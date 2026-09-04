import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ENGINE_INVITE_COOKIE = 'kilrun_engine_invite';
export const ENGINE_INVITE_PREFIX = 'ke1';

/** Every stored admin invite lasts 24 hours. */
export const ENGINE_INVITE_TTL_SEC = 24 * 60 * 60;

export type StoredEngineInvite = {
  id: string;
  token: string;
  url: string;
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  revokedAt: string | null;
};

export function parseStoredEngineInvites(raw: unknown): StoredEngineInvite[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: StoredEngineInvite[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id || '').trim();
    const token = String(r.token || '').trim();
    const url = String(r.url || '').trim();
    if (!id || !token || !url) continue;
    out.push({
      id,
      token,
      url,
      createdAt: String(r.createdAt || ''),
      expiresAt: String(r.expiresAt || ''),
      createdBy: String(r.createdBy || ''),
      revokedAt: r.revokedAt ? String(r.revokedAt) : null,
    });
  }
  return out;
}

export function storedInviteStatus(
  row: StoredEngineInvite,
  nowMs = Date.now()
): 'active' | 'expired' | 'revoked' {
  if (row.revokedAt) return 'revoked';
  const exp = Date.parse(row.expiresAt);
  if (Number.isFinite(exp) && exp <= nowMs) return 'expired';
  return 'active';
}

export type EngineInvitePayload = {
  jti: string;
  exp: number;
};

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64url(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

export function engineInviteSecret(): string {
  return (
    process.env.GAME_JOIN_TOKEN_SECRET ||
    process.env.GAME_SERVER_ADMIN_SECRET ||
    process.env.AUTH_SECRET ||
    ''
  );
}

export function ttlSecForInviteId(_id?: string | null): number {
  return ENGINE_INVITE_TTL_SEC;
}

export function signEngineInvite(input: {
  secret: string;
  ttlSec?: number;
  nowSec?: number;
  jti?: string;
}): string {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const exp = now + (input.ttlSec ?? ENGINE_INVITE_TTL_SEC);
  const jti = input.jti || randomBytes(12).toString('hex');
  const payload = b64url(Buffer.from(JSON.stringify({ v: 1, kind: 'engine-invite', jti, exp }), 'utf8'));
  const sig = b64url(createHmac('sha256', input.secret).update(payload).digest());
  return `${ENGINE_INVITE_PREFIX}.${payload}.${sig}`;
}

export function verifyEngineInvite(
  token: string | null | undefined,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000)
): EngineInvitePayload | null {
  if (!token || !secret) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== ENGINE_INVITE_PREFIX || !parts[1] || !parts[2]) {
    return null;
  }
  const [, payload, sig] = parts;
  const expected = b64url(createHmac('sha256', secret).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    const json = JSON.parse(fromB64url(payload).toString('utf8')) as {
      v?: number;
      kind?: string;
      jti?: string;
      exp?: number;
    };
    if (json.v !== 1 || json.kind !== 'engine-invite') return null;
    if (!json.jti || typeof json.exp !== 'number') return null;
    if (json.exp < nowSec) return null;
    return { jti: json.jti, exp: json.exp };
  } catch {
    return null;
  }
}

export function buildEngineInviteUrl(origin: string, token: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/engine?invite=${encodeURIComponent(token)}`;
}

export function inviteCookieMaxAge(exp: number, nowSec = Math.floor(Date.now() / 1000)): number {
  return Math.max(60, exp - nowSec);
}
