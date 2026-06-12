import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../../config/database';
import { environment } from '../../config/environment';
import { v4 as uuidv4 } from 'uuid';
import { emailQueue } from '../../config/queue';
import { cacheService } from '../../services/cache.service';
import { AppError } from '../../utils/AppError';
import logger from '../../config/logger';

export class AuthService {
  async register(data: any) {
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      throw AppError.conflict('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(data.password, environment.BCRYPT_SALT_ROUNDS);

    const company = await prisma.company.create({
      data: {
        name: data.companyName,
        type: data.companyType || 'generator',
        subscriptionStatus: 'free',
      },
    });

    await prisma.whiteLabelConfig.create({
      data: {
        companyId: company.id,
        companyName: company.name,
        logo: environment.WHITE_LABEL_DEFAULT_LOGO_URL,
        primaryColor: environment.WHITE_LABEL_DEFAULT_PRIMARY_COLOR,
        secondaryColor: '#4A5568',
        customDomain: null,
        emailTemplates: {},
      },
    });

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: 'admin',
        companyId: company.id,
      },
    });

    await emailQueue.add('send', {
      to: user.email,
      template: 'welcome',
      data: {
        name: user.firstName,
        companyName: company.name,
      },
    });

    const tokens = this.generateTokens(user.id, company.id, user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    logger.info('User registered', { userId: user.id, companyId: company.id });

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw AppError.unauthorized('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      logger.warn('Failed login attempt', { email, ipAddress });
      throw AppError.unauthorized('Invalid credentials');
    }

    const tokens = this.generateTokens(user.id, user.companyId, user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    logger.info('User logged in', { userId: user.id });

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, environment.JWT_REFRESH_SECRET);
    } catch (error) {
      throw AppError.unauthorized('Invalid refresh token');
    }

    const stored = await prisma.refreshToken.findFirst({
      where: { userId: decoded.userId, token: refreshToken, revoked: false },
    });
    
    if (!stored) {
      throw AppError.unauthorized('Refresh token revoked');
    }

    if (stored.expiresAt < new Date()) {
      await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revoked: true },
      });
      throw AppError.unauthorized('Refresh token expired');
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.isActive) {
      throw AppError.unauthorized('User inactive');
    }

    const tokens = this.generateTokens(user.id, user.companyId, user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw AppError.notFound('User not found');
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      throw AppError.badRequest('Current password is incorrect');
    }

    const hashed = await bcrypt.hash(newPassword, environment.BCRYPT_SALT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    await prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    await cacheService.del(cacheService.generateKey('user', userId));

    logger.info('Password changed', { userId });

    return true;
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { userId, token: refreshToken },
        data: { revoked: true },
      });
    } else {
      await prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });
    }

    await cacheService.del(cacheService.generateKey('user', userId));

    logger.info('User logged out', { userId });
  }

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return true;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 3600000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpiry: resetExpiry,
      },
    });

    await emailQueue.add('send', {
      to: user.email,
      template: 'password-reset',
      data: {
        name: user.firstName,
        resetUrl: `${environment.APP_URL}/reset-password?token=${resetToken}`,
      },
    });

    return true;
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpiry: { gte: new Date() },
      },
    });

    if (!user) {
      throw AppError.badRequest('Invalid or expired reset token');
    }

    const hashed = await bcrypt.hash(newPassword, environment.BCRYPT_SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revoked: false },
      data: { revoked: true },
    });

    logger.info('Password reset', { userId: user.id });

    return true;
  }

  async inviteUser(companyId: string, invitedBy: string, data: any) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw AppError.conflict('User already exists with this email');
    }

    const tempPassword = crypto.randomBytes(12).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, environment.BCRYPT_SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        role: data.role,
        companyId,
        isActive: true,
      },
    });

    // Send invitation email with temp password
    await emailQueue.add('send', {
      to: user.email,
      template: 'invite',
      data: {
        name: user.firstName || user.email,
        companyName: (await prisma.company.findUnique({ where: { id: companyId } }))?.name,
        tempPassword,
        inviteUrl: `${environment.APP_URL}/set-password?email=${encodeURIComponent(user.email)}&token=${tempPassword}`,
      },
    });

    logger.info('User invited', { userId: user.id, invitedBy, companyId });
    return this.sanitizeUser(user);
  }

  async listUsers(companyId: string, role?: string) {
    const where: any = { companyId };
    if (role) where.role = role;
    return prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async updateUser(companyId: string, userId: string, data: any) {
    const user = await prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw AppError.notFound('User not found');
    return prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: data.role,
        isActive: data.isActive,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    });
  }

  async deleteUser(companyId: string, userId: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw AppError.notFound('User not found');
    if (user.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { companyId, role: 'admin', isActive: true } });
      if (adminCount <= 1) throw AppError.badRequest('Cannot delete the last admin user');
    }
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false, email: `deleted-${userId}@deleted.com` },
    });
    await prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
    logger.info('User deactivated', { userId, companyId });
  }

  private generateTokens(userId: string, companyId: string, role: string) {
    const accessToken = jwt.sign(
      { userId, companyId, role },
      environment.JWT_SECRET,
      { expiresIn: environment.JWT_EXPIRY }
    );
    const refreshToken = jwt.sign(
      { userId, companyId, role },
      environment.JWT_REFRESH_SECRET,
      { expiresIn: environment.JWT_REFRESH_EXPIRY }
    );
    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(userId: string, token: string) {
    await prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  private sanitizeUser(user: any) {
    const { password, passwordResetToken, passwordResetExpiry, ...rest } = user;
    return rest;
  }
}

export const authService = new AuthService();
