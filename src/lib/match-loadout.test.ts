import { describe, expect, it } from 'vitest';
import { packMatchLoadout, parseEquippedSkinsJson } from './match-loadout';
import { defaultAttachment } from './player-skins';

describe('match-loadout', () => {
  it('packs skins and weapon combat for join options', () => {
    const hat = defaultAttachment('hat');
    const weapon = defaultAttachment('weapon');
    const { equippedSkinsJson, weaponCombat } = packMatchLoadout([hat, weapon]);
    expect(parseEquippedSkinsJson(equippedSkinsJson)).toHaveLength(2);
    expect(weaponCombat.kind).toBe('melee');
    expect(weaponCombat.range).toBeGreaterThan(0);
  });

  it('strips data-URL textures from sync payload', () => {
    const hat = {
      ...defaultAttachment('hat'),
      textureUrl: 'data:image/png;base64,AAAA',
    };
    const { equippedSkinsJson } = packMatchLoadout([hat]);
    const parsed = parseEquippedSkinsJson(equippedSkinsJson);
    expect(parsed[0]?.textureUrl).toBeUndefined();
  });
});
