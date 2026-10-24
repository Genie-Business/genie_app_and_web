'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavGroup = { label: string; items: Array<{ label: string; href: string }> };

function isActive(pathname: string, href: string, all: string[]): boolean {
  if (href === '/') return pathname === '/';
  if (pathname === href) return true;
  // /concierge must not stay lit on /concierge/orders (a sibling entry has the longer prefix).
  const longer = all.some((h) => h !== href && h.startsWith(href + '/') && (pathname === h || pathname.startsWith(h + '/')));
  return pathname.startsWith(href + '/') && !longer;
}

export function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const all = groups.flatMap((g) => g.items.map((i) => i.href));
  return (
    <nav className="space-y-5 text-sm" aria-label="Main">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{g.label}</div>
          <div className="space-y-0.5">
            {g.items.map((i) => {
              const active = isActive(pathname, i.href, all);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`block rounded-lg px-3 py-2 transition-colors ${
                    active
                      ? 'bg-[var(--genie-primary-soft)] font-semibold text-[var(--genie-primary-solid)]'
                      : 'text-ink-secondary hover:bg-[var(--genie-bg-subtle)] hover:text-ink'
                  }`}
                >
                  {i.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
