/**
 * Generic (server- and client-safe) activation logic for the 7 built-in
 * timed_buff/burst_effect powers (visibility, fly, hook, berserk, bullet,
 * thunder, backflip-dash). Framework-agnostic: operates on the `AbilityHost`
 * shape below, which the Colyseus `PlayerState` schema class satisfies
 * structurally (server/src/sim/active-abilities.ts re-exports this for that
 * use), and which Play Test's local sim also builds a plain object for —
 * so live matches and Play Test share the exact same activation/cooldown/
 * effect code instead of two copies that can drift apart.
 */
import {
  getTimedBuffStatsByKey,
  getBurstEffectStatsByKey,
  getEnergyCostForAbility,
  getCooldownForAbility,
  getAbilitySlotKind,
  type AbilitySlotKind,
} from './power-definitions.js';
import { resolveSolidPads, type CorePad } from './sim-core.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from './sim-constants.js';

export type ActiveAbilityKey =
  | 'visibility'
  | 'fly'
  | 'hook'
  | 'berserk'
  | 'bullet'
  | 'thunder'
  | 'backflip';

export interface AbilityHostState {
  visibilityEndsAt: number;
  flyEndsAt: number;
  hookEndsAt: number;
  berserkEndsAt: number;
  bulletEndsAt: number;
  thunderEndsAt: number;
  backflipEndsAt: number;
  visibilityCooldownEndsAt: number;
  flyCooldownEndsAt: number;
  hookCooldownEndsAt: number;
  berserkCooldownEndsAt: number;
  bulletCooldownEndsAt: number;
  thunderCooldownEndsAt: number;
  backflipCooldownEndsAt: number;
}

export interface AbilityHost {
  isAlive: boolean;
  hasFinished: boolean;
  energy: number;
  x: number;
  y: number;
  z: number;
  vz: number;
  aimAngle: number;
  isInvisible: boolean;
  ability: AbilityHostState;
}

const TELEPORT_SWEEP_STEP = 0.25;

/**
 * Clamp a straight-line teleport (Hook pull, backflip dash) to the furthest
 * point along the path that isn't inside solid geometry, so these abilities
 * can never pass clean through a wall. Walks the path in small steps rather
 * than a true raycast — cheap, reuses the same `resolveSolidPads` collision
 * surface every other movement in the sim already trusts, and this only
 * runs once per activation, not per tick.
 */
function clampTeleportToSolids(
  fromX: number,
  fromY: number,
  z: number,
  toX: number,
  toY: number,
  pads: Iterable<CorePad> | undefined
): { x: number; y: number } {
  if (!pads) return { x: toX, y: toY };
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: toX, y: toY };
  const steps = Math.max(1, Math.ceil(dist / TELEPORT_SWEEP_STEP));
  let safeX = fromX;
  let safeY = fromY;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = fromX + dx * t;
    const y = fromY + dy * t;
    const resolved = resolveSolidPads({ x, y, z }, pads, PLAYER_RADIUS, PLAYER_HEIGHT, false);
    if (resolved.touchingWall) break;
    safeX = x;
    safeY = y;
  }
  return { x: safeX, y: safeY };
}

export function defaultAbilityHostState(): AbilityHostState {
  return {
    visibilityEndsAt: 0,
    flyEndsAt: 0,
    hookEndsAt: 0,
    berserkEndsAt: 0,
    bulletEndsAt: 0,
    thunderEndsAt: 0,
    backflipEndsAt: 0,
    visibilityCooldownEndsAt: 0,
    flyCooldownEndsAt: 0,
    hookCooldownEndsAt: 0,
    berserkCooldownEndsAt: 0,
    bulletCooldownEndsAt: 0,
    thunderCooldownEndsAt: 0,
    backflipCooldownEndsAt: 0,
  };
}

