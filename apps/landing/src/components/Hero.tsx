'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo } from './Logo';
import { WaitlistForm } from './WaitlistForm';
import { PhoneMock } from './PhoneMock';

const NAV = [
  { label: 'How it works', href: '#how' },
  { label: 'Anonymous gifts', href: '#anonymous' },
  { label: 'For merchants', href: '#merchants' },
  { label: 'FAQ', href: '/faq' },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/80 backdrop-blur">
      <nav className="container-genie flex h-16 items-center justify-between">
        <a href="#top" aria-label="genie home">
          <Logo />
        </a>
        <div className="hidden items-center gap-8 md:flex">
          {NAV.map((i) => (
            <a key={i.href} href={i.href} className="text-sm font-medium text-ink-secondary transition-colors hover:text-ink">
              {i.label}
            </a>
          ))}
          <a href="#waitlist" className="btn-primary !px-4 !py-2">
            Get early access
          </a>
        </div>
        <button
          type="button"
          className="text-ink md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>
      {open && (
        <div className="border-t border-line bg-canvas px-5 py-3 md:hidden">
          <div className="flex flex-col">
            {NAV.map((i) => (
              <a
                key={i.href}
                href={i.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 text-sm font-medium text-ink-secondary hover:bg-subtle"
              >
                {i.label}
              </a>
            ))}
            <a href="#waitlist" onClick={() => setOpen(false)} className="btn-primary mt-2">
              Get early access
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* soft brand wash */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-32 top-24 h-[28rem] w-[28rem] rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="container-genie grid items-center gap-14 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Coming soon to iOS &amp; Android
          </p>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            Gifts they{' '}
            <span className="relative whitespace-nowrap text-primary">
              actually want
              <svg
                aria-hidden
                viewBox="0 0 300 12"
                className="absolute -bottom-1 left-0 w-full text-primary/40"
                preserveAspectRatio="none"
              >
                <path d="M2 9C60 3 120 3 180 6s90 3 118-1" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-ink-secondary">
            Build a wishlist of real products for your birthday, wedding or baby shower. Share one
            link. Friends send exactly what you asked for — openly, or as a surprise revealed only
            when it lands at your door.
          </p>

          <div className="mt-7 max-w-md" id="waitlist-hero">
            <WaitlistForm />
          </div>
          <p className="mt-3 text-xs text-ink-muted">Free to use. No spam — one email when we launch.</p>
        </div>

        <div className="relative">
          <PhoneMock screen="wishlist" className="md:ml-auto md:scale-110" />
        </div>
      </div>
    </section>
  );
}

/** The anchor the CTAs jump to. */
export function WaitlistBand() {
  return (
    <section id="waitlist" className="border-y border-line bg-subtle py-16">
      <div className="container-genie max-w-xl text-center">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">Be first to gift smarter</h2>
        <p className="mt-2 text-sm text-ink-secondary">
          We&apos;ll email you the moment genie is on the App Store and Play Store.
        </p>
        <div className="mt-6 text-left">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
