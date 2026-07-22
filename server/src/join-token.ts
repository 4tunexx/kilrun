/**
 * Short-lived HMAC join tokens for Colyseus.
 * Mirrors `/workspace/src/lib/game-join-token.ts` (body.sig HMAC-SHA256).
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

export type JoinAuthOptions = {
  token?: string;
  userId?: string;
  username?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
  isPremium?: boolean;
  rankedAccess?: boolean;
  kp?: number;
};

function joinSecret(): string {
  return (
    process.env.GAME_JOIN_TOKEN_SECRET ||
    process.env.GAME_SERVER_ADMIN_SECRET ||
    process.env.AUTH_SECRET ||
    ''
  );
}

/** True when the server has a secret and must require tokens. */
export function isJoinTokenRequired(): boolean {
  return joinSecret().length > 0;
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

let warnedDevFallback = false;

/**
 * Colyseus onAuth helper: verify options.token when a secret is configured;
 * otherwise trust client options (local/dev) and warn once.
 */
export function authenticateJoin(
  options: JoinAuthOptions
): GameJoinClaims {
  const secret = joinSecret();
  if (secret) {
    const token = typeof options.token === 'string' ? options.token : '';
    if (!token) {
      throw new Error('Join token required');
    }
    const claims = verifyGameJoinToken(token);
    if (!claims) {
      throw new Error('Invalid or expired join token');
    }
    return claims;
  }

  if (!warnedDevFallback) {
    warnedDevFallback = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[join-token] No GAME_JOIN_TOKEN_SECRET / GAME_SERVER_ADMIN_SECRET / AUTH_SECRET — trusting client join options (dev only)'
    );
  }

  return {
    userId: String(options.userId || ''),
    username: String(options.username || 'Player'),
    avatarUrl: String(options.avatarUrl || ''),
    isAdmin: !!options.isAdmin,
    isPremium: !!options.isPremium,
    rankedAccess: !!options.rankedAccess,
    kp:
      typeof options.kp === 'number' && Number.isFinite(options.kp)
        ? options.kp
        : 1000,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

/** Prefer verified auth claims; fall back to raw options when auth is absent. */
export function claimsFromAuth(
  auth: unknown,
  options: JoinAuthOptions
): Omit<GameJoinClaims, 'exp'> {
  const a = auth as Partial<GameJoinClaims> | null | undefined;
  if (a && typeof a.userId === 'string' && a.userId.length > 0) {
    return {
      userId: a.userId,
      username: String(a.username || 'Player'),
      avatarUrl: String(a.avatarUrl || ''),
      isAdmin: !!a.isAdmin,
      isPremium: !!a.isPremium,
      rankedAccess: !!a.rankedAccess,
      kp: typeof a.kp === 'number' && Number.isFinite(a.kp) ? a.kp : 1000,
    };
  }
  return {
    userId: String(options.userId || ''),
    username: String(options.username || 'Player'),
    avatarUrl: String(options.avatarUrl || ''),
    isAdmin: !!options.isAdmin,
    isPremium: !!options.isPremium,
    rankedAccess: !!options.rankedAccess,
    kp:
      typeof options.kp === 'number' && Number.isFinite(options.kp)
        ? options.kp
        : 1000,
  };
}
