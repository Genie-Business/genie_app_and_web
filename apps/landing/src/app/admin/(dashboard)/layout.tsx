import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@genie/db';
import { destroySession, getSession } from '@/admin/lib/session';
import { NAV_GROUPS, ROLE_LABEL, can, type AdminRoleName } from '@/admin/lib/rbac';
import { NavLinks } from '@/admin/components/nav-links';
import { MobileNav } from '@/admin/components/mobile-nav';

async function signOut() {
  'use server';
  await destroySession();
  redirect('/login');
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  // Re-check the account on every page load so a deactivated admin (or a role
  // change) takes effect immediately rather than when the 12h cookie expires.
  const admin = await prisma.adminUser
    .findUnique({ where: { id: session.sub }, select: { name: true, isActive: true, role: true, mustChangePassword: true } })
    .catch(() => null);
  if (admin && !admin.isActive) {
    await destroySession();
    redirect('/login');
  }
  const role = admin?.role ?? session.role;

  const groups = NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => can(role, i.section)).map(({ label, href }) => ({ label, href })),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-[var(--genie-border)] bg-[var(--genie-bg-surface)] p-4 md:block">
        <Link href="/" className="block px-2 font-display text-lg font-bold text-[var(--genie-primary-solid)]">
          genie
        </Link>
        <div className="mt-6">
          <NavLinks groups={groups} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[var(--genie-border)] bg-[var(--genie-bg-surface)] px-4 md:px-6">
          <div className="flex items-center gap-3">
            <MobileNav groups={groups} />
            <span className="font-display text-base font-bold text-[var(--genie-primary-solid)] md:hidden">genie</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-ink-muted sm:inline">
              {admin?.name ?? session.email}
              <span className="ml-2 rounded-full bg-[var(--genie-primary-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--genie-primary-solid)]">
                {ROLE_LABEL[role as AdminRoleName] ?? role}
              </span>
            </span>
            <form action={signOut}>
              <button className="text-sm font-medium text-ink-secondary hover:text-ink">Sign out</button>
            </form>
          </div>
        </header>
        {admin?.mustChangePassword && (
          <div className="border-b border-amber-200 bg-[var(--genie-accent-soft)] px-6 py-2 text-sm text-amber-800">
            You&apos;re using a temporary password.{' '}
            <Link href="/settings" className="font-semibold underline">
              Set your own now
            </Link>
            .
          </div>
        )}
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
