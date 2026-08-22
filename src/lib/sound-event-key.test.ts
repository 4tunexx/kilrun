import { describe, expect, it } from 'vitest';
import { SOUND_EVENTS, getSoundEventDef, weaponSfxFamily } from '@shared/sound-events';
import {
  DEFAULT_SOUND_BINDINGS,
  packFilenameToBundled,
  applyPackDefaults,
} from '@shared/default-sound-pack';
import { isWritableSoundEventKey } from '@/lib/sound-event-key';

describe('isWritableSoundEventKey', () => {
  it('allows catalog keys and custom_move_ keys', () => {
    expect(isWritableSoundEventKey(SOUND_EVENTS[0].key)).toBe(true);
    expect(isWritableSoundEventKey('custom_move_slidekick')).toBe(true);
    expect(isWritableSoundEventKey('not_a_real_event')).toBe(false);
  });

  it('allows new pack event keys', () => {
    expect(isWritableSoundEventKey('ui_hover')).toBe(true);
    expect(isWritableSoundEventKey('music_menu')).toBe(true);
    expect(isWritableSoundEventKey('weapon_fire_pistol')).toBe(true);
    expect(isWritableSoundEventKey('footstep_water')).toBe(true);
    expect(isWritableSoundEventKey('footstep_ice')).toBe(true);
    expect(isWritableSoundEventKey('footstep_sand')).toBe(true);
  });
});

describe('SOUND_EVENTS catalog', () => {
  it('has unique keys', () => {
    const keys = SOUND_EVENTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('default sound pack', () => {
  it('maps every binding to a catalog event', () => {
    for (const row of DEFAULT_SOUND_BINDINGS) {
      expect(getSoundEventDef(row.eventKey), row.eventKey).not.toBeNull();
      expect(isWritableSoundEventKey(row.eventKey)).toBe(true);
    }
  });

  it('uses kebab mp3 filenames with no .import', () => {
    for (const row of DEFAULT_SOUND_BINDINGS) {
      expect(row.file).toMatch(/^[a-z0-9-]+\.mp3$/);
      expect(row.file).not.toContain('.import');
      expect(row.fileName.toLowerCase()).not.toContain('.import');
    }
  });

  it('kebab-converts Title-Case and trailing-dot Godot names', () => {
    expect(packFilenameToBundled('Sniper-rifle-single-shot.mp3')).toBe(
      'sniper-rifle-single-shot.mp3'
    );
    expect(packFilenameToBundled('lazers-anything-kill-player-anythingelse..mp3')).toBe(
      'lazers-anything-kill-player-anythingelse.mp3'
    );
    expect(packFilenameToBundled('30-sec-afk.mp3')).toBe('30-sec-afk.mp3');
  });

  it('references every bundled filename at least once', () => {
    const files = new Set(DEFAULT_SOUND_BINDINGS.map((r) => r.file));
    expect(files.size).toBe(48);
  });

  it('fills missing board rows from the pack without overwriting', () => {
    const merged = applyPackDefaults([
      { eventKey: 'land', fileUrl: '/uploads/sounds/custom-land.mp3', fileName: 'mine.mp3', volume: 0.2 },
    ]);
    const land = merged.find((r) => r.eventKey === 'land');
    const click = merged.find((r) => r.eventKey === 'ui_click');
    expect(land?.fileUrl).toBe('/uploads/sounds/custom-land.mp3');
    expect(land?.volume).toBe(0.2);
    expect(click?.fileUrl).toBe('/game/sounds/press-menu.mp3');
    expect(merged.length).toBe(DEFAULT_SOUND_BINDINGS.length);
  });
});

describe('weaponSfxFamily', () => {
  it('maps catalog ids to families', () => {
    expect(weaponSfxFamily('pistol_001')).toBe('pistol');
    expect(weaponSfxFamily('rifle_001')).toBe('rifle');
    expect(weaponSfxFamily('shotgun_001')).toBe('shotgun');
    expect(weaponSfxFamily('sniper_rifle_001')).toBe('sniper');
    expect(weaponSfxFamily('knife_001')).toBe('knife');
    expect(weaponSfxFamily('axe_001')).toBeNull();
  });
});
