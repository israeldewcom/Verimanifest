import prisma from '../config/database';
import redis from '../config/redis';
import { locationQueue } from '../config/queue';
import { broadcastToManifest, broadcastToCompany } from '../websocket/socket.service';
import { driverLocationUpdatesCounter } from '../config/metrics';
import logger from '../config/logger';

interface LocationUpdate {
  driverId: string;
  manifestId?: string;
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: Date;
}

class LocationService {
  async updateLocation(update: LocationUpdate) {
    // Store latest location in Redis with TTL 1 hour
    const key = `driver:location:${update.driverId}`;
    const value = JSON.stringify({
      lat: update.lat,
      lng: update.lng,
      accuracy: update.accuracy,
      timestamp: update.timestamp,
    });
    await redis.setex(key, 3600, value);

    // Store in database for historical tracking
    await prisma.driverLocation.create({
      data: {
        driverId: update.driverId,
        manifestId: update.manifestId,
        latitude: update.lat,
        longitude: update.lng,
        accuracy: update.accuracy,
        recordedAt: update.timestamp,
      },
    });

    // Queue for async processing (e.g., geofencing, ETA updates)
    await locationQueue.add('process', update);

    // Broadcast via WebSocket if manifestId is known
    if (update.manifestId) {
      broadcastToManifest(update.manifestId, 'driver:location', update);
    }

    // Also broadcast to company
    const driver = await prisma.user.findUnique({
      where: { id: update.driverId },
      select: { companyId: true },
    });
    if (driver) {
      broadcastToCompany(driver.companyId, 'driver:location', update);
    }

    driverLocationUpdatesCounter.inc();
    logger.info('Driver location updated', { driverId: update.driverId, lat: update.lat, lng: update.lng });
  }

  async getLatestLocation(driverId: string) {
    const key = `driver:location:${driverId}`;
    const data = await redis.get(key);
    if (data) return JSON.parse(data);
    // Fallback to last known from DB
    const last = await prisma.driverLocation.findFirst({
      where: { driverId },
      orderBy: { recordedAt: 'desc' },
    });
    return last ? { lat: last.latitude, lng: last.longitude, timestamp: last.recordedAt } : null;
  }

  async getDriverHistory(driverId: string, from: Date, to: Date) {
    return prisma.driverLocation.findMany({
      where: {
        driverId,
        recordedAt: { gte: from, lte: to },
      },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async getManifestLocations(manifestId: string) {
    return prisma.driverLocation.findMany({
      where: { manifestId },
      orderBy: { recordedAt: 'asc' },
    });
  }
}

export const locationService = new LocationService();
