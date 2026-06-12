import redis from '../config/redis';
import { environment } from '../config/environment';
import logger from '../config/logger';

export class CacheService {
  private prefix = 'cache:';
  private defaultTTL = environment.CACHE_TTL;

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(this.prefix + key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      logger.warn('Cache get failed', { key, error });
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await redis.setex(this.prefix + key, ttl, serialized);
      } else {
        await redis.setex(this.prefix + key, this.defaultTTL, serialized);
      }
    } catch (error) {
      logger.warn('Cache set failed', { key, error });
    }
  }

  async del(key: string): Promise<void> {
    try {
      await redis.del(this.prefix + key);
    } catch (error) {
      logger.warn('Cache delete failed', { key, error });
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(this.prefix + pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.warn('Cache delete pattern failed', { pattern, error });
    }
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  generateKey(...parts: string[]): string {
    return parts.join(':');
  }
}

export const cacheService = new CacheService();
