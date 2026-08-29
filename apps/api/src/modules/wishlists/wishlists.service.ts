import { prisma } from '@genie/db';
import type { events as E } from '@genie/contracts';
import { getEnv } from '../../env';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import {
  MIN_SHAREABLE_ITEMS,
  WISHLIST_INCLUDE,
  toWishlistDto,
} from './wishlists.mapper';

type AddItem = E.AddWishlistItemBody;
type UpdateItem = E.UpdateWishlistItemBody;

async function ownedWishlist(userId: string, id: string) {
  const wishlist = await prisma.wishlist.findUnique({ where: { id }, include: WISHLIST_INCLUDE });
  if (!wishlist || wishlist.event.userId !== userId) throw notFound('Wishlist not found.');
  return wishlist;
}

async function reload(id: string) {
  return prisma.wishlist.findUniqueOrThrow({ where: { id }, include: WISHLIST_INCLUDE });
}

export async function createWishlist(userId: string, input: { eventId: string; name: string }) {
  const event = await prisma.event.findFirst({
    where: { id: input.eventId, userId, status: { not: 'DELETED' } },
    select: { id: true },
  });
  if (!event) throw notFound('Event not found.');

  const dupe = await prisma.wishlist.findFirst({
    where: { eventId: input.eventId, name: { equals: input.name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (dupe) throw conflict('wishlist_name_taken', 'This event already has a wishlist with that name.');

  const wishlist = await prisma.wishlist.create({
    data: { eventId: input.eventId, name: input.name },
    include: WISHLIST_INCLUDE,
  });
  logger.info({ userId, wishlistId: wishlist.id }, 'wishlist created');
  return toWishlistDto(wishlist);
}

export async function getWishlist(userId: string, id: string) {
  return toWishlistDto(await ownedWishlist(userId, id));
}

export async function addItem(userId: string, wishlistId: string, input: AddItem) {
  await ownedWishlist(userId, wishlistId);

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { inventory: true },
  });
  if (!product || product.status !== 'ACTIVE') {
    throw badRequest('That product is not available.');
  }

  // Upsert: adding a product already on the list updates its quantity/note.
  await prisma.wishlistItem.upsert({
    where: { wishlistId_productId: { wishlistId, productId: input.productId } },
    create: {
      wishlistId,
      productId: input.productId,
      quantityWanted: input.quantityWanted,
      note: input.note,
    },
    update: {
      quantityWanted: input.quantityWanted,
      note: input.note ?? null,
    },
  });
  return toWishlistDto(await reload(wishlistId));
}

export async function updateItem(
  userId: string,
  wishlistId: string,
  itemId: string,
  input: UpdateItem,
) {
  const wishlist = await ownedWishlist(userId, wishlistId);
  const item = wishlist.items.find((i) => i.id === itemId);
  if (!item) throw notFound('Wishlist item not found.');

  await prisma.wishlistItem.update({
    where: { id: itemId },
    data: {
      quantityWanted: input.quantityWanted,
      note: input.note === undefined ? undefined : input.note,
    },
  });
  return toWishlistDto(await reload(wishlistId));
}

export async function removeItem(userId: string, wishlistId: string, itemId: string) {
  const wishlist = await ownedWishlist(userId, wishlistId);
  const item = wishlist.items.find((i) => i.id === itemId);
  if (!item) throw notFound('Wishlist item not found.');
  if (item.quantityFulfilled > 0) {
    throw badRequest('This item already has gifts against it and cannot be removed.');
  }
  await prisma.wishlistItem.delete({ where: { id: itemId } });
  return toWishlistDto(await reload(wishlistId));
}

export async function shareInfo(userId: string, wishlistId: string) {
  const wishlist = await ownedWishlist(userId, wishlistId);
  const itemCount = wishlist.items.length;
  return {
    wishlistId,
    shareUrl: `${getEnv().APP_PUBLIC_URL}/w/${wishlistId}`,
    itemCount,
    isShareable: itemCount >= MIN_SHAREABLE_ITEMS,
  };
}

/** Unauthenticated view for a friend following a share link. */
export async function publicView(wishlistId: string) {
  const wishlist = await prisma.wishlist.findUnique({
    where: { id: wishlistId },
    include: {
      ...WISHLIST_INCLUDE,
      event: {
        select: {
          id: true,
          name: true,
          userId: true,
          type: true,
          eventDate: true,
          expiresAt: true,
          status: true,
          deliveryAddress: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!wishlist || wishlist.event.status === 'DELETED') throw notFound('This wishlist is not available.');
  if (wishlist.items.length < MIN_SHAREABLE_ITEMS) {
    throw notFound('This wishlist is not ready to be shared yet.');
  }

  return {
    wishlistId: wishlist.id,
    wishlistName: wishlist.name,
    eventName: wishlist.event.name,
    eventType: wishlist.event.type,
    eventDate: wishlist.event.eventDate.toISOString(),
    expiresAt: wishlist.event.expiresAt.toISOString(),
    celebrantName: `${wishlist.event.user.firstName} ${wishlist.event.user.lastName}`.trim(),
    deliveryAddress: wishlist.event.deliveryAddress,
    items: wishlist.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      productImageUrl: i.product.images[0]?.blobUrl ?? null,
      unitPriceKobo: i.product.priceKobo,
      quantityWanted: i.quantityWanted,
      quantityFulfilled: i.quantityFulfilled,
      note: i.note,
    })),
  };
}
