import prisma from '../config/database';
import { syncQueue } from '../config/queue';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';
import { AppError } from '../utils/AppError';

interface OfflineAction {
  id: string;
  type: 'create_manifest' | 'update_status' | 'add_signature' | 'upload_photo';
  payload: any;
  timestamp: string;
}

class SyncService {
  async processBatch(companyId: string, actions: OfflineAction[]) {
    const results: any[] = [];
    for (const action of actions) {
      try {
        // Idempotency check: use action.id to prevent duplicates
        const existing = await prisma.syncLog.findUnique({
          where: { actionId: action.id },
        });
        if (existing) {
          results.push({ actionId: action.id, status: 'already_processed', result: existing.result });
          continue;
        }

        let result;
        switch (action.type) {
          case 'create_manifest':
            result = await this.processCreateManifest(companyId, action.payload);
            break;
          case 'update_status':
            result = await this.processUpdateStatus(companyId, action.payload);
            break;
          case 'add_signature':
            result = await this.processAddSignature(companyId, action.payload);
            break;
          case 'upload_photo':
            result = await this.processUploadPhoto(companyId, action.payload);
            break;
          default:
            throw new Error(`Unknown action type: ${action.type}`);
        }

        await prisma.syncLog.create({
          data: {
            actionId: action.id,
            companyId,
            type: action.type,
            payload: action.payload,
            result,
            processedAt: new Date(),
            status: 'success',
          },
        });
        results.push({ actionId: action.id, status: 'success', result });
      } catch (error: any) {
        logger.error('Sync action failed', { actionId: action.id, error: error.message });
        await prisma.syncLog.create({
          data: {
            actionId: action.id,
            companyId,
            type: action.type,
            payload: action.payload,
            error: error.message,
            processedAt: new Date(),
            status: 'failed',
          },
        });
        results.push({ actionId: action.id, status: 'failed', error: error.message });
      }
    }
    return results;
  }

  private async processCreateManifest(companyId: string, payload: any) {
    // Create manifest using existing service
    const { ManifestService } = require('../modules/manifest/manifest.service');
    const manifestService = new ManifestService();
    // Need to get a system user ID for offline sync
    const systemUser = await prisma.user.findFirst({
      where: { companyId, role: 'admin' },
      select: { id: true },
    });
    if (!systemUser) throw new Error('No admin user found for company');
    return manifestService.createManifest(payload, systemUser.id, companyId);
  }

  private async processUpdateStatus(companyId: string, payload: any) {
    const { ManifestService } = require('../modules/manifest/manifest.service');
    const manifestService = new ManifestService();
    const { manifestId, status, notes } = payload;
    const systemUser = await prisma.user.findFirst({
      where: { companyId, role: 'admin' },
      select: { id: true },
    });
    if (!systemUser) throw new Error('No admin user found for company');
    return manifestService.updateStatus(manifestId, status, systemUser.id, notes);
  }

  private async processAddSignature(companyId: string, payload: any) {
    const { ManifestService } = require('../modules/manifest/manifest.service');
    const manifestService = new ManifestService();
    const { manifestId, signerRole, signatureData } = payload;
    const systemUser = await prisma.user.findFirst({
      where: { companyId, role: 'admin' },
      select: { id: true },
    });
    if (!systemUser) throw new Error('No admin user found for company');
    return manifestService.addSignature(manifestId, signerRole, systemUser.id, signatureData);
  }

  private async processUploadPhoto(companyId: string, payload: any) {
    const { ManifestService } = require('../modules/manifest/manifest.service');
    const manifestService = new ManifestService();
    const { manifestId, photoData, caption } = payload;
    const systemUser = await prisma.user.findFirst({
      where: { companyId, role: 'admin' },
      select: { id: true },
    });
    if (!systemUser) throw new Error('No admin user found for company');
    // Reconstruct file-like object from base64
    const buffer = Buffer.from(photoData.base64, 'base64');
    const file = { buffer, originalname: photoData.filename, mimetype: photoData.mimetype };
    return manifestService.uploadPhoto(manifestId, systemUser.id, file, caption);
  }
}

export const syncService = new SyncService();
