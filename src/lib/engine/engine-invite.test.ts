import { describe, expect, it } from 'vitest';
import {
  ENGINE_INVITE_PREFIX,
  ENGINE_INVITE_TTL_SEC,
  parseStoredEngineInvites,
  signEngineInvite,
  storedInviteStatus,
  ttlSecForInviteId,
  verifyEngineInvite,
} from './engine-invite';

const secret = 'test-engine-invite-secret';

describe('engine invite tokens', () => {
  it('round-trips a signed invite', () => {
    const token = signEngineInvite({
      secret,
      jti: 'abc123',
      ttlSec: 3600,
      nowSec: 1_700_000_000,
    });
    expect(token.startsWith(`${ENGINE_INVITE_PREFIX}.`)).toBe(true);
    expect(verifyEngineInvite(token, secret, 1_700_000_000)).toEqual({
      jti: 'abc123',
      exp: 1_700_000_000 + 3600,
    });
  });

  it('rejects a bad signature, missing secret, and an expired token', () => {
    const token = signEngineInvite({
      secret,
      jti: 'x',
      ttlSec: 10,
      nowSec: 100,
    });
    expect(verifyEngineInvite(token, 'other', 100)).toBeNull();
    expect(verifyEngineInvite(`${token}x`, secret, 100)).toBeNull();
    expect(verifyEngineInvite(token, secret, 120)).toBeNull();
    expect(verifyEngineInvite(token, '', 100)).toBeNull();
    expect(verifyEngineInvite('', secret, 100)).toBeNull();
  });

  it('always uses a 24-hour ttl', () => {
    expect(ENGINE_INVITE_TTL_SEC).toBe(24 * 60 * 60);
    expect(ttlSecForInviteId('1h')).toBe(24 * 60 * 60);
    expect(ttlSecForInviteId('bogus')).toBe(24 * 60 * 60);
  });

  it('parses stored invites and reports status', () => {
    const rows = parseStoredEngineInvites(
      JSON.stringify([
        {
          id: 'a',
          token: 'ke1.x.y',
          url: 'https://kilrun.vercel.app/engine?invite=x',
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-01-02T00:00:00.000Z',
          createdBy: 'admin',
          revokedAt: null,
        },
      ])
    );
    expect(rows).toHaveLength(1);
    expect(storedInviteStatus(rows[0], Date.parse('2026-01-01T12:00:00.000Z'))).toBe('active');
    expect(storedInviteStatus(rows[0], Date.parse('2026-01-03T00:00:00.000Z'))).toBe('expired');
    expect(
      storedInviteStatus({ ...rows[0], revokedAt: '2026-01-01T06:00:00.000Z' }, Date.parse('2026-01-01T12:00:00.000Z'))
    ).toBe('revoked');
  });
});
