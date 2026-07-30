/**
 * Short-lived "elevated" session for the admin Secrets vault — separate from
 * the normal Steam-login session. Unlocking with the vault password or a
 * passkey issues a signed, expiring cookie; every vault action re-checks it
 * server-side so the step-up gate can't be bypassed by just being logged in
 * as admin. Mirrors the HMAC join-token pattern already used for the game
 * server (server/src/join-token.ts) rather than adding a new dependency.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

export const VAULT_COOKIE_NAME = 'kilrun_vault_session';
const VAULT_TTL_SEC = 20 * 60; // step-up re-auth every 20 minutes

function vaultSigningSecret(): string {
  const secret =
    process.env.SITE_SECRETS_ENCRYPTION_KEY || process.env.AUTH_SECRET || '';
  if (!secret) throw new Error('No signing secret available for vault sessions');
  return secret;
}

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function signToken(userId: string, exp: number): string {
  const body = b64url(JSON.stringify({ userId, exp }));
  const sig = b64url(createHmac('sha256', vaultSigningSecret()).update(body).digest());
  return `${body}.${sig}`;
}

function verifyToken(token: string): { userId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  let expectedSig: string;
  try {
    expectedSig = b64url(createHmac('sha256', vaultSigningSecret()).update(body).digest());
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as { userId?: string; exp?: number };
    if (!payload.userId || typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: String(payload.userId) };
  } catch {
    return null;
  }
}

/** Issue the elevated-session cookie after a successful password/passkey check. */
export async function issueVaultSession(userId: string) {
  const exp = Math.floor(Date.now() / 1000) + VAULT_TTL_SEC;
  const token = signToken(userId, exp);
  const store = await cookies();
  store.set(VAULT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: VAULT_TTL_SEC,
  });
}

/** True if the current request carries a still-valid vault session for this user. */
export async function hasValidVaultSession(userId: string): Promise<boolean> {
  const store = await cookies();
  const token = store.get(VAULT_COOKIE_NAME)?.value;
  if (!token) return false;
  const verified = verifyToken(token);
  return Boolean(verified && verified.userId === userId);
}

export async function clearVaultSession() {
  const store = await cookies();
  store.delete(VAULT_COOKIE_NAME);
}
