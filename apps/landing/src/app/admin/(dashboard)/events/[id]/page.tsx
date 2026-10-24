import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@genie/db';
import { guard } from '@/admin/lib/rbac';
import { fmtDate, formatKobo, fullName } from '@/admin/lib/format';
import { A, Empty, Forbidden, PageHeader, Pill, SectionTitle, StatusPill, Table, Td, Th, Thead, Tr } from '@/admin/components/ui';

export const dynamic = 'force-dynamic';

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await guard('events');
  if (!session) return <Forbidden />;
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      wishlists: {
        orderBy: { createdAt: 'asc' },
        include: { items: { include: { product: { select: { id: true, name: true, priceKobo: true, status: true } } }, orderBy: { createdAt: 'asc' } } },
      },
    },
  });
  if (!event) notFound();

  return (
    <div>
      <PageHeader
        title={event.name}
        subtitle={
          <>
            {event.type} · {fmtDate(event.eventDate)} · owned by <A href={`/users/${event.user.id}`}>{fullName(event.user)}</A> ·{' '}
            <StatusPill status={event.status} />
          </>
        }
        actions={
          <Link href="/events" className="text-sm font-medium text-[var(--genie-primary-solid)] hover:underline">
            ← All events
          </Link>
        }
      />

      <div className="card text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div><span className="text-ink-muted">Delivery address: </span>{event.deliveryAddress ?? '—'}</div>
          <div><span className="text-ink-muted">Repeats: </span>{event.recurrence === 'ANNUAL' ? 'Every year' : 'Once'}</div>
          <div><span className="text-ink-muted">Wishlist expires: </span>{fmtDate(event.expiresAt)}</div>
          <div><span className="text-ink-muted">Created: </span>{fmtDate(event.createdAt)}</div>
        </div>
      </div>

      {event.wishlists.length === 0 ? (
        <>
          <SectionTitle>Wishlists</SectionTitle>
          <Empty>No wishlists yet.</Empty>
        </>
      ) : (
        event.wishlists.map((w) => (
          <div key={w.id}>
            <SectionTitle>{w.name}</SectionTitle>
            {w.items.length === 0 ? (
              <Empty>Empty wishlist.</Empty>
            ) : (
              <Table min={620}>
                <Thead>
                  <Th>Item</Th>
                  <Th>Price</Th>
                  <Th>Fulfilled</Th>
                  <Th>Notes</Th>
                </Thead>
                <tbody>
                  {w.items.map((i) => (
                    <Tr key={i.id}>
                      <Td>
                        <div className="font-medium">{i.product.name}</div>
                        {i.product.status !== 'ACTIVE' && <StatusPill status={i.product.status} />}
                      </Td>
                      <Td>{i.product.priceKobo > 0n ? formatKobo(i.product.priceKobo) : <span className="text-ink-muted">awaiting price</span>}</Td>
                      <Td>
                        {i.quantityFulfilled} / {i.quantityWanted}
                      </Td>
                      <Td muted>
                        {i.isAnonymousGift && <Pill tone="info">Anonymous gifts</Pill>} {i.note}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        ))
      )}
    </div>
  );
}
