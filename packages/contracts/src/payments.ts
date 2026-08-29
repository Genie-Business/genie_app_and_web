import { z } from 'zod';
import { koboString } from './common';

export const paymentMethod = z.enum(['BANK_TRANSFER', 'CARD', 'WALLET']);
export const paymentStatus = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED']);

// ── Add funds (US "Pay for Items" / wallet funding) ─────────────────────
export const createAddFundsIntentBody = z.object({
  amountKobo: z.number().int().min(10000), // ₦100 minimum
  method: paymentMethod.default('BANK_TRANSFER'),
});

export const virtualAccountDto = z.object({
  accountNumber: z.string(),
  bankName: z.string(),
  accountName: z.string(),
  expiresAt: z.string().nullable(),
});

export const paymentIntentDto = z.object({
  reference: z.string(),
  purpose: z.enum(['ADD_FUNDS', 'GIFT', 'ORDER']),
  amountKobo: koboString,
  status: paymentStatus,
  method: paymentMethod,
  virtualAccount: virtualAccountDto.nullable(),
  checkoutUrl: z.string().nullable(),
});

// ── Pay for a gift (US0016 / US0019) ───────────────────────────────────
export const payForGiftBody = z.object({
  wishlistItemId: z.string(),
  amountKobo: z.number().int().positive(),
  isAnonymous: z.boolean().default(false),
  message: z.string().trim().max(280).optional(),
  /** WALLET pays from balance; BANK_TRANSFER issues a one-off virtual account. */
  method: z.enum(['WALLET', 'BANK_TRANSFER']).default('WALLET'),
});

export const walletBalanceDto = z.object({
  currency: z.string(),
  balanceKobo: koboString,
  status: z.enum(['ACTIVE', 'FROZEN', 'CLOSED']),
});

// ── Cards (scaffold — Anchor card acquiring TBC) ───────────────────────
export const addCardBody = z.object({
  // Card data must be tokenised client-side; the raw PAN never reaches genie.
  provider: z.literal('anchor'),
  token: z.string().min(1),
});

// ── Anchor webhook envelope (as received at /v1/payments/webhooks/anchor) ─
export const anchorWebhookEnvelope = z.object({
  data: z.object({
    id: z.string(),
    type: z.string(),
    attributes: z.record(z.unknown()),
  }),
});
