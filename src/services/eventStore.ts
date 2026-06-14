import prisma from '../config/database';
import { blockchainQueue } from '../config/queue';
import { cacheService } from './cache.service';
import logger from '../config/logger';

export interface ManifestEvent {
  type: string;
  data: any;
  userId?: string;
  metadata?: any;
}

class EventStore {
  async appendEvent(manifestId: string, event: ManifestEvent) {
    const lastEvent = await prisma.manifestEvent.findFirst({
      where: { manifestId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const version = (lastEvent?.version || 0) + 1;

    const storedEvent = await prisma.manifestEvent.create({
      data: {
        manifestId,
        type: event.type,
        data: event.data,
        userId: event.userId || 'system',
        version,
        timestamp: new Date(),
      },
    });

    await cacheService.del(cacheService.generateKey('manifest', manifestId));
    await cacheService.del(cacheService.generateKey('manifest', 'events', manifestId));

    logger.info('Event appended', {
      manifestId,
      eventType: event.type,
      version,
    });

    return storedEvent;
  }

  async getEvents(manifestId: string, fromVersion?: number) {
    const cacheKey = cacheService.generateKey('manifest', 'events', manifestId);
    
    if (!fromVersion) {
      return cacheService.getOrSet(cacheKey, () => 
        prisma.manifestEvent.findMany({
          where: { manifestId },
          orderBy: { version: 'asc' },
        })
      );
    }

    return prisma.manifestEvent.findMany({
      where: {
        manifestId,
        version: { gte: fromVersion },
      },
      orderBy: { version: 'asc' },
    });
  }

  async getLatestVersion(manifestId: string): Promise<number> {
    const lastEvent = await prisma.manifestEvent.findFirst({
      where: { manifestId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return lastEvent?.version || 0;
  }

  async rebuildState(manifestId: string): Promise<any> {
    const events = await this.getEvents(manifestId);
    const state: any = {
      signatures: [],
      photos: [],
      complianceChecks: [],
      statusHistory: [],
    };

    for (const event of events) {
      const eventData = event.data as any; // Cast to any to access properties
      switch (event.type) {
        case 'MANIFEST_CREATED':
          Object.assign(state, eventData);
          break;
        case 'STATUS_CHANGED':
          state.status = eventData.newStatus;
          state.statusUpdatedAt = event.timestamp;
          state.statusHistory.push({ 
            oldStatus: eventData.oldStatus, 
            newStatus: eventData.newStatus, 
            timestamp: event.timestamp 
          });
          break;
        case 'SIGNATURE_ADDED':
          state.signatures.push(eventData);
          break;
        case 'PHOTO_UPLOADED':
          state.photos.push(eventData);
          break;
        case 'COMPLIANCE_CHECKED':
          state.complianceChecks.push(eventData);
          break;
        case 'LEGAL_HOLD_APPLIED':
          state.legalHold = true;
          state.legalHoldReason = eventData.reason;
          state.legalHoldPlacedAt = event.timestamp;
          break;
        case 'LEGAL_HOLD_RELEASED':
          state.legalHold = false;
          state.legalHoldReleasedAt = event.timestamp;
          break;
        case 'DRIVER_ASSIGNED':
          state.assignedDriverId = eventData.driverId;
          state.assignedAt = event.timestamp;
          break;
      }
    }

    return state;
  }
}

export const eventStore = new EventStore();
