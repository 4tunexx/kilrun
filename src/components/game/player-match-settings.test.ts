import { describe, expect, it } from 'vitest';
import { sanitizePlayerMatchSettings } from '@/components/game/player-match-settings';

describe('sanitizePlayerMatchSettings', () => {
  it('clamps volume and look sensitivity', () => {
    expect(sanitizePlayerMatchSettings({ masterVolume: 4, mouseSensMult: 9, bloom: false })).toEqual({
      bloom: false,
      masterVolume: 1,
      mouseSensMult: 2.5,
    });
    expect(sanitizePlayerMatchSettings({ masterVolume: -1, mouseSensMult: 0 }).mouseSensMult).toBe(0.25);
    expect(sanitizePlayerMatchSettings(null).bloom).toBe(true);
  });
});
