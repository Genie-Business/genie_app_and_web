import { prisma } from '@genie/db';
import { notFound } from '../../lib/errors';

/** Build the canonical `/v1/me` payload for a user id. */
export async function toMeResponse(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      merchantProfile: true,
      kycVerifications: { where: { level: 'LEVEL_1' }, take: 1 },
    },
  });
  if (!user) throw notFound('Account not found.');

  const level1 = user.kycVerifications[0];

  return {
    id: user.id,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    username: user.username,
    referralCode: user.referralCode,
    phone: user.phone,
    country: user.country,
    stateOfResidence: user.stateOfResidence,
    dateOfBirth: user.dateOfBirth?.toISOString() ?? null,
    address: {
      line: user.addressLine,
      lga: user.lga,
      city: user.city,
    },
    emailVerified: user.emailVerifiedAt != null,
    createdAt: user.createdAt.toISOString(),
    merchant: user.merchantProfile
      ? {
          businessName: user.merchantProfile.businessName,
          businessState: user.merchantProfile.businessState,
          bankName: user.merchantProfile.bankName,
          kybStatus: user.merchantProfile.kybStatus,
        }
      : null,
    kyc: { level1: level1?.status ?? 'NONE' },
  };
}
