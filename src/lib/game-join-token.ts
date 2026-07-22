/**
 * Short-lived HMAC join tokens for Colyseus.
 * Minted by the Next.js hub (session-authenticated); verified in room onAuth.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export type GameJoinClaims = {
  userId: string;
  username: string;
  avatarUrl: string;
  isAdmin: boolean;
  isPremium: boolean;
  rankedAccess: boolean;
  kp: number;
  /** unix seconds */
  exp: number;
};

function joinSecret(): string {
  return (
    process.env.GAME_JOIN_TOKEN_SECRET ||
    process.env.GAME_SERVER_ADMIN_SECRET ||
    process.env.AUTH_SECRET ||
    ''
  );
}

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

export function mintGameJoinToken(
  claims: Omit<GameJoinClaims, 'exp'>,
  ttlSec = 120
): string {
  const secret = joinSecret();
  if (!secret) {
    throw new Error('Join token secret not configured');
  }
  const payload: GameJoinClaims = {
    ...claims,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(
    createHmac('sha256', secret).update(body).digest()
  );
  return `${body}.${sig}`;
}

export function verifyGameJoinToken(token: string): GameJoinClaims | null {
  const secret = joinSecret();
  if (!secret || !token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(
    createHmac('sha256', secret).update(body).digest()
  );
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const raw = JSON.parse(fromB64url(body).toString('utf8')) as GameJoinClaims;
    if (!raw?.userId || typeof raw.exp !== 'number') return null;
    if (raw.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      userId: String(raw.userId),
      username: String(raw.username || 'Player'),
      avatarUrl: String(raw.avatarUrl || ''),
      isAdmin: !!raw.isAdmin,
      isPremium: !!raw.isPremium,
      rankedAccess: !!raw.rankedAccess,
      kp: typeof raw.kp === 'number' && Number.isFinite(raw.kp) ? raw.kp : 1000,
      exp: raw.exp,
    };
  } catch {
    return null;
  }
}
