import logger from './logger';

export class VaultService {
  async initialize() {
    logger.info('Vault service not configured – running without Vault');
  }
  async getSecret(path: string, key: string): Promise<string> {
    logger.warn(`Vault secret requested but Vault not configured: ${path}/${key}`);
    return '';
  }
  async rotateDatabaseCredentials() {
    logger.info('Database credential rotation skipped – Vault not configured');
  }
}

export const vaultService = new VaultService();
