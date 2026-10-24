import Link from 'next/link';
import { prisma } from '@genie/db';
import { can, guard, ROLE_LABEL, type AdminRoleName } from '@/admin/lib/rbac';
import { formatKobo, formatKoboCompact, fmtDateTime, fullName, titleCase } from '@/admin/lib/format';
import { A, Empty, Forbidden, PageHeader, Pill, SectionTitle, Stat, StatusPill } from '@/admin/components/ui';
import { BarChart } from '@/admin/components/bar-chart';

export const dynamic = 'force-dynamic';

const CONCIERGE_EMAIL = 'concierge@genieapps.co';
const DAY = 86_400_000;

/** One failing query (e.g. a table that hasn't been migrated yet) shouldn't blank the dashboard. */
async function safe<T, F = T>(p: Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await p;
  } catch (e) {
    console.error('dashboard query failed', e);
    return fallback;
  }
}

/** Counts per day for the last `days` days (oldest first), bucketed in the server's timezone. */
function perDay(dates: Date[], days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setTime(start.getTime() - (days - 1) * DAY);
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY);
    return {
      label: String(d.getDate()),
      full: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      value: 0,
    };
  });
  for (const d of dates) {
    const i = Math.floor((d.getTime() - start.getTime()) / DAY);
    if (i >= 0 && i < days) buckets[i]!.value += 1;
  }
  return buckets;
}

