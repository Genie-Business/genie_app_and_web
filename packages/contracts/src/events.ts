import { z } from 'zod';
import { koboString } from './common';

/** Suggested event types; the API accepts any non-empty string. */
export const EVENT_TYPES = [
  'Birthday',
  'Wedding',
  'Anniversary',
  'Baby Shower',
  'Graduation',
  'Housewarming',
  'Naming Ceremony',
  'Other',
] as const;

export const eventStatus = z.enum(['ACTIVE', 'EXPIRED', 'COMPLETED', 'DELETED']);

// ── Events (E003) ───────────────────────────────────────────────────────
export const createEventBody = z
  .object({
    type: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(120),
    deliveryAddress: z.string().trim().max(400).optional(),
    eventDate: z.string().datetime(),
    /** Defaults to the event date. Must be on/before the event date. */
    expiresAt: z.string().datetime().optional(),
    /** When set, an empty wishlist with this name is created with the event. */
    wishlistName: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => !v.expiresAt || new Date(v.expiresAt) <= new Date(v.eventDate), {
    message: 'Expiry must be on or before the event date.',
    path: ['expiresAt'],
  });
export type CreateEventBody = z.infer<typeof createEventBody>;

export const updateEventBody = z
  .object({
    type: z.string().trim().min(1).max(60).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    deliveryAddress: z.string().trim().max(400).nullable().optional(),
    eventDate: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .refine(
    (v) => !v.expiresAt || !v.eventDate || new Date(v.expiresAt) <= new Date(v.eventDate),
    { message: 'Expiry must be on or before the event date.', path: ['expiresAt'] },
  );
export type UpdateEventBody = z.infer<typeof updateEventBody>;

export const eventSummaryDto = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  deliveryAddress: z.string().nullable(),
  eventDate: z.string(),
  expiresAt: z.string(),
  status: eventStatus,
  wishlistCount: z.number().int(),
  itemCount: z.number().int(),
  /** 0–100, weighted by quantityFulfilled / quantityWanted across all items. */
  fulfilmentPct: z.number().int(),
  createdAt: z.string(),
});

export const dashboardDto = z.object({
  totalEvents: z.number().int(),
  activeEvents: z.number().int(),
  recentEvents: z.array(eventSummaryDto),
});

// ── Wishlists (E004) ────────────────────────────────────────────────────
export const createWishlistBody = z.object({
  eventId: z.string(),
  name: z.string().trim().min(1).max(120),
});

export const addWishlistItemBody = z.object({
  productId: z.string(),
  quantityWanted: z.number().int().min(1).max(99).default(1),
  note: z.string().trim().max(500).optional(),
});
export type AddWishlistItemBody = z.infer<typeof addWishlistItemBody>;

export const updateWishlistItemBody = z.object({
  quantityWanted: z.number().int().min(1).max(99).optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type UpdateWishlistItemBody = z.infer<typeof updateWishlistItemBody>;

export const wishlistItemDto = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  productImageUrl: z.string().nullable(),
  unitPriceKobo: koboString,
  quantityWanted: z.number().int(),
  quantityFulfilled: z.number().int(),
  isAnonymousGift: z.boolean(),
  note: z.string().nullable(),
});

export const wishlistDto = z.object({
  id: z.string(),
  eventId: z.string(),
  eventName: z.string(),
  name: z.string(),
  items: z.array(wishlistItemDto),
  itemCount: z.number().int(),
  totalValueKobo: koboString,
  /** A wishlist needs ≥ 2 items before it can be shared (business rule). */
  isShareable: z.boolean(),
});

export const wishlistShareDto = z.object({
  wishlistId: z.string(),
  shareUrl: z.string(),
  itemCount: z.number().int(),
  isShareable: z.boolean(),
});

/** Public (unauthenticated) wishlist view for friends following a share link. */
export const publicWishlistDto = z.object({
  wishlistId: z.string(),
  wishlistName: z.string(),
  eventName: z.string(),
  eventType: z.string(),
  eventDate: z.string(),
  expiresAt: z.string(),
  celebrantName: z.string(),
  deliveryAddress: z.string().nullable(),
  items: z.array(
    wishlistItemDto.pick({
      id: true,
      productId: true,
      productName: true,
      productImageUrl: true,
      unitPriceKobo: true,
      quantityWanted: true,
      quantityFulfilled: true,
      note: true,
    }),
  ),
});
