import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  inviteUserSchema,
} from './auth.validation';
import { authLimiter } from '../../middleware/rateLimiter';

const router = Router();
const controller = new AuthController();

router.post('/register', authLimiter, validate(registerSchema), controller.register);
router.post('/login', authLimiter, validate(loginSchema), controller.login);
router.post('/refresh', validate(refreshTokenSchema), controller.refresh);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), controller.resetPassword);
router.get('/me', authenticate, controller.me);
router.put('/change-password', authenticate, validate(changePasswordSchema), controller.changePassword);
router.post('/logout', authenticate, controller.logout);

// User management (requires manage:users permission)
router.post('/invite', authenticate, requirePermission('manage:users'), validate(inviteUserSchema), controller.inviteUser);
router.get('/users', authenticate, requirePermission('manage:users'), controller.listUsers);
router.put('/users/:id', authenticate, requirePermission('manage:users'), controller.updateUser);
router.delete('/users/:id', authenticate, requirePermission('manage:users'), controller.deleteUser);

export default router;
