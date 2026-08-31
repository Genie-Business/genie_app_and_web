/**
 * Ad-hoc DB inspector / cleaner. Run from packages/db:
 *   node --env-file=../../.env scripts/dbcheck.mjs                       # show counts
 *   node --env-file=../../.env scripts/dbcheck.mjs --clean-smoke         # remove *.smoke@example.com test data
 *   node --env-file=../../.env scripts/dbcheck.mjs --clean-probes        # remove ad-hoc probe accounts (see PROBE_PREFIXES)
 *   node --env-file=../../.env scripts/dbcheck.mjs --set-admin-password  # reset admin@genieapps.co (needs NEW_ADMIN_PASSWORD env)
 */
import { scrypt as _scrypt, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** scrypt hash in @genie/core's format: `scrypt$N$r$p$saltB64$hashB64`.
 * Inlined (not imported from @genie/core) so this script runs under plain node. */
function hashPassword(password) {
  const [N, r, p, maxmem] = [2 ** 15, 8, 1, 64 * 1024 * 1024];
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    _scrypt(password.normalize('NFKC'), salt, 64, { N, r, p, maxmem }, (err, dk) => {
      if (err) reject(err);
      else resolve(['scrypt', N, r, p, salt.toString('base64'), dk.toString('base64')].join('$'));
    });
  });
}

/** Local/CI exploration accounts, all `@example.com`. */
const PROBE_PREFIXES = [
  'probe+', 'probe1', 'deploycheck-', 'dupcheck-', 'e2e+', 'e2e2+', 'netcheck-', 'lga+',
];

async function deleteUsers(users) {
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
}

if (process.argv.includes('--clean-smoke')) {
  await deleteUsers(
    await prisma.user.findMany({
      where: { email: { endsWith: '.smoke@example.com' } },
      select: { id: true, email: true },
    }),
  );
  await prisma.webhookEvent.deleteMany({});
}

if (process.argv.includes('--clean-probes')) {
  await deleteUsers(
    await prisma.user.findMany({
      where: {
        email: { endsWith: '@example.com' },
        OR: PROBE_PREFIXES.map((p) => ({ email: { startsWith: p } })),
      },
      select: { id: true, email: true },
    }),
  );
  const wl = await prisma.waitlistSignup.deleteMany({ where: { email: { endsWith: '@example.com' } } });
  if (wl.count) console.log('deleted', wl.count, 'example.com waitlist signups');
}

if (process.argv.includes('--set-admin-password')) {
  const email = process.env.ADMIN_EMAIL ?? 'admin@genieapps.co';
  const password = process.env.NEW_ADMIN_PASSWORD;
  if (!password) throw new Error('set NEW_ADMIN_PASSWORD in the environment');
  await prisma.adminUser.update({
    where: { email },
    data: { passwordHash: await hashPassword(password) },
  });
  console.log(`password reset for ${email}`);
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
