/**
 * XP / level helpers shared by hub UI and server progression.
 *
 * Leveling uses a progressive curve: early levels are cheap (roughly one
 * match to hit level 2), and the XP required per level grows steadily so
 * high levels take meaningfully longer — "easy at first, harder later".
 */

export const MAX_LEVEL = 100;

/** XP required to go from `level` to `level + 1`. */
export function getXpRequiredForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.min(Math.floor(level), MAX_LEVEL));
  return Math.round(40 * Math.pow(safeLevel, 1.32) + 60);
}

/** LEVEL_START_XP[n] = total cumulative XP needed to reach level n. */
const LEVEL_START_XP: number[] = (() => {
  const table: number[] = [0, 0]; // index 0 unused; level 1 starts at 0 XP
  let cumulative = 0;
  for (let level = 1; level < MAX_LEVEL; level++) {
    cumulative += getXpRequiredForLevel(level);
    table[level + 1] = cumulative;
  }
  return table;
})();

export function getXpForLevelStart(level: number): number {
  const safeLevel = Math.max(1, Math.min(Math.floor(level), MAX_LEVEL));
  return LEVEL_START_XP[safeLevel] ?? 0;
}

export function getLevelFromXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) {
    if (safeXp >= LEVEL_START_XP[l]) level = l;
    else break;
  }
  return level;
}

/** XP accumulated within the player's current level (resets each level). */
export function getXpIntoLevel(xp: number): number {
  const level = getLevelFromXp(xp);
  return Math.max(0, Math.floor(xp) - getXpForLevelStart(level));
}

/** XP needed to go from `level` to the next one (for progress bars). */
export function getXpForNextLevel(level: number): number {
  return getXpRequiredForLevel(level);
}

export function getLevelProgressPercent(xp: number): number {
  const level = getLevelFromXp(xp);
  const into = getXpIntoLevel(xp);
  const needed = getXpForNextLevel(level);
  if (needed <= 0) return 100;
  return Math.min(100, Math.round((into / needed) * 1000) / 10);
}

/** One-stop shop for rendering a level/XP bar from a raw `xpProgress` value. */
export function getLevelProgress(xp: number) {
  const level = getLevelFromXp(xp);
  const xpIntoLevel = getXpIntoLevel(xp);
  const xpForNextLevel = getXpForNextLevel(level);
  const percent = getLevelProgressPercent(xp);
  return { level, xpIntoLevel, xpForNextLevel, percent };
}

export function getRankForLevel(level: number): string {
  if (level >= 50) return 'Immortal';
  if (level >= 40) return 'Diamond';
  if (level >= 30) return 'Platinum';
  if (level >= 20) return 'Gold';
  if (level >= 10) return 'Silver';
  if (level >= 5) return 'Bronze';
  return 'Unranked';
}
