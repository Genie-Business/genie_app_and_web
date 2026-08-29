import type { Metadata, Viewport } from 'next';
import { Inter, Unbounded } from 'next/font/google';
import { site } from '@/lib/site';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const unbounded = Unbounded({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-unbounded',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} — ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  openGraph: {
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    url: site.url,
    siteName: site.name,
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: site.name, description: site.description },
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfdfe' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1417' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${unbounded.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
