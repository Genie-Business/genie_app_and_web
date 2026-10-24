'use client';

import { useState } from 'react';
import { NavLinks, type NavGroup } from '@/components/nav-links';

/** Hamburger drawer for < md screens (the desktop sidebar is hidden there). */
export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-[var(--genie-border-strong)] px-3 py-1.5 text-sm font-medium"
      >
        {open ? 'Close' : 'Menu'}
      </button>
      {open && (
        <div className="fixed inset-x-0 top-14 z-30 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-[var(--genie-border)] bg-[var(--genie-bg-surface)] p-4 shadow-lg">
          <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
