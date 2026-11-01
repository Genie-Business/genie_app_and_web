import { revalidatePath } from 'next/cache';
import { prisma, type OrderStatus, type Prisma } from '@genie/db';
import { audit } from '@/admin/lib/audit';
import { canWrite, guard, guardWrite } from '@/admin/lib/rbac';
import { PAGE_SIZE, fmtDateTime, formatKobo, fullName, one, pageArgs, titleCase } from '@/admin/lib/format';
import { Empty, FilterBar, Forbidden, PageHeader, Pager, Person, StatusPill, Table, Td, Th, Thead, Tr, ghostBtn } from '@/admin/components/ui';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;
const STATUSES: OrderStatus[] = ['PENDING_PAYMENT', 'PAID', 'FULFILLING', 'DELIVERED', 'CANCELLED'];

/**
 * Record that the delivery company has delivered an order, on their behalf (they reported it by phone or
 * email). Goes through the same endpoint their own system would use: it marks the order delivered, tells
 * the buyer, the recipient and the merchant, and pays the merchant straight away.
 */
async function markDelivered(orderNumber: string) {
  'use server';
  const session = await guardWrite('orders');
  if (!session) return;
  const secret = process.env.CRON_SECRET;
  if (!secret) return;

  const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787').replace(/\/$/, '');
  let result: unknown = null;
  try {
    const res = await fetch(`${base}/v1/internal/delivery/confirm`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ orderNumber }),
      cache: 'no-store',
    });
    result = await res.json().catch(() => ({ status: res.status }));
  } catch {
    result = { error: 'could not reach the API' };
  }
  await audit(session, 'order.delivery.confirm', 'Order', orderNumber, { after: result });
  revalidatePath('/admin/orders');
}

export default async function OrdersPage({ searchParams }: { searchParams: SP }) {
  const session = await guard('orders');
  if (!session) return <Forbidden />;

  const writer = canWrite(session.role, 'orders');
  const sp = await searchParams;
  const q = one(sp.q);
  const status = one(sp.status);
  const { page, skip, take } = pageArgs(one(sp.page));

  const where: Prisma.OrderWhereInput = {
    ...((STATUSES as string[]).includes(status) ? { status: status as OrderStatus } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: 'insensitive' } },
            { merchant: { merchantProfile: { businessName: { contains: q, mode: 'insensitive' } } } },
            { buyer: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        items: { select: { description: true, quantity: true } },
        delivery: { select: { status: true } },
        merchant: { select: { firstName: true, merchantProfile: { select: { businessName: true } } } },
        buyer: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Orders" subtitle="Every order across merchants. Each gift that’s paid becomes one. Deliveries are confirmed by the delivery company or the person receiving the gift, never the merchant; use “Mark delivered” only to record what the courier told you." />
      <FilterBar
        q={q}
        placeholder="Order number, merchant or buyer email"
        selects={[{ name: 'status', value: status, label: 'Any status', options: STATUSES.map((s) => [s, titleCase(s)] as [string, string]) }]}
      />
      {orders.length === 0 ? (
        <Empty>No orders match.</Empty>
      ) : (
        <Table min={940}>
          <Thead>
            <Th>Order</Th>
            <Th>Items</Th>
            <Th>Merchant</Th>
            <Th>Buyer</Th>
            <Th right>Total</Th>
            <Th>Placed</Th>
            <Th>Order</Th>
            <Th>Delivery</Th>
            <Th right />
          </Thead>
          <tbody>
            {orders.map((o) => (
              <Tr key={o.id}>
                <Td><span className="font-mono text-xs">{o.orderNumber}</span></Td>
                <Td>{o.items.map((i) => `${i.description} ×${i.quantity}`).join(', ')}</Td>
                <Td muted>{o.merchant.merchantProfile?.businessName ?? o.merchant.firstName}</Td>
                <Td>{o.buyer ? <Person name={fullName(o.buyer)} sub={o.buyer.email} /> : <span className="text-ink-muted">Guest</span>}</Td>
                <Td right>{formatKobo(o.totalKobo)}</Td>
                <Td muted>{fmtDateTime(o.createdAt)}</Td>
                <Td><StatusPill status={o.status} /></Td>
                <Td>{o.delivery ? <StatusPill status={o.delivery.status} /> : <span className="text-ink-muted">—</span>}</Td>
                <Td right>
                  {writer && (o.status === 'PAID' || o.status === 'FULFILLING') && (
                    <form action={markDelivered.bind(null, o.orderNumber)}>
                      <button className={ghostBtn} title="The delivery company reported this delivered: notify everyone and pay the merchant">
                        Mark delivered
                      </button>
                    </form>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager base="/orders" params={{ q, status }} page={page} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
