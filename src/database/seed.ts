import prisma from '../config/database';
import bcrypt from 'bcrypt';
import { environment } from '../config/environment';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

async function seed() {
  logger.info('Seeding database...');

  const company = await prisma.company.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Test Waste Generator Inc.',
      type: 'generator',
      epaId: 'EPA-TEST-001',
      address: '123 Waste St, Houston, TX 77001',
      state: 'TX',
      subscriptionStatus: 'active',
      latitude: 29.7604,
      longitude: -95.3698,
    },
  });

  const hashedPassword = await bcrypt.hash('Admin123!', environment.BCRYPT_SALT_ROUNDS);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@verimanifest.com' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'admin@verimanifest.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      companyId: company.id,
    },
  });

  const transporter = await prisma.company.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      name: 'Test Transport Co.',
      type: 'transporter',
      epaId: 'EPA-TRANS-001',
      address: '456 Highway Rd, Dallas, TX 75201',
      state: 'TX',
      interstateAuthorized: true,
      subscriptionStatus: 'active',
      latitude: 32.7767,
      longitude: -96.7970,
    },
  });

  await prisma.company.upsert({
    where: { id: '00000000-0000-0000-0000-000000000004' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000004',
      name: 'Test Disposal Facility',
      type: 'facility',
      epaId: 'EPA-FAC-001',
      address: '789 Disposal Blvd, Austin, TX 73301',
      state: 'TX',
      subscriptionStatus: 'active',
      latitude: 30.2672,
      longitude: -97.7431,
    },
  });

  // Create a driver user
  const driverPassword = await bcrypt.hash('Driver123!', environment.BCRYPT_SALT_ROUNDS);
  await prisma.user.upsert({
    where: { email: 'driver@verimanifest.com' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000005',
      email: 'driver@verimanifest.com',
      password: driverPassword,
      firstName: 'Test',
      lastName: 'Driver',
      role: 'driver',
      companyId: transporter.id,
      isActive: true,
    },
  });

  await prisma.insurancePolicy.upsert({
    where: { id: '00000000-0000-0000-0000-000000000006' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000006',
      companyId: transporter.id,
      provider: 'Test Insurance Co.',
      policyNumber: 'POL-12345',
      coverageAmount: 1000000,
      effectiveDate: new Date('2024-01-01'),
      expirationDate: new Date('2025-12-31'),
      status: 'active',
    },
  });

  await prisma.whiteLabelConfig.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      companyName: company.name,
      logo: environment.WHITE_LABEL_DEFAULT_LOGO_URL,
      primaryColor: environment.WHITE_LABEL_DEFAULT_PRIMARY_COLOR,
      secondaryColor: '#4A5568',
      customDomain: null,
      emailTemplates: {},
    },
  });

  logger.info('Database seeding completed');
}

seed()
  .catch((e) => {
    logger.error('Seed failed', { error: e });
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
