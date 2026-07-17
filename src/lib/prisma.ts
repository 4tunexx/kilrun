import { PrismaClient } from '@/generated/prisma';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Append serverless-friendly MongoDB driver options when missing.
 * Vercel spins up many concurrent instances; a large default pool per
 * instance exhausts Atlas (especially free/shared tiers) and surfaces as
 * "Server selection timeout" / TLS "fatal alert: InternalError".
 */
function withServerlessParams(databaseUrl: string): string {
  const additions: string[] = [];
  if (!/[?&]maxPoolSize=/.test(databaseUrl)) {
    additions.push('maxPoolSize=1');
  }
  if (!/[?&]serverSelectionTimeoutMS=/.test(databaseUrl)) {
    additions.push('serverSelectionTimeoutMS=5000');
  }
  if (additions.length === 0) return databaseUrl;
  return `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}${additions.join('&')}`;
}

function createPrismaClient(): PrismaClient {
  const datasourceUrl = process.env.DATABASE_URL
    ? withServerlessParams(process.env.DATABASE_URL)
    : undefined;

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    ...(datasourceUrl
      ? { datasources: { db: { url: datasourceUrl } } }
      : {}),
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Always resolve through `getClient()` so a reconnect after
 * `resetPrismaClient()` is visible to every importer. Caching the client
 * only on `globalThis` (not as a module-level const) is what lets warm
 * Vercel instances recover from a dead MongoDB topology.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export function isTransientDbConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = String((error as { message?: string }).message ?? '');
  const code = (error as { code?: string }).code;
  return (
    code === 'P2010' ||
    message.includes('Server selection timeout') ||
    message.includes('No available servers') ||
    message.includes('ReplicaSetNoPrimary') ||
    message.includes('received fatal alert') ||
    message.includes('ECONNRESET') ||
    message.includes('MongoNetworkError') ||
    message.includes('MongoServerSelectionError')
  );
}

/** Drop a poisoned client so the next call opens a fresh connection pool. */
export async function resetPrismaClient(): Promise<void> {
  const existing = globalForPrisma.prisma;
  globalForPrisma.prisma = undefined;
  if (existing) {
    try {
      await existing.$disconnect();
    } catch {
      // Ignore disconnect failures from an already-dead client.
    }
  }
}

/**
 * Run a DB operation, recreating the Prisma singleton once if the cached
 * client is stuck on a dead topology (common after Atlas blips on warm
 * Vercel instances).
 */
export async function withPrismaRetry<T>(
  operation: (client: PrismaClient) => Promise<T>,
  retries = 1
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation(getClient());
    } catch (error) {
      lastError = error;
      if (attempt < retries && isTransientDbConnectionError(error)) {
        console.warn(
          `[prisma] transient connection error (attempt ${attempt + 1}); recreating client`
        );
        await resetPrismaClient();
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
