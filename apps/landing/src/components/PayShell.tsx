import Link from 'next/link';
import { Logo } from '@/components/Logo';

/** The plain frame around the pages a buyer lands on after paying. */
export function PayShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line">
        <div className="container-genie flex h-16 items-center">
          <Link href="/" aria-label="genie home">
            <Logo />
          </Link>
        </div>
      </header>
      <main className="container-genie py-14 sm:py-20">{children}</main>
    </div>
  );
}
