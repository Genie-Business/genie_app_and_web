/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    },
  ],
};

export default nextConfig;
