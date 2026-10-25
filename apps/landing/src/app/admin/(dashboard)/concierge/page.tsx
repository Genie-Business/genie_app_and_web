import Link from 'next/link';
import { prisma } from '@genie/db';
import { guard } from '@/admin/lib/rbac';
import { Forbidden } from '@/admin/components/ui';

export const dynamic = 'force-dynamic';

function formatKobo(kobo: bigint | null): string {
  if (kobo == null) return '—';
  const naira = Number(kobo) / 100;
  return `₦${naira.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
}

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-[var(--genie-accent-soft)] text-[var(--genie-accent-solid)]',
  IN_REVIEW: 'bg-[var(--genie-accent-soft)] text-[var(--genie-accent-solid)]',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-[var(--genie-bg-subtle)] text-ink-muted',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[status] ?? ''}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

export default async function ConciergePage() {
  const session = await guard('concierge');
  if (!session) return <Forbidden />;

  const requests = await prisma.conciergeRequest.findMany({
    orderBy: { createdAt: 'desc' },
    include: { requestedBy: { select: { firstName: true, lastName: true, email: true } } },
    take: 100,
  });
  const needsReview = requests.filter((r) => r.status === 'NEW' || r.status === 'IN_REVIEW');
  const rest = requests.filter((r) => r.status !== 'NEW' && r.status !== 'IN_REVIEW');

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Concierge</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Imported-gift requests from celebrants who couldn&apos;t find the item in the catalogue.
          </p>
        </div>
        <Link href="/concierge/orders" className="btn">
          Orders to fulfil
        </Link>
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        Needs review ({needsReview.length})
      </h2>
      <RequestTable rows={needsReview} empty="Nothing waiting. New imports will show up here." />

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        History
      </h2>
      <RequestTable rows={rest} empty="No reviewed requests yet." />
    </div>
  );
}

function RequestTable({
  rows,
  empty,
}: {
  rows: Array<{
    id: string;
    name: string;
    sourceUrl: string;
    estimatedPriceKobo: bigint | null;
    status: string;
    createdAt: Date;
    requestedBy: { firstName: string; lastName: string; email: string };
  }>;
  empty: string;
}) {
  if (rows.length === 0) return <div className="card mt-3 text-sm text-ink-muted">{empty}</div>;
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--genie-border)] bg-[var(--genie-bg-surface)]">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-[var(--genie-border)] text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-4 py-3">Requested by</th>
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">Estimate</th>
            <th className="px-4 py-3">Submitted</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[var(--genie-border)] last:border-0">
              <td className="px-4 py-3">
                <div className="font-medium">{r.requestedBy.firstName} {r.requestedBy.lastName}</div>
                <div className="text-xs text-ink-muted">{r.requestedBy.email}</div>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium">{r.name}</div>
                <a
                  href={r.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--genie-primary-solid)] hover:underline"
                >
                  {r.sourceUrl}
                </a>
              </td>
              <td className="px-4 py-3">{formatKobo(r.estimatedPriceKobo)}</td>
              <td className="px-4 py-3 text-ink-muted">{r.createdAt.toLocaleDateString('en-GB')}</td>
              <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
              <td className="px-4 py-3 text-right">
                <Link href={`/concierge/${r.id}`} className="text-sm font-medium text-[var(--genie-primary-solid)] hover:underline">
                  Review
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
