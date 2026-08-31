import { Reveal } from './Reveal';
import { WaitlistForm } from './WaitlistForm';
import { faqs } from '@/lib/site';

const STEPS = [
  {
    who: 'Celebrants',
    title: 'Make a wishlist worth sharing',
    body: 'Create an event — a birthday, a wedding, a baby shower — and fill a wishlist with things you actually want from genie merchants.',
  },
  {
    who: 'Gifters',
    title: 'Give the perfect gift in seconds',
    body: "Browse a friend's wishlist, pick something in your budget, and pay. Send it with your name on it, or keep it a secret until it arrives.",
  },
  {
    who: 'Merchants',
    title: 'Sell to people who came to buy',
    body: 'List your products and services, manage stock and orders, and get settled to your bank account after every delivery.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-[var(--genie-border)] bg-[var(--genie-bg-subtle)] py-20">
      <div className="container-genie">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">How genie works</h2>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.who} delay={i * 0.08}>
              <div className="h-full rounded-2xl border border-[var(--genie-border)] bg-[var(--genie-bg-surface)] p-6">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--genie-primary-solid)]">
                  {s.who}
                </span>
                <h3 className="mt-2 font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-secondary">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  ['Event wishlists', 'Group your gifts under the occasion they belong to, with a due date.'],
  ['Anonymous gifts', 'Add a secret gift to a friend’s list — revealed only when it reaches them.'],
  ['Real products', 'Everything on a wishlist is a real item from a genie merchant, ready to ship.'],
  ['Secure payments', 'Pay by transfer or wallet in Naira. Merchants settled automatically.'],
  ['Friends & sharing', 'Import contacts and share wishlists straight to chat and social.'],
  ['Order tracking', 'Follow every gift from payment to delivery, for givers and merchants alike.'],
];

export function Features() {
  return (
    <section id="features" className="py-20">
      <div className="container-genie">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Everything a gift needs
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, body], i) => (
            <Reveal key={title} delay={i * 0.05}>
              <div className="rounded-2xl border border-[var(--genie-border)] p-5">
                <h3 className="font-display text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-secondary">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MerchantCta() {
  return (
    <section id="merchants" className="scroll-mt-20 py-20">
      <div className="container-genie">
        <div className="relative overflow-hidden rounded-3xl px-8 py-12 text-white sm:px-12">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src="/merchants.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            aria-hidden
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(120deg, rgba(109,40,217,0.92), rgba(90,32,176,0.88))',
            }}
          />
          <Reveal className="relative">
            <h2 className="max-w-xl font-display text-2xl font-bold sm:text-3xl">
              Sell on genie
            </h2>
            <p className="mt-3 max-w-lg text-white/90">
              Put your catalogue in front of people who are here to buy gifts — not to browse. Manage
              orders and inventory in the app, and get paid to your bank account.
            </p>
            <div className="mt-6 max-w-md">
              <WaitlistForm compact />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" className="border-t border-[var(--genie-border)] py-20">
      <div className="container-genie max-w-3xl">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Questions</h2>
        </Reveal>
        <dl className="mt-8 divide-y divide-[var(--genie-border)]">
          {faqs.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="font-display text-base font-semibold">{f.q}</dt>
              <dd className="mt-1.5 text-sm text-ink-secondary">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
