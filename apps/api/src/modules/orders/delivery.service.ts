import { prisma } from '@genie/db';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { recordActivity } from '../activities/activities.service';
import { notify } from '../notifications/notify.service';
import { runPayouts } from '../payouts/payouts.service';

/** Who reported the delivery. The merchant is deliberately not one of them. */
export type Confirmer = 'celebrant' | 'courier' | 'admin';

const money = (kobo: bigint) => `₦${(Number(kobo) / 100).toLocaleString()}`;

/**
 * A delivery is confirmed: mark the order delivered, tell everyone involved, and pay the merchant
 * straight away. The merchant never marks their own delivery as done; it comes from the delivery
 * company, from the person receiving the gift, or (as a fallback) from a genie admin.
 * Idempotent: confirming twice does nothing the second time.
 */
export async function confirmDelivery(orderId: string, by: Confirmer, actorUserId?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      delivery: true,
      items: { select: { description: true }, take: 1 },
      event: { select: { userId: true } },
      gift: { select: { id: true, status: true } },
    },
  });
  if (!order) throw notFound('Order not found.');
  if (order.status === 'DELIVERED') return { alreadyDelivered: true as const };
  if (order.status !== 'PAID' && order.status !== 'FULFILLING') throw badRequest('This order is not awaiting delivery.');

  // Claim the transition so a courier call and the recipient's tap can't both run the follow-ups.
  const moved = await prisma.order.updateMany({
    where: { id: orderId, status: { in: ['PAID', 'FULFILLING'] } },
    data: { status: 'DELIVERED' },
  });
  if (moved.count === 0) return { alreadyDelivered: true as const };

  const now = new Date();
  await prisma.delivery.upsert({
    where: { orderId },
    create: { orderId, status: 'DELIVERED', deliveredAt: now },
    update: { status: 'DELIVERED', deliveredAt: now },
  });
  if (order.gift && order.gift.status !== 'REVEALED') {
    await prisma.gift.update({ where: { id: order.gift.id }, data: { status: 'DELIVERED' } });
  }

  const label = order.items[0]?.description ?? 'Your order';
  const celebrantId = order.event?.userId ?? null;
  try {
    if (order.buyerUserId) {
      await notify({
        userId: order.buyerUserId,
        type: 'order.delivery',
        title: 'Gift delivered',
        body: `${label} has been delivered.`,
        payload: { orderId },
      });
    }
    if (celebrantId && celebrantId !== order.buyerUserId && by !== 'celebrant') {
      await notify({
        userId: celebrantId,
        type: 'gift.delivered',
        title: 'Your gift has arrived',
        body: `${label} has been delivered. Enjoy!`,
        payload: { orderId, giftId: order.gift?.id },
      });
    }
    await notify({
      userId: order.merchantId,
      type: 'order.delivered',
      title: 'Delivery confirmed',
      body: `${order.orderNumber} was delivered. Your payment of ${money(order.merchantNetKobo)} is being sent to your bank account.`,
      payload: { orderId },
    });
    await recordActivity({
      userId: order.merchantId,
      category: 'TRANSACTION',
      action: 'delivery.confirmed',
      entityType: 'Order',
      entityId: orderId,
      metadata: { by, ...(actorUserId ? { actorUserId } : {}) },
    });
  } catch (err) {
    logger.error({ err, orderId }, 'delivery notifications failed');
  }

  // Pay the merchant now. A problem here (Transfers not enabled, a bad bank account) must not undo
  // the confirmation; the order stays owed and the daily run picks it up.
  try {
    await runPayouts({ merchantId: order.merchantId });
  } catch (err) {
    logger.error({ err, orderId }, 'immediate payout after delivery failed');
  }

  logger.info({ orderId, by }, 'delivery confirmed');
  return { alreadyDelivered: false as const };
}

/**
 * The person a gift is for says it has reached them. Allowed once the merchant has sent it (or
 * straight away for a gift that is collected in person), so a recipient can't release the money
 * for something that was never sent.
 */
export async function confirmReceived(userId: string, giftId: string) {
  const gift = await prisma.gift.findUnique({
    where: { id: giftId },
    include: {
      order: { include: { delivery: { select: { status: true } } } },
      wishlistItem: {
        include: {
          product: { select: { deliveryOption: true } },
          wishlist: { select: { event: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!gift) throw notFound('Gift not found.');
  if (gift.wishlistItem.wishlist.event.userId !== userId) throw forbidden('This gift is not on your wishlist.');
  if (!gift.order) throw badRequest('This gift has no delivery to confirm.');

  const sent = gift.order.delivery?.status === 'DISPATCHED' || gift.order.delivery?.status === 'IN_TRANSIT';
  const collected = gift.wishlistItem.product.deliveryOption === 'PICKUP';
  if (gift.order.status !== 'DELIVERED' && !sent && !collected) {
    throw badRequest("The merchant hasn't sent this gift yet. You can confirm it once it's on its way.");
  }
  return confirmDelivery(gift.order.id, 'celebrant', userId);
}

/** A delivery company or admin identifies the order by its number. */
export async function confirmByOrderNumber(orderNumber: string, by: Exclude<Confirmer, 'celebrant'>) {
  const order = await prisma.order.findUnique({ where: { orderNumber: orderNumber.trim() }, select: { id: true } });
  if (!order) throw notFound('No order with that number.');
  return confirmDelivery(order.id, by);
}
