import { describe, expect, it } from 'vitest';
import { signEngineStaffToken, verifyEngineStaffToken } from './staff-token';

const secret = 'test-engine-secret';

describe('engine staff token', () => {
  it('round-trips a staff session', () => {
    const token = signEngineStaffToken({
      userId: '507f1f77bcf86cd799439011',
      steamId: '76561198001993310',
      secret,
      nowSec: 1_700_000_000,
    });
    expect(
      verifyEngineStaffToken(token, secret, 1_700_000_000)
    ).toEqual({
      userId: '507f1f77bcf86cd799439011',
      steamId: '76561198001993310',
      exp: 1_700_000_000 + 30 * 24 * 60 * 60,
    });
  });

  it('rejects a bad signature and an expired token', () => {
    const token = signEngineStaffToken({
      userId: 'u1',
      steamId: 's1',
      secret,
      ttlSec: 10,
      nowSec: 100,
    });
    expect(verifyEngineStaffToken(token, 'other-secret', 100)).toBeNull();
    expect(verifyEngineStaffToken(`${token}x`, secret, 100)).toBeNull();
    expect(verifyEngineStaffToken(token, secret, 120)).toBeNull();
  });
});