function getSlotCooldownEndsAt(host: AbilityHost, slot: AbilitySlotKind): number {
  switch (slot) {
    case 'visibility':
      return host.ability.visibilityCooldownEndsAt;
    case 'fly':
      return host.ability.flyCooldownEndsAt;
    case 'berserk':
      return host.ability.berserkCooldownEndsAt;
    case 'bullet':
      return host.ability.bulletCooldownEndsAt;
    case 'hook':
      return host.ability.hookCooldownEndsAt;
    case 'backflip':
      return host.ability.backflipCooldownEndsAt;
    case 'thunder':
      return host.ability.thunderCooldownEndsAt;
    default:
      return 0;
  }
}

function setSlotCooldownEndsAt(host: AbilityHost, slot: AbilitySlotKind, endsAt: number): void {
  switch (slot) {
    case 'visibility':
      host.ability.visibilityCooldownEndsAt = endsAt;
      break;
    case 'fly':
      host.ability.flyCooldownEndsAt = endsAt;
      break;
    case 'berserk':
      host.ability.berserkCooldownEndsAt = endsAt;
      break;
    case 'bullet':
      host.ability.bulletCooldownEndsAt = endsAt;
      break;
    case 'hook':
      host.ability.hookCooldownEndsAt = endsAt;
      break;
    case 'backflip':
      host.ability.backflipCooldownEndsAt = endsAt;
      break;
    case 'thunder':
      host.ability.thunderCooldownEndsAt = endsAt;
      break;
  }
}

/**
 * Generic activation: dispatches on the power's EFFECT TEMPLATE (timed_buff
 * buffKind / burst_effect kind), not the literal ability key — a custom
 * power reusing one of these templates activates for real, same as the
 * original 6 (+ backflip dash).
 */
export function activateAbility(
  host: AbilityHost,
  abilityKey: string | null | undefined,
  now: number,
  levels: Record<string, number>,
  pads?: Iterable<CorePad>
): boolean {
  if (!host.isAlive || host.hasFinished) return false;
  if (!abilityKey) return false;

  const level = levels[abilityKey] ?? 0;
  if (level <= 0) return false;

  const slot = getAbilitySlotKind(abilityKey);
  if (slot && getSlotCooldownEndsAt(host, slot) > now) return false;

  const energyCost = getEnergyCostForAbility(abilityKey);
  if (energyCost > 0 && host.energy < energyCost) return false;

  const applied = applyAbilityEffect(host, abilityKey, level, now, pads);
  if (!applied) return false;

  if (energyCost > 0) {
    host.energy = Math.max(0, host.energy - energyCost);
  }
  if (slot) {
    const cooldownMs = getCooldownForAbility(abilityKey);
    if (cooldownMs > 0) setSlotCooldownEndsAt(host, slot, now + cooldownMs);
  }
  return true;
}

