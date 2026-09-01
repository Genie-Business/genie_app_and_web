/**
 * "Gifting happens in the app" call-to-action, shown on shared wishlist and
 * invite pages. Store links are placeholders until the app is published.
 */
export function GetTheApp({ heading, sub }: { heading: string; sub: string }) {
  return (
    <div className="rounded-3xl border border-line bg-primary-soft p-8 text-center sm:p-10">
      <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">{heading}</h2>
      <p className="mx-auto mt-3 max-w-md text-ink-secondary">{sub}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          href="#"
          aria-disabled
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          App Store
        </a>
        <a
          href="#"
          aria-disabled
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          Google Play
        </a>
      </div>
      <p className="mt-3 text-xs text-ink-muted">Launching soon — join the waitlist on the home page.</p>
    </div>
  );
}
