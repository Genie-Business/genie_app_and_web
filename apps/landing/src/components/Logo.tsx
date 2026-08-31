/**
 * genie logo — the genie-in-a-lamp glyph + wordmark, in deep violet
 * (var(--genie-primary-solid) / #6D28D9). The glyph is a single flat colour so
 * it tints cleanly on any background. Mirrors
 * apps/mobile/lib/shared/widgets/genie_mark.dart and
 * packages/config/brand/genie-logo.svg.
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
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        style={{ color: 'var(--genie-primary-solid)' }}
      >
        {/* lamp body */}
        <path
          d="M2.9 17.3q-0.5-4.8 5.3-5.8h7.6q5.8 1 5.3 5.8q0 3.4-9.1 3.4T2.9 17.3Z"
          fill="currentColor"
        />
        {/* spout */}
        <path d="M3.4 14.4 0 15.4l3.4 1.4Z" fill="currentColor" />
        {/* rising wisp */}
        <path
          d="M12 11q-4.8-2.4 0-7.2-2.4-1.2 0.5-2.9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* the wish */}
        <path
          d="M14.4 2.4q0.66 0.66 1.56 0.96-0.9 0.3-1.56 0.96-0.66-0.66-1.56-0.96 0.9-0.3 1.56-0.96Z"
          fill="currentColor"
        />
      </svg>
      <span
        className={`font-display ${wordmark} font-bold tracking-tight text-[var(--genie-primary-solid)]`}
      >
        genie
      </span>
    </span>
  );
}
