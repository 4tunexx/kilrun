/**
 * Data-driven "Powers" definitions — the persisted, editable replacement for
 * the old hardcoded `ABILITY_DEFINITIONS` object in `ability-progression.ts`.
 *
 * Design: a power's *numbers* (cost curve, effect magnitude) are always
 * data (JSON-safe), never a function, so they can be stored in Mongo via the
 * Prisma `PowerDefinition` model and edited from the in-app Power Editor.
 * A small set of generic "effect templates" (see `PowerEffectType`) cover
 * every gameplay mechanic that already has a real server-side implementation:
 *
 *   - stat_bonus    passive always-on stat modifier (health/speed/jump/...)
 *   - timed_buff    press-to-activate; wraps an EXISTING buff mechanic
 *                   (invisibility / fly / berserk / unlimited_ammo) with new
 *                   duration numbers — a genuine reskin, not a new mechanic.
 *   - burst_effect  press-to-activate instant effect; wraps an EXISTING
 *                   mechanic — thunder's radius+damage pulse, or hook's
 *                   range+pull — with new numbers.
 *
 * This module is imported by BOTH the Next.js app (client + server) and the
 * Colyseus game server, so it must stay dependency-free (no Prisma, no
 * Next.js APIs, no `fetch`) — pure data + pure functions only. Whoever DOES
 * have access to the persisted rows (Next.js API routes, the Colyseus boot
 * sequence) calls `applyDynamicPowerDefinitions()` to hot-swap the active
 * list; everyone else just calls the getters below, which always fall back
 * to `STATIC_FALLBACK_POWERS` (the original 12 hardcoded balance numbers)
 * if nothing dynamic has been loaded yet.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PowerEffectType = 'stat_bonus' | 'timed_buff' | 'burst_effect';

/** Persisted cost-per-level curve — replaces the old `costForLevel` closure. */
export type CostFormula =
  | { type: 'flat'; base: number }
  | { type: 'ramp'; base: number; step: number };

export type StatBonusStat =
  | 'maxHealth'
  | 'speed'
  | 'jump'
  | 'maxEnergy'
  | 'punchDamage'
  /** New generic stats — schema/editor support them, but see the report:
   * NOT yet consumed by the sim (no PlayerState field / reload or fall
   * damage logic reads them). Safe to configure, cosmetically inert. */
  | 'reloadSpeed'
  | 'fallDamageReduction';

export interface StatBonusEntry {
  stat: StatBonusStat;
  /** additive: level * perLevel added to a flat pool. multiplicative: 1 + level * perLevel. */
  mode: 'additive' | 'multiplicative';
  perLevel: number;
}

export interface StatBonusParams {
  bonuses: StatBonusEntry[];
}

export type TimedBuffKind = 'invisibility' | 'fly' | 'berserk' | 'unlimited_ammo';

export interface TimedBuffParams {
  buffKind: TimedBuffKind;
  /** Duration in seconds at level 0 (usually unused; level>0 required to activate). */
  durationBaseSec: number;
  durationPerLevelSec: number;
  /** Optional cooldown in ms between activations (0 = no explicit cooldown tracked). */
  cooldownMs?: number;
  /** Energy consumed from the shared sprint/jump energy pool on activation
   * (0/undefined = free). Activation is blocked if the player has less. */
  energyCost?: number;
}

export type BurstEffectKind = 'radius_damage' | 'range_pull' | 'range_dash';

export interface BurstEffectParams {
  kind: BurstEffectKind;
  // radius_damage (thunder-style)
  radiusBaseMeters?: number;
  radiusPerLevelMeters?: number;
  damageBase?: number;
  damagePerLevel?: number;
  // range_pull (hook-style) / range_dash (backflip-style — same numbers,
  // pushes away from aim instead of toward it)
  rangeBaseMeters?: number;
  rangePerLevelMeters?: number;
  pullDurationBaseSec?: number;
  pullDurationPerLevelSec?: number;
  /** Energy consumed from the shared sprint/jump energy pool on activation
   * (0/undefined = free). Activation is blocked if the player has less. */
  energyCost?: number;
  /** Cooldown in ms before this power can be activated again (0/undefined =
   * no cooldown). Drives the HUD's radial recharge ring. */
  cooldownMs?: number;
}

export type PowerEffectParams = StatBonusParams | TimedBuffParams | BurstEffectParams;

export interface PowerPrerequisite {
  key: string;
  level: number;
}

