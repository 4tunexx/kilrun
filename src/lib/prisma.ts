import { PrismaClient } from '@/generated/prisma';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Cache on `globalThis` in EVERY environment, not just dev. Vercel reuses
// the same warm serverless instance across many requests (cold starts are
// the exception, not the rule); without this, every request on a warm
// instance created a brand-new PrismaClient with its own fresh MongoDB
// connection pool that was never closed, leaking connections until Atlas's
// connection ceiling was hit and started rejecting/dropping connections --
// which is exactly what "Server selection timeout: No available servers" /
// "received fatal alert: InternalError" across all three shard servers means.
globalForPrisma.prisma = prisma;
