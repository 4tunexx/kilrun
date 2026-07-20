'use client';

import type { ReactNode } from 'react';

const PANEL =
  'bg-slate-900/60 backdrop-blur-md border-b border-slate-700/30';

export function PageBanner({
  title,
  subtitle,
  toolbar,
}: {
  title: string;
  subtitle?: string;
  toolbar?: ReactNode;
}) {
  return (
    <div className={`${PANEL} shrink-0 relative z-[200] overflow-visible`}>
      <div className="px-4 sm:px-8 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 overflow-visible">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight truncate">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-slate-400 mt-1 text-sm sm:text-base line-clamp-2">
              {subtitle}
            </p>
          ) : null}
        </div>
        {toolbar ? (
          <div className="shrink-0 w-full lg:w-auto relative z-[210] overflow-visible">
            {toolbar}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  home: {
    title: 'Welcome to Kilrun',
    subtitle: 'The ultimate deathrun experience. Compete, conquer, and climb the ranks.',
  },
  play: {
    title: 'Play',
    subtitle: 'Pick a mode and jump into a match.',
  },
  missions: {
    title: 'Missions',
    subtitle: 'Complete in-game and website challenges for XP.',
  },
  store: {
    title: 'Store',
    subtitle: 'Spend VP on cosmetics, boosts, and emotes.',
  },
  premium: {
    title: 'Premium',
    subtitle: 'Unlock Ranked Competitive, KP Elo, and hub perks — $2.99/mo or 5000 VP.',
  },
  leaderboard: {
    title: 'Leaderboard',
    subtitle: 'XP, combat, and Premium Ranked (KP) ladders.',
  },
  community: {
    title: 'Community',
    subtitle: 'News, discussions, and hub life.',
  },
  guides: {
    title: 'Guides',
    subtitle: 'Tips and strategies from the community.',
  },
  support: {
    title: 'Support',
    subtitle: 'Get help or contact staff.',
  },
  profile: {
    title: 'Profile',
    subtitle: 'Manage your Kilrun identity and showcase.',
  },
  stats: {
    title: 'Stats',
    subtitle: 'Your Deathrun performance at a glance.',
  },
  badges: {
    title: 'Badges',
    subtitle: 'Achievements and collectible badges.',
  },
  notifications: {
    title: 'Notifications',
    subtitle: 'Latest alerts from the hub.',
  },
  messages: {
    title: 'Messages',
    subtitle: 'Direct messages with other players.',
  },
  admin: {
    title: 'Admin Panel',
    subtitle: 'Manage players, content, and site settings.',
  },
  'public-profile': {
    title: 'Player Profile',
    subtitle: 'Public showcase and reputation.',
  },
};
