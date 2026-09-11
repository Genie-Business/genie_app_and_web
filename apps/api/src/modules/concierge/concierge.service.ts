import { prisma, type ConciergeRequest } from '@genie/db';
import type { concierge as C } from '@genie/contracts';
import { badRequest, notFound } from '../../lib/errors';
import { recordActivity } from '../activities/activities.service';

/** Must match the system merchant seeded by packages/db/prisma/seed.ts's seedConcierge(). */
const CONCIERGE_MERCHANT_EMAIL = 'concierge@genieapps.co';

let conciergeMerchantId: string | null = null;

/** Memoised — this account never changes once seeded. */
async function resolveConciergeMerchantId(): Promise<string> {
  if (conciergeMerchantId) return conciergeMerchantId;
  const merchant = await prisma.user.findUnique({
    where: { email: CONCIERGE_MERCHANT_EMAIL },
    select: { id: true },
  });
  if (!merchant) {
    throw badRequest('The concierge service is not set up yet. Please try again shortly.');
  }
  conciergeMerchantId = merchant.id;
  return conciergeMerchantId;
}

// Kobo fields stay bigint here — serializeBigInts() in the route stringifies
// the whole response, same as every other module's mapper.
function toDto(row: ConciergeRequest) {
  return {
    id: row.id,
    sourceUrl: row.sourceUrl,
    name: row.name,
    note: row.note,
    estimatedPriceKobo: row.estimatedPriceKobo,
    status: row.status,
    rejectionReason: row.rejectionReason,
    productId: row.productId,
    wishlistItemId: row.wishlistItemId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * A celebrant imports a gift from an external link. This creates a DRAFT
 * placeholder Product (owned by the system concierge merchant) and attaches
 * it to the wishlist right away — it shows up as "pending" and, because
 * every gifting/cart/order code path already refuses a non-ACTIVE product,
 * it's automatically un-giftable until a concierge prices and activates it.
 */
export async function createRequest(userId: string, input: C.CreateConciergeRequestBody) {
  const wishlist = await prisma.wishlist.findUnique({
    where: { id: input.wishlistId },
    include: { event: { select: { userId: true, status: true } } },
  });
  if (!wishlist || wishlist.event.userId !== userId) throw notFound('Wishlist not found.');
  if (wishlist.event.status === 'DELETED') throw notFound('This wishlist is not available.');
  if (wishlist.event.status === 'EXPIRED') throw badRequest('This event has ended.');

  const merchantId = await resolveConciergeMerchantId();
  const category = await prisma.category.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!category) throw badRequest('No product category is configured yet.');

  const request = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        merchantId,
        categoryId: category.id,
        name: input.name,
        description: input.note?.trim() || `Imported from ${input.sourceUrl}`,
        priceKobo: BigInt(input.estimatedPriceKobo ?? 0),
        status: 'DRAFT',
        deliveryOption: 'BOTH',
        inventory: { create: { availableStock: 0 } },
      },
    });
    const item = await tx.wishlistItem.create({
      data: { wishlistId: input.wishlistId, productId: product.id, quantityWanted: 1 },
    });
    return tx.conciergeRequest.create({
      data: {
        requestedByUserId: userId,
        wishlistItemId: item.id,
        sourceUrl: input.sourceUrl,
        name: input.name,
        note: input.note,
        estimatedPriceKobo: input.estimatedPriceKobo != null ? BigInt(input.estimatedPriceKobo) : null,
        productId: product.id,
      },
    });
  });

  await recordActivity({
    userId,
    category: 'EVENT',
    action: 'concierge.requested',
    entityType: 'ConciergeRequest',
    entityId: request.id,
    metadata: { name: input.name, sourceUrl: input.sourceUrl },
  });

  return toDto(request);
}

export async function listMyRequests(userId: string) {
  const rows = await prisma.conciergeRequest.findMany({
    where: { requestedByUserId: userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDto);
}

/** Withdraw a request before a concierge has priced it. */
export async function cancelRequest(userId: string, id: string): Promise<void> {
  const row = await prisma.conciergeRequest.findUnique({ where: { id } });
  if (!row || row.requestedByUserId !== userId) throw notFound('Request not found.');
  if (row.status !== 'NEW' && row.status !== 'IN_REVIEW') {
    throw badRequest('This request has already been reviewed and can no longer be cancelled.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.wishlistItem.deleteMany({ where: { id: row.wishlistItemId } });
    await tx.product.update({ where: { id: row.productId }, data: { status: 'DELETED' } });
    await tx.conciergeRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
  });
}
