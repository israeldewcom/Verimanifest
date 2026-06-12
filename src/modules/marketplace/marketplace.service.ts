import prisma from '../../config/database';
import { cacheService } from '../../services/cache.service';
import { notificationService } from '../../services/notification.service';
import { environment } from '../../config/environment';
import { AppError } from '../../utils/AppError';
import logger from '../../config/logger';

export class MarketplaceService {
  async createListing(companyId: string, data: any) {
    const listing = await prisma.marketplaceListing.create({
      data: {
        generatorId: companyId,
        wasteType: data.wasteType,
        quantity: data.quantity,
        unit: data.unit,
        status: 'open',
        pickupDate: new Date(data.pickupDate),
        location: data.location,
        budget: data.budget,
        requirements: data.requirements,
        expiresAt: new Date(data.expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    logger.info('Marketplace listing created', {
      listingId: listing.id,
      companyId,
    });

    return listing;
  }

  async getOpenListings(page = 1, limit = 20, filters?: any) {
    const where: any = {
      status: 'open',
      expiresAt: { gte: new Date() },
    };

    if (filters?.wasteType) {
      where.wasteType = { contains: filters.wasteType, mode: 'insensitive' };
    }
    if (filters?.wasteClassification) {
      where.wasteClassification = filters.wasteClassification;
    }

    const [total, listings] = await Promise.all([
      prisma.marketplaceListing.count({ where }),
      prisma.marketplaceListing.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          generator: { select: { id: true, name: true } },
          _count: { select: { bids: true } },
        },
      }),
    ]);

    return {
      data: listings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getListing(listingId: string) {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: {
        generator: { select: { id: true, name: true, address: true } },
        bids: {
          include: {
            transporter: { select: { id: true, name: true } },
          },
          orderBy: { amount: 'asc' },
        },
      },
    });

    if (!listing) {
      throw AppError.notFound('Listing not found');
    }

    return listing;
  }

  async submitBid(companyId: string, listingId: string, amount: number, notes?: string) {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      throw AppError.notFound('Listing not found');
    }

    if (listing.status !== 'open') {
      throw AppError.badRequest('Listing is no longer open for bids');
    }

    if (listing.expiresAt < new Date()) {
      throw AppError.badRequest('Listing has expired');
    }

    if (listing.generatorId === companyId) {
      throw AppError.badRequest('Cannot bid on your own listing');
    }

    const existingBid = await prisma.marketplaceBid.findFirst({
      where: { listingId, transporterId: companyId, status: 'pending' },
    });

    if (existingBid) {
      const updatedBid = await prisma.marketplaceBid.update({
        where: { id: existingBid.id },
        data: { amount, notes },
      });
      return updatedBid;
    }

    const bid = await prisma.marketplaceBid.create({
      data: {
        listingId,
        transporterId: companyId,
        amount,
        notes,
        status: 'pending',
      },
    });

    const generatorUsers = await prisma.user.findMany({
      where: { companyId: listing.generatorId, role: 'admin' },
      select: { id: true },
    });

    for (const user of generatorUsers) {
      await notificationService.send(user.id, 'new_bid', {
        listingId,
        bidId: bid.id,
        amount,
      });
    }

    logger.info('Bid submitted', { bidId: bid.id, listingId, companyId, amount });

    return bid;
  }

  async acceptBid(bidId: string, companyId: string) {
    const bid = await prisma.marketplaceBid.findUnique({
      where: { id: bidId },
      include: { listing: true },
    });

    if (!bid) {
      throw AppError.notFound('Bid not found');
    }

    if (bid.listing.generatorId !== companyId) {
      throw AppError.forbidden('Only the listing owner can accept bids');
    }

    if (bid.status !== 'pending') {
      throw AppError.badRequest('Bid is no longer available');
    }

    const platformFee = Math.round(bid.amount * (environment.MARKETPLACE_PLATFORM_FEE_PERCENT / 100) * 100) / 100;
    const transporterEarn = bid.amount - platformFee;

    await prisma.$transaction([
      prisma.marketplaceBid.update({
        where: { id: bidId },
        data: { status: 'accepted' },
      }),
      prisma.marketplaceBid.updateMany({
        where: { listingId: bid.listingId, id: { not: bidId } },
        data: { status: 'rejected' },
      }),
      prisma.marketplaceListing.update({
        where: { id: bid.listingId },
        data: { status: 'awarded', awardedBidId: bidId },
      }),
      prisma.platformTransaction.create({
        data: {
          listingId: bid.listingId,
          bidId,
          amount: bid.amount,
          platformFee,
          transporterEarn,
          status: 'completed',
        },
      }),
    ]);

    const transporterUsers = await prisma.user.findMany({
      where: { companyId: bid.transporterId, role: 'admin' },
      select: { id: true },
    });

    for (const user of transporterUsers) {
      await notificationService.send(user.id, 'bid_accepted', {
        listingId: bid.listingId,
        bidId,
        amount: bid.amount,
        platformFee,
      });
    }

    logger.info('Bid accepted', { bidId, listingId: bid.listingId, platformFee });

    return bid;
  }

  async getMyListings(companyId: string, page = 1, limit = 20) {
    const [total, listings] = await Promise.all([
      prisma.marketplaceListing.count({ where: { generatorId: companyId } }),
      prisma.marketplaceListing.findMany({
        where: { generatorId: companyId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { bids: true } },
        },
      }),
    ]);

    return {
      data: listings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getMyBids(companyId: string, page = 1, limit = 20) {
    const [total, bids] = await Promise.all([
      prisma.marketplaceBid.count({ where: { transporterId: companyId } }),
      prisma.marketplaceBid.findMany({
        where: { transporterId: companyId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          listing: {
            select: { id: true, wasteType: true, status: true },
          },
        },
      }),
    ]);

    return {
      data: bids,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

export const marketplaceService = new MarketplaceService();
