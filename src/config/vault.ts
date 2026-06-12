import Vault from '@hashicorp/vault-nodejs';
import { environment } from './environment';
import logger from './logger';
import { PrismaClient } from '@prisma/client';

class VaultService {
  private client: any;
  private initialized = false;
  private prismaClient: PrismaClient | null = null;

  async initialize() {
    if (!environment.VAULT_ADDR) {
      if (environment.NODE_ENV === 'production') {
        throw new Error('Vault configuration is required in production');
      }
      logger.warn('Vault not configured — using environment variables (development only)');
      return;
    }

    try {
      this.client = new Vault({
        endpoint: environment.VAULT_ADDR,
        token: environment.VAULT_TOKEN,
      });
      this.initialized = true;
      logger.info('Vault initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Vault', { error });
      throw error;
    }
  }

  async getSecret(path: string, key: string): Promise<string> {
    if (!this.initialized) {
      const envVal = process.env[key];
      if (!envVal && environment.NODE_ENV === 'production') {
        throw new Error(`Secret ${key} not found and Vault not available`);
      }
      return envVal || '';
    }

    try {
      const secret = await this.client.read(path);
      return secret.data[key] || process.env[key] || '';
    } catch (error) {
      logger.error(`Failed to read secret: ${path}/${key}`, { error });
      throw error;
    }
  }

  async rotateDatabaseCredentials() {
    if (!this.initialized) return;
    try {
      const newCredentials = await this.client.read('database/creds/verimanifest');
      const newUrl = newCredentials.data.url;
      process.env.DATABASE_URL = newUrl;
      
      // Create new Prisma client instance
      const newPrisma = new PrismaClient({
        datasources: { db: { url: newUrl } },
      });
      await newPrisma.$connect();
      
      // Replace the global prisma instance
      const prismaModule = await import('./database');
      const oldPrisma = prismaModule.default;
      await oldPrisma.$disconnect();
      
      // Update module exports
      Object.assign(prismaModule, { default: newPrisma });
      // Also update any direct reference (like in config/database export)
      (global as any).__prisma = newPrisma;
      
      logger.info('Database credentials rotated and Prisma reconnected');
    } catch (error) {
      logger.error('Failed to rotate database credentials', { error });
    }
  }
}

export const vaultService = new VaultService();
