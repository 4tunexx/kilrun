import { weaponSfxFamily } from '@shared/sound-events';
import { playSound, playSoundOrFallback } from './soundboard';

type SfxOpts = { volume?: number };

export function playWeaponFireSfx(
  weaponId: string | null | undefined,
  kind: string,
  opts?: SfxOpts
): void {
  if (kind === 'melee') {
    playSound('melee_punch', opts);
    return;
  }
  const family = weaponSfxFamily(weaponId);
  playSoundOrFallback(family ? `weapon_fire_${family}` : 'weapon_fire', 'weapon_fire', opts);
  if (family === 'sniper') playSound('weapon_sniper_drop', opts);
}

export function playWeaponReloadSfx(weaponId: string | null | undefined, opts?: SfxOpts): void {
  const family = weaponSfxFamily(weaponId);
  playSoundOrFallback(family ? `weapon_reload_${family}` : 'weapon_reload', 'weapon_reload', opts);
  playSound('weapon_insert_mag', opts);
}

export function playFootstepSfx(surface?: string | null, opts?: SfxOpts): void {
  if (surface === 'water') {
    playSoundOrFallback('footstep_water', 'footstep', opts);
    return;
  }
  if (surface === 'ice') {
    playSoundOrFallback('footstep_ice', 'footstep', opts);
    return;
  }
  if (surface === 'sand') {
    playSoundOrFallback('footstep_sand', 'footstep', opts);
    return;
  }
  playSound('footstep', opts);
}

/** Pack has no dedicated jump/crouch/slide/wall-jump clips — reuse close events. */
export function playMoveSfx(
  eventKey: 'jump' | 'wall_jump' | 'crouch' | 'slide',
  opts?: SfxOpts
): void {
  const fallback =
    eventKey === 'crouch' ? 'footstep' : eventKey === 'slide' ? 'sprint_burst' : 'double_jump';
  playSoundOrFallback(eventKey, fallback, opts);
}

export function playTrapHitSfx(hazard: { kind?: string; instantKill?: boolean }): void {
  if (hazard.instantKill || hazard.kind === 'crusher') {
    playSoundOrFallback('trap_crush', 'trap_trigger');
    return;
  }
  if (hazard.kind === 'saw' || hazard.kind === 'spike' || hazard.kind === 'laser') {
    playSoundOrFallback('trap_cut', 'trap_trigger');
    return;
  }
  playSoundOrFallback('trap_small', 'trap_trigger');
}

export function supportPadKind(
  pads: Array<{ id?: string; entityId?: string; kind?: string }>,
  supportPadId: string | null
): string | undefined {
  if (!supportPadId) return undefined;
  return pads.find((p) => p.id === supportPadId || p.entityId === supportPadId)?.kind;
}
