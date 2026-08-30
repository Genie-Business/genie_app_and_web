import { z } from 'zod';

// ── Settings (E011) ────────────────────────────────────────────────────

/** Editable profile fields. Identity fields (name, email) stay locked. */
export const updateProfileBody = z
  .object({
    dateOfBirth: z.string().datetime().optional(),
    stateOfResidence: z.string().trim().min(1).max(60).optional(),
    addressLine: z.string().trim().min(1).max(200).optional(),
    lga: z.string().trim().min(1).max(80).optional(),
    city: z.string().trim().min(1).max(80).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update.' });
export type UpdateProfileBody = z.infer<typeof updateProfileBody>;

export const sessionDto = z.object({
  id: z.string(),
  deviceId: z.string(),
  deviceName: z.string().nullable(),
  userAgent: z.string().nullable(),
  current: z.boolean(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type SessionDto = z.infer<typeof sessionDto>;

export const revokeOtherSessionsBody = z.object({
  deviceId: z.string().trim().min(1),
});

export const deleteAccountConfirmBody = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

export const allowedCountryDto = z.object({
  code: z.string(),
  name: z.string(),
  callingCode: z.string().nullable(),
  states: z.array(z.string()),
});
export type AllowedCountryDto = z.infer<typeof allowedCountryDto>;
