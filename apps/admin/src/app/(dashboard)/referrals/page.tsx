import { prisma, type Prisma, type ReferralStatus } from '@genie/db';
import { guard } from '@/lib/rbac';
import { PAGE_SIZE, fmtDate, formatKobo, fullName, one, pageArgs, titleCase } from '@/lib/format';
import { A, Empty, FilterBar, Forbidden, PageHeader, Pager, Stat, StatusPill, Table, Td, Th, Thead, Tr } from '@/components/ui';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;
const STATUSES: ReferralStatus[] = ['PENDING', 'SIGNED_UP', 'REWARDED'];

export default async function ReferralsPage({ searchParams }: { searchParams: SP }) {
  const session = await guard('referrals');
  if (!session) return <Forbidden />;

  const sp = await searchParams;
  const q = one(sp.q);
  const status = one(sp.status);
  const { page, skip, take } = pageArgs(one(sp.page));

  const where: Prisma.ReferralWhereInput = {
    ...((STATUSES as string[]).includes(status) ? { status: status as ReferralStatus } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { referrer: { email: { contains: q, mode: 'insensitive' } } },
            { referee: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, referrals, byStatus, paid] = await Promise.all([
    prisma.referral.count({ where }),
    prisma.referral.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        referrer: { select: { id: true, firstName: true, lastName: true, email: true } },
        referee: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.referral.groupBy({ by: ['status'], _count: true }),
    prisma.referral.aggregate({ where: { status: 'REWARDED' }, _sum: { rewardKobo: true } }),
  ]);
  const count = (s: ReferralStatus) => byStatus.find((r) => r.status === s)?._count ?? 0;

  return (
    <div>
      <PageHeader title="Referrals" subtitle="Who invited whom, and the rewards paid out." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Invites sent" value={count('PENDING') + count('SIGNED_UP') + count('REWARDED')} />
        <Stat label="Signed up" value={count('SIGNED_UP') + count('REWARDED')} />
        <Stat label="Rewarded" value={count('REWARDED')} />
        <Stat label="Rewards paid" value={formatKobo(paid._sum.rewardKobo ?? 0n)} />
      </div>
      <FilterBar
        q={q}
        placeholder="Code or email"
        selects={[{ name: 'status', value: status, label: 'Any status', options: STATUSES.map((s) => [s, titleCase(s)] as [string, string]) }]}
      />
      {referrals.length === 0 ? (
        <Empty>No referrals match.</Empty>
      ) : (
        <Table min={760}>
          <Thead>
            <Th>Referrer</Th>
            <Th>Referee</Th>
            <Th>Code</Th>
            <Th right>Reward</Th>
            <Th>Date</Th>
            <Th>Status</Th>
          </Thead>
          <tbody>
            {referrals.map((r) => (
              <Tr key={r.id}>
                <Td><A href={`/users/${r.referrer.id}`}>{fullName(r.referrer)}</A><div className="text-xs text-ink-muted">{r.referrer.email}</div></Td>
                <Td>{r.referee ? <><A href={`/users/${r.referee.id}`}>{fullName(r.referee)}</A><div className="text-xs text-ink-muted">{r.referee.email}</div></> : <span className="text-ink-muted">not yet</span>}</Td>
                <Td><span className="font-mono text-xs">{r.code}</span></Td>
                <Td right>{r.rewardKobo > 0n ? formatKobo(r.rewardKobo) : '—'}</Td>
                <Td muted>{fmtDate(r.createdAt)}</Td>
                <Td><StatusPill status={r.status} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager base="/referrals" params={{ q, status }} page={page} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
