import Link from 'next/link';
import { prisma, type PaymentStatus, type PayoutStatus, type Prisma, type TransactionType } from '@genie/db';
import { guard } from '@/lib/rbac';
import { PAGE_SIZE, fmtDateTime, formatKobo, formatKoboCompact, fullName, one, pageArgs, titleCase } from '@/lib/format';
import { Empty, FilterBar, Forbidden, PageHeader, Pager, Person, Stat, StatusPill, Table, Td, Th, Thead, Tr } from '@/components/ui';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;
const TYPES: TransactionType[] = ['FUNDING', 'GIFT', 'ORDER_PAYMENT', 'PAYOUT', 'WITHDRAWAL', 'FEE', 'REFUND', 'REFERRAL'];
const PAYMENT_STATUSES: PaymentStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'];
const PAYOUT_STATUSES: PayoutStatus[] = ['PENDING', 'PROCESSING', 'PAID', 'FAILED'];

export default async function TransactionsPage({ searchParams }: { searchParams: SP }) {
  const session = await guard('transactions');
  if (!session) return <Forbidden />;

  const sp = await searchParams;
  const tab = one(sp.tab) === 'payouts' ? 'payouts' : 'transactions';
  const q = one(sp.q);
  const status = one(sp.status);
  const type = one(sp.type);
  const { page, skip, take } = pageArgs(one(sp.page));

  const tabs = (
    <div className="mb-4 flex gap-1 border-b border-[var(--genie-border)] text-sm">
      {(
        [
          ['transactions', 'Transactions'],
          ['payouts', 'Merchant payouts'],
        ] as const
      ).map(([key, label]) => (
        <Link
          key={key}
          href={key === 'transactions' ? '/transactions' : '/transactions?tab=payouts'}
          className={`-mb-px border-b-2 px-4 py-2 font-medium ${
            tab === key ? 'border-[var(--genie-primary-solid)] text-[var(--genie-primary-solid)]' : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );

  if (tab === 'payouts') {
    const where: Prisma.PayoutWhereInput = {
      ...((PAYOUT_STATUSES as string[]).includes(status) ? { status: status as PayoutStatus } : {}),
      ...(q
        ? {
            OR: [
              { reference: { contains: q, mode: 'insensitive' } },
              { merchant: { merchantProfile: { businessName: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [total, payouts, owed] = await Promise.all([
      prisma.payout.count({ where }),
      prisma.payout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { merchant: { select: { firstName: true, email: true, merchantProfile: { select: { businessName: true } } } } },
      }),
      prisma.payout.aggregate({ where: { status: { in: ['PENDING', 'PROCESSING'] } }, _sum: { netAmountKobo: true } }),
    ]);

    return (
      <div>
        <PageHeader title="Transactions" subtitle="Money moving through genie." />
        {tabs}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Awaiting payout" value={formatKoboCompact(owed._sum.netAmountKobo)} hint="pending + processing" />
        </div>
        <FilterBar
          q={q}
          placeholder="Reference or merchant"
          selects={[{ name: 'status', value: status, label: 'Any status', options: PAYOUT_STATUSES.map((s) => [s, titleCase(s)] as [string, string]) }]}
          hidden={{ tab: 'payouts' }}
        />
        {payouts.length === 0 ? (
          <Empty>No payouts yet.</Empty>
        ) : (
          <Table min={860}>
            <Thead>
              <Th>Reference</Th>
              <Th>Merchant</Th>
              <Th right>Gross</Th>
              <Th right>Fee</Th>
              <Th right>Net</Th>
              <Th>Created</Th>
              <Th>Status</Th>
            </Thead>
            <tbody>
              {payouts.map((p) => (
                <Tr key={p.id}>
                  <Td><span className="font-mono text-xs">{p.reference}</span></Td>
                  <Td><Person name={p.merchant.merchantProfile?.businessName ?? p.merchant.firstName} sub={p.merchant.email} /></Td>
                  <Td right>{formatKobo(p.amountKobo)}</Td>
                  <Td right>{formatKobo(p.feeKobo)}</Td>
                  <Td right>{formatKobo(p.netAmountKobo)}</Td>
                  <Td muted>{fmtDateTime(p.createdAt)}</Td>
                  <Td>
                    <StatusPill status={p.status} />
                    {p.failureReason && <div className="mt-1 text-xs text-error-fg">{p.failureReason}</div>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager base="/transactions" params={{ tab: 'payouts', q, status }} page={page} total={total} pageSize={PAGE_SIZE} />
      </div>
    );
  }

  const where: Prisma.TransactionWhereInput = {
    ...((TYPES as string[]).includes(type) ? { type: type as TransactionType } : {}),
    ...((PAYMENT_STATUSES as string[]).includes(status) ? { status: status as PaymentStatus } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
            { narration: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [total, txs, completed] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    }),
    prisma.transaction.aggregate({ where: { status: 'COMPLETED' }, _sum: { amountKobo: true, feeKobo: true }, _count: true }),
  ]);

  return (
    <div>
      <PageHeader title="Transactions" subtitle="Money moving through genie." />
      {tabs}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Completed volume" value={formatKoboCompact(completed._sum.amountKobo)} hint={`${completed._count} transactions`} />
        <Stat label="Fees on completed" value={formatKoboCompact(completed._sum.feeKobo)} />
      </div>
      <FilterBar
        q={q}
        placeholder="Reference, email or narration"
        selects={[
          { name: 'type', value: type, label: 'Any type', options: TYPES.map((t) => [t, titleCase(t)] as [string, string]) },
          { name: 'status', value: status, label: 'Any status', options: PAYMENT_STATUSES.map((s) => [s, titleCase(s)] as [string, string]) },
        ]}
      />
      {txs.length === 0 ? (
        <Empty>No transactions match.</Empty>
      ) : (
        <Table min={880}>
          <Thead>
            <Th>Reference</Th>
            <Th>Type</Th>
            <Th>User</Th>
            <Th right>Amount</Th>
            <Th right>Fee</Th>
            <Th>Date</Th>
            <Th>Status</Th>
          </Thead>
          <tbody>
            {txs.map((t) => (
              <Tr key={t.id}>
                <Td>
                  <span className="font-mono text-xs">{t.reference}</span>
                  {t.narration && <div className="text-xs text-ink-muted">{t.narration}</div>}
                </Td>
                <Td muted>{titleCase(t.type)}</Td>
                <Td>{t.user ? <Person name={fullName(t.user)} sub={t.user.email} /> : <span className="text-ink-muted">Guest</span>}</Td>
                <Td right>{formatKobo(t.amountKobo)}</Td>
                <Td right>{formatKobo(t.feeKobo)}</Td>
                <Td muted>{fmtDateTime(t.createdAt)}</Td>
                <Td><StatusPill status={t.status} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager base="/transactions" params={{ q, type, status }} page={page} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
