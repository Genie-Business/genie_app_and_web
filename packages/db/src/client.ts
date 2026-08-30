import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

/**
 * genie talks to Neon through its serverless (WebSocket) driver via a Prisma
 * driver adapter — no native query-engine binary. This is what makes the client
 * work on Vercel functions; it's equally fine for local dev, tests and the
 * seed script. Prisma CLI commands (migrate / studio / db push) still use the
 * plain `DATABASE_URL` / `DIRECT_URL` connection and are unaffected.
 */

// Node < 22 has no global WebSocket; the driver needs one for the pool.
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });
}

// Cache on globalThis so a warm serverless invocation (or dev HMR) reuses the
// same client + Neon pool instead of opening a new one each time.
export const prisma = globalForPrisma.prisma ?? createClient();
globalForPrisma.prisma = prisma;

export type { PrismaClient };
