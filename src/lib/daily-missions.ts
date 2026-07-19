/** Shared helpers for calendar-day daily missions. */

export function missionPeriodKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfLocalDay(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameLocalDay(a: Date | string | null | undefined, b = new Date()): boolean {
  if (!a) return false;
  const left = new Date(a);
  if (Number.isNaN(left.getTime())) return false;
  return (
    left.getFullYear() === b.getFullYear() &&
    left.getMonth() === b.getMonth() &&
    left.getDate() === b.getDate()
  );
}

export const DAILY_MISSION_SEEDS = [
  {
    key: 'daily_login',
    title: 'Daily Login',
    description: 'Log into the Kilrun hub today.',
    category: 'daily',
    metric: 'daily_login',
    targetCount: 1,
    rewardXp: 40,
  },
  {
    key: 'daily_chat',
    title: 'Daily Chatter',
    description: 'Send 1 message in live global chat today.',
    category: 'daily',
    metric: 'daily_chat',
    targetCount: 1,
    rewardXp: 35,
  },
  {
    key: 'daily_forum',
    title: 'Forum Check-In',
    description: 'Post a community forum thread or reply today.',
    category: 'daily',
    metric: 'daily_forum',
    targetCount: 1,
    rewardXp: 40,
  },
  {
    key: 'daily_play',
    title: 'Daily Deathrun',
    description: 'Play 1 Deathrun match today.',
    category: 'daily',
    metric: 'daily_runs',
    targetCount: 1,
    rewardXp: 50,
  },
  {
    key: 'daily_leaderboard',
    title: 'Check the Board',
    description: 'Open the leaderboard today.',
    category: 'daily',
    metric: 'daily_leaderboard',
    targetCount: 1,
    rewardXp: 25,
  },
] as const;

export function isDailyMissionCategory(category: string | null | undefined): boolean {
  return (category || '').toLowerCase() === 'daily';
}
