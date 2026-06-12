import { Router } from 'express';
import { ManifestController } from './manifest.controller';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import {
  createManifestSchema,
  updateManifestStatusSchema,
  addSignatureSchema,
  manifestQuerySchema,
  assignDriverSchema,
} from './manifest.validation';
import multer from 'multer';

const router = Router();
const controller = new ManifestController();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

router.post('/', validate(createManifestSchema), controller.create);
router.get('/', validate(manifestQuerySchema, 'query'), controller.list);
router.get('/:id', controller.getOne);
router.patch('/:id/status', validate(updateManifestStatusSchema), controller.updateStatus);
router.post('/:id/pdf', controller.generatePDF);
router.post('/:id/signatures', validate(addSignatureSchema), controller.addSignature);
router.get('/:id/compliance', controller.complianceStatus);
router.post('/:id/photos', upload.single('photo'), controller.uploadPhoto);
router.get('/:id/photos', controller.getPhotos);
router.post('/:id/legal-hold', requirePermission('write:manifests'), controller.applyLegalHold);
router.delete('/:id/legal-hold', requirePermission('write:manifests'), controller.releaseLegalHold);
router.get('/:id/route', controller.calculateRoute);
router.get('/:id/tax', controller.calculateTax);
router.post('/:id/assign-driver', requirePermission('write:manifests'), validate(assignDriverSchema), controller.assignDriver);

export default router;
