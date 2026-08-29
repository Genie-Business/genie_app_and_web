import { prisma } from '@genie/db';

let probed: boolean | null = null;

/**
 * Integration suites TRUNCATE every table between tests, so they only run when
 * pointed at a throwaway database: DATABASE_URL contains "test" (e.g. a Neon
 * branch named `test`) OR ALLOW_DB_RESET=1 is set explicitly. Otherwise they
 * skip — never against a database that holds real/seed data.
 */
function isDisposableDb(): boolean {
  const url = process.env.DATABASE_URL ?? '';
  return process.env.ALLOW_DB_RESET === '1' || /test/i.test(url);
}

/** True when a disposable DATABASE_URL is set AND reachable. */
export async function hasDb(): Promise<boolean> {
  if (probed != null) return probed;
  if (!process.env.DATABASE_URL || !isDisposableDb()) {
    probed = false;
    return probed;
  }
  // Retry — a suspended serverless database (Neon) may need a moment to wake.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      probed = true;
      return probed;
    } catch {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  probed = false;
  return probed;
}

/** Wipe all app data between tests. Order respects FK dependencies. */
export async function resetDb(): Promise<void> {
  if (!isDisposableDb()) {
    throw new Error(
      'resetDb() refused: DATABASE_URL is not a disposable test database. ' +
        'Point it at a Neon branch named "test" or set ALLOW_DB_RESET=1.',
    );
  }
  // App data wiped between tests. Global config (FeeConfig, CommissionConfig,
  // AllowedCountry, AppSetting, AdminUser) is left alone.
  const tables = [
    'LedgerEntry', 'Transaction', 'PaymentIntent', 'WebhookEvent', 'Payout', 'PayoutAccount',
    'WalletAccount', 'Gift', 'OrderItem', 'Delivery', 'Order', 'CartItem', 'Cart',
    'WishlistItem', 'Wishlist', 'Event', 'ProductImage', 'Inventory', 'Product', 'Category',
    'Referral', 'Friendship', 'ContactImport', 'Notification', 'SupportMessage',
    'SupportThread', 'ActivityLog', 'DeviceToken', 'RefreshToken', 'OtpToken',
    'KycVerification', 'MerchantProfile', 'MerchantInviteCode', 'User',
  ];
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

export { prisma };
