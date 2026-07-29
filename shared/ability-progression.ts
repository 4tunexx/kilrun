/**
 * IN-GAME leveling & ability upgrades — completely separate from the
 * website account level/XP (`src/lib/progression.ts`, `User.xpProgress`).
 *
 * This system tracks a player's in-match power progression: kills/wins earn
 * "game XP", leveling up grants Skill Points, and Skill Points are spent
 * upgrading powers (Health, Speed, Jump, Energy, Visibility, Punch, Fly,
 * Hook, Berserk, Bullet, Thunder) from the in-game menu (press M).
 *
 * Single source of truth so the Next.js app (menu UI, profile pages,
 * server actions) and the Colyseus game server (applying the actual
 * gameplay effects) never drift out of sync.
 */

export type AbilityKey =
  | 'health'
  | 'speed'
  | 'jump'
  | 'energy'
  | 'visibility'
  | 'punch'
  | 'fly'
  | 'hook'
  | 'berserk'
  | 'bullet'
  | 'thunder';

export interface AbilityLevelEffect {
  level: number;
  /** Short human-readable summary of what this level grants. */
  label: string;
}

export interface AbilityDefinition {
  key: AbilityKey;
  name: string;
  description: string;
  /** Emoji/icon glyph for compact UI. */
  icon: string;
  maxLevel: number;
  /** Skill points required to go from `level` to `level + 1`. */
  costForLevel: (level: number) => number;
  /** Human-readable effect summary at a given level (0 = not unlocked). */
  effectLabel: (level: number) => string;
}

const flatCost = (points: number) => (_level: number) => points;
const rampCost = (base: number, step: number) => (level: number) =>
  base + step * level;

export const MAX_ABILITY_LEVEL = 10;

export const ABILITY_DEFINITIONS: Record<AbilityKey, AbilityDefinition> = {
  health: {
    key: 'health',
    name: 'Health',
    description: 'Increases maximum health.',
    icon: '❤️',
    maxLevel: MAX_ABILITY_LEVEL,
    costForLevel: flatCost(1),
    effectLabel: (level) => `+${level * 10} max HP`,
  },
  speed: {
    key: 'speed',
    name: 'Speed',
    description: 'Increases movement speed.',
    icon: '⚡',
    maxLevel: MAX_ABILITY_LEVEL,
    costForLevel: flatCost(1),
    effectLabel: (level) => `+${(level * 4).toFixed(0)}% move speed`,
  },
  jump: {
    key: 'jump',
    name: 'Jump',
    description: 'Increases jump height.',
    icon: '🦘',
    maxLevel: MAX_ABILITY_LEVEL,
    costForLevel: flatCost(1),
    effectLabel: (level) => `+${(level * 5).toFixed(0)}% jump height`,
  },
  energy: {
    key: 'energy',
    name: 'Energy',
    description: 'Increases maximum energy (sprint/abilities pool).',
    icon: '🔋',
    maxLevel: MAX_ABILITY_LEVEL,
    costForLevel: flatCost(1),
    effectLabel: (level) => `+${level * 10} max energy`,
  },
  visibility: {
    key: 'visibility',
    name: 'Invisibility',
    description: 'Turn invisible to enemies for a short duration.',
    icon: '👻',
    maxLevel: MAX_ABILITY_LEVEL,
    costForLevel: rampCost(1, 1),
    effectLabel: (level) => (level > 0 ? `${(2 + level * 0.8).toFixed(1)}s duration` : 'Locked'),
  },
  punch: {
    key: 'punch',
    name: 'Punch Damage',
    description: 'Increases melee punch damage.',
    icon: '👊',
    maxLevel: MAX_ABILITY_LEVEL,
    costForLevel: flatCost(1),
    effectLabel: (level) => `+${level * 8}% punch damage`,
  },
  fly: {
    key: 'fly',
    name: 'Fly',
    description: 'Take to the air for a short duration.',
    icon: '🕊️',
    maxLevel: MAX_ABILITY_LEVEL,
    costForLevel: rampCost(1, 1),
    effectLabel: (level) => (level > 0 ? `${(1.5 + level * 0.7).toFixed(1)}s duration` : 'Locked'),
  },
  hook: {
    key: 'hook',
    name: 'Grapple Hook',
    description: 'Press H to fire a hook and pull yourself to a wall/object.',
    icon: '🪝',
    maxLevel: MAX_ABILITY_LEVEL,
    costForLevel: rampCost(1, 1),
    effectLabel: (level) =>
      level > 0
        ? `${(8 + level * 1.5).toFixed(1)}m range · ${(0.4 + level * 0.05).toFixed(2)}s pull`
        : 'Locked',
  },
  berserk: {
    key: 'berserk',
    name: 'Berserk',
    description: 'Grow huge, take no damage, and one-punch-KO enemies.',
    icon: '💢',
    maxLevel: MAX_ABILITY_LEVEL,
    costForLevel: rampCost(2, 1),
    effectLabel: (level) => (level > 0 ? `${(3 + level * 0.6).toFixed(1)}s duration` : 'Locked'),
  },
  bullet: {
    key: 'bullet',
    name: 'Unlimited Ammo',
    description: 'Fire without reloading or consuming ammo for a duration.',
    icon: '🔫',
    maxLevel: MAX_ABILITY_LEVEL,
    costForLevel: rampCost(1, 1),
    effectLabel: (level) => (level > 0 ? `${(3 + level * 0.6).toFixed(1)}s duration` : 'Locked'),
  },
  thunder: {
    key: 'thunder',
    name: 'Thunder Bolt',
    description: 'Release a thunder bolt that damages nearby enemies.',
    icon: '⚡🌩️',
    maxLevel: MAX_ABILITY_LEVEL,
    costForLevel: rampCost(2, 1),
    effectLabel: (level) =>
      level > 0
        ? `${(3 + level * 0.5).toFixed(1)}m radius · ${20 + level * 8} dmg`
        : 'Locked',
  },
};

