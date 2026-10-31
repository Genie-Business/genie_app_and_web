export type HeaderCtx = { req: { header: (k: string) => string | undefined } };

/**
 * The real client IP. On Vercel `x-vercel-forwarded-for` / `x-real-ip` are set
 * by the platform and cannot be spoofed by the caller; the first entry of a
 * client-supplied `x-forwarded-for` CAN be, so it is only a last resort and we
 * take its LAST hop (the one the nearest trusted proxy added).
 */
export const clientIp = (c: HeaderCtx): string => {
  const vercel = c.req.header('x-vercel-forwarded-for')?.trim();
  if (vercel) return vercel;
  const real = c.req.header('x-real-ip')?.trim();
  if (real) return real;
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((s) => s.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  return 'local';
};
