import { playSound } from './soundboard';
import { playFootstepSfx, playMoveSfx, playWeaponFireSfx, playWeaponReloadSfx } from './weapon-sfx';
import { monsterLocomotionSfx } from './impact-sfx';

export type SpatialListener = { x: number; y: number; z: number };

export type RemoteAudioPlayer = {
  x: number;
  y: number;
  z?: number;
  vz?: number;
  health: number;
  isAlive: boolean;
  isGrounded: boolean;
  isSprinting: boolean;
  isSliding: boolean;
  isFlipping: boolean;
  isCrouching?: boolean;
  weaponId?: string;
  weaponKind?: string;
  weaponMagSize?: number;
  ammoInMag?: number;
  reloadEndsAt?: number;
  attackSeq?: number;
};

export type RemoteSfxPrev = {
  ammo: number;
  reloadEndsAt: number;
  health: number;
  isAlive: boolean;
  x: number;
  y: number;
  z: number;
  vz: number;
  isGrounded: boolean;
  isSliding: boolean;
  isFlipping: boolean;
  isCrouching: boolean;
  isSprinting: boolean;
  lastFootAt: number;
  weaponId: string;
  attackSeq: number;
};

export type MonsterSfxPrev = {
  x: number;
  y: number;
  z: number;
  lastFootAt: number;
};

export type SpatialCueKind =
  | 'fire'
  | 'reload'
  | 'footstep'
  | 'slide'
  | 'flip'
  | 'crouch'
  | 'sprint'
  | 'jump'
  | 'land'
  | 'hit_taken'
  | 'death'
  | 'respawn'
  | 'pickup_health'
  | 'monster_footstep'
  | 'monster_fly';

export type SpatialCue = {
  kind: SpatialCueKind;
  volume: number;
  weaponId?: string;
  weaponKind?: string;
  count?: number;
};

const NEAR_UNITS = 6;
const FAR_UNITS = 42;

/** Quadratic falloff: full volume inside `near`, silent past `far`. */
export function volumeAtDistance(dist: number, near = NEAR_UNITS, far = FAR_UNITS): number {
  if (!Number.isFinite(dist) || dist <= near) return 1;
  if (dist >= far) return 0;
  const t = (dist - near) / (far - near);
  return (1 - t) * (1 - t);
}

export function distanceToListener(
  listener: SpatialListener,
  x: number,
  y: number,
  z = 0
): number {
  return Math.hypot(listener.x - x, listener.y - y, listener.z - z);
}

function snapshotPlayer(player: RemoteAudioPlayer, lastFootAt = 0): RemoteSfxPrev {
  return {
    ammo: player.ammoInMag ?? 0,
    reloadEndsAt: player.reloadEndsAt ?? 0,
    health: player.health,
    isAlive: player.isAlive,
    x: player.x,
    y: player.y,
    z: player.z ?? 0,
    vz: player.vz ?? 0,
    isGrounded: player.isGrounded,
    isSliding: player.isSliding,
    isFlipping: player.isFlipping,
    isCrouching: Boolean(player.isCrouching),
    isSprinting: player.isSprinting,
    lastFootAt,
    weaponId: player.weaponId ?? '',
    attackSeq: player.attackSeq ?? 0,
  };
}

/**
 * Diff one remote player's snapshot against the last tick. First sighting
 * only stores state so join/spawn doesn't dump a burst of footsteps.
 */
