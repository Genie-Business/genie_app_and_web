import { z } from 'zod';
import { koboString } from './common';

// ── Gifting (E005 / E012) ───────────────────────────────────────────────
export const giftQuoteBody = z.object({
  wishlistItemId: z.string(),
  quantity: z.number().int().min(1).max(50).default(1),
});

export const payForGiftBody = z.object({
  wishlistItemId: z.string(),
  quantity: z.number().int().min(1).max(50).default(1),
  isAnonymous: z.boolean().default(false),
  message: z.string().trim().max(280).optional(),
});
export type PayForGiftBody = z.infer<typeof payForGiftBody>;

export const giftChargeDto = z.object({
  quantity: z.number().int(),
  subtotalKobo: koboString,
  transactionFeeKobo: koboString,
  logisticsFeeKobo: koboString,
  gifterPaysKobo: koboString,
  commissionKobo: koboString,
  merchantReceivesKobo: koboString,
  genieRetainsKobo: koboString,
});

export const giftReceivedDto = z.object({
  id: z.string(),
  productName: z.string(),
  eventName: z.string(),
  amountKobo: koboString,
  message: z.string().nullable(),
  from: z.string().nullable(),
  isAnonymous: z.boolean(),
  revealed: z.boolean(),
  canReveal: z.boolean(),
  status: z.string(),
  createdAt: z.string(),
});

// ── Cards (E012, US0019) ────────────────────────────────────────────────
export const addCardBody = z.object({
  // The provider tokenises the card client-side; genie never receives the PAN.
  providerToken: z.string().min(6),
  last4: z.string().regex(/^\d{4}$/),
  brand: z.string().max(20).optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().min(2024).max(2100).optional(),
  makeDefault: z.boolean().default(false),
});
export type AddCardBody = z.infer<typeof addCardBody>;

export const cardDto = z.object({
  id: z.string(),
  last4: z.string(),
  brand: z.string().nullable(),
  expMonth: z.number().int().nullable(),
  expYear: z.number().int().nullable(),
  isDefault: z.boolean(),
});

// ── Payouts (E012) ──────────────────────────────────────────
export const payoutAccountBody = z.object({
  bankName: z.string().trim().min(1),
  /** With a bank code the server looks up the account name itself. */
  bankCode: z.string().trim().regex(/^\d{2,8}$/).optional(),
  accountNumber: z.string().regex(/^\d{10}$/),
  /** Only used when the name lookup is unavailable; a looked-up name always wins. */
  accountName: z.string().trim().min(1).max(120).optional(),
});
export type PayoutAccountBody = z.infer<typeof payoutAccountBody>;
