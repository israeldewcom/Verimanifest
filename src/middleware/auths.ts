import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { environment } from '../config/environment';
import prisma from '../config/database';
import { AppError } from '../utils/AppError';
import { cacheService } from '../services/cache.service';
import logger from '../config/logger';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    companyId: string;
    role: string;
    permissions: string[];
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw AppError.unauthorized('No token provided');
    }

    const token = authHeader.split(' ')[1];
    
    const isBlacklisted = await cacheService.get(`blacklist:${token}`);
    if (isBlacklisted) {
      throw AppError.unauthorized('Token has been revoked');
    }

    const decoded = jwt.verify(token, environment.JWT_SECRET) as any;

    const cacheKey = cacheService.generateKey('user', decoded.userId);
    let user = await cacheService.get<any>(cacheKey);
    
    if (!user) {
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, companyId: true, role: true, isActive: true },
      });
      if (user) {
        await cacheService.set(cacheKey, user, 300);
      }
    }

    if (!user || !user.isActive) {
      throw AppError.unauthorized('User inactive or deleted');
    }

    req.user = {
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
      permissions: getPermissionsForRole(user.role),
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    if (error instanceof jwt.TokenExpiredError) {
      return next(AppError.unauthorized('Token expired'));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(AppError.unauthorized('Invalid token'));
    }
    logger.error('Authentication error', { error });
    return next(AppError.internal('Authentication failed'));
  }
};

function getPermissionsForRole(role: string): string[] {
  const permissions: Record<string, string[]> = {
    admin: ['*'],
    manager: ['read:*', 'write:manifests', 'write:signatures', 'read:reports', 'manage:users'],
    driver: ['read:manifests', 'write:signatures', 'read:assigned', 'update:location'],
    viewer: ['read:manifests', 'read:reports'],
    auditor: ['read:*', 'read:compliance'],
  };
  return permissions[role] || [];
}

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden('Insufficient permissions'));
    }
    next();
  };
};

export const requirePermission = (...permissions: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }
    if (req.user.permissions.includes('*')) {
      return next();
    }
    const hasPermission = permissions.some(p => req.user!.permissions.includes(p));
    if (!hasPermission) {
      return next(AppError.forbidden('Insufficient permissions'));
    }
    next();
  };
};
