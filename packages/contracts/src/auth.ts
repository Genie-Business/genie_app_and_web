import { z } from 'zod';

/**
 * Auth request/response contracts. Rules mirror the requirements doc
 * (US0001–US0007, US0023). Keep the regexes in sync with @genie/core's
 * password-policy module — the API validates with these, @genie/core is the
 * shared implementation the tests pin.
 */

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long.')
  .regex(/[A-Z]/, 'Password must contain an upper-case letter.')
  .regex(/[a-z]/, 'Password must contain a lower-case letter.')
  .regex(/[0-9]/, 'Password must contain a number.')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a symbol.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9.+_-]*[A-Za-z0-9])?@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/,
    'Enter a valid email address.',
  );

export const usernameSchema = z
  .string()
  .trim()
  .regex(
    /^(?!\.)(?!.*\.\.)[A-Za-z0-9._]{3,20}(?<!\.)$/,
    'Username must be 3–20 letters, numbers, dots or underscores.',
  );

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, 'Enter a valid phone number.');

export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.');

const deviceInfo = {
  deviceId: z.string().min(8).max(128),
  deviceName: z.string().max(120).optional(),
};

// ── Celebrant registration (US0001) ──────────────────────────────────────
export const registerCelebrantBody = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  phone: phoneSchema,
  stateOfResidence: z.string().trim().min(1),
  country: z.string().trim().length(2).default('NG'),
  referralCode: z.string().trim().min(4).max(24).optional(),
});
export type RegisterCelebrantBody = z.infer<typeof registerCelebrantBody>;

// ── Merchant registration (US0004) ───────────────────────────────────────
export const registerMerchantBody = z.object({
  businessName: z.string().trim().min(1).max(140),
  confirmationCode: z.string().trim().min(4).max(40),
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  businessPhone: phoneSchema,
  businessState: z.string().trim().min(1),
  country: z.string().trim().length(2).default('NG'),
  bankName: z.string().trim().min(1),
  bankAccountNumber: z.string().trim().regex(/^\d{10}$/, 'Enter a valid 10-digit account number.'),
  bankAccountName: z.string().trim().min(1).optional(),
});
export type RegisterMerchantBody = z.infer<typeof registerMerchantBody>;

export const registerResponse = z.object({
  userId: z.string(),
  email: z.string(),
  emailVerificationRequired: z.literal(true),
  message: z.string(),
});

// ── Email verification ──────────────────────────────────────────────────
export const verifyEmailBody = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  deviceId: z.string().min(8).max(128),
  deviceName: z.string().max(120).optional(),
});
export const resendOtpBody = z.object({
  email: emailSchema,
  purpose: z.enum(['EMAIL_VERIFY', 'PASSWORD_RESET']).default('EMAIL_VERIFY'),
});

// ── Login (US0002 / US0005) ─────────────────────────────────────────────
export const loginBody = z.object({
  identifier: z.string().trim().min(1), // email or username
  password: z.string().min(1),
  ...deviceInfo,
});
export type LoginBody = z.infer<typeof loginBody>;

export const tokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresIn: z.number().int(),
  tokenType: z.literal('Bearer'),
});
export type TokenPair = z.infer<typeof tokenPair>;

export const refreshBody = z.object({ refreshToken: z.string().min(1), ...deviceInfo });
export const logoutBody = z.object({ refreshToken: z.string().min(1) });

// ── Password reset (US0003) ─────────────────────────────────────────────
export const forgotPasswordBody = z.object({ email: emailSchema });
export const resetPasswordBody = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  newPassword: passwordSchema,
});

// ── Change password (US0023, authenticated) ────────────────────────────
export const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must be different from the current one.',
    path: ['newPassword'],
  });

// ── Register / device token (push) ─────────────────────────────────────
export const registerDeviceTokenBody = z.object({
  fcmToken: z.string().min(10),
  platform: z.enum(['IOS', 'ANDROID']),
});
