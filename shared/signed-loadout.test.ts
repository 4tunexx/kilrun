import { describe, expect, it } from 'vitest';
import { signLoadoutToken, verifyLoadoutToken } from './signed-loadout';

describe('signed loadout', () => {
  const secret = 'test-loadout-secret';

  it('round-trips a DB loadout and rejects tampering', () => {
    const token = signLoadoutToken(
      {
        userId: 'u1',
        equippedSkinsJson: '[{"slot":"hat"}]',
        weaponCombat: { kind: 'melee', damage: 12 },
      },
      secret
    );
    const ok = verifyLoadoutToken(token, secret);
    expect(ok?.userId).toBe('u1');
    expect(ok?.equippedSkinsJson).toContain('hat');
    expect(verifyLoadoutToken(token.slice(0, -2) + 'xx', secret)).toBeNull();
    expect(verifyLoadoutToken(token, 'other')).toBeNull();
  });
});
