import { revalidatePath } from 'next/cache';
import { prisma, type Prisma } from '@genie/db';
import { audit } from '@/lib/audit';
import { canWrite, guard, guardWrite } from '@/lib/rbac';
import { PAGE_SIZE, fmtDateTime, one, pageArgs } from '@/lib/format';
import { BarChart } from '@/components/bar-chart';
import { Empty, FilterBar, Forbidden, PageHeader, Pager, Pill, Stat, Table, Td, Th, Thead, Tr, dangerBtn } from '@/components/ui';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;
const DAY = 86_400_000;

async function remove(id: string) {
  'use server';
  const session = await guardWrite('crm');
  if (!session) return;
  const row = await prisma.waitlistSignup.findUnique({ where: { id } });
  if (!row) return;
  await prisma.waitlistSignup.delete({ where: { id } });
  await audit(session, 'waitlist.delete', 'WaitlistSignup', id, { before: { email: row.email, source: row.source } });
  revalidatePath('/crm');
}

export default async function CrmPage({ searchParams }: { searchParams: SP }) {
  const session = await guard('crm');
  if (!session) return <Forbidden />;
  const writer = canWrite(session.role, 'crm');

  const sp = await searchParams;
  const q = one(sp.q);
  const source = one(sp.source);
  const { page, skip, take } = pageArgs(one(sp.page));

  const where: Prisma.WaitlistSignupWhereInput = {
    ...(source ? { source } : {}),
    ...(q ? { email: { contains: q, mode: 'insensitive' } } : {}),
  };

  const since = new Date(Date.now() - 14 * DAY);
  const [total, all, signups, bySource, recent] = await Promise.all([
    prisma.waitlistSignup.count({ where }),
    prisma.waitlistSignup.count(),
    prisma.waitlistSignup.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.waitlistSignup.groupBy({ by: ['source'], _count: true, orderBy: { _count: { source: 'desc' } } }),
    prisma.waitlistSignup.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true }, take: 5000 }),
  ]);

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setTime(start.getTime() - 13 * DAY);
  const series = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY);
    return { label: String(d.getDate()), full: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), value: 0 };
  });
  for (const r of recent) {
    const i = Math.floor((r.createdAt.getTime() - start.getTime()) / DAY);
    if (i >= 0 && i < 14) series[i]!.value += 1;
  }

  const exportHref = `/crm/export${source ? `?source=${encodeURIComponent(source)}` : ''}`;

  return (
    <div>
      <PageHeader
        title="Waitlist"
        subtitle="People who asked to be told when genie launches — from the website and landing pages."
        actions={
          <a href={exportHref} className="btn">
            Download CSV
          </a>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total signups" value={all.toLocaleString('en-NG')} />
        <Stat label="Last 14 days" value={series.reduce((n, d) => n + d.value, 0)} />
        <Stat label="Sources" value={bySource.length} hint={bySource[0] ? `Top: ${bySource[0].source ?? 'unknown'}` : undefined} />
      </div>

      <div className="card mt-3">
        <div className="font-display text-base font-bold">Signups per day</div>
        <div className="mt-3">
          <BarChart data={series} unit="signups" />
        </div>
      </div>

      {bySource.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {bySource.map((s) => (
            <a
              key={s.source ?? 'none'}
              href={`/crm?source=${encodeURIComponent(s.source ?? '')}`}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                source === (s.source ?? '') && source !== ''
                  ? 'border-[var(--genie-primary-solid)] bg-[var(--genie-primary-soft)] text-[var(--genie-primary-solid)]'
                  : 'border-[var(--genie-border-strong)] text-ink-secondary hover:bg-[var(--genie-bg-subtle)]'
              }`}
            >
              {s.source ?? 'unknown'} · {s._count}
            </a>
          ))}
          {source && (
            <a href="/crm" className="px-2 py-1 text-xs font-semibold text-ink-muted hover:text-ink">
              Clear filter
            </a>
          )}
        </div>
      )}

      <div className="mt-4">
        <FilterBar q={q} placeholder="Search email" hidden={source ? { source } : {}} />
        {signups.length === 0 ? (
          <Empty>No signups match.</Empty>
        ) : (
          <Table min={560}>
            <Thead>
              <Th>Email</Th>
              <Th>Source</Th>
              <Th>Signed up</Th>
              <Th right />
            </Thead>
            <tbody>
              {signups.map((s) => (
                <Tr key={s.id}>
                  <Td>{s.email}</Td>
                  <Td>{s.source ? <Pill>{s.source}</Pill> : <span className="text-ink-muted">—</span>}</Td>
                  <Td muted>{fmtDateTime(s.createdAt)}</Td>
                  <Td right>
                    {writer && (
                      <form action={remove.bind(null, s.id)}>
                        <button className={dangerBtn}>Delete</button>
                      </form>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager base="/crm" params={{ q, source }} page={page} total={total} pageSize={PAGE_SIZE} />
      </div>
    </div>
  );
}
