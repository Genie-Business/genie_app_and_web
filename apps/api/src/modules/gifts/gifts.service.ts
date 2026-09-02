import { normalizeEmail, orderNumber, paymentReference, transactionReference } from '@genie/core';
import { prisma, type Prisma } from '@genie/db';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { recordActivity } from '../activities/activities.service';
import { computeGiftCharge, type GiftCharge } from '../fees/fees.service';
import { notify } from '../notifications/notify.service';
import { maybeRewardReferral } from '../referrals/referrals.service';
import { getBalanceKobo, postEntry } from '../payments/ledger.service';
import { getPaymentProvider } from '../payments/provider';
import { ensureWallet } from '../payments/wallet.service';
import { nextOccurrence } from '../events/recurrence';

/** A wishlist needs this many items before it can be shared / gifted from. */
const MIN_SHAREABLE_ITEMS = 2;

const ITEM_INCLUDE = {
  product: { include: { inventory: true, merchant: true } },
  wishlist: {
    include: { event: { include: { user: { select: { firstName: true, lastName: true, id: true } } } } },
  },
} satisfies Prisma.WishlistItemInclude;

type ItemFull = Prisma.WishlistItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

async function loadItem(wishlistItemId: string): Promise<ItemFull> {
  const item = await prisma.wishlistItem.findUnique({
    where: { id: wishlistItemId },
    include: ITEM_INCLUDE,
  });
  if (!item) throw notFound('That wishlist item no longer exists.');
  return item;
}

function assertGiftable(item: ItemFull, gifterUserId: string, quantity: number) {
  if (item.product.status !== 'ACTIVE') throw badRequest('That product is no longer available.');
  if (item.wishlist.event.status === 'DELETED') throw notFound('That wishlist is not available.');
  if (item.wishlist.event.status === 'EXPIRED') throw badRequest('This event has ended.');
  if (item.wishlist.event.user.id === gifterUserId) {
    throw badRequest('You cannot gift an item on your own wishlist.');
  }
  const remaining = item.quantityWanted - item.quantityFulfilled;
  if (quantity > remaining) {
    throw conflict('over_fulfilled', `Only ${remaining} of this item still need${remaining === 1 ? 's' : ''} a gift.`);
  }
  const stock = item.product.inventory?.availableStock ?? 0;
  if (stock < quantity) throw conflict('out_of_stock', 'The merchant is out of stock for this item.');
}

export async function quote(wishlistItemId: string, quantity: number) {
  const item = await loadItem(wishlistItemId);
  const charge = await computeGiftCharge({
    unitPriceKobo: item.product.priceKobo,
    quantity,
    deliveryOption: item.product.deliveryOption,
  });
  return {
    wishlistItemId,
    productName: item.product.name,
    unitPriceKobo: item.product.priceKobo,
    ...charge,
  };
}

type PayInput = {
  wishlistItemId: string;
  quantity: number;
  isAnonymous: boolean;
  message?: string;
  method: 'WALLET' | 'BANK_TRANSFER';
};

/**
 * Money model for a gift:
 *  - gifter pays  subtotal + transactionFee + logisticsFee
 *  - merchant wallet is credited  subtotal − commission  (settled to bank later)
 *  - genie revenue = transactionFee + logisticsFee + commission  (tracked on the
 *    Order/Transaction, not a user wallet — a separate GL account)
 */
