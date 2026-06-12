import { z } from 'zod';

export const createManifestSchema = z.object({
  generatorId: z.string().uuid('Invalid generator ID'),
  transporterId: z.string().uuid('Invalid transporter ID'),
  facilityId: z.string().uuid('Invalid facility ID'),
  assignedDriverId: z.string().uuid().optional(),
  wasteType: z.string().min(3, 'Waste type must be at least 3 characters').max(200),
  wasteClassification: z.enum([
    'hazardous',
    'non-hazardous',
    'medical',
    'universal',
    'radioactive',
  ]),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.enum(['gallons', 'pounds', 'tons', 'cubic yards', 'items']),
  containerType: z.string().min(1).max(100),
  containerCount: z.number().int('Must be a whole number').positive(),
  notes: z.string().max(5000).optional(),
  specialInstructions: z.string().max(5000).optional(),
  pickupDate: z.string().datetime().optional(),
});

export const updateManifestStatusSchema = z.object({
  status: z.enum([
    'draft',
    'generator_signed',
    'transport_accepted',
    'in_transit',
    'facility_received',
    'disposed',
    'archived',
  ]),
  notes: z.string().max(2000).optional(),
});

export const addSignatureSchema = z.object({
  signerRole: z.enum(['generator', 'transporter', 'facility']),
  signatureImage: z.string().optional(),
  ipAddress: z.string().optional(),
  geolocation: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
  deviceInfo: z.any().optional(),
});

export const manifestQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.string().optional(),
  wasteType: z.string().optional(),
  wasteClassification: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  driverId: z.string().uuid().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'pickupDate']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const photoUploadSchema = z.object({
  caption: z.string().max(500).optional(),
});

export const assignDriverSchema = z.object({
  driverId: z.string().uuid(),
});
