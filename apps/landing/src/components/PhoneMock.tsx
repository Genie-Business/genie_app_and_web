/**
 * A lightweight CSS phone frame rendering a stylised genie app screen. No
 * screenshots — the UI is rebuilt in markup so it stays crisp and on-brand in
 * light and dark.
 */
export function PhoneMock({
  screen = 'wishlist',
  className = '',
}: {
  screen?: 'wishlist' | 'reveal' | 'gifting';
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute -inset-8 -z-10 rounded-full bg-primary/25 blur-3xl" aria-hidden />
      <div className="mx-auto w-[264px] rounded-[2.6rem] border border-line bg-ink/90 p-2.5 shadow-2xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-canvas">
          <div className="absolute left-1/2 top-2 z-10 h-4 w-24 -translate-x-1/2 rounded-full bg-ink/80" aria-hidden />
          <div className="h-[512px] overflow-hidden px-4 pb-4 pt-9">
            {screen === 'wishlist' && <WishlistScreen />}
            {screen === 'reveal' && <RevealScreen />}
            {screen === 'gifting' && <GiftingScreen />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <div className="flex items-center gap-1.5">
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ color: 'var(--genie-primary-solid)' }}>
        <path d="M2.9 17.3q-0.5-4.8 5.3-5.8h7.6q5.8 1 5.3 5.8q0 3.4-9.1 3.4T2.9 17.3Z" fill="currentColor" />
        <path d="M3.4 14.4 0 15.4l3.4 1.4Z" fill="currentColor" />
        <path d="M12 11q-4.8-2.4 0-7.2-2.4-1.2 0.5-2.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="font-display text-sm font-bold text-primary">genie</span>
    </div>
  );
}

function Product({ name, price, gifted = false }: { name: string; price: string; gifted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface p-2.5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-subtle text-base">🎁</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-ink">{name}</p>
        <p className="text-[10px] text-ink-secondary">{price}</p>
      </div>
      {gifted ? (
        <span className="text-[10px] font-semibold text-ink-muted">Gifted 🎉</span>
      ) : (
        <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-semibold text-white">Gift</span>
      )}
    </div>
  );
}

function WishlistScreen() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <Wordmark />
        <span className="text-sm">🔔</span>
      </div>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-primary">Birthday · in 12 days</p>
      <h3 className="font-display text-lg font-bold leading-tight text-ink">Ada&apos;s 30th 🎂</h3>
      <p className="mt-0.5 text-[10px] text-ink-secondary">Main wishlist · 6 items · 2 gifted</p>
      <div className="mt-3 space-y-2">
        <Product name="Wireless Earbuds Pro" price="₦42,000" />
        <Product name="Adire Silk Scarf" price="₦18,500" />
        <Product name="Celebration Cake (8″)" price="₦28,000" gifted />
        <Product name="Shea & Cocoa Gift Box" price="₦15,000" />
        <Product name="genie Gift Card" price="₦10,000" gifted />
      </div>
      <div className="mt-auto rounded-2xl bg-primary p-2.5 text-center">
        <p className="text-[10px] font-semibold text-white">Share this wishlist</p>
      </div>
    </div>
  );
}

function RevealScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="text-5xl">🎁</div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-primary">A secret gift arrived</p>
      <h3 className="mt-1 font-display text-xl font-bold text-ink">It was from Kemi!</h3>
      <p className="mt-2 max-w-[180px] text-[11px] leading-relaxed text-ink-secondary">
        &ldquo;Happy birthday Ada — hope this makes the year sweeter 💜&rdquo;
      </p>
      <div className="mt-5 w-full rounded-2xl border border-line bg-surface p-3 text-left">
        <p className="text-[11px] font-semibold text-ink">Shea &amp; Cocoa Gift Box</p>
        <p className="mt-0.5 text-[10px] text-ink-secondary">Delivered · 24 Sept</p>
      </div>
    </div>
  );
}

function GiftingScreen() {
  return (
    <div className="flex h-full flex-col">
      <Wordmark />
      <h3 className="mt-4 font-display text-base font-bold text-ink">Send Ada a gift</h3>
      <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-line bg-surface p-2.5">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-subtle text-base">🎧</div>
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-ink">Wireless Earbuds Pro</p>
          <p className="text-[10px] text-ink-secondary">₦42,000</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 rounded-2xl bg-subtle p-3 text-[10px]">
        <Row l="Item" r="₦42,000" />
        <Row l="Delivery" r="₦1,500" />
        <div className="my-1 h-px bg-line" />
        <Row l="You pay" r="₦44,130" bold />
      </div>
      <label className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-surface p-2.5 text-[10px] text-ink">
        Send anonymously
        <span className="h-4 w-7 rounded-full bg-primary p-0.5">
          <span className="block h-3 w-3 translate-x-3 rounded-full bg-white" />
        </span>
      </label>
      <div className="mt-auto rounded-2xl bg-primary p-2.5 text-center">
        <p className="text-[10px] font-semibold text-white">Pay ₦44,130 from wallet</p>
      </div>
    </div>
  );
}

function Row({ l, r, bold = false }: { l: string; r: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold text-ink' : 'text-ink-secondary'}`}>
      <span>{l}</span>
      <span>{r}</span>
    </div>
  );
}
