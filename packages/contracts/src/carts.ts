import { z } from 'zod';
import { koboString } from './common';

// ── Cart (E013) — a gift basket of wishlist items ─────────────────────

export const addCartItemBody = z.object({
  wishlistItemId: z.string(),
  quantity: z.number().int().min(1).max(50).default(1),
  isAnonymous: z.boolean().default(false),
  message: z.string().trim().max(280).optional(),
});
export type AddCartItemBody = z.infer<typeof addCartItemBody>;

export const updateCartItemBody = z
  .object({
    quantity: z.number().int().min(1).max(50).optional(),
    isAnonymous: z.boolean().optional(),
    message: z.string().trim().max(280).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide a field to update.' });
export type UpdateCartItemBody = z.infer<typeof updateCartItemBody>;

export const checkoutCartBody = z.object({
  method: z.enum(['WALLET', 'BANK_TRANSFER']).default('WALLET'),
});
export type CheckoutCartBody = z.infer<typeof checkoutCartBody>;

export const cartItemDto = z.object({
  id: z.string(),
  wishlistItemId: z.string(),
  productName: z.string(),
  eventName: z.string(),
  forWhom: z.string(),
  unitPriceKobo: koboString,
  quantity: z.number().int(),
  isAnonymous: z.boolean(),
  message: z.string().nullable(),
  giftable: z.boolean(),
  reason: z.string().nullable(),
  subtotalKobo: koboString,
  transactionFeeKobo: koboString,
  logisticsFeeKobo: koboString,
  lineTotalKobo: koboString,
});

export const cartDto = z.object({
  id: z.string(),
  status: z.enum(['OPEN', 'CHECKED_OUT', 'ABANDONED']),
  items: z.array(cartItemDto),
  itemCount: z.number().int(),
  allGiftable: z.boolean(),
  totalKobo: koboString,
});
export type CartDto = z.infer<typeof cartDto>;
