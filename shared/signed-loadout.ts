/**
 * HMAC-signed match loadout (skins + weapon) minted by the hub from DB.
 * Game server verifies before applying so clients cannot spoof cosmetics/combat.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export type SignedLoadoutPayload = {
  userId: string;
  equippedSkinsJson: string;
  weaponCombat: unknown;
  exp: number;
};

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

export function signLoadoutToken(
  payload: Omit<SignedLoadoutPayload, 'exp'>,
  secret: string,
  ttlSec = 180
): string {
  if (!secret) throw new Error('Loadout secret not configured');
  const body: SignedLoadoutPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const encoded = b64url(JSON.stringify(body));
  const sig = b64url(createHmac('sha256', secret).update(encoded).digest());
  return `${encoded}.${sig}`;
}

export function verifyLoadoutToken(token: string, secret: string): SignedLoadoutPayload | null {
  if (!secret || !token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(createHmac('sha256', secret).update(body).digest());
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const raw = JSON.parse(fromB64url(body).toString('utf8')) as SignedLoadoutPayload;
    if (!raw?.userId || typeof raw.exp !== 'number') return null;
    if (raw.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      userId: String(raw.userId),
      equippedSkinsJson: typeof raw.equippedSkinsJson === 'string' ? raw.equippedSkinsJson : '[]',
      weaponCombat: raw.weaponCombat,
      exp: raw.exp,
    };
  } catch {
    return null;
  }
}

export function loadoutSecretFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string {
  return (
    env.GAME_JOIN_TOKEN_SECRET ||
    env.GAME_SERVER_ADMIN_SECRET ||
    env.AUTH_SECRET ||
    ''
  );
}
