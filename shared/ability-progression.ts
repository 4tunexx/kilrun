/**
 * IN-GAME leveling & ability upgrades — completely separate from the
 * website account level/XP (`src/lib/progression.ts`, `User.xpProgress`).
 *
 * This system tracks a player's in-match power progression: kills/wins earn
 * "game XP", leveling up grants Skill Points, and Skill Points are spent
 * upgrading powers from the in-game menu (press M).
 *
 * As of the Power Editor feature, the actual power definitions (name, icon,
 * cost curve, effect magnitude, prerequisites, skill-tree gating) are
 * data-driven and persisted via the Prisma `PowerDefinition` model — see
 * `shared/power-definitions.ts` for the generic engine. This file is now a
 * thin backward-compatible shim: `ABILITY_DEFINITIONS` / `ABILITY_KEYS` are
 * mutable singletons that `applyDynamicPowerDefinitions()` (re-exported from
 * `power-definitions.ts`) hot-swaps in place once dynamic data has loaded,
 * so every existing import of this module keeps working unchanged. Until
 * then (or if the DB is unreachable), they hold the original 11 hardcoded
 * abilities as a safe static fallback.
 */

import {
  applyDynamicPowerDefinitions as _applyDynamicPowerDefinitions,
  costForLevelFormula,
  effectLabelGeneric,
  getActivePowerDefinitions,
  getBerserkDurationMs,
  getFlyDurationMs,
  getHookStats,
  getThunderStats,
  getUnlimitedAmmoDurationMs,
  getVisibilityDurationMs,
  computeAbilityStatBonuses,
  type GenericAbilityStatBonuses,
  type PowerDefinitionRecord,
} from './power-definitions';

export {
  costForLevelFormula,
  effectLabelGeneric,
  getActivePowerDefinitions,
  getPowerDefinitionByKey,
  getTimedBuffStatsByKey,
  getBurstEffectStatsByKey,
  STATIC_FALLBACK_POWERS,
  type PowerDefinitionRecord,
  type PowerEffectType,
  type PowerPrerequisite,
  type CostFormula,
  type StatBonusParams,
  type TimedBuffParams,
  type BurstEffectParams,
} from './power-definitions';

/** Re-exported so callers don't need to import from two modules. Hot-swaps
 * `ABILITY_DEFINITIONS`/`ABILITY_KEYS` below as a side effect. */
export function applyDynamicPowerDefinitions(records: PowerDefinitionRecord[]): void {
  _applyDynamicPowerDefinitions(records);
  rebuildLegacyShim();
}

/** Any power key — core (health/speed/.../thunder) or a custom power created
 * in the editor. Loosened from the old fixed 11-value union so newly
 * created powers type-check everywhere without further edits. */
export type AbilityKey = string;

export interface AbilityDefinition {
  key: AbilityKey;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  unlockLevel: number;
  /** Skill-tree prerequisites: [{key, level}, ...] — empty for no gating. */
  prerequisites: { key: string; level: number }[];
  costForLevel: (level: number) => number;
  effectLabel: (level: number) => string;
}

export const MAX_ABILITY_LEVEL = 10;

/** Mutable singleton — same object reference forever; properties are
 * added/removed in place by `rebuildLegacyShim()` so existing
 * `import { ABILITY_DEFINITIONS }` call sites see live updates. */
export const ABILITY_DEFINITIONS: Record<string, AbilityDefinition> = {};
/** Mutable singleton array — same reference forever, contents replaced via splice. */
export const ABILITY_KEYS: AbilityKey[] = [];

function toLegacyDefinition(rec: PowerDefinitionRecord): AbilityDefinition {
  return {
    key: rec.key,
    name: rec.name,
    description: rec.description,
    icon: rec.icon,
    maxLevel: rec.maxLevel,
    unlockLevel: rec.unlockLevel,
    prerequisites: rec.prerequisites ?? [],
    costForLevel: (level: number) => costForLevelFormula(rec.cost, level),
    effectLabel: (level: number) => effectLabelGeneric(rec, level),
  };
}

function rebuildLegacyShim(): void {
  for (const k of Object.keys(ABILITY_DEFINITIONS)) delete ABILITY_DEFINITIONS[k];
  ABILITY_KEYS.length = 0;
  for (const rec of getActivePowerDefinitions()) {
    ABILITY_KEYS.push(rec.key);
    ABILITY_DEFINITIONS[rec.key] = toLegacyDefinition(rec);
  }
}
rebuildLegacyShim();

/** Abilities whose unlockLevel falls in `(prevLevel, newLevel]` — used to
 * show "you just unlocked X" in a level-up popup. Empty if nothing new. */
export function getNewlyUnlockedAbilities(prevLevel: number, newLevel: number): AbilityDefinition[] {
  if (newLevel <= prevLevel) return [];
  return ABILITY_KEYS.map((k) => ABILITY_DEFINITIONS[k]).filter(
    (def) => def.unlockLevel > prevLevel && def.unlockLevel <= newLevel
  );
}

