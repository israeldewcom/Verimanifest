import prisma from '../../config/database';
import {
  manifestQueue,
  pdfGenerationQueue,
  blockchainQueue,
  complianceQueue,
  notificationQueue,
} from '../../config/queue';
import { v4 as uuidv4 } from 'uuid';
import { eventStore } from '../../services/eventStore';
import { webhookManager } from '../../services/webhookManager';
import { insuranceVerification } from '../../services/insuranceVerification';
import { complianceEngine } from '../../services/complianceEngine';
import { taxCalculator } from '../../services/taxCalculator';
import { routeOptimizer } from '../../services/routeOptimizer';
import { cacheService } from '../../services/cache.service';
import { billingService } from '../../modules/billing/billing.service';
import { notificationService } from '../../services/notification.service';
import { manifestsCreatedCounter } from '../../config/metrics';
import { AppError } from '../../utils/AppError';
import logger from '../../config/logger';
import { pdfService } from '../../services/pdf.service';
import { featureFlags } from '../../config/featureFlags';

export class ManifestService {
  async createManifest(data: any, userId: string, userCompanyId: string) {
    const company = await prisma.company.findUnique({ where: { id: userCompanyId } });
    if (!company) throw AppError.notFound('Company not found');

    if (company.subscriptionStatus === 'free') {
      const manifestCount = await prisma.manifest.count({
        where: { companyId: userCompanyId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
      });
      if (manifestCount >= 10) {
        throw AppError.forbidden('Free plan limited to 10 manifests per month. Upgrade to continue.');
      }
    }

    const manifestNumber = this.generateManifestNumber();

    const manifest = await prisma.manifest.create({
      data: {
        generatorId: data.generatorId,
        transporterId: data.transporterId,
        facilityId: data.facilityId,
        assignedDriverId: data.assignedDriverId,
        manifestNumber,
        status: 'draft',
        wasteType: data.wasteType,
        wasteClassification: data.wasteClassification,
        quantity: data.quantity,
        unit: data.unit,
        containerType: data.containerType,
        containerCount: data.containerCount,
        notes: data.notes,
        specialInstructions: data.specialInstructions,
        pickupDate: data.pickupDate ? new Date(data.pickupDate) : null,
        createdBy: userId,
        companyId: userCompanyId,
      },
    });

    await billingService.trackManifestCreation(userCompanyId, manifest.id);
    manifestsCreatedCounter.inc({ plan: company.subscriptionStatus });

    await eventStore.appendEvent(manifest.id, {
      type: 'MANIFEST_CREATED',
      data: manifest,
      userId,
    });

    await complianceQueue.add('check', { manifestId: manifest.id });

    const isBlockchainEnabled = await featureFlags.isEnabled('blockchain-verification');
    if (isBlockchainEnabled) {
      await blockchainQueue.add('anchor', { manifestId: manifest.id });
    }

    await webhookManager.triggerWebhook(manifest.id, 'manifest.created', manifest);

    logger.info('Manifest created', {
      manifestId: manifest.id,
      manifestNumber,
      companyId: userCompanyId,
    });

    return manifest;
  }

  async updateStatus(
    manifestId: string,
    newStatus: string,
    userId: string,
    notes?: string
  ) {
    const manifest = await prisma.manifest.findUnique({ where: { id: manifestId } });
    if (!manifest) {
      throw AppError.notFound('Manifest not found');
    }

    const allowedTransitions: Record<string, string[]> = {
      draft: ['generator_signed', 'archived'],
      generator_signed: ['transport_accepted', 'archived'],
      transport_accepted: ['in_transit', 'archived'],
      in_transit: ['facility_received', 'archived'],
      facility_received: ['disposed', 'archived'],
      disposed: ['archived'],
      archived: [],
    };

    if (!allowedTransitions[manifest.status]?.includes(newStatus)) {
      throw AppError.badRequest(
        `Cannot transition from ${manifest.status} to ${newStatus}`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    if (newStatus === 'transport_accepted') {
      const hasValidInsurance = await insuranceVerification.blockDispatchWithoutInsurance(
        manifest.transporterId
      );
      if (!hasValidInsurance) {
        throw AppError.badRequest(
          'Transporter insurance invalid or expired',
          'INSURANCE_INVALID'
        );
      }
    }

    if (newStatus === 'in_transit' && !manifest.pickupDate) {
      await prisma.manifest.update({
        where: { id: manifestId },
        data: { pickupDate: new Date() },
      });
    }

    const updated = await prisma.manifest.update({
      where: { id: manifestId },
      data: {
        status: newStatus,
        [`${newStatus}At`]: new Date(),
        updatedBy: userId,
        statusNotes: notes,
      },
    });

    await eventStore.appendEvent(manifestId, {
      type: 'STATUS_CHANGED',
      data: { oldStatus: manifest.status, newStatus },
      userId,
    });

    if (['generator_signed', 'disposed'].includes(newStatus)) {
      await pdfGenerationQueue.add('generate', { manifestId });
    }

    await complianceQueue.add('check', { manifestId });

    await webhookManager.triggerWebhook(manifestId, 'manifest.status_updated', updated);

    await cacheService.del(cacheService.generateKey('manifest', manifestId));

    logger.info('Manifest status updated', {
      manifestId,
      oldStatus: manifest.status,
      newStatus,
      userId,
    });

    return updated;
  }

  async getManifest(manifestId: string, userId: string, companyId: string) {
    const cacheKey = cacheService.generateKey('manifest', manifestId);
    
    const manifest = await cacheService.getOrSet(
      cacheKey,
      () =>
        prisma.manifest.findFirst({
          where: {
            id: manifestId,
            OR: [
              { generatorId: companyId },
              { transporterId: companyId },
              { facilityId: companyId },
              { companyId },
            ],
          },
          include: {
            generator: { select: { id: true, name: true, epaId: true, address: true } },
            transporter: { select: { id: true, name: true, epaId: true, address: true } },
            facility: { select: { id: true, name: true, epaId: true, address: true } },
            assignedDriver: { select: { id: true, firstName: true, lastName: true, email: true } },
            signatures: true,
            pdfs: { orderBy: { createdAt: 'desc' }, take: 5 },
            complianceChecks: { orderBy: { checkedAt: 'desc' }, take: 5 },
          },
        }),
      300
    );

    if (!manifest) {
      throw AppError.notFound('Manifest not found');
    }

    return manifest;
  }

  async listManifests(companyId: string, filters: any, userId?: string) {
    const {
      page = 1,
      limit = 20,
      status,
      wasteType,
      wasteClassification,
      dateFrom,
      dateTo,
      driverId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    const where: any = {
      OR: [
        { generatorId: companyId },
        { transporterId: companyId },
        { facilityId: companyId },
      ],
    };

    if (status) where.status = status;
    if (wasteType) where.wasteType = { contains: wasteType, mode: 'insensitive' };
    if (wasteClassification) where.wasteClassification = wasteClassification;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    if (driverId) where.assignedDriverId = driverId;

    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (user?.role === 'driver') {
        where.assignedDriverId = userId;
      }
    }

    const [total, manifests] = await Promise.all([
      prisma.manifest.count({ where }),
      prisma.manifest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          generator: { select: { name: true } },
          transporter: { select: { name: true } },
          facility: { select: { name: true } },
          assignedDriver: { select: { firstName: true, lastName: true } },
          _count: { select: { signatures: true } },
        },
      }),
    ]);

    return {
      data: manifests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async assignDriver(manifestId: string, driverId: string, assignedBy: string) {
    const manifest = await prisma.manifest.findUnique({ where: { id: manifestId } });
    if (!manifest) throw AppError.notFound('Manifest not found');

    const driver = await prisma.user.findFirst({
      where: { id: driverId, companyId: manifest.companyId, role: 'driver', isActive: true },
    });
    if (!driver) throw AppError.badRequest('Driver not found in company');

    const updated = await prisma.manifest.update({
      where: { id: manifestId },
      data: { assignedDriverId: driverId },
    });

    await eventStore.appendEvent(manifestId, {
      type: 'DRIVER_ASSIGNED',
      data: { driverId, assignedBy },
      userId: assignedBy,
    });

    await notificationService.send(driverId, 'manifest_assigned', {
      manifestId,
      manifestNumber: manifest.manifestNumber,
    });

    await cacheService.del(cacheService.generateKey('manifest', manifestId));
    return updated;
  }

  async generatePDF(manifestId: string) {
    return pdfService.generateManifestPDF(manifestId);
  }

  async addSignature(
    manifestId: string,
    signerRole: string,
    userId: string,
    signatureData: any
  ) {
    const manifest = await prisma.manifest.findUnique({ where: { id: manifestId } });
    if (!manifest) {
      throw AppError.notFound('Manifest not found');
    }

    const existingSignature = await prisma.signature.findFirst({
      where: { manifestId, signerRole },
    });

    if (existingSignature) {
      throw AppError.conflict(`${signerRole} has already signed this manifest`);
    }

    const signature = await prisma.signature.create({
      data: {
        manifestId,
        signerRole,
        signedBy: userId,
        signatureImage: signatureData.signatureImage,
        signedAt: new Date(),
        ipAddress: signatureData.ipAddress,
        geolocation: signatureData.geolocation,
        deviceInfo: signatureData.deviceInfo,
      },
    });

    await eventStore.appendEvent(manifestId, {
      type: 'SIGNATURE_ADDED',
      data: signature,
      userId,
    });

    await cacheService.del(cacheService.generateKey('manifest', manifestId));

    await webhookManager.triggerWebhook(manifestId, 'manifest.signed', {
      signerRole,
      signedAt: signature.signedAt,
    });

    logger.info('Signature added to manifest', {
      manifestId,
      signerRole,
      userId,
    });

    return signature;
  }

  async getComplianceStatus(manifestId: string) {
    const cacheKey = cacheService.generateKey('compliance', manifestId);
    
    return cacheService.getOrSet(cacheKey, () =>
      complianceEngine.validateManifest(manifestId),
      300
    );
  }

  async uploadPhoto(manifestId: string, userId: string, file: any, caption?: string) {
    const manifest = await prisma.manifest.findUnique({ where: { id: manifestId } });
    if (!manifest) {
      throw AppError.notFound('Manifest not found');
    }

    const { s3Client } = require('../../config/aws');
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const { environment } = require('../../config/environment');

    const s3Key = `manifests/${manifest.companyId}/photos/${uuidv4()}-${file.originalname}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: environment.S3_BUCKET,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    const photo = await prisma.manifestPhoto.create({
      data: {
        manifestId,
        s3Key,
        uploadedBy: userId,
        caption,
      },
    });

    await eventStore.appendEvent(manifestId, {
      type: 'PHOTO_UPLOADED',
      data: photo,
      userId,
    });

    return photo;
  }

  async getPhotos(manifestId: string) {
    return prisma.manifestPhoto.findMany({
      where: { manifestId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async applyLegalHold(
    manifestId: string,
    reason: string,
    requestedBy: string
  ) {
    const manifest = await prisma.manifest.findUnique({ where: { id: manifestId } });
    if (!manifest) {
      throw AppError.notFound('Manifest not found');
    }

    const updated = await prisma.manifest.update({
      where: { id: manifestId },
      data: {
        legalHold: true,
        legalHoldReason: reason,
        legalHoldRequestedBy: requestedBy,
        legalHoldPlacedAt: new Date(),
      },
    });

    await eventStore.appendEvent(manifestId, {
      type: 'LEGAL_HOLD_APPLIED',
      data: { reason, requestedBy },
      userId: requestedBy,
    });

    await cacheService.del(cacheService.generateKey('manifest', manifestId));

    return updated;
  }

  async releaseLegalHold(manifestId: string, releasedBy: string) {
    const manifest = await prisma.manifest.findUnique({ where: { id: manifestId } });
    if (!manifest || !manifest.legalHold) {
      throw AppError.notFound('Legal hold not found on manifest');
    }

    const updated = await prisma.manifest.update({
      where: { id: manifestId },
      data: {
        legalHold: false,
        legalHoldReleasedBy: releasedBy,
        legalHoldReleasedAt: new Date(),
      },
    });

    await eventStore.appendEvent(manifestId, {
      type: 'LEGAL_HOLD_RELEASED',
      data: { releasedBy },
      userId: releasedBy,
    });

    await cacheService.del(cacheService.generateKey('manifest', manifestId));

    return updated;
  }

  async calculateRoute(manifestId: string, companyId: string) {
    const manifest = await prisma.manifest.findUnique({
      where: { id: manifestId },
      include: {
        generator: true,
        facility: true,
      },
    });

    if (!manifest) {
      throw AppError.notFound('Manifest not found');
    }

    const stops: any[] = [
      {
        address: manifest.generator.address || 'Generator Location',
        type: 'pickup',
      },
      {
        address: manifest.facility.address || 'Facility Location',
        type: 'delivery',
      },
    ];

    return routeOptimizer.optimizeRoute(stops, companyId);
  }

  async calculateTax(manifestId: string) {
    const manifest = await prisma.manifest.findUnique({
      where: { id: manifestId },
      include: {
        generator: true,
        facility: true,
      },
    });

    if (!manifest) {
      throw AppError.notFound('Manifest not found');
    }

    return taxCalculator.calculateTax({
      amount: manifest.quantity * 100,
      fromState: manifest.generator.state || 'TX',
      toState: manifest.facility.state || 'TX',
      wasteType: manifest.wasteType,
      wasteClassification: manifest.wasteClassification,
    });
  }

  private generateManifestNumber(): string {
    const prefix = 'VM';
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${date}${random}`;
  }
}
