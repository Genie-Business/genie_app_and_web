import { Prisma, prisma, type LedgerDirection, type LedgerReason } from '@genie/db';
import { badRequest, conflict, notFound } from '../../lib/errors';

export type PostEntryInput = {
  userId: string;
  direction: LedgerDirection;
  amountKobo: bigint;
  reason: LedgerReason;
  refType?: string;
  refId?: string;
  narration?: string;
  /** Guarantees the entry is posted at most once. */
  idempotencyKey?: string;
};

/**
 * Post a single ledger entry and move the wallet's cached balance atomically.
 * The LedgerEntry table is the source of truth; `WalletAccount.balanceKobo` is
 * a denormalised running total kept in lock-step here.
 */
export async function postEntry(input: PostEntryInput, client: Prisma.TransactionClient = prisma) {
  if (input.amountKobo <= 0n) throw badRequest('Ledger amount must be positive.');

  const wallet = await client.walletAccount.findUnique({ where: { userId: input.userId } });
  if (!wallet) throw notFound('Wallet not found for this user.');
  if (wallet.status !== 'ACTIVE') throw badRequest('This wallet is not active.');

  if (input.idempotencyKey) {
    const existing = await client.ledgerEntry.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
  }

  const delta = input.direction === 'CREDIT' ? input.amountKobo : -input.amountKobo;
  const balanceAfter = wallet.balanceKobo + delta;
  if (balanceAfter < 0n) {
    throw conflict('insufficient_funds', 'Insufficient wallet balance for this transaction.');
  }

  const write = async (db: Prisma.TransactionClient) => {
    const entry = await db.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        direction: input.direction,
        amountKobo: input.amountKobo,
        balanceAfterKobo: balanceAfter,
        reason: input.reason,
        refType: input.refType,
        refId: input.refId,
        narration: input.narration,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await db.walletAccount.update({ where: { id: wallet.id }, data: { balanceKobo: balanceAfter } });
    return entry;
  };

  try {
    // If we were handed a transaction client we're already inside a tx; otherwise
    // open one so the entry + balance update commit together.
    return '$transaction' in client
      ? await (client as typeof prisma).$transaction((tx) => write(tx))
      : await write(client);
  } catch (err) {
    if (
      input.idempotencyKey &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const existing = await client.ledgerEntry.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
    }
    throw err;
  }
}

/**
 * Move funds between two genie wallets in one transaction (e.g. a gift payment
 * from the gifter to the merchant, after fees). All amounts in kobo.
 */
export async function transferBetweenWallets(input: {
  fromUserId: string;
  toUserId: string;
  amountKobo: bigint;
  reason: { debit: LedgerReason; credit: LedgerReason };
  refType: string;
  refId: string;
  narration: string;
  idempotencyKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    const debit = await postEntry(
      {
        userId: input.fromUserId,
        direction: 'DEBIT',
        amountKobo: input.amountKobo,
        reason: input.reason.debit,
        refType: input.refType,
        refId: input.refId,
        narration: input.narration,
        idempotencyKey: `${input.idempotencyKey}:debit`,
      },
      tx,
    );
    const credit = await postEntry(
      {
        userId: input.toUserId,
        direction: 'CREDIT',
        amountKobo: input.amountKobo,
        reason: input.reason.credit,
        refType: input.refType,
        refId: input.refId,
        narration: input.narration,
        idempotencyKey: `${input.idempotencyKey}:credit`,
      },
      tx,
    );
    return { debit, credit };
  });
}

export async function getBalanceKobo(userId: string): Promise<bigint> {
  const wallet = await prisma.walletAccount.findUnique({
    where: { userId },
    select: { balanceKobo: true },
  });
  return wallet?.balanceKobo ?? 0n;
}

/**
 * Verify the ledger invariant for a wallet: the sum of signed entries must equal
 * the cached balance. Used in tests and (later) a nightly admin reconciliation.
 */
export async function assertLedgerConsistent(userId: string): Promise<void> {
  const wallet = await prisma.walletAccount.findUnique({
    where: { userId },
    include: { ledgerEntries: true },
  });
  if (!wallet) throw notFound('Wallet not found.');
  const computed = wallet.ledgerEntries.reduce(
    (sum, e) => sum + (e.direction === 'CREDIT' ? e.amountKobo : -e.amountKobo),
    0n,
  );
  if (computed !== wallet.balanceKobo) {
    throw new Error(
      `Ledger inconsistency for wallet ${wallet.id}: entries sum ${computed} != cached ${wallet.balanceKobo}`,
    );
  }
}
