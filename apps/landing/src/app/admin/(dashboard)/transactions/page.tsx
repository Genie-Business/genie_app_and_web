import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma, type PaymentStatus, type PayoutStatus, type Prisma, type TransactionType } from '@genie/db';
import { audit } from '@/admin/lib/audit';
import { canWrite, guard, guardWrite } from '@/admin/lib/rbac';
import { PAGE_SIZE, fmtDateTime, formatKobo, formatKoboCompact, fullName, one, pageArgs, titleCase } from '@/admin/lib/format';
import { Empty, FilterBar, Forbidden, PageHeader, Pager, Person, Stat, StatusPill, Table, Td, Th, Thead, Tr } from '@/admin/components/ui';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;
const TYPES: TransactionType[] = ['GIFT', 'ORDER_PAYMENT', 'PAYOUT', 'FEE', 'REFUND', 'REFERRAL'];
const PAYMENT_STATUSES: PaymentStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'];
const PAYOUT_STATUSES: PayoutStatus[] = ['PENDING', 'PROCESSING', 'PAID', 'FAILED'];

/**
 * Pay every merchant what they are owed for delivered orders, right now rather than at the
 * next scheduled run. Calls the same endpoint the daily cron uses; money is sent by the API.
 */
async function runPayoutsNow() {
  'use server';
  const session = await guardWrite('transactions');
  if (!session) return;

  const secret = process.env.CRON_SECRET;
  if (!secret) redirect('/transactions?tab=payouts&run=unconfigured');

  let outcome = 'failed';
  let detail: Record<string, unknown> | null = null;
  try {
    const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787').replace(/\/$/, '');
    const res = await fetch(`${base}/v1/internal/payouts/run`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    detail = json?.data ?? { status: res.status };
    outcome = res.ok ? 'ok' : 'failed';
  } catch {
    detail = { error: 'could not reach the API' };
  }
  await audit(session, 'payouts.run', 'Payout', null, { after: detail });
  const paid = outcome === 'ok' ? `&paid=${String(detail?.paid ?? 0)}&processing=${String(detail?.processing ?? 0)}&skipped=${String(detail?.skipped ?? 0)}` : '';
  redirect(`/transactions?tab=payouts&run=${outcome}${paid}`);
}

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
    const [total, payouts, owed, ready] = await Promise.all([
      prisma.payout.count({ where }),
      prisma.payout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { merchant: { select: { firstName: true, email: true, merchantProfile: { select: { businessName: true } } } } },
      }),
      prisma.payout.aggregate({ where: { status: { in: ['PENDING', 'PROCESSING'] } }, _sum: { netAmountKobo: true } }),
      // Delivered orders waiting for the next run.
      prisma.order.aggregate({ where: { status: 'DELIVERED', payoutId: null }, _sum: { merchantNetKobo: true }, _count: true }),
    ]);
    const run = one(sp.run);

    return (
      <div>
        <PageHeader title="Transactions" subtitle="Money moving through genie." />
        {tabs}
        {run && (
          <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${run === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
            {run === 'ok'
              ? `Payout run finished: ${one(sp.paid) || 0} paid, ${one(sp.processing) || 0} still processing, ${one(sp.skipped) || 0} skipped.`
              : run === 'unconfigured'
                ? 'CRON_SECRET is not set on this project, so payouts cannot be started from here.'
                : 'The payout run did not complete. Check the API logs, then try again.'}
          </div>
        )}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Ready for the next run" value={formatKoboCompact(ready._sum.merchantNetKobo ?? 0)} hint={`${ready._count} delivered order${ready._count === 1 ? '' : 's'}`} />
          <Stat label="Sent, not yet confirmed" value={formatKoboCompact(owed._sum.netAmountKobo ?? 0)} hint="pending + processing" />
          {canWrite(session.role, 'transactions') && (
            <form action={runPayoutsNow} className="card flex flex-col justify-center gap-2">
              <p className="text-xs text-ink-muted">Runs automatically every morning. Run it now to pay delivered orders straight away.</p>
              <button className="btn">Run payouts now</button>
            </form>
          )}
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
        <Stat label="Completed volume" value={formatKoboCompact(completed._sum.amountKobo ?? 0)} hint={`${completed._count} transactions`} />
        <Stat label="Fees on completed" value={formatKoboCompact(completed._sum.feeKobo ?? 0)} />
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
