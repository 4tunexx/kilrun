/**
 * Catalog of "requirement types" (a.k.a. progression metrics) that admins can
 * pick from when creating/editing missions, achievements, and badges. Backed
 * by `metricCount()` in `progression-actions.ts` — adding a new type here
 * must be paired with a case there.
 */

export type RequirementCategory =
  | 'game'
  | 'progression'
  | 'website'
  | 'social'
  | 'cosmetics'
  | 'daily';

export interface RequirementType {
  value: string;
  label: string;
  description: string;
  category: RequirementCategory;
}

export const REQUIREMENT_CATEGORY_LABELS: Record<RequirementCategory, string> = {
  game: 'In-Game',
  progression: 'Progression / Leveling',
  website: 'Website',
  social: 'Community',
  cosmetics: 'Profile Cosmetics',
  daily: 'Daily Missions',
};

export const REQUIREMENT_TYPES: RequirementType[] = [
  // In-game
  {
    value: 'runs',
    label: 'Matches played',
    description: 'Total Deathrun matches completed.',
    category: 'game',
  },
  {
    value: 'wins',
    label: 'Matches won',
    description: 'Deathrun matches won or survived.',
    category: 'game',
  },
  {
    value: 'distance',
    label: 'Distance covered',
    description: 'Total meters covered across all runs.',
    category: 'game',
  },
  {
    value: 'score',
    label: 'Best score',
    description: 'Highest single-run score reached.',
    category: 'game',
  },
  {
    value: 'trapper_wins',
    label: 'Trapper round wins',
    description: 'Deathrun rounds won while playing as the Trapper.',
    category: 'game',
  },
  {
    value: 'runner_survives',
    label: 'Runner survivals',
    description: 'Deathrun rounds survived while playing as a Runner.',
    category: 'game',
  },
  {
    value: 'losses',
    label: 'Matches lost',
    description: 'Deathrun matches lost (for "keep trying" style unlocks).',
    category: 'game',
  },
  {
    value: 'eliminated',
    label: 'Times eliminated',
    description: 'Runner rounds ending in elimination before the finish line.',
    category: 'game',
  },
  {
    value: 'horde_runs',
    label: 'Horde matches played',
    description: 'Total Horde mode matches completed.',
    category: 'game',
  },
  {
    value: 'horde_wins',
    label: 'Horde matches survived',
    description: 'Horde matches finished without a wipe (win / survived).',
    category: 'game',
  },
  {
    value: 'horde_waves',
    label: 'Horde waves cleared',
    description: 'Total enemy waves cleared across Horde matches.',
    category: 'game',
  },
  {
    value: 'horde_kills',
    label: 'Horde monster kills',
    description: 'Total monsters killed in Horde mode.',
    category: 'game',
  },
  {
    value: 'competitive_runs',
    label: 'Competitive matches played',
    description: 'Total Competitive 4v4 matches completed.',
    category: 'game',
  },
  {
    value: 'competitive_wins',
    label: 'Competitive matches won',
    description: 'Competitive 4v4 matches won by your team.',
    category: 'game',
  },
  {
    value: 'kp',
    label: 'Killrun Points (KP)',
    description: 'Competitive Elo-style rating that determines your rank.',
    category: 'progression',
  },

  // Progression / leveling
  {
    value: 'level',
    label: 'Account level',
    description: 'Player reaches a given website/account level.',
    category: 'progression',
  },
  {
    value: 'vip',
    label: 'VIP status',
    description: 'Player has unlocked VIP.',
    category: 'progression',
  },
  {
    value: 'missions_completed',
    label: 'Missions completed',
    description: 'Total missions completed.',
    category: 'progression',
  },
  {
    value: 'badges_earned',
    label: 'Badges earned',
    description: 'Total badges unlocked (a "collector" style meta-badge).',
    category: 'progression',
  },
  {
    value: 'achievements_unlocked',
    label: 'Achievements unlocked',
    description: 'Total achievements unlocked across the whole platform.',
    category: 'progression',
  },

  // Website / daily engagement
  {
    value: 'logins',
    label: 'Logged in',
    description: 'Player has logged into the hub at least once.',
    category: 'website',
  },
  {
    value: 'daily_login_streak',
    label: 'Daily login streak',
    description: 'Consecutive days logged in, back to back.',
    category: 'website',
  },
  {
    value: 'email',
    label: 'Email verified',
    description: 'Player confirmed their email address.',
    category: 'website',
  },
  {
    value: 'purchases',
    label: 'Store purchases made',
    description: 'Number of items bought from the VP store.',
    category: 'website',
  },
  {
    value: 'vp_spent',
    label: 'Total VP spent',
    description: 'Cumulative VP spent in the store.',
    category: 'website',
  },
  {
    value: 'support_tickets',
    label: 'Support tickets opened',
    description: 'Support tickets a player has submitted.',
    category: 'website',
  },

  // Community / social
  {
    value: 'friends',
    label: 'Friends added',
    description: 'Number of accepted friends.',
    category: 'social',
  },
  {
    value: 'messages',
    label: 'Direct messages sent',
    description: 'Direct messages sent to other players.',
    category: 'social',
  },
  {
    value: 'chat',
    label: 'Global chat messages',
    description: 'Messages sent in the hub global chat.',
    category: 'social',
  },
  {
    value: 'forum',
    label: 'Forum threads created',
    description: 'Forum discussion threads started.',
    category: 'social',
  },
  {
    value: 'forum_replies',
    label: 'Forum replies posted',
    description: 'Replies posted on forum threads.',
    category: 'social',
  },
  {
    value: 'reputation',
    label: 'Reputation received',
    description: 'Net +rep received from other players.',
    category: 'social',
  },

  // Profile cosmetics
  {
    value: 'cosmetic_owned',
    label: 'Cosmetics owned',
    description: 'Owned inventory items with a cosmetic slot (banner / frame / nickname).',
    category: 'cosmetics',
  },
  {
    value: 'banner_owned',
    label: 'Banners owned',
    description: 'Profile banners currently in inventory.',
    category: 'cosmetics',
  },
  {
    value: 'frame_owned',
    label: 'Avatar frames owned',
    description: 'Avatar frames currently in inventory.',
    category: 'cosmetics',
  },
  {
    value: 'nickname_owned',
    label: 'Nickname effects owned',
    description: 'Nickname effects currently in inventory.',
    category: 'cosmetics',
  },
  {
    value: 'cosmetics_equipped',
    label: 'Cosmetics equipped',
    description: 'Lifetime times a cosmetic was equipped.',
    category: 'cosmetics',
  },
  {
    value: 'cosmetics_deleted',
    label: 'Cosmetics discarded',
    description: 'Lifetime times a cosmetic was discarded from inventory.',
    category: 'cosmetics',
  },
  {
    value: 'cosmetics_resold',
    label: 'Cosmetics resold',
    description: 'Lifetime times a cosmetic was sold back for VP.',
    category: 'cosmetics',
  },

  // Daily mission metrics (reset with the daily board)
  {
    value: 'daily_login',
    label: 'Daily hub login',
    description: 'Log into the hub once today.',
    category: 'daily',
  },
  {
    value: 'daily_chat',
    label: 'Daily live chat',
    description: 'Send a global chat message today.',
    category: 'daily',
  },
  {
    value: 'daily_forum',
    label: 'Daily forum post',
    description: 'Create a forum thread or reply today.',
    category: 'daily',
  },
  {
    value: 'daily_runs',
    label: 'Daily Deathrun match',
    description: 'Play a Deathrun match today.',
    category: 'daily',
  },
  {
    value: 'daily_horde',
    label: 'Daily Horde match',
    description: 'Play a Horde mode match today.',
    category: 'daily',
  },
  {
    value: 'daily_competitive',
    label: 'Daily Competitive match',
    description: 'Play a Competitive 4v4 match today.',
    category: 'daily',
  },
  {
    value: 'daily_leaderboard',
    label: 'Daily leaderboard visit',
    description: 'Open the leaderboard page today.',
    category: 'daily',
  },
];

export function getRequirementType(value: string): RequirementType | undefined {
  return REQUIREMENT_TYPES.find((t) => t.value === value);
}

export function groupRequirementTypes(): Record<RequirementCategory, RequirementType[]> {
  const groups: Record<RequirementCategory, RequirementType[]> = {
    game: [],
    progression: [],
    website: [],
    social: [],
    cosmetics: [],
    daily: [],
  };
  for (const type of REQUIREMENT_TYPES) {
    groups[type.category].push(type);
  }
  return groups;
}
