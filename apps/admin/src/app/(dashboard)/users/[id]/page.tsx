import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@genie/db';
import { guard } from '@/lib/rbac';
import { fmtDate, fmtDateTime, formatKobo, fullName } from '@/lib/format';
import { A, Empty, Forbidden, PageHeader, SectionTitle, Stat, StatusPill, Table, Td, Th, Thead, Tr } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await guard('users');
  if (!session) return <Forbidden />;
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      merchantProfile: true,
      kycVerifications: true,
      wallet: { select: { balanceKobo: true, status: true } },
      referredBy: { select: { id: true, firstName: true, lastName: true } },
      events: { orderBy: { eventDate: 'desc' }, take: 10, include: { _count: { select: { wishlists: true } } } },
      transactions: { orderBy: { createdAt: 'desc' }, take: 10 },
      _count: { select: { giftsGiven: true, referrals: true, conciergeRequests: true, ordersAsBuyer: true } },
    },
  });
  if (!user) notFound();

  const rows: Array<[string, React.ReactNode]> = [
    ['Email', <>{user.email} {user.emailVerifiedAt ? <span className="text-xs text-emerald-700">verified</span> : <span className="text-xs text-amber-700">unverified</span>}</>],
    ['Username', `@${user.username}`],
    ['Phone', user.phone ?? '—'],
    ['Location', [user.addressLine, user.city, user.lga, user.stateOfResidence, user.country].filter(Boolean).join(', ') || '—'],
    ['Date of birth', fmtDate(user.dateOfBirth)],
    ['Referral code', user.referralCode],
    ['Referred by', user.referredBy ? <A href={`/users/${user.referredBy.id}`}>{fullName(user.referredBy)}</A> : '—'],
    ['Joined', fmtDateTime(user.createdAt)],
  ];

  return (
    <div>
      <PageHeader
        title={fullName(user)}
        subtitle={
          <>
            {user.role === 'MERCHANT' ? 'Merchant' : 'Celebrant'} · <StatusPill status={user.status} />
            {user.status === 'DELETED' && user.deletionReason ? ` — ${user.deletionReason}` : ''}
          </>
        }
        actions={
          <Link href="/users" className="text-sm font-medium text-[var(--genie-primary-solid)] hover:underline">
            ← All users
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Gifts sent" value={user._count.giftsGiven} />
        <Stat label="Orders placed" value={user._count.ordersAsBuyer} />
        <Stat label="People referred" value={user._count.referrals} />
        <Stat label="Wallet" value={user.wallet ? formatKobo(user.wallet.balanceKobo) : '—'} hint={user.wallet?.status} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="font-display text-base font-bold">Profile</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-28 shrink-0 text-ink-muted">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card">
          <h2 className="font-display text-base font-bold">{user.merchantProfile ? 'Business' : 'Verification'}</h2>
          {user.merchantProfile ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex gap-3"><dt className="w-28 shrink-0 text-ink-muted">Business</dt><dd>{user.merchantProfile.businessName}</dd></div>
              <div className="flex gap-3"><dt className="w-28 shrink-0 text-ink-muted">KYB</dt><dd><StatusPill status={user.merchantProfile.kybStatus} /></dd></div>
              <div className="flex gap-3"><dt className="w-28 shrink-0 text-ink-muted">Bank</dt><dd>{[user.merchantProfile.bankName, user.merchantProfile.bankAccountName].filter(Boolean).join(' · ') || '—'}</dd></div>
              <div className="flex gap-3"><dt className="w-28 shrink-0 text-ink-muted">State</dt><dd>{user.merchantProfile.businessState ?? '—'}</dd></div>
            </dl>
          ) : user.kycVerifications.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">No KYC submitted.</p>
          ) : (
            <dl className="mt-3 space-y-2 text-sm">
              {user.kycVerifications.map((k) => (
                <div key={k.id} className="flex gap-3">
                  <dt className="w-28 shrink-0 text-ink-muted">{k.level.replace('_', ' ')}</dt>
                  <dd><StatusPill status={k.status} /> {k.rejectionReason && <span className="text-xs text-ink-muted">— {k.rejectionReason}</span>}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <SectionTitle>Events</SectionTitle>
      {user.events.length === 0 ? (
        <Empty>No events.</Empty>
      ) : (
        <Table min={560}>
          <Thead>
            <Th>Event</Th>
            <Th>Type</Th>
            <Th>Date</Th>
            <Th>Wishlists</Th>
            <Th>Status</Th>
          </Thead>
          <tbody>
            {user.events.map((e) => (
              <Tr key={e.id}>
                <Td><A href={`/events/${e.id}`}>{e.name}</A></Td>
                <Td muted>{e.type}</Td>
                <Td muted>{fmtDate(e.eventDate)}</Td>
                <Td>{e._count.wishlists}</Td>
                <Td><StatusPill status={e.status} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <SectionTitle>Recent transactions</SectionTitle>
      {user.transactions.length === 0 ? (
        <Empty>No transactions.</Empty>
      ) : (
        <Table min={640}>
          <Thead>
            <Th>Reference</Th>
            <Th>Type</Th>
            <Th>Amount</Th>
            <Th>Date</Th>
            <Th>Status</Th>
          </Thead>
          <tbody>
            {user.transactions.map((t) => (
              <Tr key={t.id}>
                <Td><span className="font-mono text-xs">{t.reference}</span></Td>
                <Td muted>{t.type.replace('_', ' ')}</Td>
                <Td>{formatKobo(t.amountKobo)}</Td>
                <Td muted>{fmtDateTime(t.createdAt)}</Td>
                <Td><StatusPill status={t.status} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
