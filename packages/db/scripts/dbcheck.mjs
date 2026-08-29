/**
 * Ad-hoc DB inspector / cleaner. Run from packages/db:
 *   node --env-file=../../.env scripts/dbcheck.mjs           # show counts
 *   node --env-file=../../.env scripts/dbcheck.mjs --clean-smoke   # remove *.smoke@example.com test data
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const clean = process.argv.includes('--clean-smoke');

if (clean) {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: '.smoke@example.com' } },
    select: { id: true, email: true },
  });
  for (const u of users) {
    await prisma.transaction.deleteMany({ where: { userId: u.id } });
    await prisma.paymentIntent.deleteMany({ where: { userId: u.id } });
    await prisma.merchantInviteCode.updateMany({
      where: { usedByUserId: u.id },
      data: { usedByUserId: null, usedAt: null },
    });
    await prisma.user.delete({ where: { id: u.id } }); // cascades wallet/ledger/tokens/etc.
    console.log('deleted', u.email);
  }
  await prisma.webhookEvent.deleteMany({});
}

const c = await Promise.all([
  prisma.user.count(),
  prisma.walletAccount.count(),
  prisma.ledgerEntry.count(),
  prisma.paymentIntent.count(),
  prisma.transaction.count(),
  prisma.category.count(),
  prisma.feeConfig.count(),
  prisma.merchantInviteCode.count({ where: { usedByUserId: null } }),
  prisma.adminUser.count(),
]);
console.log(
  JSON.stringify(
    {
      users: c[0], wallets: c[1], ledgerEntries: c[2], paymentIntents: c[3],
      transactions: c[4], categories: c[5], feeConfigs: c[6],
      unusedInviteCodes: c[7], admins: c[8],
    },
    null,
    1,
  ),
);
await prisma.$disconnect();
