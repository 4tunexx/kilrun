/** XP / level helpers shared by hub UI and server progression. */

export const XP_PER_LEVEL = 100;

export function getLevelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1);
}

export function getXpIntoLevel(xp: number): number {
  return Math.max(0, xp) % XP_PER_LEVEL;
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