export interface PowerDefinitionRecord {
  key: string;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  /** Flat account-level gate (kept for backward compat with the old system). */
  unlockLevel: number;
  /** Skill-tree gate: this power cannot be leveled at all until every
   * listed prerequisite power is at least at the given level. */
  prerequisites: PowerPrerequisite[];
  cost: CostFormula;
  effectType: PowerEffectType;
  effectParams: PowerEffectParams;
  /** True for the original 12 — deletable=false, only tunable, in the editor. */
  isCore: boolean;
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// Pure interpreters (safe on client + server + Colyseus)
// ---------------------------------------------------------------------------

export function costForLevelFormula(formula: CostFormula, level: number): number {
  if (formula.type === 'flat') return Math.max(0, Math.round(formula.base));
  return Math.max(0, Math.round(formula.base + formula.step * Math.max(0, level)));
}

export function timedBuffDurationMs(params: TimedBuffParams, level: number): number {
  if (level <= 0) return 0;
  return Math.round((params.durationBaseSec + level * params.durationPerLevelSec) * 1000);
}

export function burstEffectStats(
  params: BurstEffectParams,
  level: number
): { radiusMeters: number; damage: number; rangeMeters: number; pullDurationMs: number } {
  if (level <= 0) {
    return { radiusMeters: 0, damage: 0, rangeMeters: 0, pullDurationMs: 0 };
  }
  if (params.kind === 'radius_damage') {
    return {
      radiusMeters: (params.radiusBaseMeters ?? 0) + level * (params.radiusPerLevelMeters ?? 0),
      damage: Math.round((params.damageBase ?? 0) + level * (params.damagePerLevel ?? 0)),
      rangeMeters: 0,
      pullDurationMs: 0,
    };
  }
  return {
    radiusMeters: 0,
    damage: 0,
    rangeMeters: (params.rangeBaseMeters ?? 0) + level * (params.rangePerLevelMeters ?? 0),
    pullDurationMs: Math.round(
      ((params.pullDurationBaseSec ?? 0) + level * (params.pullDurationPerLevelSec ?? 0)) * 1000
    ),
  };
}

/** Human-readable effect summary at a given level (0 = not unlocked yet). */
export function effectLabelGeneric(def: PowerDefinitionRecord, level: number): string {
  if (def.effectType === 'stat_bonus') {
    const params = def.effectParams as StatBonusParams;
    if (!params.bonuses?.length) return 'No effect configured';
    return params.bonuses
      .map((b) => {
        const amount = level * b.perLevel;
        if (b.mode === 'multiplicative') return `+${(amount * 100).toFixed(0)}% ${statLabel(b.stat)}`;
        return `+${amount.toFixed(b.stat === 'fallDamageReduction' ? 2 : 0)} ${statLabel(b.stat)}`;
      })
      .join(' · ');
  }
  if (def.effectType === 'timed_buff') {
    if (level <= 0) return 'Locked';
    const params = def.effectParams as TimedBuffParams;
    const ms = timedBuffDurationMs(params, level);
    const energySuffix = params.energyCost ? ` · ${params.energyCost} energy` : '';
    const cooldownSuffix = params.cooldownMs ? ` · ${(params.cooldownMs / 1000).toFixed(0)}s cooldown` : '';
    return `${(ms / 1000).toFixed(1)}s duration${energySuffix}${cooldownSuffix}`;
  }
  // burst_effect
  if (level <= 0) return 'Locked';
  const stats = burstEffectStats(def.effectParams as BurstEffectParams, level);
  const params = def.effectParams as BurstEffectParams;
  const energySuffix = params.energyCost ? ` · ${params.energyCost} energy` : '';
  const cooldownSuffix = params.cooldownMs ? ` · ${(params.cooldownMs / 1000).toFixed(0)}s cooldown` : '';
  if (params.kind === 'radius_damage') {
    return `${stats.radiusMeters.toFixed(1)}m radius · ${stats.damage} dmg${energySuffix}${cooldownSuffix}`;
  }
  return `${stats.rangeMeters.toFixed(1)}m range · ${(stats.pullDurationMs / 1000).toFixed(2)}s pull${energySuffix}${cooldownSuffix}`;
}

function statLabel(stat: StatBonusStat): string {
  switch (stat) {
    case 'maxHealth':
      return 'max HP';
    case 'speed':
      return 'move speed';
    case 'jump':
      return 'jump height';
    case 'maxEnergy':
      return 'max energy';
    case 'punchDamage':
      return 'punch damage';
    case 'reloadSpeed':
      return 'reload speed';
    case 'fallDamageReduction':
      return 'fall damage reduction';
    default:
      return stat;
  }
}

// ---------------------------------------------------------------------------
// The 12 original abilities, re-encoded losslessly in the new JSON shape.
// This is the safe static fallback used whenever nothing dynamic has been
// loaded (SSR without DB access, Colyseus boot race, DB unreachable, etc).
// Keys MUST stay exactly as they were so old `User.gameAbilities` JSON blobs
// (keyed by these strings) keep mapping correctly.
// ---------------------------------------------------------------------------

export const STATIC_FALLBACK_POWERS: PowerDefinitionRecord[] = [
  {
    key: 'health',
    name: 'Health',
    description: 'Increases maximum health.',
    icon: '❤️',
    maxLevel: 5,
    unlockLevel: 1,
    prerequisites: [],
    cost: { type: 'flat', base: 1 },
    effectType: 'stat_bonus',
    effectParams: { bonuses: [{ stat: 'maxHealth', mode: 'additive', perLevel: 10 }] },
    isCore: true,
    sortOrder: 0,
  },
  {
    key: 'energy',
    name: 'Energy',
    description: 'Increases maximum energy (sprint/abilities pool).',
    icon: '🔋',
    maxLevel: 5,
    unlockLevel: 1,
    prerequisites: [],
    cost: { type: 'flat', base: 1 },
    effectType: 'stat_bonus',
    effectParams: { bonuses: [{ stat: 'maxEnergy', mode: 'additive', perLevel: 10 }] },
    isCore: true,
    sortOrder: 1,
  },
  {
    key: 'speed',
    name: 'Speed',
    description: 'Increases movement speed.',
    icon: '⚡',
    maxLevel: 5,
    unlockLevel: 5,
    prerequisites: [],
    cost: { type: 'flat', base: 1 },
    effectType: 'stat_bonus',
    effectParams: { bonuses: [{ stat: 'speed', mode: 'multiplicative', perLevel: 0.04 }] },
    isCore: true,
    sortOrder: 2,
  },
  {
    key: 'visibility',
    name: 'Invisibility',
    description: 'Turn invisible to enemies for a short duration.',
    icon: '👻',
    maxLevel: 5,
    unlockLevel: 10,
    prerequisites: [],
    cost: { type: 'ramp', base: 1, step: 1 },
    effectType: 'timed_buff',
    effectParams: {
      buffKind: 'invisibility',
      durationBaseSec: 2,
      durationPerLevelSec: 0.8,
      energyCost: 20,
      cooldownMs: 12000,
    },
    isCore: true,
    sortOrder: 3,
  },
  {
    key: 'bullet',
    name: 'Unlimited Ammo',
    description: 'Fire without reloading or consuming ammo for a duration.',
    icon: '🔫',
    maxLevel: 5,
    unlockLevel: 20,
    prerequisites: [{ key: 'visibility', level: 3 }],
    cost: { type: 'ramp', base: 1, step: 1 },
    effectType: 'timed_buff',
    effectParams: {
      buffKind: 'unlimited_ammo',
      durationBaseSec: 3,
      durationPerLevelSec: 0.6,
      energyCost: 20,
      cooldownMs: 15000,
    },
    isCore: true,
    sortOrder: 4,
  },
  {
    key: 'jump',
    name: 'Jump',
    description: 'Increases jump height.',
    icon: '🦘',
    maxLevel: 5,
    unlockLevel: 25,
    prerequisites: [{ key: 'speed', level: 3 }],
    cost: { type: 'flat', base: 1 },
    effectType: 'stat_bonus',
    effectParams: { bonuses: [{ stat: 'jump', mode: 'multiplicative', perLevel: 0.05 }] },
    isCore: true,
    sortOrder: 5,
  },
  {
    key: 'punch',
    name: 'Punch Damage',
    description: 'Increases melee punch damage.',
    icon: '👊',
    maxLevel: 5,
    unlockLevel: 15,
    prerequisites: [],
    cost: { type: 'flat', base: 1 },
    effectType: 'stat_bonus',
    effectParams: { bonuses: [{ stat: 'punchDamage', mode: 'multiplicative', perLevel: 0.08 }] },
    isCore: true,
    sortOrder: 6,
  },
  {
    key: 'hook',
    name: 'Grapple Hook',
    description: 'Press H to fire a hook and pull yourself to a wall/object.',
    icon: '🪝',
    maxLevel: 5,
    unlockLevel: 30,
    prerequisites: [{ key: 'jump', level: 3 }],
    cost: { type: 'ramp', base: 1, step: 1 },
    effectType: 'burst_effect',
    effectParams: {
      kind: 'range_pull',
      rangeBaseMeters: 8,
      rangePerLevelMeters: 1.5,
      pullDurationBaseSec: 0.4,
      pullDurationPerLevelSec: 0.05,
      energyCost: 15,
      cooldownMs: 6000,
    },
    isCore: true,
    sortOrder: 7,
  },
  {
    key: 'fly',
    name: 'Fly',
    description: 'Take to the air for a short duration.',
    icon: '🕊️',
    maxLevel: 5,
    unlockLevel: 35,
    prerequisites: [{ key: 'hook', level: 3 }],
    cost: { type: 'ramp', base: 1, step: 1 },
    effectType: 'timed_buff',
    effectParams: {
      buffKind: 'fly',
      durationBaseSec: 1.5,
      durationPerLevelSec: 0.7,
      energyCost: 25,
      cooldownMs: 14000,
    },
    isCore: true,
    sortOrder: 8,
  },
  {
    key: 'berserk',
    name: 'Berserk',
    description: 'Grow huge, take no damage, and one-punch-KO enemies.',
    icon: '💢',
    maxLevel: 5,
    unlockLevel: 40,
    prerequisites: [{ key: 'punch', level: 5 }],
    cost: { type: 'ramp', base: 2, step: 1 },
    effectType: 'timed_buff',
    effectParams: {
      buffKind: 'berserk',
      durationBaseSec: 3,
      durationPerLevelSec: 0.6,
      energyCost: 30,
      cooldownMs: 20000,
    },
    isCore: true,
    sortOrder: 9,
  },
  {
    key: 'thunder',
    name: 'Thunder Bolt',
    description: 'Release a thunder bolt that damages nearby enemies.',
    icon: '⚡🌩️',
    maxLevel: 5,
    unlockLevel: 45,
    prerequisites: [{ key: 'berserk', level: 3 }],
    cost: { type: 'ramp', base: 2, step: 1 },
    effectType: 'burst_effect',
    effectParams: {
      kind: 'radius_damage',
      radiusBaseMeters: 3,
      radiusPerLevelMeters: 0.5,
      damageBase: 20,
      damagePerLevel: 8,
      energyCost: 25,
      cooldownMs: 10000,
    },
    isCore: true,
    sortOrder: 10,
  },
  {
    key: 'backflip',
    name: 'Backflip',
    description: 'Press Q to kick off an evasive backflip dash away from where you’re aiming.',
    icon: '\u{1F938}',
    maxLevel: 5,
    unlockLevel: 32,
    prerequisites: [{ key: 'jump', level: 3 }],
    cost: { type: 'ramp', base: 1, step: 1 },
    effectType: 'burst_effect',
    effectParams: {
      kind: 'range_dash',
      rangeBaseMeters: 5,
      rangePerLevelMeters: 0.6,
      pullDurationBaseSec: 0.25,
      pullDurationPerLevelSec: 0.02,
      energyCost: 15,
      cooldownMs: 5000,
    },
    isCore: true,
    sortOrder: 11,
  },
];

// ---------------------------------------------------------------------------
// Live "active" list — mutated in place by `applyDynamicPowerDefinitions()`.
// Kept as a module-level singleton so every existing call site that reads
// definitions synchronously (no async plumbing needed) automatically picks
// up dynamic data the moment it's loaded, with the static list as the
// always-available fallback.
// ---------------------------------------------------------------------------

let activeDefs: PowerDefinitionRecord[] = STATIC_FALLBACK_POWERS;

/** Replace the active power list (called after loading from Prisma / HTTP).
 * Always guarantees the original 12 core keys are present (falls back to the
 * static definition for any core key missing from `records`) so a bad or
 * partial dynamic payload can never brick core gameplay. */
export function applyDynamicPowerDefinitions(records: PowerDefinitionRecord[]): void {
  if (!Array.isArray(records) || records.length === 0) return;
  const byKey = new Map(records.map((r) => [r.key, r]));
  for (const fallback of STATIC_FALLBACK_POWERS) {
    if (!byKey.has(fallback.key)) byKey.set(fallback.key, fallback);
  }
  activeDefs = Array.from(byKey.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function resetToStaticPowerDefinitions(): void {
  activeDefs = STATIC_FALLBACK_POWERS;
}

export function getActivePowerDefinitions(): PowerDefinitionRecord[] {
  return activeDefs;
}

export function getPowerDefinitionByKey(key: string): PowerDefinitionRecord | null {
  return activeDefs.find((d) => d.key === key) ?? null;
}

// ---------------------------------------------------------------------------
// Generic gameplay getters — consumed by the sim. Signatures for the six
// legacy per-key functions are UNCHANGED so every existing call site in
// `server/src` keeps compiling and working with zero edits; they just read
// through the (possibly dynamic) active list instead of a hardcoded formula.
// ---------------------------------------------------------------------------

export interface GenericAbilityStatBonuses {
  maxHealthBonus: number;
  speedMultiplier: number;
  jumpMultiplier: number;
  maxEnergyBonus: number;
  punchDamageMultiplier: number;
  /** Configurable in the editor; not yet consumed by the sim (see report). */
  reloadSpeedMultiplier: number;
  fallDamageReduction: number;
}

export function computeAbilityStatBonuses(
  levels: Record<string, number>,
  defs: PowerDefinitionRecord[] = getActivePowerDefinitions()
): GenericAbilityStatBonuses {
  const out: GenericAbilityStatBonuses = {
    maxHealthBonus: 0,
    speedMultiplier: 1,
    jumpMultiplier: 1,
    maxEnergyBonus: 0,
    punchDamageMultiplier: 1,
    reloadSpeedMultiplier: 1,
    fallDamageReduction: 0,
  };
  for (const def of defs) {
    if (def.effectType !== 'stat_bonus') continue;
    const level = levels[def.key] ?? 0;
    if (level <= 0) continue;
    const params = def.effectParams as StatBonusParams;
    for (const bonus of params.bonuses ?? []) {
      const amount = level * bonus.perLevel;
      switch (bonus.stat) {
        case 'maxHealth':
          out.maxHealthBonus += amount;
          break;
        case 'maxEnergy':
          out.maxEnergyBonus += amount;
          break;
        case 'speed':
          out.speedMultiplier += bonus.mode === 'multiplicative' ? amount : amount / 100;
          break;
        case 'jump':
          out.jumpMultiplier += bonus.mode === 'multiplicative' ? amount : amount / 100;
          break;
        case 'punchDamage':
          out.punchDamageMultiplier += bonus.mode === 'multiplicative' ? amount : amount / 100;
          break;
        case 'reloadSpeed':
          out.reloadSpeedMultiplier += bonus.mode === 'multiplicative' ? amount : amount / 100;
          break;
        case 'fallDamageReduction':
          out.fallDamageReduction += bonus.mode === 'multiplicative' ? amount : amount / 100;
          break;
      }
    }
  }
  return out;
}

function findTimedBuffByKind(kind: TimedBuffKind): PowerDefinitionRecord | null {
  return (
    activeDefs.find((d) => d.effectType === 'timed_buff' && (d.effectParams as TimedBuffParams).buffKind === kind) ??
    null
  );
}

export function getVisibilityDurationMs(level: number): number {
  const def = getPowerDefinitionByKey('visibility') ?? findTimedBuffByKind('invisibility');
  if (!def) return 0;
  return timedBuffDurationMs(def.effectParams as TimedBuffParams, level);
}

export function getFlyDurationMs(level: number): number {
  const def = getPowerDefinitionByKey('fly') ?? findTimedBuffByKind('fly');
  if (!def) return 0;
  return timedBuffDurationMs(def.effectParams as TimedBuffParams, level);
}

export function getBerserkDurationMs(level: number): number {
  const def = getPowerDefinitionByKey('berserk') ?? findTimedBuffByKind('berserk');
  if (!def) return 0;
  return timedBuffDurationMs(def.effectParams as TimedBuffParams, level);
}

export function getUnlimitedAmmoDurationMs(level: number): number {
  const def = getPowerDefinitionByKey('bullet') ?? findTimedBuffByKind('unlimited_ammo');
  if (!def) return 0;
  return timedBuffDurationMs(def.effectParams as TimedBuffParams, level);
}

export function getHookStats(level: number): { rangeMeters: number; pullDurationMs: number } {
  const def = getPowerDefinitionByKey('hook');
  if (!def) return { rangeMeters: 0, pullDurationMs: 0 };
  const stats = burstEffectStats(def.effectParams as BurstEffectParams, level);
  return { rangeMeters: stats.rangeMeters, pullDurationMs: stats.pullDurationMs };
}

export function getThunderStats(level: number): { radiusMeters: number; damage: number } {
  const def = getPowerDefinitionByKey('thunder');
  if (!def) return { radiusMeters: 0, damage: 0 };
  const stats = burstEffectStats(def.effectParams as BurstEffectParams, level);
  return { radiusMeters: stats.radiusMeters, damage: stats.damage };
}

/** Generic version of the six functions above — takes the ability KEY as a
 * parameter instead of assuming it, so a brand-new custom power (any key)
 * gets real timed_buff / burst_effect behavior, not just the original 6. */
export function getTimedBuffStatsByKey(
  key: string,
  level: number
): { durationMs: number; buffKind: TimedBuffKind | null } {
  const def = getPowerDefinitionByKey(key);
  if (!def || def.effectType !== 'timed_buff') return { durationMs: 0, buffKind: null };
  const params = def.effectParams as TimedBuffParams;
  return { durationMs: timedBuffDurationMs(params, level), buffKind: params.buffKind };
}

/** Energy cost (from the shared sprint/jump pool) to activate this power,
 * for any timed_buff or burst_effect power. 0 for passive stat_bonus powers
 * or powers with no cost configured. Generic by key so custom powers pick
 * this up automatically, same as the six legacy stat getters above. */
export function getEnergyCostForAbility(key: string): number {
  const def = getPowerDefinitionByKey(key);
  if (!def) return 0;
  if (def.effectType === 'timed_buff') return Math.max(0, (def.effectParams as TimedBuffParams).energyCost ?? 0);
  if (def.effectType === 'burst_effect') return Math.max(0, (def.effectParams as BurstEffectParams).energyCost ?? 0);
  return 0;
}

/** Cooldown (ms) before this power can be activated again. 0 = no cooldown. */
export function getCooldownForAbility(key: string): number {
  const def = getPowerDefinitionByKey(key);
  if (!def) return 0;
  if (def.effectType === 'timed_buff') return Math.max(0, (def.effectParams as TimedBuffParams).cooldownMs ?? 0);
  if (def.effectType === 'burst_effect') return Math.max(0, (def.effectParams as BurstEffectParams).cooldownMs ?? 0);
  return 0;
}

/** The 7 fixed `PlayerState.ability` field slots (visibilityEndsAt,
 * hookEndsAt, ...) — every timed_buff/burst_effect power (core or custom)
 * maps onto exactly one of these based on which mechanic it wraps, same
 * dispatch-by-mechanism rule `activateAbility()` uses server-side. Kept here
 * so server (which slot to set) and client (which slot to read for the HUD
 * cooldown ring) share one mapping instead of two that can drift apart. */
export type AbilitySlotKind = 'visibility' | 'fly' | 'berserk' | 'bullet' | 'hook' | 'backflip' | 'thunder';

export function getAbilitySlotKind(key: string): AbilitySlotKind | null {
  const def = getPowerDefinitionByKey(key);
  if (!def) return null;
  if (def.effectType === 'timed_buff') {
    switch ((def.effectParams as TimedBuffParams).buffKind) {
      case 'invisibility':
        return 'visibility';
      case 'fly':
        return 'fly';
      case 'berserk':
        return 'berserk';
      case 'unlimited_ammo':
        return 'bullet';
      default:
        return null;
    }
  }
  if (def.effectType === 'burst_effect') {
    switch ((def.effectParams as BurstEffectParams).kind) {
      case 'range_pull':
        return 'hook';
      case 'range_dash':
        return 'backflip';
      case 'radius_damage':
        return 'thunder';
      default:
        return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Radial/hex skill-tree layout — shared by the admin Power Editor and the
// in-game "press M" menu so both render the same geometry (WayneTech-style
// honeycomb rings around a central player hex, rather than tiered rows).
// Pure math only: callers turn the returned {x,y} offsets (relative to a
// center point) into absolute-positioned hexagon nodes however they like.
// ---------------------------------------------------------------------------

/** Tier = 0 for no prerequisites, else 1 + max(tier of every prerequisite).
 * Tier 0 forms the ring immediately around the player; higher tiers radiate
 * outward. Cyclic prerequisites (shouldn't happen, but data can be bad) are
 * broken by treating the cycle member as tier 0. */
export function computePowerTiers(powers: PowerDefinitionRecord[]): Map<string, number> {
  const tiers = new Map<string, number>();
  const byKey = new Map(powers.map((p) => [p.key, p]));
  const visiting = new Set<string>();
  function tierOf(key: string): number {
    if (tiers.has(key)) return tiers.get(key)!;
    if (visiting.has(key)) return 0;
    visiting.add(key);
    const power = byKey.get(key);
    let tier = 0;
    if (power?.prerequisites?.length) {
      for (const p of power.prerequisites) if (byKey.has(p.key)) tier = Math.max(tier, tierOf(p.key) + 1);
    }
    visiting.delete(key);
    tiers.set(key, tier);
    return tier;
  }
  for (const power of powers) tierOf(power.key);
  return tiers;
}

export interface RadialHexLayout {
  /** Node centers, relative to (centerX, centerY) — add those to get
   * absolute pixel coordinates in a `width` x `height` container. */
  positions: Map<string, { x: number; y: number; tier: number }>;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  hexWidth: number;
  hexHeight: number;
  centerHexSize: number;
}

/** Concentric-ring layout: ring N (by tier) is packed with its nodes spread
 * evenly by angle around the player-centered origin. Not a true edge-to-edge
 * honeycomb packing (that requires axial hex-grid placement) — this is a
 * simpler radial approximation that still reads as "hexagons orbiting the
 * player in rings," which is the visual goal. */
export function computeRadialHexLayout(
  powers: PowerDefinitionRecord[],
  opts: { hexWidth?: number; hexHeight?: number; centerHexSize?: number; ringGap?: number } = {}
): RadialHexLayout {
  const hexWidth = opts.hexWidth ?? 92;
  const hexHeight = opts.hexHeight ?? 100;
  const centerHexSize = opts.centerHexSize ?? 108;
  const ringGap = opts.ringGap ?? hexHeight + 22;

  const tiers = computePowerTiers(powers);
  const byTier = new Map<number, PowerDefinitionRecord[]>();
  for (const p of powers) {
    const t = tiers.get(p.key) ?? 0;
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t)!.push(p);
  }
  const maxTier = Math.max(0, ...Array.from(byTier.keys()));

  const positions = new Map<string, { x: number; y: number; tier: number }>();
  let maxRadius = 0;

  for (let tier = 0; tier <= maxTier; tier++) {
    const list = byTier.get(tier) ?? [];
    if (list.length === 0) continue;
    // Minimum radius so rings don't collide with the center hex or each
    // other; grows further if a ring has enough nodes that they'd overlap
    // at the minimum radius (circumference needed for N hexes side by side).
    const minRadiusForTier = centerHexSize / 2 + ringGap * (tier + 0.65);
    const circumferenceRadius = (list.length * (hexWidth + 12)) / (2 * Math.PI);
    const radius = Math.max(minRadiusForTier, circumferenceRadius);
    maxRadius = Math.max(maxRadius, radius);
    // Offset each ring's start angle a bit so nodes don't line up in
    // perfectly straight spokes tier after tier — closer to the honeycomb's
    // organic look.
    const rotationOffset = (tier % 2 === 1 ? Math.PI / Math.max(1, list.length) : 0) + tier * 0.18;
    list.forEach((p, i) => {
      const angle = (i / list.length) * Math.PI * 2 + rotationOffset - Math.PI / 2;
      positions.set(p.key, { x: radius * Math.cos(angle), y: radius * Math.sin(angle), tier });
    });
  }

  const half = maxRadius + hexWidth / 2 + 28;
  return {
    positions,
    width: half * 2,
    height: half * 2,
    centerX: half,
    centerY: half,
    hexWidth,
    hexHeight,
    centerHexSize,
  };
}

export function getBurstEffectStatsByKey(
  key: string,
  level: number
): { radiusMeters: number; damage: number; rangeMeters: number; pullDurationMs: number; kind: BurstEffectKind | null } {
  const def = getPowerDefinitionByKey(key);
  if (!def || def.effectType !== 'burst_effect') {
    return { radiusMeters: 0, damage: 0, rangeMeters: 0, pullDurationMs: 0, kind: null };
  }
  const params = def.effectParams as BurstEffectParams;
  return { ...burstEffectStats(params, level), kind: params.kind };
}
