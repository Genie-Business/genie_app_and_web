import type { Prisma } from '@genie/db';

export const WISHLIST_INCLUDE = {
  event: { select: { id: true, name: true, userId: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          priceKobo: true,
          status: true,
          images: { orderBy: { position: 'asc' }, take: 1, select: { blobUrl: true } },
        },
      },
    },
  },
} satisfies Prisma.WishlistInclude;

export type WishlistWithItems = Prisma.WishlistGetPayload<{ include: typeof WISHLIST_INCLUDE }>;

/** ≥ 2 items before a wishlist can be shared (business rule, US0015 deps). */
export const MIN_SHAREABLE_ITEMS = 2;

export function toWishlistItemDto(i: WishlistWithItems['items'][number]) {
  return {
    id: i.id,
    productId: i.productId,
    productName: i.product.name,
    productImageUrl: i.product.images[0]?.blobUrl ?? null,
    unitPriceKobo: i.product.priceKobo,
    quantityWanted: i.quantityWanted,
    quantityFulfilled: i.quantityFulfilled,
    isAnonymousGift: i.isAnonymousGift,
    note: i.note,
  };
}

export function toWishlistDto(w: WishlistWithItems) {
  const items = w.items.map(toWishlistItemDto);
  const totalValueKobo = w.items.reduce(
    (sum, i) => sum + i.product.priceKobo * BigInt(i.quantityWanted),
    0n,
  );
  return {
    id: w.id,
    eventId: w.eventId,
    eventName: w.event.name,
    name: w.name,
    items,
    itemCount: items.length,
    totalValueKobo,
    isShareable: items.length >= MIN_SHAREABLE_ITEMS,
  };
}
