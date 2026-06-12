import { Router } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { apiKeyService } from '../../services/apiKey.service';
import { requirePermission } from '../../middleware/auth';
import { AppError } from '../../utils/AppError';

const router = Router();

router.get('/', requirePermission('manage:api'), async (req: AuthRequest, res, next) => {
  try {
    const keys = await apiKeyService.listApiKeys(req.user!.companyId);
    res.json({ success: true, data: keys });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission('manage:api'), async (req: AuthRequest, res, next) => {
  try {
    const { name, permissions } = req.body;
    if (!name) throw AppError.badRequest('Name required');
    const key = await apiKeyService.generateApiKey(req.user!.companyId, name, permissions || ['read:manifests']);
    res.status(201).json({ success: true, data: key });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermission('manage:api'), async (req: AuthRequest, res, next) => {
  try {
    await apiKeyService.revokeApiKey(req.user!.companyId, req.params.id);
    res.json({ success: true, message: 'API key revoked' });
  } catch (error) {
    next(error);
  }
});

export default router;