async function finalizeGift(opts: {
  item: ItemFull;
  /** Null for a guest checkout from a shared wishlist link. */
  gifterUserId: string | null;
  /** Shown on the reveal when there is no account (guest). */
  giftedByName?: string | null;
  input: PayInput;
  charge: GiftCharge;
  paidFromWallet: boolean;
  /** Real PaymentIntent id for the Gift/Transaction FK (1:1). Omit for cart lines. */
  paymentIntentId?: string;
  /** Scope for the ledger idempotency keys — defaults to paymentIntentId. */
  idempotencyScope?: string;
}) {
  const { item, gifterUserId, input, charge } = opts;
  const ledgerScope = opts.idempotencyScope ?? opts.paymentIntentId;
  const merchantId = item.product.merchantId;
  const eventId = item.wishlist.event.id;

  // Provision wallets outside the transaction (provider calls + idempotent).
  await ensureWallet(merchantId);
  if (opts.paidFromWallet) {
    if (!gifterUserId) throw badRequest('Wallet payments require an account.');
    await ensureWallet(gifterUserId);
  }

  // The transaction covers only what must move atomically: the two ledger
  // postings, the order + gift + transaction records, and the fulfilment /
  // stock counters. Notifications and the activity log are written after — a
  // failure there must not roll back a paid gift.
  const { gift, order } = await prisma.$transaction(
    async (tx) => {
      if (opts.paidFromWallet && gifterUserId) {
        await postEntry(
          {
            userId: gifterUserId,
            direction: 'DEBIT',
            amountKobo: charge.gifterPaysKobo,
            reason: 'GIFT_SENT',
            refType: 'WishlistItem',
            refId: item.id,
            narration: `Gift: ${item.product.name}`,
            idempotencyKey: ledgerScope
              ? `gift-debit:${ledgerScope}`
              : `gift-debit:${gifterUserId}:${item.id}:${Date.now()}`,
          },
          tx,
        );
      }

      await postEntry(
        {
          userId: merchantId,
          direction: 'CREDIT',
          amountKobo: charge.merchantReceivesKobo,
          reason: 'GIFT_RECEIVED',
          refType: 'WishlistItem',
          refId: item.id,
          narration: `Sale: ${item.product.name} ×${input.quantity}`,
          idempotencyKey: ledgerScope
            ? `gift-credit:${ledgerScope}`
            : `gift-credit:${merchantId}:${item.id}:${Date.now()}`,
        },
        tx,
      );

      const order = await tx.order.create({
        data: {
          orderNumber: orderNumber(),
          merchantId,
          buyerUserId: gifterUserId,
          eventId,
          status: 'PAID',
          subtotalKobo: charge.subtotalKobo,
          feeKobo: charge.transactionFeeKobo + charge.logisticsFeeKobo,
          commissionKobo: charge.commissionKobo,
          totalKobo: charge.gifterPaysKobo,
          deliveryAddress: item.wishlist.event.deliveryAddress,
          items: {
            create: {
              productId: item.productId,
              description: item.product.name,
              unitPriceKobo: item.product.priceKobo,
              quantity: input.quantity,
              lineTotalKobo: charge.subtotalKobo,
            },
          },
          delivery: { create: { status: 'PENDING', address: item.wishlist.event.deliveryAddress } },
        },
      });

      const gift = await tx.gift.create({
        data: {
          wishlistItemId: item.id,
          gifterUserId,
          giftedByName: gifterUserId || input.isAnonymous ? null : (opts.giftedByName ?? null),
          isAnonymous: input.isAnonymous,
          amountKobo: charge.subtotalKobo,
          message: input.message,
          status: 'PAID',
          orderId: order.id,
          paymentIntentId: opts.paymentIntentId,
        },
      });

      await tx.transaction.create({
        data: {
          reference: transactionReference(),
          userId: gifterUserId,
          type: 'GIFT',
          amountKobo: charge.gifterPaysKobo,
          feeKobo: charge.genieRetainsKobo,
          status: 'COMPLETED',
          giftId: gift.id,
          orderId: order.id,
          paymentIntentId: opts.paymentIntentId,
          narration: `Gift for ${item.wishlist.event.user.firstName} — ${item.product.name}`,
        },
      });

      await tx.wishlistItem.update({
        where: { id: item.id },
        data: { quantityFulfilled: { increment: input.quantity } },
      });
      await tx.inventory.updateMany({
        where: { productId: item.productId },
        data: { availableStock: { decrement: input.quantity } },
      });

      return { gift, order };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  // ── Post-commit side effects (best-effort) ────────────────────────────
  const celebrantId = item.wishlist.event.user.id;
  const gifterName = input.isAnonymous
    ? 'Someone'
    : gifterUserId
      ? ((await prisma.user
          .findUnique({ where: { id: gifterUserId }, select: { firstName: true } })
          .then((u) => u?.firstName)) ?? 'A friend')
      : (opts.giftedByName?.trim().split(/\s+/)[0] ?? 'A friend');

  try {
    await notify({
      userId: celebrantId,
      type: 'gift.received',
      title: input.isAnonymous ? 'A secret gift appeared 🎁' : `${gifterName} sent you a gift 🎁`,
      body: input.isAnonymous
        ? `An anonymous gift was added to "${item.wishlist.name}". It'll be revealed when it arrives.`
        : `${gifterName} gifted you ${item.product.name}.`,
      payload: { giftId: gift.id, eventId },
    });
    await notify({
      userId: merchantId,
      type: 'order.new',
      title: 'New order',
      body: `${item.product.name} ×${input.quantity} — ${order.orderNumber}`,
      payload: { orderId: order.id },
    });
    if (gifterUserId) {
      await recordActivity({
        userId: gifterUserId,
        category: 'TRANSACTION',
        action: 'gift.paid',
        entityType: 'Gift',
        entityId: gift.id,
        metadata: { amountKobo: charge.gifterPaysKobo.toString(), anonymous: input.isAnonymous },
      });
    }
    await recordActivity({
      userId: celebrantId,
      category: 'TRANSACTION',
      action: 'gift.received',
      entityType: 'Gift',
      entityId: gift.id,
      metadata: { productName: item.product.name },
    });
    // A referred user's first paid gift converts their referral.
    if (gifterUserId) await maybeRewardReferral(gifterUserId);
  } catch (err) {
    logger.error({ err, giftId: gift.id }, 'gift post-commit side effects failed');
  }

  logger.info({ giftId: gift.id, orderId: order.id, merchantId }, 'gift finalised');
  return { gift, order };
}

export async function payForGift(gifterUserId: string, input: PayInput) {
  const item = await loadItem(input.wishlistItemId);
  assertGiftable(item, gifterUserId, input.quantity);

  const charge = await computeGiftCharge({
    unitPriceKobo: item.product.priceKobo,
    quantity: input.quantity,
    deliveryOption: item.product.deliveryOption,
  });

  if (input.method === 'WALLET') {
    await ensureWallet(gifterUserId);
    const balance = await getBalanceKobo(gifterUserId);
    if (balance < charge.gifterPaysKobo) {
      throw conflict(
        'insufficient_funds',
        `You need ₦${(Number(charge.gifterPaysKobo) / 100).toLocaleString()} but your wallet has ₦${(Number(balance) / 100).toLocaleString()}. Add funds first.`,
      );
    }
    const { gift, order } = await finalizeGift({ item, gifterUserId, input, charge, paidFromWallet: true });
    return {
      status: 'PAID' as const,
      giftId: gift.id,
      orderNumber: order.orderNumber,
      charge,
    };
  }

  // BANK_TRANSFER — issue a one-off virtual account; the webhook finalises it.
  const provider = getPaymentProvider();
  const reference = paymentReference();
  const gifter = await prisma.user.findUniqueOrThrow({ where: { id: gifterUserId } });
  const dva = await provider.createDynamicVirtualAccount({
    amountKobo: charge.gifterPaysKobo,
    reference,
    customerName: `${gifter.firstName} ${gifter.lastName}`.trim(),
    ttlSeconds: 1800,
  });
  const intent = await prisma.paymentIntent.create({
    data: {
      reference,
      userId: gifterUserId,
      purpose: 'GIFT',
      amountKobo: charge.gifterPaysKobo,
      provider: provider.name,
      method: 'BANK_TRANSFER',
      status: 'PENDING',
      dynamicVirtualNuban: {
        accountNumber: dva.accountNumber,
        bankName: dva.bankName,
        accountName: dva.accountName,
      },
      expiresAt: dva.expiresAt ? new Date(dva.expiresAt) : null,
      metadata: {
        wishlistItemId: input.wishlistItemId,
        quantity: input.quantity,
        isAnonymous: input.isAnonymous,
        message: input.message ?? null,
      },
    },
  });

  return {
    status: 'PENDING' as const,
    reference: intent.reference,
    virtualAccount: { ...dva },
    charge,
  };
}

// ── Cart checkout (E013) — pay for several wishlist gifts at once ─────────

export type CartLine = { wishlistItemId: string; quantity: number; isAnonymous: boolean; message?: string };

async function priceCart(gifterUserId: string, lines: CartLine[]) {
  if (lines.length === 0) throw badRequest('Your cart is empty.');
  const priced = [];
  let totalKobo = 0n;
  for (const line of lines) {
    const item = await loadItem(line.wishlistItemId);
    assertGiftable(item, gifterUserId, line.quantity);
    const charge = await computeGiftCharge({
      unitPriceKobo: item.product.priceKobo,
      quantity: line.quantity,
      deliveryOption: item.product.deliveryOption,
    });
    priced.push({ item, line, charge });
    totalKobo += charge.gifterPaysKobo;
  }
  return { priced, totalKobo };
}

export async function payForCart(
  gifterUserId: string,
  input: { lines: CartLine[]; method: 'WALLET' | 'BANK_TRANSFER' },
) {
  const { priced, totalKobo } = await priceCart(gifterUserId, input.lines);

  if (input.method === 'WALLET') {
    await ensureWallet(gifterUserId);
    const balance = await getBalanceKobo(gifterUserId);
    if (balance < totalKobo) {
      throw conflict(
        'insufficient_funds',
        `Your cart totals ₦${(Number(totalKobo) / 100).toLocaleString()} but your wallet has ₦${(Number(balance) / 100).toLocaleString()}. Add funds first.`,
      );
    }
    const results = [];
    for (const { item, line, charge } of priced) {
      const { gift, order } = await finalizeGift({
        item,
        gifterUserId,
        input: { ...line, method: 'WALLET' },
        charge,
        paidFromWallet: true,
      });
      results.push({ wishlistItemId: line.wishlistItemId, giftId: gift.id, orderNumber: order.orderNumber });
    }
    return { status: 'PAID' as const, totalKobo, gifts: results };
  }

  // BANK_TRANSFER — one virtual account for the whole cart.
  const provider = getPaymentProvider();
  const reference = paymentReference();
  const gifter = await prisma.user.findUniqueOrThrow({ where: { id: gifterUserId } });
  const dva = await provider.createDynamicVirtualAccount({
    amountKobo: totalKobo,
    reference,
    customerName: `${gifter.firstName} ${gifter.lastName}`.trim(),
    ttlSeconds: 1800,
  });
  const intent = await prisma.paymentIntent.create({
    data: {
      reference,
      userId: gifterUserId,
      purpose: 'GIFT',
      amountKobo: totalKobo,
      provider: provider.name,
      method: 'BANK_TRANSFER',
      status: 'PENDING',
      dynamicVirtualNuban: { accountNumber: dva.accountNumber, bankName: dva.bankName, accountName: dva.accountName },
      expiresAt: dva.expiresAt ? new Date(dva.expiresAt) : null,
      metadata: {
        kind: 'cart',
        items: input.lines.map((l) => ({
          wishlistItemId: l.wishlistItemId,
          quantity: l.quantity,
          isAnonymous: l.isAnonymous,
          message: l.message ?? null,
        })),
      },
    },
  });
  return { status: 'PENDING' as const, reference: intent.reference, virtualAccount: { ...dva }, totalKobo };
}

/** Called by the payment webhook when a GIFT-purpose transfer lands. */
export async function settleGiftTransfer(reference: string, paidAmountKobo: bigint) {
  const intent = await prisma.paymentIntent.findUnique({ where: { reference } });
  if (!intent || intent.purpose !== 'GIFT') return { handled: false };
  if (intent.status === 'COMPLETED') return { handled: true, duplicate: true };

  const rawMeta = intent.metadata as Record<string, unknown>;

  // Cart checkout (in-app) or guest checkout (a shared link, no account):
  // finalise every line, then mark the intent complete.
  if (rawMeta?.kind === 'cart' || rawMeta?.kind === 'guest-cart') {
    const guest = rawMeta.kind === 'guest-cart';
    const lines = (rawMeta.items as CartLine[]) ?? [];
    for (const line of lines) {
      const item = await loadItem(line.wishlistItemId);
      const charge = await computeGiftCharge({
        unitPriceKobo: item.product.priceKobo,
        quantity: line.quantity,
        deliveryOption: item.product.deliveryOption,
      });
      await finalizeGift({
        item,
        gifterUserId: guest ? null : intent.userId,
        giftedByName: guest ? intent.guestName : null,
        input: {
          wishlistItemId: line.wishlistItemId,
          quantity: line.quantity,
          isAnonymous: line.isAnonymous,
          message: line.message ?? undefined,
          method: 'BANK_TRANSFER',
        },
        charge,
        paidFromWallet: false,
        idempotencyScope: `${intent.id}:${line.wishlistItemId}`,
      });
    }
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return { handled: true, duplicate: false };
  }

  const meta = rawMeta as unknown as {
    wishlistItemId: string;
    quantity: number;
    isAnonymous: boolean;
    message: string | null;
  };
  const item = await loadItem(meta.wishlistItemId);
  const charge = await computeGiftCharge({
    unitPriceKobo: item.product.priceKobo,
    quantity: meta.quantity,
    deliveryOption: item.product.deliveryOption,
  });
  if (paidAmountKobo > 0n && paidAmountKobo < charge.gifterPaysKobo) {
    logger.warn({ reference, paidAmountKobo: paidAmountKobo.toString() }, 'gift underpaid');
  }

  await finalizeGift({
    item,
    gifterUserId: intent.userId,
    input: {
      wishlistItemId: meta.wishlistItemId,
      quantity: meta.quantity,
      isAnonymous: meta.isAnonymous,
      message: meta.message ?? undefined,
      method: 'BANK_TRANSFER',
    },
    charge,
    paidFromWallet: false,
    paymentIntentId: intent.id,
  });
  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  return { handled: true, duplicate: false };
}

// ── Reads ────────────────────────────────────────────────────────────────

// ── Guest checkout (E005) — buy from a shared wishlist link, no account ──

export type GuestCheckoutInput = {
  wishlistItemIds: string[];
  gifterName: string;
  gifterEmail: string;
  gifterPhone?: string;
  isAnonymous: boolean;
  message?: string;
};

/**
 * A visitor following a shared wishlist link picks one or more items and pays
 * for all of them in one bank transfer. No genie account: the gift rows carry
 * `gifterUserId = null` and (unless anonymous) the guest's name. The webhook
 * finalises everything once the transfer lands.
 */
export async function guestCheckout(wishlistId: string, input: GuestCheckoutInput) {
  const wishlist = await prisma.wishlist.findUnique({
    where: { id: wishlistId },
    include: {
      event: { select: { status: true } },
      items: { include: { product: { include: { inventory: true } } } },
    },
  });
  if (!wishlist || wishlist.event.status === 'DELETED') {
    throw notFound('This wishlist is not available.');
  }

  const wanted = [...new Set(input.wishlistItemIds)];
  const items = wishlist.items.filter((i) => wanted.includes(i.id));
  if (items.length === 0) throw badRequest('Choose at least one item to gift.');
  if (items.length !== wanted.length) {
    throw badRequest('Some of those items are not on this wishlist.');
  }

  const lines: CartLine[] = [];
  const breakdown: { wishlistItemId: string; productName: string; amountKobo: bigint }[] = [];
  let totalKobo = 0n;
  for (const it of items) {
    if (it.quantityFulfilled >= it.quantityWanted) {
      throw conflict('already_fulfilled', `"${it.product.name}" has already been gifted.`);
    }
    if (it.product.status !== 'ACTIVE') {
      throw badRequest(`"${it.product.name}" is no longer available.`);
    }
    if (it.product.inventory && it.product.inventory.availableStock < 1) {
      throw conflict('out_of_stock', `"${it.product.name}" is out of stock.`);
    }
    const charge = await computeGiftCharge({
      unitPriceKobo: it.product.priceKobo,
      quantity: 1,
      deliveryOption: it.product.deliveryOption,
    });
    totalKobo += charge.gifterPaysKobo;
    lines.push({
      wishlistItemId: it.id,
      quantity: 1,
      isAnonymous: input.isAnonymous,
      message: input.message,
    });
    breakdown.push({
      wishlistItemId: it.id,
      productName: it.product.name,
      amountKobo: charge.gifterPaysKobo,
    });
  }

  const provider = getPaymentProvider();
  const reference = paymentReference();
  const dva = await provider.createDynamicVirtualAccount({
    amountKobo: totalKobo,
    reference,
    customerName: input.gifterName.slice(0, 40),
    ttlSeconds: 3600,
  });

  await prisma.paymentIntent.create({
    data: {
      reference,
      userId: null,
      guestName: input.gifterName,
      guestEmail: normalizeEmail(input.gifterEmail),
      guestPhone: input.gifterPhone,
      purpose: 'GIFT',
      amountKobo: totalKobo,
      provider: provider.name,
      method: 'BANK_TRANSFER',
      status: 'PENDING',
      dynamicVirtualNuban: {
        accountNumber: dva.accountNumber,
        bankName: dva.bankName,
        accountName: dva.accountName,
      },
      expiresAt: dva.expiresAt ? new Date(dva.expiresAt) : null,
      metadata: { kind: 'guest-cart', wishlistId, items: lines },
    },
  });

  return {
    reference,
    status: 'PENDING' as const,
    totalKobo,
    breakdown,
    virtualAccount: {
      accountNumber: dva.accountNumber,
      bankName: dva.bankName,
      accountName: dva.accountName,
      expiresAt: dva.expiresAt ?? null,
    },
  };
}

/** Poll a guest checkout's payment status (unauthenticated, by reference). */
export async function guestPaymentStatus(reference: string) {
  const intent = await prisma.paymentIntent.findUnique({
    where: { reference },
    select: { purpose: true, status: true, amountKobo: true, expiresAt: true, metadata: true },
  });
  const kind = (intent?.metadata as Record<string, unknown> | null)?.kind;
  if (!intent || intent.purpose !== 'GIFT' || kind !== 'guest-cart') {
    throw notFound('Payment not found.');
  }
  return {
    reference,
    status: intent.status,
    totalKobo: intent.amountKobo,
    expiresAt: intent.expiresAt?.toISOString() ?? null,
  };
}

export async function listGiven(userId: string) {
  const gifts = await prisma.gift.findMany({
    where: { gifterUserId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      wishlistItem: {
        include: {
          product: { select: { name: true } },
          wishlist: { include: { event: { select: { name: true } } } },
        },
      },
      order: { select: { orderNumber: true, status: true } },
    },
  });
  return gifts.map((g) => ({
    id: g.id,
    productName: g.wishlistItem.product.name,
    eventName: g.wishlistItem.wishlist.event.name,
    amountKobo: g.amountKobo,
    isAnonymous: g.isAnonymous,
    status: g.status,
    revealed: g.revealedAt != null,
    orderNumber: g.order?.orderNumber ?? null,
    orderStatus: g.order?.status ?? null,
    createdAt: g.createdAt.toISOString(),
  }));
}

/**
 * Wishlists belonging to my friends that I can still gift from — the "invites to
 * pay for the items" feed on the home screen. Only ACTIVE events that haven't
 * passed (ANNUAL events roll forward), only shareable wishlists (≥ 2 items), and
 * only ones that still have something unfulfilled.
 */
export async function listInvitations(userId: string) {
  const friendships = await prisma.friendship.findMany({
    where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  const friendIds = friendships.map((f) =>
    f.requesterId === userId ? f.addresseeId : f.requesterId,
  );
  if (friendIds.length === 0) return [];

  const now = Date.now();
  const wishlists = await prisma.wishlist.findMany({
    where: {
      event: {
        userId: { in: friendIds },
        status: 'ACTIVE',
        OR: [{ expiresAt: { gte: new Date(now) } }, { recurrence: 'ANNUAL' }],
      },
    },
    include: {
      event: {
        select: {
          id: true,
          userId: true,
          name: true,
          type: true,
          eventDate: true,
          expiresAt: true,
          recurrence: true,
          user: { select: { firstName: true, lastName: true, username: true } },
        },
      },
      items: { include: { product: { select: { priceKobo: true } } } },
    },
  });

  const rows = wishlists
    .filter((w) => w.items.length >= MIN_SHAREABLE_ITEMS)
    .map((w) => {
      const outstanding = w.items.filter((i) => i.quantityFulfilled < i.quantityWanted);
      const totalValueKobo = w.items.reduce(
        (s, i) => s + i.product.priceKobo * BigInt(i.quantityWanted),
        0n,
      );
      const outstandingValueKobo = outstanding.reduce(
        (s, i) => s + i.product.priceKobo * BigInt(i.quantityWanted - i.quantityFulfilled),
        0n,
      );
      const occ = nextOccurrence(w.event.eventDate, w.event.expiresAt, w.event.recurrence, now);
      const name = `${w.event.user.firstName} ${w.event.user.lastName}`.trim();
      return {
        wishlistId: w.id,
        wishlistName: w.name,
        celebrantUserId: w.event.userId,
        celebrantName: name || `@${w.event.user.username}`,
        eventName: w.event.name,
        eventType: w.event.type,
        eventDate: occ.eventDate.toISOString(),
        itemCount: w.items.length,
        outstandingCount: outstanding.length,
        totalValueKobo,
        outstandingValueKobo,
      };
    })
    .filter((w) => w.outstandingCount > 0);

  rows.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  return rows;
}

export async function listReceived(userId: string) {
  const gifts = await prisma.gift.findMany({
    where: {
      status: { in: ['PAID', 'DELIVERED', 'REVEALED'] },
      wishlistItem: { wishlist: { event: { userId } } },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      gifter: { select: { firstName: true, lastName: true } },
      wishlistItem: {
        include: {
          product: { select: { name: true } },
          wishlist: { include: { event: { select: { name: true } } } },
        },
      },
    },
  });
  return gifts.map((g) => {
    const hidden = g.isAnonymous && g.revealedAt == null;
    const gifterName =
      `${g.gifter?.firstName ?? ''} ${g.gifter?.lastName ?? ''}`.trim() ||
      g.giftedByName ||
      'A friend';
    return {
      id: g.id,
      productName: g.wishlistItem.product.name,
      eventName: g.wishlistItem.wishlist.event.name,
      amountKobo: g.amountKobo,
      message: g.message,
      from: hidden ? null : gifterName,
      isAnonymous: g.isAnonymous,
      revealed: g.revealedAt != null,
      canReveal: g.isAnonymous && g.revealedAt == null,
      status: g.status,
      createdAt: g.createdAt.toISOString(),
    };
  });
}

/** Celebrant reveals an anonymous gift once it physically arrives. */
export async function reveal(userId: string, giftId: string) {
  const gift = await prisma.gift.findUnique({
    where: { id: giftId },
    include: {
      gifter: { select: { firstName: true, lastName: true } },
      wishlistItem: { include: { wishlist: { include: { event: { select: { userId: true } } } } } },
    },
  });
  if (!gift) throw notFound('Gift not found.');
  if (gift.wishlistItem.wishlist.event.userId !== userId) {
    throw forbidden('This gift is not on your wishlist.');
  }
  if (!gift.isAnonymous) throw badRequest('This gift is not anonymous.');
  if (gift.revealedAt) throw badRequest('This gift has already been revealed.');

  await prisma.gift.update({
    where: { id: giftId },
    data: { revealedAt: new Date(), status: 'REVEALED' },
  });
  await recordActivity({
    userId,
    category: 'APP',
    action: 'gift.revealed',
    entityType: 'Gift',
    entityId: giftId,
  });
  return {
    giftId,
    from:
      `${gift.gifter?.firstName ?? ''} ${gift.gifter?.lastName ?? ''}`.trim() ||
      gift.giftedByName ||
      'A friend',
    message: gift.message,
  };
}
