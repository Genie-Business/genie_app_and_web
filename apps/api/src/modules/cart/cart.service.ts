import { prisma, type Prisma } from '@genie/db';
import type { carts as C } from '@genie/contracts';
import { badRequest, notFound } from '../../lib/errors';
// Kobo fields are returned as bigint and stringified by serializeBigInts in the route.
import { recordActivity } from '../activities/activities.service';
import { computeGiftCharge } from '../fees/fees.service';
import { payForCart, type CartLine } from '../gifts/gifts.service';

const ITEM_INCLUDE = {
  wishlistItem: {
    include: {
      product: { include: { inventory: true } },
      wishlist: { include: { event: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } } },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartItemFull = Prisma.CartItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

function giftability(row: CartItemFull, userId: string): { giftable: boolean; reason: string | null } {
  const wi = row.wishlistItem;
  if (wi.product.status !== 'ACTIVE') return { giftable: false, reason: 'This product is no longer available.' };
  if (wi.wishlist.event.status === 'DELETED') return { giftable: false, reason: 'That wishlist was removed.' };
  if (wi.wishlist.event.status === 'EXPIRED') return { giftable: false, reason: 'That event has ended.' };
  if (wi.wishlist.event.user.id === userId) return { giftable: false, reason: 'This item is on your own wishlist.' };
  const remaining = wi.quantityWanted - wi.quantityFulfilled;
  if (row.quantity > remaining) return { giftable: false, reason: `Only ${remaining} still needed.` };
  if ((wi.product.inventory?.availableStock ?? 0) < row.quantity) {
    return { giftable: false, reason: 'The merchant is out of stock.' };
  }
  return { giftable: true, reason: null };
}

async function openCart(userId: string) {
  const existing = await prisma.cart.findFirst({
    where: { userId, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    include: { items: { orderBy: { createdAt: 'asc' }, include: ITEM_INCLUDE } },
  });
  if (existing) return existing;
  return prisma.cart.create({
    data: { userId, status: 'OPEN' },
    include: { items: { orderBy: { createdAt: 'asc' }, include: ITEM_INCLUDE } },
  });
}

async function toDto(cart: Awaited<ReturnType<typeof openCart>>, userId: string) {
  const items = await Promise.all(
    cart.items.map(async (row) => {
      const wi = row.wishlistItem;
      const charge = await computeGiftCharge({
        unitPriceKobo: wi.product.priceKobo,
        quantity: row.quantity,
        deliveryOption: wi.product.deliveryOption,
      });
      const g = giftability(row, userId);
      return {
        id: row.id,
        wishlistItemId: row.wishlistItemId,
        productName: wi.product.name,
        eventName: wi.wishlist.event.name,
        forWhom: `${wi.wishlist.event.user.firstName} ${wi.wishlist.event.user.lastName}`.trim(),
        unitPriceKobo: wi.product.priceKobo,
        quantity: row.quantity,
        isAnonymous: row.isAnonymous,
        message: row.message,
        giftable: g.giftable,
        reason: g.reason,
        subtotalKobo: charge.subtotalKobo,
        transactionFeeKobo: charge.transactionFeeKobo,
        logisticsFeeKobo: charge.logisticsFeeKobo,
        lineTotalKobo: charge.gifterPaysKobo,
      };
    }),
  );
  return {
    id: cart.id,
    status: cart.status,
    items,
    itemCount: items.length,
    allGiftable: items.length > 0 && items.every((i) => i.giftable),
    totalKobo: items.reduce((s, i) => s + BigInt(i.lineTotalKobo), 0n),
  };
}

export async function getCart(userId: string) {
  return toDto(await openCart(userId), userId);
}

export async function addItem(userId: string, input: C.AddCartItemBody) {
  const wi = await prisma.wishlistItem.findUnique({
    where: { id: input.wishlistItemId },
    include: { wishlist: { include: { event: { select: { userId: true, status: true } } } }, product: { select: { status: true } } },
  });
  if (!wi) throw notFound('That wishlist item no longer exists.');
  if (wi.wishlist.event.userId === userId) throw badRequest('You cannot add an item from your own wishlist.');
  if (wi.product.status !== 'ACTIVE') throw badRequest('That product is no longer available.');
  if (['DELETED', 'EXPIRED'].includes(wi.wishlist.event.status)) throw badRequest('That event is not accepting gifts.');

  const cart = await openCart(userId);
  if (cart.items.length >= 20) throw badRequest('Your cart is full (20 items). Check out or remove some first.');

  await prisma.cartItem.upsert({
    where: { cartId_wishlistItemId: { cartId: cart.id, wishlistItemId: input.wishlistItemId } },
    create: {
      cartId: cart.id,
      wishlistItemId: input.wishlistItemId,
      quantity: input.quantity,
      isAnonymous: input.isAnonymous,
      message: input.message,
    },
    update: { quantity: input.quantity, isAnonymous: input.isAnonymous, message: input.message ?? null },
  });
  return getCart(userId);
}

async function ownItem(userId: string, itemId: string) {
  const row = await prisma.cartItem.findUnique({ where: { id: itemId }, include: { cart: true } });
  if (!row || row.cart.userId !== userId || row.cart.status !== 'OPEN') throw notFound('Cart item not found.');
  return row;
}

export async function updateItem(userId: string, itemId: string, input: C.UpdateCartItemBody) {
  await ownItem(userId, itemId);
  await prisma.cartItem.update({
    where: { id: itemId },
    data: {
      ...(input.quantity == null ? {} : { quantity: input.quantity }),
      ...(input.isAnonymous == null ? {} : { isAnonymous: input.isAnonymous }),
      ...(input.message === undefined ? {} : { message: input.message }),
    },
  });
  return getCart(userId);
}

export async function removeItem(userId: string, itemId: string) {
  await ownItem(userId, itemId);
  await prisma.cartItem.delete({ where: { id: itemId } });
  return getCart(userId);
}

export async function clearCart(userId: string) {
  const cart = await openCart(userId);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  return getCart(userId);
}

export async function checkout(userId: string, method: 'WALLET' | 'BANK_TRANSFER') {
  const cart = await openCart(userId);
  if (cart.items.length === 0) throw badRequest('Your cart is empty.');

  const lines: CartLine[] = cart.items.map((row) => ({
    wishlistItemId: row.wishlistItemId,
    quantity: row.quantity,
    isAnonymous: row.isAnonymous,
    message: row.message ?? undefined,
  }));

  const result = await payForCart(userId, { lines, method });

  // Close this cart either way — a fresh OPEN one is created on next access.
  await prisma.cart.update({ where: { id: cart.id }, data: { status: 'CHECKED_OUT' } });
  await recordActivity({
    userId,
    category: 'TRANSACTION',
    action: 'cart.checkout',
    entityType: 'Cart',
    entityId: cart.id,
    metadata: { items: lines.length, totalKobo: result.totalKobo.toString(), method },
  });
  return result;
}
