import { createHmac, timingSafeEqual } from 'node:crypto';

export type EngineStaffTokenPayload = {
  userId: string;
  steamId: string;
  exp: number;
};

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64url(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

export function signEngineStaffToken(input: {
  userId: string;
  steamId: string;
  secret: string;
  ttlSec?: number;
  nowSec?: number;
}): string {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const exp = now + (input.ttlSec ?? 30 * 24 * 60 * 60);
  const payload = b64url(
    Buffer.from(JSON.stringify({ v: 1, uid: input.userId, sid: input.steamId, exp }), 'utf8')
  );
  const sig = b64url(createHmac('sha256', input.secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyEngineStaffToken(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000)
): EngineStaffTokenPayload | null {
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, sig] = parts;
  const expected = b64url(createHmac('sha256', secret).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    const json = JSON.parse(fromB64url(payload).toString('utf8')) as {
      v?: number;
      uid?: string;
      sid?: string;
      exp?: number;
    };
    if (json.v !== 1 || !json.uid || !json.sid || typeof json.exp !== 'number') return null;
    if (json.exp < nowSec) return null;
    return { userId: json.uid, steamId: json.sid, exp: json.exp };
  } catch {
    return null;
  }
}