export const ABILITY_KEYS = Object.keys(ABILITY_DEFINITIONS) as AbilityKey[];

<<<<<<< HEAD
/** Abilities whose unlockLevel falls in `(prevLevel, newLevel]` — used to
 * show "you just unlocked X" in a level-up popup. Empty if nothing new. */
export function getNewlyUnlockedAbilities(prevLevel: number, newLevel: number): AbilityDefinition[] {
  if (newLevel <= prevLevel) return [];
  return ABILITY_KEYS.map((k) => ABILITY_DEFINITIONS[k]).filter(
    (def) => def.unlockLevel > prevLevel && def.unlockLevel <= newLevel
  );
}

=======
export type AbilityLevels = Record<AbilityKey, number>;

export function defaultAbilityLevels(): AbilityLevels {
  const out = {} as AbilityLevels;
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
  }
  return out;
}

/** Total Skill Points ever earned/spent so far (used to compute points remaining). */
export function totalSpentSkillPoints(levels: AbilityLevels): number {
  let spent = 0;
  for (const key of ABILITY_KEYS) {
    const def = ABILITY_DEFINITIONS[key];
    for (let lvl = 0; lvl < levels[key]; lvl++) {
      spent += def.costForLevel(lvl);
    }
  }
  return spent;
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
// Colyseus room sim when spawning/updating a player).
// ---------------------------------------------------------------------------

export interface AbilityStatBonuses {
  /** Additive bonus to max health. */
  maxHealthBonus: number;
  /** Multiplier applied to move speed (1 = no change). */
  speedMultiplier: number;
  /** Multiplier applied to jump velocity (1 = no change). */
  jumpMultiplier: number;
  /** Additive bonus to max energy. */
  maxEnergyBonus: number;
  /** Multiplier applied to melee punch damage (1 = no change). */
  punchDamageMultiplier: number;
}

export function getAbilityStatBonuses(levels: AbilityLevels): AbilityStatBonuses {
  return {
    maxHealthBonus: levels.health * 10,
    speedMultiplier: 1 + levels.speed * 0.04,
    jumpMultiplier: 1 + levels.jump * 0.05,
    maxEnergyBonus: levels.energy * 10,
    punchDamageMultiplier: 1 + levels.punch * 0.08,
  };
}

export function getVisibilityDurationMs(level: number): number {
  return level > 0 ? Math.round((2 + level * 0.8) * 1000) : 0;
}

export function getFlyDurationMs(level: number): number {
  return level > 0 ? Math.round((1.5 + level * 0.7) * 1000) : 0;
}

export function getHookStats(level: number): { rangeMeters: number; pullDurationMs: number } {
  return {
    rangeMeters: level > 0 ? 8 + level * 1.5 : 0,
    pullDurationMs: level > 0 ? Math.round((0.4 + level * 0.05) * 1000) : 0,
  };
}

export function getBerserkDurationMs(level: number): number {
  return level > 0 ? Math.round((3 + level * 0.6) * 1000) : 0;
}

export function getUnlimitedAmmoDurationMs(level: number): number {
  return level > 0 ? Math.round((3 + level * 0.6) * 1000) : 0;
}

export function getThunderStats(level: number): { radiusMeters: number; damage: number } {
  return {
    radiusMeters: level > 0 ? 3 + level * 0.5 : 0,
    damage: level > 0 ? 20 + level * 8 : 0,
  };
}
