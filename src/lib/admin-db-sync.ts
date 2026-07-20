'use server';

/**
 * Admin-triggered database schema sync from the website.
 * Tries `prisma db push`, then verifies app fields (e.g. equippedSkins) work on Mongo.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import { writeAuditLog } from '@/lib/audit';

const execFileAsync = promisify(execFile);

/** Schema readiness version — bump when new fields need a push. */
const DB_SCHEMA_SYNC_VERSION = '2026-07-20-kp-ranks';

async function requireAdmin() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || user.role !== 'admin') {
    throw new Error('Admin only');
  }
  return user;
}

function resolvePrismaBin(): string | null {
  const candidates = [
    path.join(process.cwd(), 'node_modules', '.bin', 'prisma'),
    path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export type AdminDbSyncResult = {
  ok: boolean;
  version: string;
  syncedAt: string;
  cliPush: 'ok' | 'skipped' | 'failed';
  cliDetail?: string;
  steps: string[];
};

/**
 * Push Prisma schema to Mongo and verify KP / skin fields are writable.
 * Call from Admin → Dashboard → Sync database schema.
 *
 * Needed after deploying: User.kp, MatchResult.kpDelta / stats, and any new
 * mission / achievement / badge seed keys.
 */
export async function adminSyncDatabaseSchema(): Promise<AdminDbSyncResult> {
  const staff = await requireAdmin();
  const steps: string[] = [];
  const syncedAt = new Date().toISOString();

  try {
    await prisma.$runCommandRaw({ ping: 1 });
    steps.push('MongoDB ping OK');
  } catch (e) {
    throw new Error(
      e instanceof Error ? `MongoDB unreachable: ${e.message}` : 'MongoDB unreachable'
    );
  }

  let cliPush: AdminDbSyncResult['cliPush'] = 'skipped';
  let cliDetail: string | undefined;

  const bin = resolvePrismaBin();
  if (!bin) {
    steps.push('Prisma CLI not found in node_modules — using runtime field verify only');
    cliPush = 'skipped';
    cliDetail = 'CLI binary missing (common on some serverless builds)';
  } else if (!process.env.DATABASE_URL) {
    steps.push('DATABASE_URL missing — cannot run prisma db push');
    cliPush = 'failed';
    cliDetail = 'DATABASE_URL not set';
  } else {
    try {
      const args =
        bin.endsWith('index.js')
          ? [bin, 'db', 'push', '--skip-generate', '--accept-data-loss']
          : ['db', 'push', '--skip-generate', '--accept-data-loss'];
      const cmd = bin.endsWith('index.js') ? process.execPath : bin;
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        cwd: process.cwd(),
        env: { ...process.env },
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const out = `${stdout || ''}\n${stderr || ''}`.trim();
      cliPush = 'ok';
      cliDetail = out.slice(0, 1200) || 'prisma db push finished';
      steps.push('prisma db push completed');
    } catch (e: unknown) {
      const err = e as { message?: string; stdout?: string; stderr?: string };
      cliPush = 'failed';
      cliDetail = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n').slice(0, 1200);
      steps.push(
        'prisma db push failed or timed out — continuing with runtime field verify (Mongo is flexible)'
      );
    }
  }

  // Runtime verify: body skins field used by Model Editor → shop → equip
  try {
    const current = await prisma.user.findUnique({
      where: { id: staff.id },
      select: { equippedSkins: true },
    });
    const map =
      current?.equippedSkins && typeof current.equippedSkins === 'object'
        ? (current.equippedSkins as Record<string, unknown>)
        : {};
    await prisma.user.update({
      where: { id: staff.id },
      data: { equippedSkins: map as Prisma.InputJsonValue },
    });
    steps.push('equippedSkins field verified (read/write OK)');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`equippedSkins verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — equippedSkins not writable. Redeploy with latest Prisma schema, then retry. (${msg})`
    );
  }

  // Runtime verify: Killrun Points (KP) + rank for Competitive ladder
  try {
    const current = await prisma.user.findUnique({
      where: { id: staff.id },
      select: { kp: true, currentRank: true },
    });
    const kp = typeof current?.kp === 'number' ? current.kp : 1000;
    await prisma.user.update({
      where: { id: staff.id },
      data: { kp },
    });
    steps.push(`kp field verified (read/write OK, value=${kp})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`kp verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — User.kp not writable. Run Sync again after deploy. (${msg})`
    );
  }

  // Runtime verify: MatchResult.kpDelta / stats for Competitive + Horde
  try {
    const probe = await prisma.matchResult.create({
      data: {
        userId: staff.id,
        mode: 'schema_probe',
        outcome: 'probe',
        xpEarned: 0,
        vpEarned: 0,
        kpDelta: 0,
        stats: { probe: true },
      },
    });
    await prisma.matchResult.delete({ where: { id: probe.id } });
    steps.push('MatchResult.kpDelta + stats verified');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`MatchResult verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — MatchResult.kpDelta/stats not writable. (${msg})`
    );
  }

  // Persist sync stamp on SiteSettings chrome JSON (no extra schema field needed)
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { singletonKey: 'default' },
    });
    let chrome: Record<string, unknown> = {};
    try {
      chrome = settings?.hubChromeJson ? JSON.parse(settings.hubChromeJson) : {};
    } catch {
      chrome = {};
    }
    chrome.schemaSync = {
      version: DB_SCHEMA_SYNC_VERSION,
      at: syncedAt,
      cliPush,
      by: staff.username,
    };
    if (settings) {
      await prisma.siteSettings.update({
        where: { singletonKey: 'default' },
        data: { hubChromeJson: JSON.stringify(chrome) },
      });
    } else {
      await prisma.siteSettings.create({
        data: {
          singletonKey: 'default',
          hubChromeJson: JSON.stringify(chrome),
        },
      });
    }
    steps.push('Sync status saved to site settings');
  } catch {
    steps.push('Could not persist sync stamp (non-fatal)');
  }

  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'db_schema_sync',
    detail: `v=${DB_SCHEMA_SYNC_VERSION} cli=${cliPush}`,
  });

  return {
    ok: true,
    version: DB_SCHEMA_SYNC_VERSION,
    syncedAt,
    cliPush,
    cliDetail,
    steps,
  };
}

/** Read last sync stamp for the dashboard (admin/moderator). */
export async function adminGetSchemaSyncStatus(): Promise<{
  version: string | null;
  at: string | null;
  cliPush: string | null;
  expectedVersion: string;
  upToDate: boolean;
} | null> {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) return null;
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || (user.role !== 'admin' && user.role !== 'moderator')) {
    return null;
  }

  const settings = await prisma.siteSettings.findUnique({
    where: { singletonKey: 'default' },
  });
  let stamp: { version?: string; at?: string; cliPush?: string } | null = null;
  try {
    const chrome = settings?.hubChromeJson ? JSON.parse(settings.hubChromeJson) : {};
    stamp = chrome?.schemaSync ?? null;
  } catch {
    stamp = null;
  }

  return {
    version: stamp?.version ?? null,
    at: stamp?.at ?? null,
    cliPush: stamp?.cliPush ?? null,
    expectedVersion: DB_SCHEMA_SYNC_VERSION,
    upToDate: stamp?.version === DB_SCHEMA_SYNC_VERSION,
  };
}
