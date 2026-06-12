import prisma from '../config/database';
import { s3Client } from '../config/aws';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { environment } from '../config/environment';
import logger from '../config/logger';

export const gdprService = {
  async exportUserData(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) throw new Error('User not found');

    const manifests = await prisma.manifest.findMany({
      where: {
        OR: [
          { createdBy: userId },
          { companyId: user.companyId },
        ],
      },
    });

    const signatures = await prisma.signature.findMany({
      where: { signedBy: userId },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        createdAt: user.createdAt,
      },
      company: {
        name: user.company.name,
        type: user.company.type,
      },
      manifests: manifests.map(m => ({
        id: m.id,
        manifestNumber: m.manifestNumber,
        status: m.status,
        createdAt: m.createdAt,
      })),
      signatures: signatures.map(s => ({
        manifestId: s.manifestId,
        signerRole: s.signerRole,
        signedAt: s.signedAt,
      })),
    };
  },

  async deleteUserData(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          include: { users: { where: { role: 'admin' } } },
        },
      },
    });

    if (!user) throw new Error('User not found');

    const adminCount = user.company.users.length;
    if (user.role === 'admin' && adminCount <= 1) {
      throw new Error('Cannot delete the last admin user');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@anonymous.com`,
        firstName: 'Deleted',
        lastName: 'User',
        phone: null,
        isActive: false,
        password: '',
      },
    });

    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true },
    });

    logger.info(`User ${userId} data anonymized for GDPR compliance`);

    return { success: true };
  },
};