export type AbilityLevels = Record<string, number>;

export function defaultAbilityLevels(): AbilityLevels {
  const out: AbilityLevels = {};
  for (const key of ABILITY_KEYS) out[key] = 0;
  return out;
}

/** Parse the persisted `User.gameAbilities` JSON blob into a safe, clamped map. */
export function parseAbilityLevels(raw: unknown): AbilityLevels {
  const out = defaultAbilityLevels();
  if (raw && typeof raw === 'object') {
    for (const key of ABILITY_KEYS) {
      const value = (raw as Record<string, unknown>)[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = Math.max(0, Math.min(ABILITY_DEFINITIONS[key].maxLevel, Math.floor(value)));
      }
    }
    // Preserve levels for keys not in the currently-loaded active list (e.g.
    // a custom power that failed to load this request) rather than dropping
    // the player's progress silently.
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!(key in out) && typeof value === 'number' && Number.isFinite(value)) {
        out[key] = Math.max(0, Math.floor(value));
      }
    }
  }
  return out;
}

/** Total Skill Points ever earned/spent so far (used to compute points remaining). */
export function totalSpentSkillPoints(levels: AbilityLevels): number {
  let spent = 0;
  for (const key of ABILITY_KEYS) {
    const def = ABILITY_DEFINITIONS[key];
    for (let lvl = 0; lvl < (levels[key] ?? 0); lvl++) {
      spent += def.costForLevel(lvl);
    }
  }
  return spent;
}

/** Is `prerequisites` satisfied given the player's current levels? */
export function arePrerequisitesMet(def: AbilityDefinition, levels: AbilityLevels): boolean {
  if (!def.prerequisites?.length) return true;
  return def.prerequisites.every((p) => (levels[p.key] ?? 0) >= p.level);
}

// ---------------------------------------------------------------------------
// In-game level curve (separate from the website's src/lib/progression.ts)
// ---------------------------------------------------------------------------

export const GAME_MAX_LEVEL = 60;

/** Game XP required to go from `level` to `level + 1`. Gentler than the web curve. */
export function getGameXpRequiredForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.min(Math.floor(level), GAME_MAX_LEVEL));
  return Math.round(30 * Math.pow(safeLevel, 1.22) + 40);
}

const GAME_LEVEL_START_XP: number[] = (() => {
  const table: number[] = [0, 0];
  let cumulative = 0;
  for (let level = 1; level < GAME_MAX_LEVEL; level++) {
    cumulative += getGameXpRequiredForLevel(level);
    table[level + 1] = cumulative;
  }
  return table;
})();

export function getGameLevelFromXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  for (let l = 2; l <= GAME_MAX_LEVEL; l++) {
    if (safeXp >= GAME_LEVEL_START_XP[l]) level = l;
    else break;
  }
  return level;
}

export function getGameXpForLevelStart(level: number): number {
  const safeLevel = Math.max(1, Math.min(Math.floor(level), GAME_MAX_LEVEL));
  return GAME_LEVEL_START_XP[safeLevel] ?? 0;
}

export function getGameLevelProgress(xp: number) {
  const level = getGameLevelFromXp(xp);
  const into = Math.max(0, Math.floor(xp) - getGameXpForLevelStart(level));
  const needed = getGameXpRequiredForLevel(level);
  const percent = needed > 0 ? Math.min(100, Math.round((into / needed) * 1000) / 10) : 100;
  return { level, xpIntoLevel: into, xpForNextLevel: needed, percent };
}

/** 1 Skill Point per level gained (levels start at 1, so level N grants N-1 points total). */
export function skillPointsForLevel(level: number): number {
  return Math.max(0, Math.floor(level) - 1);
}

// ---------------------------------------------------------------------------
// Live gameplay stat bonuses derived from ability levels (consumed by the
// Colyseus room sim when spawning/updating a player). Signature unchanged
// from the original hardcoded version; math is now generic/data-driven.
// ---------------------------------------------------------------------------

export interface AbilityStatBonuses {
  maxHealthBonus: number;
  speedMultiplier: number;
  jumpMultiplier: number;
  maxEnergyBonus: number;
  punchDamageMultiplier: number;
  reloadSpeedMultiplier?: number;
  fallDamageReduction?: number;
}

export function getAbilityStatBonuses(levels: AbilityLevels): AbilityStatBonuses {
  const bonuses: GenericAbilityStatBonuses = computeAbilityStatBonuses(levels);
  return bonuses;
}

export {
  getVisibilityDurationMs,
  getFlyDurationMs,
  getHookStats,
  getBerserkDurationMs,
  getUnlimitedAmmoDurationMs,
  getThunderStats,
};
