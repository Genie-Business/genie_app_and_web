import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { GetTheApp } from '@/components/GetTheApp';

export const metadata: Metadata = {
  title: 'You’re invited to genie',
  description: 'A friend invited you to genie — the wishlist app for people who love giving.',
  robots: { index: false },
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const code = (ref ?? '').trim().slice(0, 32).toUpperCase();

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line">
        <div className="container-genie flex h-16 items-center">
          <Link href="/" aria-label="genie home">
            <Logo />
          </Link>
        </div>
      </header>
      <main className="container-genie py-14">
        <div className="mx-auto max-w-md text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">You’re invited</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-ink sm:text-4xl">
            A friend uses genie
          </h1>
          <p className="mt-3 text-ink-secondary">
            Create events, build wishlists from real products, and let friends gift exactly what you
            want.
          </p>
          {code && (
            <div className="mx-auto mt-6 inline-flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-4">
              <span className="text-xs uppercase tracking-wide text-ink-muted">Your invite code</span>
              <span className="mt-1 font-mono text-lg font-bold text-ink">{code}</span>
            </div>
          )}
          <div className="mt-8">
            <GetTheApp
              heading="Get genie"
              sub={
                code
                  ? `Enter code ${code} when you sign up so your friend gets credited.`
                  : 'Download the app to get started.'
              }
            />
          </div>
        </div>
      </main>
    </div>
  );
}
