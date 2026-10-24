import { headers } from 'next/headers';
import { prisma } from '@genie/db';
import type { Prisma } from '@genie/db';
import type { AdminSession } from '@/lib/session';

/** BigInt/Date-safe JSON for the audit trail. */
function jsonSafe(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(
    JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val)),
  ) as Prisma.InputJsonValue;
}

/** Record an admin action. Never throws — an audit hiccup must not block the action it describes. */
export async function audit(
  session: AdminSession,
  action: string,
  entityType: string,
  entityId?: string | null,
  change?: { before?: unknown; after?: unknown },
): Promise<void> {
  try {
    const h = await headers();
    const ip = h.get('x-vercel-forwarded-for') ?? h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0] ?? null;
    await prisma.auditLog.create({
      data: {
        adminId: session.sub,
        action,
        entityType,
        entityId: entityId ?? null,
        before: jsonSafe(change?.before),
        after: jsonSafe(change?.after),
        ipAddress: ip,
      },
    });
  } catch (e) {
    console.error('audit log write failed', e);
  }
}
