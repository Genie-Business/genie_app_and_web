/**
 * genie logo — the official mark (packages/config/brand/LOGO.png), recoloured
 * to the brand violet. Rendered as a CSS mask so it always paints in
 * var(--genie-primary-solid) and stays crisp in light and dark.
 */
export function Logo({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'md' | 'lg';
}) {
  const h = size === 'lg' ? 34 : 28;
  return (
    <span
      role="img"
      aria-label="genie"
      className={`inline-block shrink-0 ${className}`}
      style={{
        height: h,
        width: (h * 692) / 200,
        backgroundColor: 'var(--genie-primary-solid)',
        WebkitMaskImage: 'url(/genie-logo-mask.png)',
        maskImage: 'url(/genie-logo-mask.png)',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'left center',
        maskPosition: 'left center',
      }}
    />
  );
}
