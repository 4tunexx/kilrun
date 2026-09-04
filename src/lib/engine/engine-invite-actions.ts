'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isAdminRole } from '@/lib/roles';
import { writeAuditLog } from '@/lib/audit';
import {
  ENGINE_INVITE_TTL_SEC,
  buildEngineInviteUrl,
  engineInviteSecret,
  parseStoredEngineInvites,
  signEngineInvite,
  storedInviteStatus,
  verifyEngineInvite,
  type StoredEngineInvite,
} from '@/lib/engine/engine-invite';

export type EngineInviteListItem = {
  id: string;
  url: string;
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  status: 'active' | 'expired' | 'revoked';
};

async function requireAdmin() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !isAdminRole(user.role)) {
    throw new Error('Admin only');
  }
  return user;
}

function safeOrigin(raw: string | undefined): string {
  try {
    const parsed = new URL(raw || '');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.origin;
  } catch {
    /* keep site URL */
  }
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://kilrun.vercel.app').replace(/\/$/, '');
}

async function readInviteStore(): Promise<StoredEngineInvite[]> {
  const raw = (await prisma.$runCommandRaw({
    find: 'SiteSettings',
    filter: { singletonKey: 'default' },
    limit: 1,
  })) as { cursor?: { firstBatch?: Array<Record<string, unknown>> } };
  const doc = raw?.cursor?.firstBatch?.[0];
  return parseStoredEngineInvites(doc?.engineInvitesJson);
}

async function writeInviteStore(rows: StoredEngineInvite[]) {
  const json = JSON.stringify(rows.slice(0, 80));
  await prisma.siteSettings.upsert({
    where: { singletonKey: 'default' },
    create: { singletonKey: 'default' },
    update: {},
  });
  try {
    await prisma.siteSettings.update({
      where: { singletonKey: 'default' },
      data: { engineInvitesJson: json } as { engineInvitesJson: string },
    });
  } catch {
    await prisma.$runCommandRaw({
      update: 'SiteSettings',
      updates: [
        {
          q: { singletonKey: 'default' },
          u: { $set: { engineInvitesJson: json } },
        },
      ],
    });
  }
}

function toListItem(row: StoredEngineInvite): EngineInviteListItem {
  return {
    id: row.id,
    url: row.url,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    createdBy: row.createdBy,
    status: storedInviteStatus(row),
  };
}

export async function listEngineInviteLinks(): Promise<EngineInviteListItem[]> {
  await requireAdmin();
  const rows = await readInviteStore();
  return rows
    .map(toListItem)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function createEngineInviteLink(input?: {
  origin?: string;
}): Promise<EngineInviteListItem> {
  const admin = await requireAdmin();
  const secret = engineInviteSecret();
  if (!secret) {
    throw new Error('Invite signing secret is not configured (AUTH_SECRET)');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const token = signEngineInvite({ secret, ttlSec: ENGINE_INVITE_TTL_SEC, nowSec });
  const verified = verifyEngineInvite(token, secret, nowSec);
  if (!verified) throw new Error('Failed to sign invite');
  const origin = safeOrigin(input?.origin);
  const url = buildEngineInviteUrl(origin, token);
  const row: StoredEngineInvite = {
    id: verified.jti,
    token,
    url,
    createdAt: new Date(nowSec * 1000).toISOString(),
    expiresAt: new Date((nowSec + ENGINE_INVITE_TTL_SEC) * 1000).toISOString(),
    createdBy: admin.username,
    revokedAt: null,
  };
  const existing = await readInviteStore();
  await writeInviteStore([row, ...existing.filter((item) => item.id !== row.id)]);
  await writeAuditLog({
    action: 'engine_invite_create',
    detail: `id=${row.id} exp=${row.expiresAt}`,
  });
  return toListItem(row);
}

export async function revokeEngineInviteLink(id: string): Promise<{ ok: true }> {
  await requireAdmin();
  const key = String(id || '').trim();
  if (!key) throw new Error('Missing invite id');
  const rows = await readInviteStore();
  const next = rows.map((row) =>
    row.id === key && !row.revokedAt
      ? { ...row, revokedAt: new Date().toISOString() }
      : row
  );
  await writeInviteStore(next);
  await writeAuditLog({
    action: 'engine_invite_revoke',
    detail: `id=${key}`,
  });
  return { ok: true };
}

/** Used by /engine accept-invite: HMAC must match a stored, active row. */
export async function findActiveStoredInvite(
  token: string
): Promise<StoredEngineInvite | null> {
  const secret = engineInviteSecret();
  const payload = verifyEngineInvite(token, secret);
  if (!payload) return null;
  const rows = await readInviteStore();
  const row = rows.find((item) => item.id === payload.jti && item.token === token);
  if (!row || storedInviteStatus(row) !== 'active') return null;
  return row;
}
