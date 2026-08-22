import { describe, expect, it } from 'vitest';
import {
  collectRemoteMonsterCues,
  collectRemotePlayerCues,
  volumeAtDistance,
  type RemoteAudioPlayer,
} from './spatial-sfx';

const origin = { x: 0, y: 0, z: 0 };

function player(partial: Partial<RemoteAudioPlayer> = {}): RemoteAudioPlayer {
  return {
    x: 1,
    y: 0,
    z: 0,
    vz: 0,
    health: 100,
    isAlive: true,
    isGrounded: true,
    isSprinting: false,
    isSliding: false,
    isFlipping: false,
    isCrouching: false,
    weaponId: 'pistol_001',
    weaponKind: 'hitscan',
    weaponMagSize: 12,
    ammoInMag: 12,
    reloadEndsAt: 0,
    ...partial,
  };
}

describe('volumeAtDistance', () => {
  it('is full nearby and silent past the far radius', () => {
    expect(volumeAtDistance(0)).toBe(1);
    expect(volumeAtDistance(6)).toBe(1);
    expect(volumeAtDistance(42)).toBe(0);
    expect(volumeAtDistance(80)).toBe(0);
    const mid = volumeAtDistance(24);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('collectRemotePlayerCues', () => {
  it('emits nothing on first sighting', () => {
    const { cues, next } = collectRemotePlayerCues(undefined, player({ ammoInMag: 5 }), origin, 1000);
    expect(cues).toEqual([]);
    expect(next.ammo).toBe(5);
  });

  it('treats an ammo drop as gunfire', () => {
    const first = collectRemotePlayerCues(undefined, player({ ammoInMag: 12 }), origin, 0);
    const { cues } = collectRemotePlayerCues(
      first.next,
      player({ ammoInMag: 10 }),
      origin,
      50
    );
    const fire = cues.find((c) => c.kind === 'fire');
    expect(fire?.count).toBe(2);
    expect(fire?.weaponId).toBe('pistol_001');
    expect(fire?.volume).toBe(1);
  });

  it('treats a rising attackSeq as melee / mag-less fire', () => {
    const melee = player({
      weaponId: 'knife_001',
      weaponKind: 'melee',
      weaponMagSize: 0,
      ammoInMag: 0,
      attackSeq: 2,
    });
    const first = collectRemotePlayerCues(undefined, melee, origin, 0);
    const { cues } = collectRemotePlayerCues(
      first.next,
      { ...melee, attackSeq: 3 },
      origin,
      50
    );
    const fire = cues.find((c) => c.kind === 'fire');
    expect(fire?.weaponKind).toBe('melee');
    expect(fire?.count).toBe(1);
  });

  it('does not treat a weapon swap ammo jump as gunfire', () => {
    const first = collectRemotePlayerCues(
      undefined,
      player({ weaponId: 'pistol_001', ammoInMag: 12 }),
      origin,
      0
    );
    const { cues } = collectRemotePlayerCues(
      first.next,
      player({ weaponId: 'shotgun_001', ammoInMag: 2, weaponMagSize: 8 }),
      origin,
      50
    );
    expect(cues.some((c) => c.kind === 'fire')).toBe(false);
  });

  it('plays reload on a rising reloadEndsAt', () => {
    const first = collectRemotePlayerCues(undefined, player(), origin, 1000);
    const { cues } = collectRemotePlayerCues(
      first.next,
      player({ reloadEndsAt: 2500, ammoInMag: 12 }),
      origin,
      1100
    );
    expect(cues.some((c) => c.kind === 'reload')).toBe(true);
  });

  it('stays silent when the remote is past the far radius', () => {
    const far = player({ x: 80, y: 0, ammoInMag: 12 });
    const first = collectRemotePlayerCues(undefined, far, origin, 0);
    const { cues } = collectRemotePlayerCues(
      first.next,
      { ...far, ammoInMag: 11 },
      origin,
      50
    );
    expect(cues).toEqual([]);
  });

  it('plays death instead of hit_taken when they drop', () => {
    const first = collectRemotePlayerCues(undefined, player({ health: 20 }), origin, 0);
    const { cues } = collectRemotePlayerCues(
      first.next,
      player({ health: 0, isAlive: false }),
      origin,
      50
    );
    expect(cues.map((c) => c.kind)).toEqual(['death']);
  });

  it('spaces footsteps by interval', () => {
    const a = collectRemotePlayerCues(undefined, player({ x: 1, y: 0 }), origin, 0);
    const tooSoon = collectRemotePlayerCues(
      a.next,
      player({ x: 1.3, y: 0 }),
      origin,
      100
    );
    expect(tooSoon.cues.some((c) => c.kind === 'footstep')).toBe(false);
    const later = collectRemotePlayerCues(
      tooSoon.next,
      player({ x: 1.6, y: 0 }),
      origin,
      500
    );
    expect(later.cues.some((c) => c.kind === 'footstep')).toBe(true);
  });
});

describe('collectRemoteMonsterCues', () => {
  it('plays a footstep after the monster moves', () => {
    const first = collectRemoteMonsterCues(undefined, { x: 2, y: 0, z: 0 }, origin, 0);
    expect(first.cues).toEqual([]);
    const moved = collectRemoteMonsterCues(first.next, { x: 2.4, y: 0, z: 0 }, origin, 400);
    expect(moved.cues.some((c) => c.kind === 'monster_footstep')).toBe(true);
    const flyFirst = collectRemoteMonsterCues(
      undefined,
      { x: 2, y: 0, z: 1, displayName: 'Wasp' },
      origin,
      0
    );
    const flyMoved = collectRemoteMonsterCues(
      flyFirst.next,
      { x: 2.4, y: 0, z: 1, displayName: 'Wasp' },
      origin,
      400
    );
    expect(flyMoved.cues.some((c) => c.kind === 'monster_fly')).toBe(true);
  });
});
