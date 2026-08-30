/**
 * genie wordmark. The brand logo is a deep-violet "genie" wordmark with a
 * genie-in-a-lamp glyph; this is a faithful placeholder built from type + a
 * simple lamp mark until the official SVG is dropped in
 * (packages/config/brand/genie-logo.svg → import it here).
 */
export function Logo({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'md' | 'lg';
}) {
  const wordmark = size === 'lg' ? 'text-2xl' : 'text-xl';
  const glyph = size === 'lg' ? 30 : 26;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={glyph} height={glyph} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path
          d="M6 21c0-3 3-4 7-4s9 .5 11 2c1 .8 1 2-1 2H8c-1.4 0-2-.8-2 0Z"
          fill="var(--genie-primary-solid)"
        />
        <path
          d="M13 17c-1-3 .5-6 3-7 .8-.3.7-1.2-.2-1.4-3-.6-3 3-2.8 4.4"
          stroke="var(--genie-primary-solid)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="16.5" cy="7.5" r="2" fill="var(--genie-primary-solid)" />
      </svg>
      <span
        className={`font-display ${wordmark} font-bold tracking-tight text-[var(--genie-primary-solid)]`}
      >
        genie
      </span>
    </span>
  );
}
