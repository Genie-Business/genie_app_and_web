'use client';

import { useEffect, useState } from 'react';

/**
 * Shown at the top of a shared wishlist page. If the genie app is installed and
 * the domain is verified, the OS opens the app before this page ever loads
 * (Android App Links / iOS Universal Links) — this banner is the fallback that
 * lets someone jump to the app manually, with the browser view underneath.
 */
export function OpenInApp({ path }: { path: string }) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('genie-open-in-app-dismissed') !== '1') setHidden(false);
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  const openApp = () => {
    // Custom scheme — opens the app if installed, no-ops otherwise.
    window.location.href = `genie://${path}`;
  };

  const dismiss = () => {
    try {
      sessionStorage.setItem('genie-open-in-app-dismissed', '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <div className="border-b border-line bg-primary-soft">
      <div className="container-genie flex items-center gap-3 py-2.5 text-sm">
        <span className="flex-1 text-ink">Have the app? Open this wishlist in genie.</span>
        <button
          type="button"
          onClick={openApp}
          className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover"
        >
          Open in app
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-ink-muted">
          ✕
        </button>
      </div>
    </div>
  );
}
