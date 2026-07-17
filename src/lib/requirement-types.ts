/**
 * Catalog of "requirement types" (a.k.a. progression metrics) that admins can
 * pick from when creating/editing missions, achievements, and badges. Backed
 * by `metricCount()` in `progression-actions.ts` — adding a new type here
 * must be paired with a case there.
 */

export type RequirementCategory = 'game' | 'progression' | 'website' | 'social';

export interface RequirementType {
  value: string;
  label: string;
  description: string;
  category: RequirementCategory;
}

export const REQUIREMENT_CATEGORY_LABELS: Record<RequirementCategory, string> = {
  game: 'In-Game',
  progression: 'Progression / Leveling',
  website: 'Website / Daily',
  social: 'Community',
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
  };
  for (const type of REQUIREMENT_TYPES) {
    groups[type.category].push(type);
  }
  return groups;
}
