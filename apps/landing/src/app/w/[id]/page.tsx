import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { GetTheApp } from '@/components/GetTheApp';
import { site } from '@/lib/site';
import { formatDate, formatKobo } from '@/lib/money';

export const revalidate = 60;

type WishlistItem = {
  id: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  unitPriceKobo: string;
  quantityWanted: number;
  quantityFulfilled: number;
  note: string | null;
};

type PublicWishlist = {
  wishlistId: string;
  wishlistName: string;
  eventName: string;
  eventType: string;
  eventDate: string;
  expiresAt: string;
  celebrantName: string;
  items: WishlistItem[];
};

async function fetchWishlist(id: string): Promise<PublicWishlist | null> {
  try {
    const res = await fetch(`${site.apiBaseUrl}/v1/public/wishlists/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: PublicWishlist };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const wl = await fetchWishlist(id);
  if (!wl) return { title: 'Wishlist', robots: { index: false } };
  const owner = wl.celebrantName ? `${wl.celebrantName}’s ` : '';
  const title = `${owner}${wl.wishlistName}`;
  const description = `${wl.eventName} · ${formatDate(wl.eventDate)}. See the wishlist and send a gift with genie.`;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title: `${title} · genie`, description, type: 'website' },
    twitter: { card: 'summary', title: `${title} · genie`, description },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line">
        <div className="container-genie flex h-16 items-center">
          <Link href="/" aria-label="genie home">
            <Logo />
          </Link>
        </div>
      </header>
      <main className="container-genie py-10 sm:py-14">{children}</main>
    </div>
  );
}

export default async function SharedWishlistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const wl = await fetchWishlist(id);

  if (!wl) {
    return (
      <Shell>
        <div className="mx-auto max-w-md text-center">
          <h1 className="font-display text-2xl font-bold text-ink">This wishlist isn’t available</h1>
          <p className="mt-3 text-ink-secondary">
            The link may be wrong, the event may have passed, or the list isn’t ready to share yet.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Go to genie
          </Link>
        </div>
      </Shell>
    );
  }

  const gifted = wl.items.filter((i) => i.quantityFulfilled >= i.quantityWanted).length;

  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {wl.eventType} · {formatDate(wl.eventDate)}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink sm:text-4xl">{wl.wishlistName}</h1>
        <p className="mt-2 text-ink-secondary">
          {wl.celebrantName ? `${wl.celebrantName}’s wishlist` : 'A wishlist'} for {wl.eventName}
          {wl.items.length > 0 && (
            <>
              {' '}· {wl.items.length} item{wl.items.length === 1 ? '' : 's'}
              {gifted > 0 && `, ${gifted} already gifted`}
            </>
          )}
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {wl.items.map((item) => {
            const done = item.quantityFulfilled >= item.quantityWanted;
            return (
              <li
                key={item.id}
                className="flex gap-4 rounded-2xl border border-line bg-surface p-4"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-subtle">
                  {item.productImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.productImageUrl}
                      alt={item.productName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink-muted">
                      🎁
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{item.productName}</p>
                  <p className="mt-0.5 text-sm text-ink-secondary">{formatKobo(item.unitPriceKobo)}</p>
                  {item.note && (
                    <p className="mt-1 line-clamp-2 text-xs text-ink-muted">“{item.note}”</p>
                  )}
                  <p className={`mt-2 text-xs font-semibold ${done ? 'text-ink-muted' : 'text-primary'}`}>
                    {done
                      ? 'Gifted'
                      : item.quantityWanted > 1
                        ? `Wants ${item.quantityWanted} · ${item.quantityFulfilled} gifted`
                        : 'Available'}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-10">
          <GetTheApp
            heading={
              wl.celebrantName
                ? `Send ${wl.celebrantName.split(' ')[0]} a gift`
                : 'Send a gift'
            }
            sub="Pick something from this list and pay in the genie app — openly, or as an anonymous gift revealed only when it arrives."
          />
        </div>
      </div>
    </Shell>
  );
}
