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
  method: z.enum(['WALLET', 'BANK_TRANSFER']).default('WALLET'),
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

// ── Withdraw / payouts (E012) ──────────────────────────────────────────
export const withdrawBody = z.object({
  amountKobo: z.number().int().min(10000).max(500_000_000), // ₦100 min, ₦5,000,000 max
  bankName: z.string().trim().min(1).max(120),
  bankCode: z.string().trim().max(20).optional(),
  accountNumber: z.string().regex(/^\d{10}$/),
  accountName: z.string().trim().min(1).max(120),
});

export const payoutAccountBody = z.object({
  bankName: z.string().trim().min(1),
  bankCode: z.string().trim().optional(),
  accountNumber: z.string().regex(/^\d{10}$/),
  accountName: z.string().trim().min(1),
});
export type WithdrawBody = z.infer<typeof withdrawBody>;
export type PayoutAccountBody = z.infer<typeof payoutAccountBody>;
