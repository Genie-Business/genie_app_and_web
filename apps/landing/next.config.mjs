/** @type {import('next').NextConfig} */

const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787').origin;
  } catch {
    return 'http://localhost:8787';
  }
})();

// One app serves two sites on two hostnames (see src/middleware.ts): the public site and the
// admin portal. They get different security headers, so header rules are scoped by host.
const adminHosts = (process.env.ADMIN_HOSTS ?? 'admin.getgenie.gift,admin.localhost')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const adminHostRe = `(${adminHosts.map(escapeRe).join('|')})`;
const onAdminHost = [{ type: 'host', value: adminHostRe }];

// Next's App Router hydration bootstrap uses inline <script> and inline styles;
// nonce-based CSP needs per-request middleware. This policy still blocks
// third-party script injection, framing, and form/base-uri hijacking.
// `unsafe-eval` is only added in `next dev` (HMR / React refresh use eval).
const dev = process.env.NODE_ENV !== 'production';
const scriptSrc = `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`;

const siteCsp = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  `connect-src 'self' ${apiOrigin}`,
  'upgrade-insecure-requests',
].join('; ');

// Admin is a first-party-only tool: no third-party anything, never framed.
const adminCsp = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

const common = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const siteHeaders = [
  { key: 'Content-Security-Policy', value: siteCsp },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ...common,
];

const adminHeaders = [
  { key: 'Content-Security-Policy', value: adminCsp },
  // Not `no-referrer`: browsers then send `Origin: null` on form posts and Next's Server Actions
  // handler throws on it (new URL('null')), 500ing every action incl. sign-in. `same-origin`
  // still sends nothing to other sites.
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  ...common,
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@genie/config', '@genie/core', '@genie/db'],
  // Leave these for Node to resolve from node_modules at runtime instead of letting the bundler
  // inline them: Prisma's client + the Neon serverless driver stack (@genie/db talks to Postgres
  // through @prisma/adapter-neon over a WebSocket, same as apps/api). `ws` in particular has
  // optional-native requires that the bundler mangles.
  serverExternalPackages: [
    '@prisma/client',
    '.prisma/client',
    'prisma',
    '@prisma/adapter-neon',
    '@neondatabase/serverless',
    'ws',
  ],
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,

  // The 3D marketing site is static HTML in public/site; serve it at clean URLs.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/site/index.html' },
        { source: '/product', destination: '/site/product.html' },
        { source: '/team', destination: '/site/team.html' },
      ],
    };
  },
  async redirects() {
    return [{ source: '/faq', destination: '/product#faq', permanent: true }];
  },
  headers: async () => [
    { source: '/(.*)', missing: onAdminHost, headers: siteHeaders },
    { source: '/(.*)', has: onAdminHost, headers: adminHeaders },
    {
      source: '/assets/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, must-revalidate' }],
    },
  ],
};

export default nextConfig;
