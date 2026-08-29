import { prisma } from '@genie/db';
import type { catalog as C } from '@genie/contracts';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';

type CreateProduct = C.CreateProductBody;
type UpdateProduct = Partial<CreateProduct>;

const INCLUDE = { images: true, inventory: true, category: true } as const;

async function assertCategory(categoryId: string) {
  const cat = await prisma.category.findFirst({ where: { id: categoryId, isActive: true } });
  if (!cat) throw badRequest('That category does not exist. Request it to be added first.');
}

export async function createProduct(merchantId: string, input: CreateProduct) {
  await assertCategory(input.categoryId);
  const product = await prisma.product.create({
    data: {
      merchantId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      priceKobo: BigInt(input.priceKobo),
      location: input.location,
      deliveryOption: input.deliveryOption,
      status: 'ACTIVE',
      images: {
        create: (input.imageUrls ?? []).map((url, position) => ({ blobUrl: url, position })),
      },
      inventory: { create: { availableStock: input.quantity ?? 0 } },
    },
    include: INCLUDE,
  });
  logger.info({ merchantId, productId: product.id }, 'product created');
  return product;
}

async function ownedProduct(merchantId: string, id: string) {
  const product = await prisma.product.findUnique({ where: { id }, include: INCLUDE });
  if (!product || product.status === 'DELETED') throw notFound('Product not found.');
  if (product.merchantId !== merchantId) throw forbidden('This product belongs to another merchant.');
  return product;
}

export async function updateProduct(merchantId: string, id: string, input: UpdateProduct) {
  await ownedProduct(merchantId, id);
  if (input.categoryId) await assertCategory(input.categoryId);

  const product = await prisma.$transaction(async (tx) => {
    if (input.imageUrls) {
      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.productImage.createMany({
        data: input.imageUrls.map((url, position) => ({ productId: id, blobUrl: url, position })),
      });
    }
    if (input.quantity != null) {
      await tx.inventory.upsert({
        where: { productId: id },
        create: { productId: id, availableStock: input.quantity },
        update: { availableStock: input.quantity },
      });
    }
    return tx.product.update({
      where: { id },
      data: {
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        priceKobo: input.priceKobo != null ? BigInt(input.priceKobo) : undefined,
        location: input.location,
        deliveryOption: input.deliveryOption,
      },
      include: INCLUDE,
    });
  });
  return product;
}

export async function deleteProduct(merchantId: string, id: string) {
  await ownedProduct(merchantId, id);
  await prisma.product.update({ where: { id }, data: { status: 'DELETED' } });
}

export async function listProducts(merchantId: string) {
  return prisma.product.findMany({
    where: { merchantId, status: { not: 'DELETED' } },
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

export async function setInventory(merchantId: string, id: string, availableStock: number) {
  await ownedProduct(merchantId, id);
  const inv = await prisma.inventory.upsert({
    where: { productId: id },
    create: { productId: id, availableStock },
    update: { availableStock },
  });
  return inv;
}

// ── Orders (E014, "Vendor Orders") ──────────────────────────────────────

export async function listOrders(merchantId: string) {
  const orders = await prisma.order.findMany({
    where: { merchantId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      items: { select: { description: true, quantity: true, lineTotalKobo: true } },
      delivery: true,
      gift: { select: { isAnonymous: true, revealedAt: true } },
    },
  });
  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    subtotalKobo: o.subtotalKobo,
    commissionKobo: o.commissionKobo,
    // what the merchant is credited for this order
    proceedsKobo: o.subtotalKobo - o.commissionKobo,
    items: o.items.map((i) => ({ description: i.description, quantity: i.quantity, lineTotalKobo: i.lineTotalKobo })),
    delivery: o.delivery
      ? { status: o.delivery.status, courierName: o.delivery.courierName, courierRef: o.delivery.courierRef }
      : null,
    isGift: o.gift != null,
    createdAt: o.createdAt.toISOString(),
  }));
}

export async function updateDelivery(
  merchantId: string,
  orderId: string,
  input: { status: 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED'; courierName?: string; courierRef?: string },
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, merchantId },
    include: { delivery: true, gift: true },
  });
  if (!order) throw notFound('Order not found.');

  const now = new Date();
  await prisma.delivery.upsert({
    where: { orderId },
    create: {
      orderId,
      status: input.status,
      courierName: input.courierName,
      courierRef: input.courierRef,
      dispatchedAt: input.status === 'DISPATCHED' ? now : undefined,
      deliveredAt: input.status === 'DELIVERED' ? now : undefined,
    },
    update: {
      status: input.status,
      courierName: input.courierName,
      courierRef: input.courierRef,
      dispatchedAt: input.status === 'DISPATCHED' ? now : order.delivery?.dispatchedAt ?? undefined,
      deliveredAt: input.status === 'DELIVERED' ? now : order.delivery?.deliveredAt ?? undefined,
    },
  });

  if (input.status === 'DELIVERED') {
    await prisma.order.update({ where: { id: orderId }, data: { status: 'DELIVERED' } });
    if (order.gift) {
      await prisma.gift.update({ where: { id: order.gift.id }, data: { status: 'DELIVERED' } });
    }
  } else if (order.status === 'PAID') {
    await prisma.order.update({ where: { id: orderId }, data: { status: 'FULFILLING' } });
  }
  return { orderId, deliveryStatus: input.status };
}
