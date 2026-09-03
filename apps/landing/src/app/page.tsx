import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Hero, SiteNav, WaitlistBand } from '@/components/Hero';
import { AnonymousGift, Faq, Features, HowItWorks, MerchantCta } from '@/components/sections';
import { site } from '@/lib/site';

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <Hero />
      <main>
        <HowItWorks />
        <AnonymousGift />
        <Features />
        <MerchantCta />
        <Faq />
        <WaitlistBand />
      </main>

      <footer className="border-t border-line py-12">
        <div className="container-genie flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-ink-muted">{site.tagline} Built in Lagos.</p>
          </div>
          <div className="flex flex-col gap-3 text-sm text-ink-muted">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/privacy" className="hover:text-ink">Privacy</Link>
              <Link href="/terms" className="hover:text-ink">Terms</Link>
              <a href={`mailto:${site.email}`} className="hover:text-ink">{site.email}</a>
            </div>
            <div className="flex gap-4">
              <a href={site.social.instagram} className="hover:text-ink">Instagram</a>
              <a href={site.social.x} className="hover:text-ink">X</a>
              <a href={site.social.tiktok} className="hover:text-ink">TikTok</a>
            </div>
            <p>© {new Date().getFullYear()} GenieApps</p>
          </div>
        </div>
      </footer>
    </>
  );
}
