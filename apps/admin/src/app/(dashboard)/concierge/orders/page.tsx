import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma, type DeliveryStatus } from '@genie/db';
import { canAccessConcierge, getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CONCIERGE_EMAIL = 'concierge@genieapps.co';

function formatKobo(kobo: bigint): string {
  return `₦${(Number(kobo) / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
}

/** Mirrors apps/api/src/modules/merchant/merchant.service.ts's updateDelivery —
 *  admin talks to Prisma directly (a separate Next.js app, no shared service
 *  layer with apps/api), matching how every other admin page already works. */
async function updateDelivery(orderId: string, status: DeliveryStatus) {
  'use server';
  const session = await getSession();
  if (!session || !canAccessConcierge(session.role)) return;

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { delivery: true, gift: true } });
  if (!order) return;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.delivery.upsert({
      where: { orderId },
      create: {
        orderId,
        status,
        dispatchedAt: status === 'DISPATCHED' ? now : undefined,
        deliveredAt: status === 'DELIVERED' ? now : undefined,
      },
      update: {
        status,
        dispatchedAt: status === 'DISPATCHED' ? now : (order.delivery?.dispatchedAt ?? undefined),
        deliveredAt: status === 'DELIVERED' ? now : (order.delivery?.deliveredAt ?? undefined),
      },
    });
    if (status === 'DELIVERED') {
      await tx.order.update({ where: { id: orderId }, data: { status: 'DELIVERED' } });
      if (order.gift) await tx.gift.update({ where: { id: order.gift.id }, data: { status: 'DELIVERED' } });
    } else if (order.status === 'PAID') {
      await tx.order.update({ where: { id: orderId }, data: { status: 'FULFILLING' } });
    }
    if (order.buyerUserId && (status === 'DISPATCHED' || status === 'DELIVERED')) {
      await tx.notification.create({
        data: {
          userId: order.buyerUserId,
          channel: 'IN_APP',
          category: 'GIFT',
          type: 'order.delivery',
          title: status === 'DELIVERED' ? 'Gift delivered 🎉' : 'Gift on its way 🚚',
          body:
            status === 'DELIVERED'
              ? `${order.orderNumber} has been delivered.`
              : `${order.orderNumber} has been dispatched.`,
          payload: { orderId },
        },
      });
    }
  });

  redirect('/concierge/orders');
}

export default async function ConciergeOrdersPage() {
  const session = await getSession();
  if (!session || !canAccessConcierge(session.role)) {
    return <div className="card text-sm text-error-fg">You don&apos;t have access to the concierge section.</div>;
  }

  const concierge = await prisma.user.findUnique({ where: { email: CONCIERGE_EMAIL }, select: { id: true } });
  const orders = concierge
    ? await prisma.order.findMany({
        where: { merchantId: concierge.id },
        orderBy: { createdAt: 'desc' },
        include: { items: true, delivery: true, buyer: { select: { firstName: true, lastName: true, phone: true } } },
        take: 100,
      })
    : [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Concierge orders</h1>
          <p className="mt-1 text-sm text-ink-muted">Go buy it, ship it, and mark it here as it moves.</p>
        </div>
        <Link href="/concierge" className="text-sm font-medium text-[var(--genie-primary-solid)] hover:underline">
          ← Requests
        </Link>
      </div>

      {!concierge ? (
        <div className="card mt-6 text-sm text-error-fg">
          The concierge system account doesn&apos;t exist yet — run the seed script
          (<code>npm run seed --workspace @genie/db</code>) after applying the concierge migration.
        </div>
      ) : orders.length === 0 ? (
        <div className="card mt-6 text-sm text-ink-muted">No paid orders yet.</div>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-display font-bold">{o.orderNumber}</div>
                  <div className="text-sm text-ink-secondary">
                    {o.items.map((i) => `${i.description} ×${i.quantity}`).join(', ')}
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">
                    {o.buyer ? `${o.buyer.firstName} ${o.buyer.lastName}` : 'Guest'} · {formatKobo(o.totalKobo)} ·{' '}
                    {o.createdAt.toLocaleDateString('en-GB')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {o.delivery?.status ?? 'PENDING'}
                  </div>
                  {o.status !== 'DELIVERED' && o.status !== 'CANCELLED' && (
                    <div className="mt-2 flex gap-2">
                      {o.delivery?.status !== 'DISPATCHED' && (
                        <form action={updateDelivery.bind(null, o.id, 'DISPATCHED')}>
                          <button className="rounded-lg border border-[var(--genie-border-strong)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--genie-bg-subtle)]">
                            Mark dispatched
                          </button>
                        </form>
                      )}
                      <form action={updateDelivery.bind(null, o.id, 'DELIVERED')}>
                        <button className="btn px-3 py-1.5 text-xs">Mark delivered</button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
