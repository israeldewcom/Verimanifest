import prisma from '../config/database';
import bcrypt from 'bcrypt';
import { environment } from '../config/environment';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

async function seed() {
  logger.info('🌱 Seeding database...');

  // ------------------------------------------------------------
  // 1. Create a "Super Admin" Company (the platform owner)
  // ------------------------------------------------------------
  const superCompany = await prisma.company.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'VeriManifest Platform',
      type: 'generator', // doesn't matter
      epaId: 'EPA-SUPER-001',
      address: '123 Compliance Ave, Washington, DC 20001',
      state: 'DC',
      subscriptionStatus: 'active',
      latitude: 38.9072,
      longitude: -77.0369,
    },
  });

  // ------------------------------------------------------------
  // 2. Create a Super Admin user (you)
  // ------------------------------------------------------------
  const superPassword = await bcrypt.hash('Admin123!', environment.BCRYPT_SALT_ROUNDS);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@verimanifest.com' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'admin@verimanifest.com',
      password: superPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'admin',
      companyId: superCompany.id,
      isActive: true,
    },
  });

  // ------------------------------------------------------------
  // 3. Create SAMPLE Counterparties (so dropdowns work)
  // ------------------------------------------------------------
  // Generator
  const generator = await prisma.company.upsert({
    where: { id: '11111111-1111-1111-1111-111111111111' },
    update: {},
    create: {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Demo Generator Clinic',
      type: 'generator',
      epaId: 'EPA-GEN-001',
      address: '123 Health St, Austin, TX 73301',
      state: 'TX',
      subscriptionStatus: 'free',
      latitude: 30.2672,
      longitude: -97.7431,
    },
  });

  // Transporter
  const transporter = await prisma.company.upsert({
    where: { id: '22222222-2222-2222-2222-222222222222' },
    update: {},
    create: {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Demo Transport Co.',
      type: 'transporter',
      epaId: 'EPA-TRANS-001',
      address: '456 Highway Rd, Dallas, TX 75201',
      state: 'TX',
      interstateAuthorized: true,
      subscriptionStatus: 'free',
      latitude: 32.7767,
      longitude: -96.7970,
    },
  });

  // Facility
  const facility = await prisma.company.upsert({
    where: { id: '33333333-3333-3333-3333-333333333333' },
    update: {},
    create: {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Demo Disposal Facility',
      type: 'facility',
      epaId: 'EPA-FAC-001',
      address: '789 Disposal Blvd, Houston, TX 77001',
      state: 'TX',
      subscriptionStatus: 'free',
      latitude: 29.7604,
      longitude: -95.3698,
    },
  });

  // ------------------------------------------------------------
  // 4. Create a Demo Driver (so driver assignment works)
  // ------------------------------------------------------------
  const driverPassword = await bcrypt.hash('Driver123!', environment.BCRYPT_SALT_ROUNDS);
  const driverUser = await prisma.user.upsert({
    where: { email: 'driver@verimanifest.com' },
    update: {},
    create: {
      id: '44444444-4444-4444-4444-444444444444',
      email: 'driver@verimanifest.com',
      password: driverPassword,
      firstName: 'Demo',
      lastName: 'Driver',
      role: 'driver',
      companyId: transporter.id, // assign to transporter company
      isActive: true,
    },
  });

  // ------------------------------------------------------------
  // 5. Insurance policy for the transporter (so compliance passes)
  // ------------------------------------------------------------
  await prisma.insurancePolicy.upsert({
    where: { id: '55555555-5555-5555-5555-555555555555' },
    update: {},
    create: {
      id: '55555555-5555-5555-5555-555555555555',
      companyId: transporter.id,
      provider: 'Demo Insurance Corp',
      policyNumber: 'POL-123456',
      coverageAmount: 1000000,
      effectiveDate: new Date('2024-01-01'),
      expirationDate: new Date('2026-12-31'),
      status: 'active',
    },
  });

  // ------------------------------------------------------------
  // 6. White-label config for the super company
  // ------------------------------------------------------------
  await prisma.whiteLabelConfig.upsert({
    where: { companyId: superCompany.id },
    update: {},
    create: {
      companyId: superCompany.id,
      companyName: superCompany.name,
      logo: environment.WHITE_LABEL_DEFAULT_LOGO_URL || 'https://via.placeholder.com/200x50?text=VeriManifest',
      primaryColor: environment.WHITE_LABEL_DEFAULT_PRIMARY_COLOR || '#2D3748',
      secondaryColor: '#4A5568',
      customDomain: null,
      emailTemplates: {},
    },
  });

  // ------------------------------------------------------------
  // 7. Optional: A few sample manifests to show the dashboard
  // ------------------------------------------------------------
  const manifestNumber = `VM${Date.now().toString().slice(-6)}`;
  await prisma.manifest.create({
    data: {
      manifestNumber,
      status: 'draft',
      generatorId: generator.id,
      transporterId: transporter.id,
      facilityId: facility.id,
      companyId: superCompany.id,
      createdBy: superAdmin.id,
      wasteType: 'Biomedical',
      wasteClassification: 'medical',
      quantity: 5.0,
      unit: 'pounds',
      containerType: 'Box',
      containerCount: 2,
      notes: 'Sample manifest for demo',
    },
  });

  logger.info('✅ Seeding completed successfully.');
  logger.info('🔑 Super Admin: admin@verimanifest.com / Admin123!');
  logger.info('🔑 Driver: driver@verimanifest.com / Driver123!');
  logger.info('📦 Sample generator, transporter, and facility created – dropdowns are now populated.');
}

seed()
  .catch((e) => {
    logger.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
