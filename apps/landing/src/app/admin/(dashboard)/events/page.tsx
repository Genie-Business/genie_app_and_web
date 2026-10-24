import { prisma, type Prisma } from '@genie/db';
import { guard } from '@/admin/lib/rbac';
import { PAGE_SIZE, fmtDate, fullName, one, pageArgs, titleCase } from '@/admin/lib/format';
import { A, Empty, FilterBar, Forbidden, PageHeader, Pager, Person, StatusPill, Table, Td, Th, Thead, Tr } from '@/admin/components/ui';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;
const STATUSES = ['ACTIVE', 'EXPIRED', 'COMPLETED', 'DELETED'] as const;

export default async function EventsPage({ searchParams }: { searchParams: SP }) {
  const session = await guard('events');
  if (!session) return <Forbidden />;

  const sp = await searchParams;
  const q = one(sp.q);
  const status = one(sp.status);
  const { page, skip, take } = pageArgs(one(sp.page));

  const where: Prisma.EventWhereInput = {
    ...((STATUSES as readonly string[]).includes(status) ? { status: status as (typeof STATUSES)[number] } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { type: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
            { user: { firstName: { contains: q, mode: 'insensitive' } } },
            { user: { lastName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, events] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy: { eventDate: 'desc' },
      skip,
      take,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        wishlists: { select: { _count: { select: { items: true } } } },
      },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Events & wishlists" subtitle="Every occasion celebrants have created, with the wishlists attached to it." />
      <FilterBar
        q={q}
        placeholder="Search event, type, owner"
        selects={[{ name: 'status', value: status, label: 'Any status', options: STATUSES.map((s) => [s, titleCase(s)] as [string, string]) }]}
      />
      {events.length === 0 ? (
        <Empty>No events match.</Empty>
      ) : (
        <Table min={820}>
          <Thead>
            <Th>Event</Th>
            <Th>Owner</Th>
            <Th>Date</Th>
            <Th>Repeats</Th>
            <Th>Wishlists</Th>
            <Th>Items</Th>
            <Th>Status</Th>
          </Thead>
          <tbody>
            {events.map((e) => (
              <Tr key={e.id}>
                <Td>
                  <A href={`/events/${e.id}`}>
                    <Person name={e.name} sub={e.type} />
                  </A>
                </Td>
                <Td>
                  <A href={`/users/${e.user.id}`}>
                    <Person name={fullName(e.user)} sub={e.user.email} />
                  </A>
                </Td>
                <Td muted>{fmtDate(e.eventDate)}</Td>
                <Td muted>{e.recurrence === 'ANNUAL' ? 'Every year' : 'Once'}</Td>
                <Td>{e.wishlists.length}</Td>
                <Td>{e.wishlists.reduce((n, w) => n + w._count.items, 0)}</Td>
                <Td>
                  <StatusPill status={e.status} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager base="/events" params={{ q, status }} page={page} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