export default async function DashboardPage() {
  const session = await guard('overview');
  if (!session) return <Forbidden />;
  const role = session.role;

  const showPeople = can(role, 'users');
  const showMoney = can(role, 'transactions');
  const showConcierge = can(role, 'concierge');
  const showAudit = can(role, 'audit');

  const concierge = showConcierge
    ? await safe(prisma.user.findUnique({ where: { email: CONCIERGE_EMAIL }, select: { id: true } }), null)
    : null;
  const since = new Date(Date.now() - 14 * DAY);

  const [
    conciergeNew,
    conciergeInReview,
    conciergeActive,
    conciergeRejected,
    conciergeToFulfil,
    conciergeQueue,
    kycPending,
    kybPending,
    supportOpen,
    payoutsOpen,
    celebrants,
    merchants,
    activeEvents,
    activeProducts,
    waitlist,
    giftsPaid,
    paidOrders,
    signupDates,
    waitlistDates,
    recent,
    myClaimed,
  ] = await Promise.all([
    showConcierge ? safe(prisma.conciergeRequest.count({ where: { status: 'NEW' } }), 0) : 0,
    showConcierge ? safe(prisma.conciergeRequest.count({ where: { status: 'IN_REVIEW' } }), 0) : 0,
    showConcierge ? safe(prisma.conciergeRequest.count({ where: { status: 'ACTIVE' } }), 0) : 0,
    showConcierge ? safe(prisma.conciergeRequest.count({ where: { status: 'REJECTED' } }), 0) : 0,
    showConcierge && concierge
      ? safe(prisma.order.count({ where: { merchantId: concierge.id, status: { in: ['PAID', 'FULFILLING'] } } }), 0)
      : 0,
    showConcierge
      ? safe(
          prisma.conciergeRequest.findMany({
            where: { status: { in: ['NEW', 'IN_REVIEW'] } },
            orderBy: { createdAt: 'asc' },
            take: 5,
            include: { requestedBy: { select: { firstName: true, lastName: true } } },
          }),
          [],
        )
      : [],
    can(role, 'kyc') ? safe(prisma.kycVerification.count({ where: { status: 'PENDING' } }), 0) : 0,
    can(role, 'merchants') ? safe(prisma.merchantProfile.count({ where: { kybStatus: 'PENDING' } }), 0) : 0,
    can(role, 'support') ? safe(prisma.supportThread.count({ where: { status: { in: ['OPEN', 'PENDING'] } } }), 0) : 0,
    showMoney ? safe(prisma.payout.count({ where: { status: { in: ['PENDING', 'FAILED'] } } }), 0) : 0,
    showPeople ? safe(prisma.user.count({ where: { role: 'CELEBRANT', status: 'ACTIVE' } }), 0) : 0,
    showPeople ? safe(prisma.user.count({ where: { role: 'MERCHANT', status: 'ACTIVE' } }), 0) : 0,
    showPeople ? safe(prisma.event.count({ where: { status: 'ACTIVE' } }), 0) : 0,
    showPeople ? safe(prisma.product.count({ where: { status: 'ACTIVE' } }), 0) : 0,
    can(role, 'crm') ? safe(prisma.waitlistSignup.count(), 0) : 0,
    showMoney ? safe(prisma.gift.count({ where: { status: { in: ['PAID', 'DELIVERED', 'REVEALED'] } } }), 0) : 0,
    showMoney
      ? safe(
          prisma.order.aggregate({
            where: { status: { in: ['PAID', 'FULFILLING', 'DELIVERED'] } },
            _sum: { totalKobo: true, feeKobo: true, commissionKobo: true },
            _count: true,
          }),
          null,
        )
      : null,
    showPeople
      ? safe(prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true }, take: 5000 }), [])
      : [],
    can(role, 'crm')
      ? safe(prisma.waitlistSignup.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true }, take: 5000 }), [])
      : [],
    showAudit ? safe(prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }), []) : [],
    showConcierge
      ? safe(prisma.conciergeRequest.count({ where: { claimedByAdminId: session.sub, status: 'IN_REVIEW' } }), 0)
      : 0,
  ]);

  const adminNames = new Map<string, string>();
  if (recent.length) {
    const ids = [...new Set(recent.map((r) => r.adminId).filter((x): x is string => !!x))];
    const admins = await safe(prisma.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), []);
    for (const a of admins) adminNames.set(a.id, a.name);
  }

  const attention: Array<{ label: string; count: number; href: string; hint: string }> = [
    { label: 'Concierge requests', count: conciergeNew + conciergeInReview, href: '/concierge', hint: 'waiting to be priced' },
    { label: 'Concierge orders', count: conciergeToFulfil, href: '/concierge/orders', hint: 'to buy & ship' },
    { label: 'KYC reviews', count: kycPending, href: '/kyc', hint: 'pending' },
    { label: 'Merchant KYB', count: kybPending, href: '/merchants', hint: 'awaiting approval' },
    { label: 'Support threads', count: supportOpen, href: '/support', hint: 'open' },
    { label: 'Payouts', count: payoutsOpen, href: '/transactions?tab=payouts', hint: 'pending or failed' },
  ].filter((a) => {
    const section = a.href.startsWith('/concierge') ? 'concierge' : a.href.startsWith('/transactions') ? 'transactions' : (a.href.slice(1) as 'kyc');
    return can(role, section);
  });

  const totalAttention = attention.reduce((n, a) => n + a.count, 0);
  const signups = perDay(signupDates.map((s) => s.createdAt), 14);
  const signupTotal = signups.reduce((n, d) => n + d.value, 0);
  const waitlistSeries = perDay(waitlistDates.map((s) => s.createdAt), 14);
  const waitlistTotal = waitlistSeries.reduce((n, d) => n + d.value, 0);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={
          <>
            {ROLE_LABEL[role as AdminRoleName] ?? role} view ·{' '}
            {totalAttention > 0 ? `${totalAttention} item${totalAttention === 1 ? '' : 's'} need attention` : 'nothing is waiting on you'}
          </>
        }
      />

      {attention.length > 0 && (
        <>
          <SectionTitle>Needs attention</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((a) => (
              <Stat key={a.label} label={a.label} value={a.count} hint={a.hint} href={a.href} />
            ))}
          </div>
        </>
      )}

      {showConcierge && (
        <>
          <SectionTitle>Concierge queue</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="New" value={conciergeNew} href="/concierge" />
            <Stat label="In review" value={conciergeInReview} hint={role === 'CONCIERGE' || role === 'ADMIN' || role === 'SUPER_ADMIN' ? `${myClaimed} claimed by you` : undefined} href="/concierge" />
            <Stat label="Sourced & live" value={conciergeActive} />
            <Stat label="Rejected" value={conciergeRejected} />
          </div>
          <div className="mt-3">
            {conciergeQueue.length === 0 ? (
              <Empty>Nothing waiting — new imports will show up here.</Empty>
            ) : (
              <div className="card divide-y divide-[var(--genie-border)] p-0">
                {conciergeQueue.map((r) => (
                  <Link
                    key={r.id}
                    href={`/concierge/${r.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-[var(--genie-bg-subtle)]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.name}</div>
                      <div className="text-xs text-ink-muted">
                        {fullName(r.requestedBy)} · waiting since {fmtDateTime(r.createdAt)}
                      </div>
                    </div>
                    <StatusPill status={r.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {showPeople && (
        <>
          <SectionTitle>Platform</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Celebrants" value={celebrants.toLocaleString('en-NG')} href="/users" />
            <Stat label="Merchants" value={merchants.toLocaleString('en-NG')} href="/merchants" />
            <Stat label="Active events" value={activeEvents.toLocaleString('en-NG')} href="/events" />
            <Stat label="Active products" value={activeProducts.toLocaleString('en-NG')} href="/products" />
          </div>

          <div className="card mt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="font-display text-base font-bold">New accounts</div>
                <div className="text-sm text-ink-muted">Last 14 days · {signupTotal} sign-up{signupTotal === 1 ? '' : 's'}</div>
              </div>
              {can(role, 'crm') && (
                <Link href="/crm" className="text-sm text-ink-muted hover:text-ink">
                  Waitlist: {waitlist.toLocaleString('en-NG')} total · +{waitlistTotal} this fortnight
                </Link>
              )}
            </div>
            <div className="mt-3">
              <BarChart data={signups} unit="new accounts" />
            </div>
          </div>
        </>
      )}

      {showMoney && (
        <>
          <SectionTitle>Money</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Order volume" value={formatKoboCompact(paidOrders?._sum.totalKobo)} hint={`${paidOrders?._count ?? 0} paid orders`} href="/orders" />
            <Stat label="Fees collected" value={formatKoboCompact(paidOrders?._sum.feeKobo)} hint="gifter-side fees" href="/transactions" />
            <Stat label="Commission" value={formatKoboCompact(paidOrders?._sum.commissionKobo)} hint="merchant-side" href="/fees" />
            <Stat label="Gifts sent" value={giftsPaid.toLocaleString('en-NG')} hint={paidOrders ? formatKobo(paidOrders._sum.totalKobo) : undefined} />
          </div>
        </>
      )}

      {showAudit && (
        <>
          <SectionTitle>Recent admin activity</SectionTitle>
          {recent.length === 0 ? (
            <Empty>No admin actions recorded yet.</Empty>
          ) : (
            <div className="card divide-y divide-[var(--genie-border)] p-0">
              {recent.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{r.adminId ? (adminNames.get(r.adminId) ?? 'Admin') : 'System'}</span>{' '}
                    <span className="text-ink-secondary">{titleCase(r.action.replace(/[._]/g, ' '))}</span>{' '}
                    <Pill>{r.entityType}</Pill>
                  </div>
                  <span className="shrink-0 text-xs text-ink-muted">{fmtDateTime(r.createdAt)}</span>
                </div>
              ))}
              <div className="px-5 py-3 text-sm">
                <A href="/audit">View full audit log →</A>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