export function collectRemotePlayerCues(
  prev: RemoteSfxPrev | undefined,
  player: RemoteAudioPlayer,
  listener: SpatialListener,
  now: number
): { cues: SpatialCue[]; next: RemoteSfxPrev } {
  if (!prev) {
    return { cues: [], next: snapshotPlayer(player) };
  }

  const volume = volumeAtDistance(
    distanceToListener(listener, player.x, player.y, player.z ?? 0)
  );
  const cues: SpatialCue[] = [];
  const push = (cue: SpatialCue) => {
    if (cue.volume > 0.001) cues.push(cue);
  };

  const magSize = player.weaponMagSize ?? 0;
  const ammo = player.ammoInMag ?? 0;
  const weaponId = player.weaponId ?? '';
  const attackSeq = player.attackSeq ?? 0;
  if (player.isAlive && magSize > 0 && weaponId === prev.weaponId) {
    const dropped = prev.ammo - ammo;
    if (dropped > 0) {
      push({
        kind: 'fire',
        volume,
        weaponId: player.weaponId,
        weaponKind: player.weaponKind,
        count: Math.min(dropped, 3),
      });
    }
  } else if (player.isAlive && attackSeq > prev.attackSeq) {
    push({
      kind: 'fire',
      volume,
      weaponId: player.weaponId,
      weaponKind: player.weaponKind,
      count: Math.min(attackSeq - prev.attackSeq, 3),
    });
  }

  const reloadEndsAt = player.reloadEndsAt ?? 0;
  if (reloadEndsAt > prev.reloadEndsAt && reloadEndsAt > now) {
    push({ kind: 'reload', volume, weaponId: player.weaponId });
  }

  if (prev.isAlive && !player.isAlive) {
    push({ kind: 'death', volume });
  } else if (!prev.isAlive && player.isAlive) {
    push({ kind: 'respawn', volume });
  } else if (prev.isAlive && player.isAlive && player.health < prev.health) {
    push({ kind: 'hit_taken', volume });
  } else if (
    prev.isAlive &&
    player.isAlive &&
    player.health > prev.health &&
    prev.health > 0
  ) {
    push({ kind: 'pickup_health', volume });
  }

  if (player.isSliding && !prev.isSliding) push({ kind: 'slide', volume });
  if (player.isFlipping && !prev.isFlipping) push({ kind: 'flip', volume });
  if (Boolean(player.isCrouching) && !prev.isCrouching) push({ kind: 'crouch', volume });
  if (player.isSprinting && !prev.isSprinting && player.isGrounded) {
    push({ kind: 'sprint', volume });
  }

  if (prev.isGrounded && !player.isGrounded && (player.vz ?? 0) > 0.5) {
    push({ kind: 'jump', volume });
  } else if (!prev.isGrounded && player.isGrounded) {
    push({ kind: 'land', volume });
  }

  let lastFootAt = prev.lastFootAt;
  if (player.isAlive && player.isGrounded) {
    const horiz = Math.hypot(player.x - prev.x, player.y - prev.y);
    const interval = player.isSprinting ? 280 : 420;
    if (horiz > 0.08 && now - lastFootAt > interval) {
      lastFootAt = now;
      push({ kind: 'footstep', volume });
    }
  }

  return { cues, next: snapshotPlayer(player, lastFootAt) };
}

export function collectRemoteMonsterCues(
  prev: MonsterSfxPrev | undefined,
  monster: { x: number; y: number; z?: number; modelUrl?: string; displayName?: string; modelId?: string },
  listener: SpatialListener,
  now: number
): { cues: SpatialCue[]; next: MonsterSfxPrev } {
  const z = monster.z ?? 0;
  if (!prev) {
    return { cues: [], next: { x: monster.x, y: monster.y, z, lastFootAt: 0 } };
  }
  const volume = volumeAtDistance(distanceToListener(listener, monster.x, monster.y, z));
  const horiz = Math.hypot(monster.x - prev.x, monster.y - prev.y);
  let lastFootAt = prev.lastFootAt;
  const cues: SpatialCue[] = [];
  const kind = monsterLocomotionSfx(
    `${monster.modelUrl ?? ''} ${monster.displayName ?? ''} ${monster.modelId ?? ''}`
  );
  const interval = kind === 'monster_fly' ? 280 : 380;
  if (horiz > 0.12 && now - lastFootAt > interval) {
    lastFootAt = now;
    if (volume > 0.001) cues.push({ kind, volume });
  }
  return { cues, next: { x: monster.x, y: monster.y, z, lastFootAt } };
}

export function playSpatialCues(cues: SpatialCue[]): void {
  for (const cue of cues) {
    const opts = { volume: cue.volume };
    switch (cue.kind) {
      case 'fire': {
        const n = Math.max(1, cue.count ?? 1);
        for (let i = 0; i < n; i++) {
          playWeaponFireSfx(cue.weaponId, cue.weaponKind ?? 'hitscan', opts);
        }
        break;
      }
      case 'reload':
        playWeaponReloadSfx(cue.weaponId, opts);
        break;
      case 'footstep':
        playFootstepSfx(undefined, opts);
        break;
      case 'slide':
        playMoveSfx('slide', opts);
        break;
      case 'flip':
        playSound('flip', opts);
        break;
      case 'crouch':
        playMoveSfx('crouch', opts);
        break;
      case 'sprint':
        playSound('sprint_burst', opts);
        break;
      case 'jump':
        playMoveSfx('jump', opts);
        break;
      case 'land':
        playSound('land', opts);
        break;
      case 'hit_taken':
        playSound('hit_taken', opts);
        break;
      case 'death':
        playSound('player_death', opts);
        break;
      case 'respawn':
        playSound('respawn', opts);
        break;
      case 'pickup_health':
        playSound('pickup_health', opts);
        break;
      case 'monster_footstep':
        playSound('monster_footstep', opts);
        break;
      case 'monster_fly':
        playSound('monster_fly', opts);
        break;
    }
  }
}
