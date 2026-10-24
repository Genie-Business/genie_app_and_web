/** @type {import('next').NextConfig} */

// Admin is a first-party-only tool: no third-party anything, never framed.
const csp = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@genie/config', '@genie/core', '@genie/db'],
  // Leave these for Node to resolve from node_modules at runtime instead of
  // letting the bundler inline them: Prisma's client + the Neon serverless
  // driver stack (@genie/db talks to Postgres through @prisma/adapter-neon over
  // a WebSocket, same as apps/api). `ws` in particular has optional-native
  // requires that the bundler mangles.
  serverExternalPackages: [
    '@prisma/client',
    '.prisma/client',
    'prisma',
    '@prisma/adapter-neon',
    '@neondatabase/serverless',
    'ws',
  ],
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        // Not `no-referrer`: browsers then send `Origin: null` on form posts and Next's
        // Server Actions handler throws on it (new URL('null')), 500ing every action incl. sign-in.
        // `same-origin` still sends nothing to other sites.
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ],
    },
  ],
};

export default nextConfig;
