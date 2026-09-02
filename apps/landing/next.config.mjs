/** @type {import('next').NextConfig} */

const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787').origin;
  } catch {
    return 'http://localhost:8787';
  }
})();

// Next's App Router hydration bootstrap uses inline <script> and inline styles;
// nonce-based CSP needs per-request middleware. This policy still blocks
// third-party script injection, framing, and form/base-uri hijacking.
const csp = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  `connect-src 'self' ${apiOrigin}`,
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@genie/config'],
  async rewrites() {
    return [];
  },
  headers: async () => [{ source: '/(.*)', headers: securityHeaders }],
};

export default nextConfig;
