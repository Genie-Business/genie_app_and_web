import { z } from 'zod';

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

export const createEventBody = z
  .object({
    type: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(120),
    deliveryAddress: z.string().trim().max(400).optional(),
    eventDate: z.string().datetime(),
    expiresAt: z.string().datetime().optional(),
  })
  .refine((v) => !v.expiresAt || new Date(v.expiresAt) <= new Date(v.eventDate), {
    message: 'Expiry must be on or before the event date.',
    path: ['expiresAt'],
  });
export type CreateEventBody = z.infer<typeof createEventBody>;

export const updateEventBody = createEventBody;

export const eventDto = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  deliveryAddress: z.string().nullable(),
  eventDate: z.string(),
  expiresAt: z.string(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'COMPLETED', 'DELETED']),
  wishlistCount: z.number().int(),
});

export const createWishlistBody = z.object({
  eventId: z.string(),
  name: z.string().trim().min(1).max(120),
});

export const addWishlistItemBody = z.object({
  productId: z.string(),
  quantityWanted: z.number().int().min(1).default(1),
  isAnonymousGift: z.boolean().default(false),
  note: z.string().trim().max(500).optional(),
});

export const wishlistItemDto = z.object({
  id: z.string(),
  productId: z.string(),
  quantityWanted: z.number().int(),
  quantityFulfilled: z.number().int(),
  isAnonymousGift: z.boolean(),
  note: z.string().nullable(),
});

export const wishlistDto = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  items: z.array(wishlistItemDto),
});
