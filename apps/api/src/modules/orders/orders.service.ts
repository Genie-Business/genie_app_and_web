import { prisma } from '@genie/db';
import { notFound } from '../../lib/errors';

const INCLUDE = {
  merchant: { select: { firstName: true, lastName: true, merchantProfile: { select: { businessName: true } } } },
  items: { select: { description: true, quantity: true, lineTotalKobo: true } },
  delivery: { select: { status: true } },
  gift: { select: { id: true, isAnonymous: true } },
} as const;

function merchantName(m: {
  firstName: string;
  lastName: string;
  merchantProfile: { businessName: string } | null;
}) {
  return m.merchantProfile?.businessName || `${m.firstName} ${m.lastName}`.trim();
}

/** Orders I placed as a buyer (each gift creates one order). */
export async function listMyOrders(userId: string) {
  const rows = await prisma.order.findMany({
    where: { buyerUserId: userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: INCLUDE,
  });
  return rows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    totalKobo: o.totalKobo,
    merchantName: merchantName(o.merchant),
    items: o.items.map((i) => ({ description: i.description, quantity: i.quantity, lineTotalKobo: i.lineTotalKobo })),
    deliveryStatus: o.delivery?.status ?? null,
    createdAt: o.createdAt.toISOString(),
  }));
}

export async function getMyOrder(userId: string, id: string) {
  const o = await prisma.order.findFirst({
    where: { id, buyerUserId: userId },
    include: { ...INCLUDE, delivery: true },
  });
  if (!o) throw notFound('Order not found.');
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    subtotalKobo: o.subtotalKobo,
    feeKobo: o.feeKobo,
    totalKobo: o.totalKobo,
    merchantName: merchantName(o.merchant),
    deliveryAddress: o.deliveryAddress,
    items: o.items.map((i) => ({ description: i.description, quantity: i.quantity, lineTotalKobo: i.lineTotalKobo })),
    delivery: o.delivery
      ? {
          status: o.delivery.status,
          courierName: o.delivery.courierName,
          courierRef: o.delivery.courierRef,
          dispatchedAt: o.delivery.dispatchedAt?.toISOString() ?? null,
          deliveredAt: o.delivery.deliveredAt?.toISOString() ?? null,
        }
      : null,
    isGift: o.gift != null,
    createdAt: o.createdAt.toISOString(),
  };
}
