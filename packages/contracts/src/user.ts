import { z } from 'zod';

export const userRole = z.enum(['CELEBRANT', 'MERCHANT']);
export type UserRole = z.infer<typeof userRole>;

export const kycStatus = z.enum(['NONE', 'PENDING', 'APPROVED', 'REJECTED']);

/** The `/v1/me` payload. */
export const meResponse = z.object({
  id: z.string(),
  role: userRole,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  username: z.string(),
  phone: z.string().nullable(),
  country: z.string(),
  stateOfResidence: z.string().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  merchant: z
    .object({
      businessName: z.string(),
      kybStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
    })
    .nullable(),
  kyc: z.object({ level1: kycStatus }),
});
export type MeResponse = z.infer<typeof meResponse>;

/** Profile is read-only except username (US "Profile settings"). */
export const updateUsernameBody = z.object({
  username: z
    .string()
    .trim()
    .regex(/^(?!\.)(?!.*\.\.)[A-Za-z0-9._]{3,20}(?<!\.)$/),
});

export const deleteAccountRequestBody = z.object({ email: z.string().email() });
export const deleteAccountConfirmBody = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  reason: z.string().trim().max(500).optional(),
});
