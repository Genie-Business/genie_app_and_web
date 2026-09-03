/**
 * genie logo — a seated-genie glyph (hair knot, head, ponytail, folded arms,
 * a curl of smoke) + the wordmark, in deep violet
 * (var(--genie-primary-solid) / #6D28D9). Single flat colour so it tints on any
 * background. Mirrors packages/config/brand/genie-logo.svg and
 * apps/mobile/lib/shared/widgets/genie_mark.dart.
 */
export function Logo({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'md' | 'lg';
}) {
  const wordmark = size === 'lg' ? 'text-2xl' : 'text-xl';
  const glyph = size === 'lg' ? 32 : 28;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 34 44"
        fill="none"
        aria-hidden
        style={{ color: 'var(--genie-primary-solid)' }}
      >
        <g fill="currentColor">
          <circle cx="16.4" cy="4.8" r="2.6" />
          <ellipse cx="16.4" cy="14" rx="8.4" ry="7" />
          <path d="M24.2 11c3-.5 5 1 5.4 3.4.3 1.9-.6 3.6-2 4.2-.2-3.4-1.5-5.9-3.4-7.6z" />
          <path d="M16.4 19.6c-6.7 0-11 3-11 6.9 0 3.4 3.3 5.4 8 5.9l-1.7 5.1c-.3.9.8 1.6 1.5 1l4.6-3.9c.4 0 .8.1 1.2.1 6.7 0 11-3 11-6.9 0-3.9-4.3-6.9-11-6.9z" />
          <path d="M8.2 33.4c-3.4.6-6-.6-6.6-3-.4-1.8.4-3.6 1.9-4.3-1 2.5 0 4.6 2.4 5.4 1.2.4 2 .8 2.3 1.9z" />
        </g>
        <path
          d="M16.4 24.4c-4 0-6.6 1.4-6.6 3.1s2.6 3.1 6.6 3.1 6.6-1.4 6.6-3.1-2.6-3.1-6.6-3.1z"
          fill="#fff"
          fillOpacity="0.16"
        />
      </svg>
      <span
        className={`font-display ${wordmark} font-semibold tracking-tight text-[var(--genie-primary-solid)]`}
      >
        genie
      </span>
    </span>
  );
}
