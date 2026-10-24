import { prisma, type Prisma, type SupportStatus } from '@genie/db';
import { guard } from '@/admin/lib/rbac';
import { PAGE_SIZE, fmtDateTime, fullName, one, pageArgs, titleCase } from '@/admin/lib/format';
import { A, Empty, FilterBar, Forbidden, PageHeader, Pager, Person, StatusPill, Table, Td, Th, Thead, Tr } from '@/admin/components/ui';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;
const STATUSES: SupportStatus[] = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];

export default async function SupportInboxPage({ searchParams }: { searchParams: SP }) {
  const session = await guard('support');
  if (!session) return <Forbidden />;

  const sp = await searchParams;
  const q = one(sp.q);
  // First visit: just the threads that need a person. "Any status" is an explicit empty value.
  const status = sp.status === undefined ? 'OPEN' : one(sp.status);
  const { page, skip, take } = pageArgs(one(sp.page));

  const where: Prisma.SupportThreadWhereInput = {
    ...((STATUSES as string[]).includes(status) ? { status: status as SupportStatus } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
            { messages: { some: { body: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const [total, threads] = await Promise.all([
    prisma.supportThread.count({ where }),
    prisma.supportThread.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, senderType: true } },
        _count: { select: { messages: true } },
      },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Support inbox" subtitle="Conversations users have started from the app’s Help screen." />
      <FilterBar
        q={q}
        placeholder="Search subject, email or message"
        selects={[{ name: 'status', value: status, label: 'Any status', options: STATUSES.map((s) => [s, titleCase(s)] as [string, string]) }]}
      />
      {threads.length === 0 ? (
        <Empty>No conversations here.</Empty>
      ) : (
        <Table min={760}>
          <Thead>
            <Th>From</Th>
            <Th>Conversation</Th>
            <Th>Messages</Th>
            <Th>Updated</Th>
            <Th>Status</Th>
          </Thead>
          <tbody>
            {threads.map((t) => {
              const last = t.messages[0];
              return (
                <Tr key={t.id}>
                  <Td><Person name={fullName(t.user)} sub={t.user.email} /></Td>
                  <Td>
                    <A href={`/support/${t.id}`}>{t.subject || 'No subject'}</A>
                    {last && (
                      <div className="mt-0.5 max-w-md truncate text-xs text-ink-muted">
                        {last.senderType === 'AGENT' ? 'You: ' : ''}
                        {last.body}
                      </div>
                    )}
                  </Td>
                  <Td>{t._count.messages}</Td>
                  <Td muted>{fmtDateTime(t.updatedAt)}</Td>
                  <Td><StatusPill status={t.status} /></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pager base="/support" params={{ q, status }} page={page} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
