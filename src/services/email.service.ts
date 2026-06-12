import nodemailer from 'nodemailer';
import { environment } from '../config/environment';
import logger from '../config/logger';

const transporter = nodemailer.createTransport({
  host: environment.SMTP_HOST,
  port: environment.SMTP_PORT,
  secure: environment.SMTP_PORT === 465,
  auth: {
    user: environment.SMTP_USER,
    pass: environment.SMTP_PASS,
  },
});

const templateMap: Record<string, (data: any) => { subject: string; html: string }> = {
  welcome: (data) => ({
    subject: `Welcome to VeriManifest, ${data.name}!`,
    html: `
      <h1>Welcome to VeriManifest!</h1>
      <p>Dear ${data.name},</p>
      <p>Your account has been created successfully. Your company "${data.companyName}" is now registered.</p>
      <p>Get started by creating your first waste manifest.</p>
    `,
  }),
  invite: (data) => ({
    subject: `You've been invited to VeriManifest`,
    html: `
      <h1>Invitation to VeriManifest</h1>
      <p>Dear ${data.name},</p>
      <p>You have been invited to join ${data.companyName} on VeriManifest.</p>
      <p>Your temporary password is: <strong>${data.tempPassword}</strong></p>
      <p>Please click <a href="${data.inviteUrl}">here</a> to set your password and activate your account.</p>
      <p>This link expires in 7 days.</p>
    `,
  }),
  'password-reset': (data) => ({
    subject: 'Password Reset Request',
    html: `
      <h1>Password Reset</h1>
      <p>Dear ${data.name},</p>
      <p>Click the link below to reset your password:</p>
      <a href="${data.resetUrl}">Reset Password</a>
      <p>This link expires in 1 hour.</p>
    `,
  }),
  compliance_violation: (data) => ({
    subject: `Compliance Alert - Manifest ${data.manifestNumber}`,
    html: `
      <h1>Compliance Violation Detected</h1>
      <p>Manifest: ${data.manifestNumber}</p>
      <ul>${data.violations.map((v: string) => `<li>${v}</li>`).join('')}</ul>
    `,
  }),
  new_bid: (data) => ({
    subject: 'New Bid Received',
    html: `
      <h1>New Bid on Your Listing</h1>
      <p>A new bid of $${data.amount} has been placed on your listing.</p>
    `,
  }),
  bid_accepted: (data) => ({
    subject: 'Your Bid Was Accepted!',
    html: `
      <h1>Congratulations!</h1>
      <p>Your bid of $${data.amount} has been accepted.</p>
    `,
  }),
  manifest_assigned: (data) => ({
    subject: `New Manifest Assigned: ${data.manifestNumber}`,
    html: `
      <h1>Manifest Assigned</h1>
      <p>You have been assigned to manifest ${data.manifestNumber}.</p>
      <p>Please log in to view details.</p>
    `,
  }),
  payment_failed: (data) => ({
    subject: 'Payment Failed - Action Required',
    html: `
      <h1>Payment Failed</h1>
      <p>Your payment of ${data.amount} ${data.currency} could not be processed.</p>
      <p>Please update your payment method to avoid service interruption.</p>
    `,
  }),
};

export const emailService = {
  async send({ to, template, data }: { to: string; template: string; data: any }) {
    const templateFn = templateMap[template];
    if (!templateFn) {
      logger.warn('Unknown email template', { template });
      return;
    }

    const { subject, html } = templateFn(data);

    try {
      await transporter.sendMail({
        from: `"VeriManifest" <${environment.SMTP_USER}>`,
        to,
        subject,
        html,
      });
      logger.info('Email sent', { to, template });
    } catch (error) {
      logger.error('Email send failed', { error, to, template });
      throw error;
    }
  },
};
