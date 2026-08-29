import { PrismaClient } from '@prisma/client';

/**
 * A single PrismaClient per process. On serverless the module is re-used across
 * warm invocations; in dev we stash it on globalThis so HMR doesn't leak
 * connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient };
