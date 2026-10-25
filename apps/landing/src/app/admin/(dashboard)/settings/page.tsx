import { redirect } from 'next/navigation';
import { checkPassword, hashPassword, verifyPassword } from '@genie/core';
import { prisma } from '@genie/db';
import { audit } from '@/admin/lib/audit';
import { can, guard, ROLE_LABEL, type AdminRoleName } from '@/admin/lib/rbac';
import { fmtDateTime } from '@/admin/lib/format';
import { Field, Forbidden, Notice, PageHeader, SectionTitle, Table, Td, Th, Thead, Tr } from '@/admin/components/ui';

export const dynamic = 'force-dynamic';

async function changePassword(formData: FormData) {
  'use server';
  const session = await guard('settings');
  if (!session) return;

  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  const admin = await prisma.adminUser.findUnique({ where: { id: session.sub } });
  if (!admin) redirect('/login');
  if (!(await verifyPassword(current, admin.passwordHash))) redirect('/settings?pw=wrong');
  if (next !== confirm) redirect('/settings?pw=mismatch');
  const check = checkPassword(next);
  if (!check.valid) redirect(`/settings?pw=weak&why=${encodeURIComponent(check.errors[0] ?? '')}`);
  if (current === next) redirect('/settings?pw=same');

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  await audit(session, 'admin.password_change', 'AdminUser', admin.id);
  redirect('/settings?pw=ok');
}

const MESSAGES: Record<string, [tone: 'good' | 'bad', text: string]> = {
  ok: ['good', 'Password updated.'],
  wrong: ['bad', 'Your current password is incorrect.'],
  mismatch: ['bad', 'The new passwords don’t match.'],
  same: ['bad', 'Choose a password you haven’t been using.'],
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await guard('settings');
  if (!session) return <Forbidden />;
  const sp = await searchParams;

  const [admin, settings] = await Promise.all([
    prisma.adminUser.findUnique({ where: { id: session.sub } }),
    can(session.role, 'audit') ? prisma.appSetting.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] }) : Promise.resolve([]),
  ]);
  const flash = sp.pw === 'weak' ? (['bad', sp.why ?? 'That password is too weak.'] as const) : sp.pw ? MESSAGES[sp.pw] : undefined;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Your account." />

      <div className="card">
        <h2 className="font-display text-base font-bold">Your account</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex gap-3"><dt className="w-28 shrink-0 text-ink-muted">Name</dt><dd>{admin?.name ?? '—'}</dd></div>
          <div className="flex gap-3"><dt className="w-28 shrink-0 text-ink-muted">Email</dt><dd>{session.email}</dd></div>
          <div className="flex gap-3"><dt className="w-28 shrink-0 text-ink-muted">Role</dt><dd>{ROLE_LABEL[session.role as AdminRoleName] ?? session.role}</dd></div>
          <div className="flex gap-3"><dt className="w-28 shrink-0 text-ink-muted">Last sign-in</dt><dd>{admin?.lastLoginAt ? fmtDateTime(admin.lastLoginAt) : '—'}</dd></div>
        </dl>
      </div>

      <SectionTitle>Change password</SectionTitle>
      {flash && <Notice tone={flash[0]}>{flash[1]}</Notice>}
      {admin?.mustChangePassword && !flash && <Notice>You&apos;re on a temporary password. Set your own below.</Notice>}
      <form action={changePassword} className="card space-y-4">
        <Field label="Current password">
          <input name="current" type="password" autoComplete="current-password" required className="input" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" hint="8+ characters with upper & lower case, a number and a symbol.">
            <input name="next" type="password" autoComplete="new-password" required minLength={8} className="input" />
          </Field>
          <Field label="Confirm new password">
            <input name="confirm" type="password" autoComplete="new-password" required minLength={8} className="input" />
          </Field>
        </div>
        <button className="btn">Update password</button>
      </form>

      {can(session.role, 'audit') && (
        <>
          <SectionTitle>Platform settings</SectionTitle>
          {settings.length === 0 ? (
            <div className="card text-sm text-ink-muted">No platform settings are stored yet. Fees live under Fees.</div>
          ) : (
            <Table min={520}>
              <Thead>
                <Th>Key</Th>
                <Th>Value</Th>
                <Th>Updated</Th>
              </Thead>
              <tbody>
                {settings.map((s) => (
                  <Tr key={s.id}>
                    <Td><span className="font-mono text-xs">{s.key}</span></Td>
                    <Td><span className="font-mono text-xs">{JSON.stringify(s.value)}</span></Td>
                    <Td muted>{fmtDateTime(s.updatedAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
