/**
 * Kill-streak tier labels — pure data/logic, no rendering. A player's
 * PlayerState.killStreak (server/src/schema/RoomState.ts) is consecutive
 * kills (any source, including Horde monster kills) without dying, reset to
 * 0 on death. Only exact milestone counts fire a banner; everything else
 * (4, 6, 8, 10-12, ...) is silent so the announcement doesn't spam every
 * single kill.
 */

interface FixedTier {
  streak: number;
  label: string;
}

const FIXED_TIERS: readonly FixedTier[] = [
  { streak: 1, label: 'First Blood' },
  { streak: 2, label: 'Double Kill' },
  { streak: 3, label: 'Triple Kill' },
  { streak: 5, label: 'Multi Kill' },
  { streak: 7, label: 'Mega Kill' },
  { streak: 9, label: 'Monster Kill' },
  { streak: 13, label: 'Unstoppable' },
];

/** Label for this exact streak count, or null if it isn't a milestone.
 * Past 13, every +3 kills keeps escalating as "Rampage" (16, 19, 22, ...). */
export function getKillStreakTierLabel(streak: number): string | null {
  const fixed = FIXED_TIERS.find((t) => t.streak === streak);
  if (fixed) return fixed.label;
  if (streak > 13 && (streak - 13) % 3 === 0) return 'Rampage';
  return null;
}

/** 0-based escalation level for this streak — scales banner presentation
 * (size/shake/glow) so later tiers read as a bigger deal than earlier ones. */
export function getKillStreakEscalation(streak: number): number {
  if (streak >= 13) return 4 + Math.floor((streak - 13) / 3);
  if (streak >= 9) return 4;
  if (streak >= 7) return 3;
  if (streak >= 5) return 2;
  if (streak >= 3) return 1;
  return 0;
}

const TIER_LABEL_TO_SOUND_EVENT: Record<string, string> = {
  'First Blood': 'streak_first_blood',
  'Double Kill': 'streak_double_kill',
  'Triple Kill': 'streak_triple_kill',
  'Multi Kill': 'streak_multi_kill',
  'Mega Kill': 'streak_mega_kill',
  'Monster Kill': 'streak_monster_kill',
  Unstoppable: 'streak_unstoppable',
  Rampage: 'streak_rampage',
};

/** Sound Board event key for a tier label (see shared/sound-events.ts). */
export function getSoundEventForTierLabel(label: string): string | null {
  return TIER_LABEL_TO_SOUND_EVENT[label] ?? null;
}