function applyAbilityEffect(
  host: AbilityHost,
  abilityKey: string,
  level: number,
  now: number,
  pads?: Iterable<CorePad>
): boolean {
  const timedBuff = getTimedBuffStatsByKey(abilityKey, level);
  if (timedBuff.buffKind) {
    if (!timedBuff.durationMs) return false;
    switch (timedBuff.buffKind) {
      case 'invisibility':
        host.ability.visibilityEndsAt = now + timedBuff.durationMs;
        host.isInvisible = true;
        return true;
      case 'fly':
        host.ability.flyEndsAt = now + timedBuff.durationMs;
        return true;
      case 'berserk':
        host.ability.berserkEndsAt = now + timedBuff.durationMs;
        return true;
      case 'unlimited_ammo':
        host.ability.bulletEndsAt = now + timedBuff.durationMs;
        return true;
      default:
        return false;
    }
  }

  const burst = getBurstEffectStatsByKey(abilityKey, level);
  if (burst.kind === 'range_pull') {
    if (!burst.rangeMeters || !burst.pullDurationMs) return false;
    host.ability.hookEndsAt = now + burst.pullDurationMs;
    const targetX = host.x + Math.cos(host.aimAngle || 0) * burst.rangeMeters;
    const targetY = host.y + Math.sin(host.aimAngle || 0) * burst.rangeMeters;
    const safe = clampTeleportToSolids(host.x, host.y, host.z, targetX, targetY, pads);
    host.x = safe.x;
    host.y = safe.y;
    host.vz = Math.max(host.vz, 0.35);
    return true;
  }
  if (burst.kind === 'range_dash') {
    if (!burst.rangeMeters || !burst.pullDurationMs) return false;
    host.ability.backflipEndsAt = now + burst.pullDurationMs;
    const targetX = host.x - Math.cos(host.aimAngle || 0) * burst.rangeMeters;
    const targetY = host.y - Math.sin(host.aimAngle || 0) * burst.rangeMeters;
    const safe = clampTeleportToSolids(host.x, host.y, host.z, targetX, targetY, pads);
    host.x = safe.x;
    host.y = safe.y;
    host.vz = Math.max(host.vz, 0.5);
    return true;
  }
  if (burst.kind === 'radius_damage') {
    if (!burst.radiusMeters || !burst.damage) return false;
    host.ability.thunderEndsAt = now + 250;
    return true;
  }

  return false;
}

export function tickActiveAbilityTimers(host: AbilityHost, now: number): void {
  const a = host.ability;
  if (a.visibilityEndsAt > 0 && now >= a.visibilityEndsAt) {
    a.visibilityEndsAt = 0;
    host.isInvisible = false;
  }
  if (a.flyEndsAt > 0 && now >= a.flyEndsAt) a.flyEndsAt = 0;
  if (a.hookEndsAt > 0 && now >= a.hookEndsAt) a.hookEndsAt = 0;
  if (a.berserkEndsAt > 0 && now >= a.berserkEndsAt) a.berserkEndsAt = 0;
  if (a.bulletEndsAt > 0 && now >= a.bulletEndsAt) a.bulletEndsAt = 0;
  if (a.thunderEndsAt > 0 && now >= a.thunderEndsAt) a.thunderEndsAt = 0;
  if (a.backflipEndsAt > 0 && now >= a.backflipEndsAt) a.backflipEndsAt = 0;
  if (a.visibilityCooldownEndsAt > 0 && now >= a.visibilityCooldownEndsAt) a.visibilityCooldownEndsAt = 0;
  if (a.flyCooldownEndsAt > 0 && now >= a.flyCooldownEndsAt) a.flyCooldownEndsAt = 0;
  if (a.hookCooldownEndsAt > 0 && now >= a.hookCooldownEndsAt) a.hookCooldownEndsAt = 0;
  if (a.berserkCooldownEndsAt > 0 && now >= a.berserkCooldownEndsAt) a.berserkCooldownEndsAt = 0;
  if (a.bulletCooldownEndsAt > 0 && now >= a.bulletCooldownEndsAt) a.bulletCooldownEndsAt = 0;
  if (a.thunderCooldownEndsAt > 0 && now >= a.thunderCooldownEndsAt) a.thunderCooldownEndsAt = 0;
  if (a.backflipCooldownEndsAt > 0 && now >= a.backflipCooldownEndsAt) a.backflipCooldownEndsAt = 0;
}

export function isUnlimitedAmmoActive(host: AbilityHost, now: number): boolean {
  return host.ability.bulletEndsAt > 0 && now < host.ability.bulletEndsAt;
}

export function isBerserkActive(host: AbilityHost, now: number): boolean {
  return host.ability.berserkEndsAt > 0 && now < host.ability.berserkEndsAt;
}

export function isFlyActive(host: AbilityHost, now: number): boolean {
  return host.ability.flyEndsAt > 0 && now < host.ability.flyEndsAt;
}

export function isInvisibleActive(host: AbilityHost, now: number): boolean {
  return host.ability.visibilityEndsAt > 0 && now < host.ability.visibilityEndsAt;
}
