import { z } from 'zod';

const bankCodeSchema = z.string().trim().regex(/^\d{2,8}$/, 'Pick a bank from the list.');
const accountNumberSchema = z.string().trim().regex(/^\d{10}$/, 'Enter a valid 10-digit account number.');

export const bankSchema = z.object({ code: z.string(), name: z.string() });
export type Bank = z.infer<typeof bankSchema>;

// ── Name enquiry ─────────────────────────────────────────────────────────
// Anonymous callers (merchant sign-up, before an account exists) must send the
// signup token they got by verifying their email; signed-in merchants don't.
export const resolveAccountBody = z.object({
  bankCode: bankCodeSchema,
  accountNumber: accountNumberSchema,
  signupToken: z.string().min(20).max(2000).optional(),
});
export type ResolveAccountBody = z.infer<typeof resolveAccountBody>;

export const resolvedAccountSchema = z.object({
  accountName: z.string(),
  accountNumber: z.string(),
  bankCode: z.string(),
  bankName: z.string(),
});
export type ResolvedAccount = z.infer<typeof resolvedAccountSchema>;
