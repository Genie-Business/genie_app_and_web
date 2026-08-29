import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Hero, WaitlistBand } from '@/components/Hero';
import { Faq, Features, HowItWorks, MerchantCta } from '@/components/sections';
import { site } from '@/lib/site';

export default function HomePage() {
  return (
    <>
      <Hero />
      <main>
        <WaitlistBand />
        <HowItWorks />
        <Features />
        <MerchantCta />
        <Faq />
      </main>

      <footer className="border-t border-[var(--genie-border)] py-10">
        <div className="container-genie flex flex-col items-start justify-between gap-4 text-sm text-ink-muted sm:flex-row sm:items-center">
          <Logo />
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <a href={`mailto:${site.email}`} className="hover:text-ink">{site.email}</a>
          </div>
          <p>© {new Date().getFullYear()} GenieApps</p>
        </div>
      </footer>
    </>
  );
}
