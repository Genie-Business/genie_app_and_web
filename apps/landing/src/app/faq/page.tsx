import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { faqs, site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'FAQ',
  description: `Questions about ${site.name} — wishlists, anonymous gifts, guest checkout, payments in Naira, selling, and when it launches.`,
  alternates: { canonical: '/faq' },
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <header className="border-b border-line">
        <div className="container-genie flex h-16 items-center justify-between">
          <Link href="/" aria-label="genie home">
            <Logo />
          </Link>
          <Link href="/#waitlist" className="btn-primary !px-4 !py-2">
            Get early access
          </Link>
        </div>
      </header>

      <main className="container-genie max-w-3xl py-14 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Help</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Questions, answered
        </h1>
        <p className="mt-3 text-ink-secondary">
          Still stuck? Email{' '}
          <a href={`mailto:${site.email}`} className="font-medium text-primary hover:underline">
            {site.email}
          </a>
          .
        </p>

        <dl className="mt-10 divide-y divide-line">
          {faqs.map((f) => (
            <div key={f.q} className="py-6">
              <dt className="font-display text-base font-semibold sm:text-lg">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-secondary sm:text-base">{f.a}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-12 rounded-3xl border border-line bg-primary-soft p-8 text-center">
          <h2 className="font-display text-xl font-bold text-ink">Ready when it launches?</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-secondary">
            Join the waitlist and we&apos;ll email you the moment genie is on the App Store and Play
            Store.
          </p>
          <Link href="/#waitlist" className="btn-primary mt-5">
            Join the waitlist
          </Link>
        </div>
      </main>

      <footer className="border-t border-line py-10">
        <div className="container-genie flex flex-col items-start justify-between gap-4 text-sm text-ink-muted sm:flex-row sm:items-center">
          <Logo />
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/" className="hover:text-ink">Home</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </div>
          <p>© {new Date().getFullYear()} GenieApps</p>
        </div>
      </footer>
    </div>
  );
}
