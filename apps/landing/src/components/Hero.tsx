'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo } from './Logo';
import { WaitlistForm } from './WaitlistForm';

const NAV_ITEMS = [
  { label: 'Start', href: '#top' },
  { label: 'Story', href: '#how' },
  { label: 'Gifting', href: '#features' },
  { label: 'Merchants', href: '#merchants' },
  { label: 'FAQ', href: '#faq' },
];

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_091828_e240eb17-6edc-4129-ad9d-98678e3fd238.mp4';

export function Hero() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section id="top" className="relative h-screen overflow-hidden bg-neutral-50">
      {/* Video background */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden
      />
      {/* Legibility wash — keeps the dark heading + nav readable over any footage */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/85 via-white/50 to-white/25" />

      <div className="relative flex h-full flex-col">
        {/* Navigation */}
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-8 py-6">
          <a href="#top" aria-label="genie home">
            <Logo size="lg" />
          </a>

          <div className="hidden items-center gap-8 md:flex">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm font-medium text-ink transition-colors hover:text-neutral-600"
              >
                {item.label}
              </a>
            ))}
            <a
              href="#waitlist"
              className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Get early access
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="text-ink md:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </nav>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div className="mx-auto w-full max-w-7xl px-8 md:hidden">
            <div className="rounded-2xl bg-white/95 p-4 shadow-lg backdrop-blur">
              <div className="flex flex-col">
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-neutral-100"
                  >
                    {item.label}
                  </a>
                ))}
                <a
                  href="#waitlist"
                  onClick={() => setMenuOpen(false)}
                  className="mt-2 rounded-lg bg-brand-500 px-3 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Get early access
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Hero content */}
        <div className="flex flex-1 items-center justify-center">
          <div className="-mt-32 flex flex-col items-center px-6 text-center sm:-mt-52 md:-mt-80">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-500">
              The wishlist app
            </p>
            <h1 className="flex flex-col leading-none">
              <span className="text-6xl font-normal tracking-tighter text-neutral-500 md:text-7xl lg:text-8xl">
                Premium.
              </span>
              <span className="-mt-3 text-6xl font-normal tracking-tighter text-ink md:text-7xl lg:text-8xl">
                Accessible.
              </span>
            </h1>
            <p className="mb-6 mt-5 max-w-2xl text-lg text-neutral-600 md:text-xl">
              Create an event, build a wishlist, and let friends gift exactly what you want — with a
              little bit of magic.
            </p>
            <div className="flex items-center justify-center gap-4">
              <a
                href="#how"
                className="rounded-full bg-neutral-300 px-4 py-2 font-medium text-neutral-800 transition-colors hover:bg-neutral-400"
              >
                Discover
              </a>
              <a
                href="#waitlist"
                className="rounded-full bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary-hover"
              >
                Get early access
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Waitlist capture — anchored below the hero so the CTAs can jump to it. */
export function WaitlistBand() {
  return (
    <section
      id="waitlist"
      className="border-b border-[var(--genie-border)] bg-[var(--genie-bg-subtle)] py-16"
    >
      <div className="container-genie max-w-xl text-center">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">Join the waitlist</h2>
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
