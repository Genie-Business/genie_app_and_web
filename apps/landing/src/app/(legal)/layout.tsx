import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-genie py-12">
      <Link href="/" className="inline-block">
        <Logo />
      </Link>
      <article className="mt-8 max-w-2xl">{children}</article>
    </div>
  );
}
