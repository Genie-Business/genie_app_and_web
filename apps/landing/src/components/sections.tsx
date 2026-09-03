import { Reveal } from './Reveal';
import { WaitlistForm } from './WaitlistForm';
import { PhoneMock } from './PhoneMock';
import { faqs } from '@/lib/site';

// ── How it works ──────────────────────────────────────────────────────
const STEPS = [
  {
    n: '01',
    title: 'Create your wishlist',
    body: 'Pick an occasion and fill it with real products and services from genie merchants — priced in Naira, ready to ship.',
  },
  {
    n: '02',
    title: 'Share one link',
    body: 'Send your wishlist to WhatsApp, Instagram, the family group — anywhere. Friends open it in the app or their browser.',
  },
  {
    n: '03',
    title: 'Get exactly what you asked for',
    body: 'Friends pay and the gift is delivered to your door. Track every one from “paid” to “arrived”.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="py-20 sm:py-28">
      <div className="container-genie">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">How it works</p>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
            From “what do you want?” to “it&apos;s here” — in three steps.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <div className="h-full rounded-3xl border border-line bg-surface p-6">
                <span className="font-display text-2xl font-bold text-primary/30">{s.n}</span>
                <h3 className="mt-3 font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Anonymous gift spotlight ──────────────────────────────────────────
export function AnonymousGift() {
  return (
    <section id="anonymous" className="border-y border-line bg-subtle py-20 sm:py-28">
      <div className="container-genie grid items-center gap-14 md:grid-cols-2">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">The genie touch</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Send a gift with no name on it.
          </h2>
          <p className="mt-4 max-w-lg text-ink-secondary">
            Choose “anonymous” at checkout and your friend just sees that a secret gift is on the
            way. When it physically arrives, genie reveals who it was from — and the message you
            left. It&apos;s the surprise that a bank transfer can never be.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              'Sender hidden until the gift is in their hands',
              'A private message, revealed at the same moment',
              'Works for one item or a whole wishlist',
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] text-white">
                  ✓
                </span>
                <span className="text-ink-secondary">{t}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <PhoneMock screen="reveal" className="mx-auto" />
        </Reveal>
      </div>
    </section>
  );
}

// ── Feature grid ──────────────────────────────────────────────────────
const FEATURES = [
  ['🎯', 'Real products only', 'Every item is a genuine listing from a genie merchant — nothing on your list is a dead link.'],
  ['🔗', 'One link, any app', 'Share to WhatsApp, IG or a browser. Friends don’t need an account to gift you.'],
  ['🙈', 'Anonymous gifts', 'Send without your name — revealed only when it reaches them.'],
  ['💳', 'Naira payments', 'Pay by bank transfer or genie wallet. Merchants settled automatically after delivery.'],
  ['📦', 'Delivery tracking', 'Follow every gift from paid to dispatched to delivered, for givers and receivers.'],
  ['👫', 'Group gifting', 'Friends chip in on the big-ticket item together, one wishlist at a time.'],
];

export function Features() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="container-genie">
        <Reveal>
          <h2 className="max-w-xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Everything a gift needs, nothing it doesn&apos;t.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([icon, title, body], i) => (
            <Reveal key={title} delay={i * 0.05}>
              <div className="h-full rounded-2xl border border-line bg-surface p-6">
                <span className="text-2xl">{icon}</span>
                <h3 className="mt-3 font-display text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Merchant CTA ──────────────────────────────────────────────────────
export function MerchantCta() {
  return (
    <section id="merchants" className="scroll-mt-20 py-20 sm:py-28">
      <div className="container-genie">
        <div className="relative overflow-hidden rounded-[2rem] px-8 py-14 text-white sm:px-14">
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
            style={{ background: 'linear-gradient(120deg, rgba(109,40,217,0.94), rgba(90,32,176,0.9))' }}
          />
          <Reveal className="relative max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-white/70">For merchants</p>
            <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
              Sell to people who came to buy a gift.
            </h2>
            <p className="mt-3 text-white/90">
              List your products and services, manage stock and orders from your phone, and get paid
              to your bank account after every delivery. No storefront to build.
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

// ── FAQ ───────────────────────────────────────────────────────────────
export function Faq() {
  return (
    <section id="faq" className="border-t border-line py-20 sm:py-28">
      <div className="container-genie max-w-3xl">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Questions, answered</h2>
        </Reveal>
        <dl className="mt-10 divide-y divide-line">
          {faqs.map((f) => (
            <div key={f.q} className="py-6">
              <dt className="font-display text-base font-semibold">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-secondary">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
