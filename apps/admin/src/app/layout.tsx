import type { Metadata } from 'next';
import { Inter, Unbounded } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const unbounded = Unbounded({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-unbounded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'genie Admin',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${unbounded.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
