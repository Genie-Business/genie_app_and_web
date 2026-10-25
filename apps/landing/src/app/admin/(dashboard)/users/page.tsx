import { prisma, type Prisma } from '@genie/db';
import { guard } from '@/admin/lib/rbac';
import { PAGE_SIZE, fmtDate, fullName, one, pageArgs } from '@/admin/lib/format';
import { A, Empty, FilterBar, Forbidden, PageHeader, Pager, Person, StatusPill, Table, Td, Th, Thead, Tr } from '@/admin/components/ui';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const session = await guard('users');
  if (!session) return <Forbidden />;

  const sp = await searchParams;
  const q = one(sp.q);
  const role = one(sp.role);
  const status = one(sp.status);
  const { page, skip, take } = pageArgs(one(sp.page));

  const where: Prisma.UserWhereInput = {
    // Merchants have their own page; this one is for everyone.
    ...(role === 'CELEBRANT' || role === 'MERCHANT' ? { role } : {}),
    ...(status === 'ACTIVE' || status === 'DELETED' ? { status } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { _count: { select: { events: true, giftsGiven: true } }, kycVerifications: { select: { status: true }, take: 1 } },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Users" subtitle="Everyone who has signed up in the app: celebrants and merchants." />
      <FilterBar
        q={q}
        placeholder="Search name, email, username, phone"
        selects={[
          { name: 'role', value: role, label: 'All roles', options: [['CELEBRANT', 'Celebrants'], ['MERCHANT', 'Merchants']] },
          { name: 'status', value: status, label: 'Any status', options: [['ACTIVE', 'Active'], ['DELETED', 'Deleted']] },
        ]}
      />
      {users.length === 0 ? (
        <Empty>No users match.</Empty>
      ) : (
        <Table min={860}>
          <Thead>
            <Th>User</Th>
            <Th>Role</Th>
            <Th>Location</Th>
            <Th>Events</Th>
            <Th>Gifts sent</Th>
            <Th>KYC</Th>
            <Th>Joined</Th>
            <Th>Status</Th>
          </Thead>
          <tbody>
            {users.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <A href={`/users/${u.id}`}>
                    <Person name={fullName(u)} sub={u.email} />
                  </A>
                </Td>
                <Td>{u.role === 'MERCHANT' ? 'Merchant' : 'Celebrant'}</Td>
                <Td muted>{[u.city, u.stateOfResidence].filter(Boolean).join(', ') || '—'}</Td>
                <Td>{u._count.events}</Td>
                <Td>{u._count.giftsGiven}</Td>
                <Td>{u.kycVerifications[0] ? <StatusPill status={u.kycVerifications[0].status} /> : <span className="text-ink-muted">—</span>}</Td>
                <Td muted>{fmtDate(u.createdAt)}</Td>
                <Td>
                  <StatusPill status={u.status} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager base="/users" params={{ q, role, status }} page={page} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
