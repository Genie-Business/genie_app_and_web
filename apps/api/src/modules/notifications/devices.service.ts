import { prisma, type DevicePlatform } from '@genie/db';
import { notFound } from '../../lib/errors';

/**
 * Register (or refresh) a device's push token. FCM tokens are globally unique and
 * can migrate between users (same phone, new login), so we upsert on the token
 * and reassign ownership.
 */
export async function registerDevice(userId: string, fcmToken: string, platform: DevicePlatform) {
  const device = await prisma.deviceToken.upsert({
    where: { fcmToken },
    create: { userId, fcmToken, platform, lastSeenAt: new Date() },
    update: { userId, platform, lastSeenAt: new Date() },
  });
  return { id: device.id, platform: device.platform, registeredAt: device.createdAt.toISOString() };
}

export async function removeDevice(userId: string, fcmToken: string) {
  const device = await prisma.deviceToken.findUnique({ where: { fcmToken } });
  if (!device || device.userId !== userId) throw notFound('That device is not registered to you.');
  await prisma.deviceToken.delete({ where: { fcmToken } });
}

export async function listDevices(userId: string) {
  const rows = await prisma.deviceToken.findMany({
    where: { userId },
    orderBy: { lastSeenAt: 'desc' },
  });
  return rows.map((d) => ({
    id: d.id,
    platform: d.platform,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    // never echo the raw token back
    tokenPreview: `${d.fcmToken.slice(0, 6)}…${d.fcmToken.slice(-4)}`,
  }));
}
