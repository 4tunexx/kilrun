/** Shared helpers for calendar-day daily missions (UTC, serverless-safe). */

export function missionPeriodKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfLocalDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isSameLocalDay(a: Date | string | null | undefined, b = new Date()): boolean {
  if (!a) return false;
  const left = new Date(a);
  if (Number.isNaN(left.getTime())) return false;
  return (
    left.getUTCFullYear() === b.getUTCFullYear() &&
    left.getUTCMonth() === b.getUTCMonth() &&
    left.getUTCDate() === b.getUTCDate()
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
    key: 'daily_horde',
    title: 'Daily Horde',
    description: 'Play 1 Horde match today.',
    category: 'daily',
    metric: 'daily_horde',
    targetCount: 1,
    rewardXp: 55,
  },
  {
    key: 'daily_competitive',
    title: 'Daily Ranked',
    description: 'Play 1 Competitive match today.',
    category: 'daily',
    metric: 'daily_competitive',
    targetCount: 1,
    rewardXp: 60,
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

/** ActiveMission-shaped row: category daily or daily_* template key. */
export function isDailyMissionRow(m: {
  category?: string | null;
  templateKey: string;
}): boolean {
  return isDailyMissionCategory(m.category) || m.templateKey.startsWith('daily_');
}

export function isWebMissionRow(m: {
  category?: string | null;
  templateKey: string;
}): boolean {
  if (isDailyMissionRow(m)) return false;
  return (
    (m.category || '').toLowerCase() === 'website' || m.templateKey.startsWith('web_')
  );
}
