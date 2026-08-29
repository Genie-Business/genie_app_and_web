import { prisma } from '@genie/db';

export const dynamic = 'force-dynamic';

async function counts() {
  const [users, merchants, events, wishlists, products, waitlist] = await Promise.all([
    prisma.user.count({ where: { role: 'CELEBRANT', status: 'ACTIVE' } }),
    prisma.user.count({ where: { role: 'MERCHANT', status: 'ACTIVE' } }),
    prisma.event.count(),
    prisma.wishlist.count(),
    prisma.product.count({ where: { status: 'ACTIVE' } }),
    prisma.waitlistSignup.count(),
  ]);
  return { users, merchants, events, wishlists, products, waitlist };
}

export default async function DashboardPage() {
  let c: Awaited<ReturnType<typeof counts>> | null = null;
  let error: string | null = null;
  try {
    c = await counts();
  } catch (e) {
    error = (e as Error).message;
  }

  const cards = c
    ? [
        ['Celebrants', c.users],
        ['Merchants', c.merchants],
        ['Events', c.events],
        ['Wishlists', c.wishlists],
        ['Active products', c.products],
        ['Waitlist signups', c.waitlist],
      ]
    : [];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Milestone 1 — overview counts. CRUD screens land in later milestones.
      </p>

      {error ? (
        <div className="card mt-6 text-sm text-error-fg">
          Could not load metrics: {error}. Check <code>DATABASE_URL</code> and run migrations.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(([label, value]) => (
            <div key={label} className="card">
              <div className="text-sm text-ink-muted">{label}</div>
              <div className="mt-1 font-display text-3xl font-bold">{value as number}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
