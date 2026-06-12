import { PrismaClient } from '@prisma/client';
import { environment } from './environment';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: environment.DATABASE_URL,
    },
  },
  log: environment.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

export default prisma;
