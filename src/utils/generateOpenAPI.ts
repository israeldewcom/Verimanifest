import { OpenAPIGenerator, OpenAPIRegistry } from 'zod-to-openapi';
import { registerSchema, loginSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema, inviteUserSchema } from '../modules/auth/auth.validation';
import { createManifestSchema, updateManifestStatusSchema, addSignatureSchema, manifestQuerySchema, assignDriverSchema } from '../modules/manifest/manifest.validation';

const registry = new OpenAPIRegistry();

registry.register('UserRegister', registerSchema);
registry.register('UserLogin', loginSchema);
registry.register('ChangePassword', changePasswordSchema);
registry.register('ForgotPassword', forgotPasswordSchema);
registry.register('ResetPassword', resetPasswordSchema);
registry.register('InviteUser', inviteUserSchema);
registry.register('CreateManifest', createManifestSchema);
registry.register('UpdateManifestStatus', updateManifestStatusSchema);
registry.register('AddSignature', addSignatureSchema);
registry.register('ManifestQuery', manifestQuerySchema);
registry.register('AssignDriver', assignDriverSchema);

const generator = new OpenAPIGenerator(registry.definitions, '3.0.0');
export const openApiSpec = generator.generateDocument({
  info: { title: 'VeriManifest API', version: '5.1.0' },
  servers: [{ url: '/api/v1' }],
});
