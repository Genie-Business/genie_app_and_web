import { z } from 'zod';
import { koboString } from './common';

/**
 * The concierge service — a celebrant imports a gift from a link outside
 * genie's catalogue (Amazon, Jumia, a boutique site…). A genie staff member
 * reviews it, prices it, and activates it; from then on it's an ordinary
 * catalogue item (see the Product it's linked to).
 */
export const conciergeRequestStatus = z.enum(['NEW', 'IN_REVIEW', 'ACTIVE', 'REJECTED', 'CANCELLED']);
export type ConciergeRequestStatus = z.infer<typeof conciergeRequestStatus>;

export const createConciergeRequestBody = z.object({
  wishlistId: z.string(),
  sourceUrl: z.string().trim().url().max(2048),
  name: z.string().trim().min(1).max(160),
  note: z.string().trim().max(500).optional(),
  /** A rough guess at the price — the concierge sets the real one on review. */
  estimatedPriceKobo: z.number().int().positive().max(1_000_000_000).optional(),
});
export type CreateConciergeRequestBody = z.infer<typeof createConciergeRequestBody>;

export const conciergeRequestDto = z.object({
  id: z.string(),
  sourceUrl: z.string(),
  name: z.string(),
  note: z.string().nullable(),
  estimatedPriceKobo: koboString.nullable(),
  status: conciergeRequestStatus,
  rejectionReason: z.string().nullable(),
  productId: z.string(),
  wishlistItemId: z.string(),
  createdAt: z.string(),
});
export type ConciergeRequestDto = z.infer<typeof conciergeRequestDto>;
