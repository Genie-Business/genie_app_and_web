import { prisma } from '@genie/db';
import { getPaymentProvider } from './provider';

/**
 * Lazily provision a genie wallet (and the backing provider customer + deposit
 * account) for a user. Safe to call on every wallet-touching request.
 */
export async function ensureWallet(userId: string) {
  const existing = await prisma.walletAccount.findUnique({ where: { userId } });
  if (existing?.providerAccountId) return existing;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { merchantProfile: true },
  });
  const provider = getPaymentProvider();

  const customer = await provider.ensureCustomer({
    userId,
    type: user.role === 'MERCHANT' ? 'business' : 'individual',
    email: user.email,
    firstName: user.merchantProfile?.businessName ?? user.firstName,
    lastName: user.lastName,
    phone: user.phone,
  });
  const account = await provider.ensureDepositAccount({
    providerCustomerId: customer.providerCustomerId,
    userId,
  });

  return prisma.walletAccount.upsert({
    where: { userId },
    create: {
      userId,
      provider: provider.name,
      providerCustomerId: customer.providerCustomerId,
      providerAccountId: account.providerAccountId,
      providerVirtualNuban: account.virtualNuban ?? null,
    },
    update: {
      provider: provider.name,
      providerCustomerId: customer.providerCustomerId,
      providerAccountId: account.providerAccountId,
      providerVirtualNuban: account.virtualNuban ?? existing?.providerVirtualNuban ?? null,
    },
  });
}
