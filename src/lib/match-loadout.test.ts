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

<<<<<<< HEAD
  it('replaces data-URL textures with the shared pack atlas for sync (data: URLs cannot go over the network)', () => {
=======
  it('strips data-URL textures from sync payload', () => {
>>>>>>> origin/main
    const hat = {
      ...defaultAttachment('hat'),
      textureUrl: 'data:image/png;base64,AAAA',
    };
    const { equippedSkinsJson } = packMatchLoadout([hat]);
    const parsed = parseEquippedSkinsJson(equippedSkinsJson);
<<<<<<< HEAD
    expect(parsed[0]?.textureUrl).toBe('/game/skins/Textures.png');
    expect(parsed[0]?.textureUrl?.startsWith('data:')).toBe(false);
=======
    // Data URLs are replaced with shared pack atlas fallback to ensure matches render textured skins
    expect(parsed[0]?.textureUrl).toBe('/game/skins/Textures.png');
>>>>>>> origin/main
  });
});
