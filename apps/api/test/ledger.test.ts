import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '@genie/core';
import {
  assertLedgerConsistent,
  getBalanceKobo,
  postEntry,
  transferBetweenWallets,
} from '../src/modules/payments/ledger.service';
import { hasDb, prisma, resetDb } from './helpers/db';

const dbUp = await hasDb();
const d = dbUp ? describe : describe.skip;
if (!dbUp) console.warn('⚠  ledger.test.ts skipped — needs a disposable test DB (DATABASE_URL containing "test", or ALLOW_DB_RESET=1).');

async function makeUserWithWallet(suffix: string) {
  const user = await prisma.user.create({
    data: {
      role: 'CELEBRANT',
      firstName: 'T',
      lastName: suffix,
      email: `ledger_${suffix}@example.com`,
      username: `ledger_${suffix}`,
      referralCode: `LGR${suffix.toUpperCase()}`,
      passwordHash: await hashPassword('Abcdef1!'),
    },
  });
  await prisma.walletAccount.create({
    data: { userId: user.id, provider: 'mock', providerAccountId: `acc_${suffix}` },
  });
  return user;
}

d('ledger service', () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('credits and debits keep the cached balance in lock-step', async () => {
    const u = await makeUserWithWallet('a');
    await postEntry({ userId: u.id, direction: 'CREDIT', amountKobo: 500_00n, reason: 'FUNDING' });
    await postEntry({ userId: u.id, direction: 'DEBIT', amountKobo: 200_00n, reason: 'GIFT_SENT' });
    expect(await getBalanceKobo(u.id)).toBe(300_00n);
    await assertLedgerConsistent(u.id);
  });

  it('refuses to overdraw', async () => {
    const u = await makeUserWithWallet('b');
    await postEntry({ userId: u.id, direction: 'CREDIT', amountKobo: 100_00n, reason: 'FUNDING' });
    await expect(
      postEntry({ userId: u.id, direction: 'DEBIT', amountKobo: 150_00n, reason: 'GIFT_SENT' }),
    ).rejects.toThrow(/insufficient/i);
  });

  it('is idempotent on idempotencyKey', async () => {
    const u = await makeUserWithWallet('c');
    const key = 'funding:test-1';
    await postEntry({ userId: u.id, direction: 'CREDIT', amountKobo: 100_00n, reason: 'FUNDING', idempotencyKey: key });
    await postEntry({ userId: u.id, direction: 'CREDIT', amountKobo: 100_00n, reason: 'FUNDING', idempotencyKey: key });
    expect(await getBalanceKobo(u.id)).toBe(100_00n);
  });

  it('transfers between wallets atomically', async () => {
    const from = await makeUserWithWallet('d');
    const to = await makeUserWithWallet('e');
    await postEntry({ userId: from.id, direction: 'CREDIT', amountKobo: 1_000_00n, reason: 'FUNDING' });

    await transferBetweenWallets({
      fromUserId: from.id,
      toUserId: to.id,
      amountKobo: 400_00n,
      reason: { debit: 'GIFT_SENT', credit: 'GIFT_RECEIVED' },
      refType: 'Gift',
      refId: 'gift_1',
      narration: 'Test gift',
      idempotencyKey: 'gift:gift_1',
    });

    expect(await getBalanceKobo(from.id)).toBe(600_00n);
    expect(await getBalanceKobo(to.id)).toBe(400_00n);
    await assertLedgerConsistent(from.id);
    await assertLedgerConsistent(to.id);
  });
});
