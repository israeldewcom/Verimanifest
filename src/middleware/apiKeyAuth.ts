import { Request, Response, NextFunction } from 'express';
import { apiKeyService } from '../services/apiKey.service';
import { AppError } from '../utils/AppError';

export interface ApiKeyRequest extends Request {
  apiKeyInfo?: { companyId: string; permissions: string[] };
}

export const authenticateApiKey = async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  const apiSecret = req.headers['x-api-secret'] as string;

  if (!apiKey || !apiSecret) {
    return next(AppError.unauthorized('API key and secret required'));
  }

  const keyData = await apiKeyService.validateApiKey(apiKey, apiSecret);
  if (!keyData) {
    return next(AppError.unauthorized('Invalid API credentials'));
  }

  req.apiKeyInfo = keyData;
  next();
};
