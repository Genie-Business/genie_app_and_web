import { z } from 'zod';
import { koboString } from './common';

// ── Order management (E014) ─────────────────────────────────────────────

// A merchant reports a parcel going out or failing. "Delivered" is never theirs to say: it comes from the
// delivery company or the person receiving the gift (see orders/delivery.service.ts).
export const deliveryUpdateBody = z.object({
  status: z.enum(['DISPATCHED', 'IN_TRANSIT', 'FAILED']),
  courierName: z.string().trim().max(120).optional(),
  courierRef: z.string().trim().max(120).optional(),
});
export type DeliveryUpdateBody = z.infer<typeof deliveryUpdateBody>;

export const orderItemDto = z.object({
  description: z.string(),
  quantity: z.number().int(),
  lineTotalKobo: koboString,
});

export const merchantOrderDto = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  subtotalKobo: koboString,
  commissionKobo: koboString,
  proceedsKobo: koboString,
  items: z.array(orderItemDto),
  delivery: z
    .object({
      status: z.string(),
      courierName: z.string().nullable(),
      courierRef: z.string().nullable(),
    })
    .nullable(),
  isGift: z.boolean(),
  createdAt: z.string(),
});

export const buyerOrderDto = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  totalKobo: koboString,
  merchantName: z.string(),
  items: z.array(orderItemDto),
  deliveryStatus: z.string().nullable(),
  createdAt: z.string(),
});
