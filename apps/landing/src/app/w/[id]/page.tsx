import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { GetTheApp } from '@/components/GetTheApp';
import { OpenInApp } from '@/components/OpenInApp';
import { WishlistCheckout } from '@/components/WishlistCheckout';
import { site } from '@/lib/site';
import { formatDate } from '@/lib/money';

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

function Shell({ deepLinkPath, children }: { deepLinkPath?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      {deepLinkPath && <OpenInApp path={deepLinkPath} />}
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
  const firstName = wl.celebrantName ? (wl.celebrantName.split(' ')[0] ?? '') : '';

  return (
    <Shell deepLinkPath={`w/${id}`}>
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

        <WishlistCheckout
          wishlistId={wl.wishlistId}
          celebrantFirstName={firstName}
          items={wl.items}
        />

        <div className="mt-12">
          <GetTheApp
            heading="Prefer the app?"
            sub="Get genie to send anonymous gifts, track deliveries, and build your own wishlist."
          />
        </div>
      </div>
    </Shell>
  );
}
