/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@genie/config', '@genie/core', '@genie/db'],
  // Keep Prisma's query engine out of the webpack bundle so it resolves from
  // node_modules at runtime (required for @prisma/client in a monorepo).
  serverExternalPackages: ['@prisma/client', '.prisma/client', 'prisma'],
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
