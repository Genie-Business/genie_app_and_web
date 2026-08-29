import Link from 'next/link';
import { redirect } from 'next/navigation';
import { destroySession, getSession } from '@/lib/session';

const NAV: ReadonlyArray<readonly [label: string, href: string]> = [
  ['Dashboard', '/'],
  ['Users', '/users'],
  ['Merchants', '/merchants'],
  ['Events & Wishlists', '/events'],
  ['Products', '/products'],
  ['Transactions', '/transactions'],
  ['Fees', '/fees'],
  ['Referrals', '/referrals'],
  ['KYC', '/kyc'],
  ['Landing CRM', '/crm'],
  ['Settings', '/settings'],
];

async function signOut() {
  'use server';
  await destroySession();
  redirect('/login');
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-[var(--genie-border)] bg-[var(--genie-bg-surface)] p-4 md:block">
        <div className="px-2 font-display text-lg font-bold text-[var(--genie-primary-solid)]">genie</div>
        <nav className="mt-6 space-y-1 text-sm">
          {NAV.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="block rounded-lg px-3 py-2 text-ink-secondary hover:bg-[var(--genie-bg-subtle)] hover:text-ink"
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex h-14 items-center justify-between border-b border-[var(--genie-border)] bg-[var(--genie-bg-surface)] px-6">
          <span className="text-sm text-ink-muted">{session.email}</span>
          <form action={signOut}>
            <button className="text-sm font-medium text-ink-secondary hover:text-ink">Sign out</button>
          </form>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
