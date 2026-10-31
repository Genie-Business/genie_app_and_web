import { z } from 'zod';
import { koboString } from './common';

export const paymentStatus = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED']);

// A payment is made on the payment provider's hosted checkout page: genie hands back a
// link, the buyer pays there, and the intent moves to COMPLETED once it is confirmed.
// Paying for a gift is quantity-based (the server prices it from the live fee schedule),
// see `payForGiftBody` in ./gifts.ts.
export const paymentIntentDto = z.object({
  reference: z.string(),
  purpose: z.enum(['GIFT', 'ORDER']),
  amountKobo: koboString,
  discountKobo: koboString,
  status: paymentStatus,
  checkoutUrl: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
