import { prisma } from '@genie/db';
import { ADMIN_ROLES, ROLE_LABEL, canWrite, guard, type AdminRoleName } from '@/admin/lib/rbac';
import { fmtDate, fmtDateTime } from '@/admin/lib/format';
import { Forbidden, PageHeader, Pill, SectionTitle, Table, Td, Th, Thead, Tr, dangerBtn, ghostBtn } from '@/admin/components/ui';
import { setAdminActive, setAdminRole } from './actions';
import { CreateAdminForm, ResetPasswordForm } from './credential-forms';

export const dynamic = 'force-dynamic';

const ROLE_HELP: Record<AdminRoleName, string> = {
  SUPER_ADMIN: 'Everything, including managing admins.',
  ADMIN: 'Everything except managing admins & super admins.',
  SUPPORT: 'Users, KYC, support inbox, events, products (read-only catalogue).',
  FINANCE: 'Orders, transactions, payouts, fees, referrals.',
  CONCIERGE: 'The concierge desk: price, source and fulfil imported gifts.',
};

function manageable(actor: string, target: string): boolean {
  if (actor === 'SUPER_ADMIN') return true;
  return actor === 'ADMIN' && ['SUPPORT', 'FINANCE', 'CONCIERGE'].includes(target);
}

export default async function TeamPage() {
  const session = await guard('team');
  if (!session) return <Forbidden />;
  const writer = canWrite(session.role, 'team');

  const admins = await prisma.adminUser.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] });
  const creatable = ADMIN_ROLES.filter((r) => manageable(session.role, r)).map((r) => [r, ROLE_LABEL[r]] as [string, string]);

  return (
    <div>
      <PageHeader title="Team" subtitle="Who can sign in to this admin portal, and what they can do." />

      {writer && creatable.length > 0 && (
        <div className="card">
          <h2 className="font-display text-base font-bold">Add someone</h2>
          <p className="mt-1 text-sm text-ink-muted">We create the account and show you a temporary password once. They must change it on first sign-in.</p>
          <div className="mt-4">
            <CreateAdminForm roles={creatable} />
          </div>
        </div>
      )}

      <SectionTitle>Admins ({admins.length})</SectionTitle>
      <Table min={900}>
        <Thead>
          <Th>Name</Th>
          <Th>Role</Th>
          <Th>Last sign-in</Th>
          <Th>Added</Th>
          <Th>Status</Th>
          <Th right />
        </Thead>
        <tbody>
          {admins.map((a) => {
            const self = a.id === session.sub;
            const canEdit = writer && !self && manageable(session.role, a.role);
            return (
              <Tr key={a.id}>
                <Td>
                  <div className="font-medium">
                    {a.name} {self && <span className="text-xs font-normal text-ink-muted">(you)</span>}
                  </div>
                  <div className="text-xs text-ink-muted">{a.email}</div>
                </Td>
                <Td>
                  {canEdit ? (
                    <form action={setAdminRole.bind(null, a.id)} className="flex items-center gap-2">
                      <select name="role" defaultValue={a.role} className="input w-auto py-1.5 text-xs" aria-label={`Role for ${a.name}`}>
                        {ADMIN_ROLES.filter((r) => manageable(session.role, r) || r === a.role).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <button className={ghostBtn}>Save</button>
                    </form>
                  ) : (
                    <div title={ROLE_HELP[a.role as AdminRoleName]}>
                      <Pill tone="info">{ROLE_LABEL[a.role as AdminRoleName]}</Pill>
                    </div>
                  )}
                </Td>
                <Td muted>{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : 'Never'}</Td>
                <Td muted>{fmtDate(a.createdAt)}</Td>
                <Td>
                  {a.isActive ? <Pill tone="good">Active</Pill> : <Pill tone="neutral">Deactivated</Pill>}
                  {a.mustChangePassword && a.isActive && <div className="mt-1 text-xs text-amber-700">Temporary password</div>}
                </Td>
                <Td right>
                  {canEdit && (
                    <div className="flex flex-col items-end gap-2">
                      <ResetPasswordForm id={a.id} />
                      {a.isActive ? (
                        <form action={setAdminActive.bind(null, a.id, false)}>
                          <button className={dangerBtn}>Deactivate</button>
                        </form>
                      ) : (
                        <form action={setAdminActive.bind(null, a.id, true)}>
                          <button className={ghostBtn}>Reactivate</button>
                        </form>
                      )}
                    </div>
                  )}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>

      <SectionTitle>What each role can do</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_ROLES.map((r) => (
          <div key={r} className="card">
            <div className="font-semibold">{ROLE_LABEL[r]}</div>
            <p className="mt-1 text-sm text-ink-muted">{ROLE_HELP[r]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
