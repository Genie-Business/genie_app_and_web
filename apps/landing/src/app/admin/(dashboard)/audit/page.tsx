import { prisma, type Prisma } from '@genie/db';
import { guard } from '@/admin/lib/rbac';
import { PAGE_SIZE, fmtDateTime, one, pageArgs, titleCase } from '@/admin/lib/format';
import { Empty, FilterBar, Forbidden, PageHeader, Pager, Pill, Table, Td, Th, Thead, Tr } from '@/admin/components/ui';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AuditPage({ searchParams }: { searchParams: SP }) {
  const session = await guard('audit');
  if (!session) return <Forbidden />;

  const sp = await searchParams;
  const q = one(sp.q);
  const entity = one(sp.entity);
  const { page, skip, take } = pageArgs(one(sp.page));

  const where: Prisma.AuditLogWhereInput = {
    ...(entity ? { entityType: entity } : {}),
    ...(q ? { OR: [{ action: { contains: q, mode: 'insensitive' } }, { entityId: { contains: q } }] } : {}),
  };

  const [total, logs, entities] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.auditLog.groupBy({ by: ['entityType'], orderBy: { entityType: 'asc' } }),
  ]);

  const adminIds = [...new Set(logs.map((l) => l.adminId).filter((x): x is string => !!x))];
  const admins = adminIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true, email: true } })
    : [];
  const who = new Map(admins.map((a) => [a.id, a]));

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every change made from this portal: who did what, and when." />
      <FilterBar
        q={q}
        placeholder="Search action or record id"
        selects={[{ name: 'entity', value: entity, label: 'All records', options: entities.map((e) => [e.entityType, e.entityType] as [string, string]) }]}
      />
      {logs.length === 0 ? (
        <Empty>Nothing recorded yet.</Empty>
      ) : (
        <Table min={860}>
          <Thead>
            <Th>When</Th>
            <Th>Who</Th>
            <Th>Action</Th>
            <Th>Record</Th>
            <Th>Details</Th>
          </Thead>
          <tbody>
            {logs.map((l) => {
              const a = l.adminId ? who.get(l.adminId) : null;
              const hasDetail = l.before != null || l.after != null;
              return (
                <Tr key={l.id}>
                  <Td muted>{fmtDateTime(l.createdAt)}</Td>
                  <Td>
                    <div className="font-medium">{a?.name ?? (l.adminId ? 'Removed admin' : 'System')}</div>
                    {a && <div className="text-xs text-ink-muted">{a.email}</div>}
                    {l.ipAddress && <div className="text-xs text-ink-muted">{l.ipAddress}</div>}
                  </Td>
                  <Td>{titleCase(l.action.replace(/[._]/g, ' '))}</Td>
                  <Td>
                    <Pill>{l.entityType}</Pill>
                    {l.entityId && <div className="mt-1 font-mono text-xs text-ink-muted">{l.entityId}</div>}
                  </Td>
                  <Td>
                    {hasDetail ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer font-medium text-[var(--genie-primary-solid)]">View</summary>
                        <pre className="mt-2 max-w-md overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--genie-bg-subtle)] p-2 font-mono">
                          {JSON.stringify({ before: l.before, after: l.after }, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pager base="/audit" params={{ q, entity }} page={page} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
