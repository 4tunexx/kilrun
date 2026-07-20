/**
 * Hub layout config stored on SiteSettings as JSON strings.
 * Controls which pages are public, which rail each link sits on,
 * and whether header / footer / landing slider are shown.
 */

export type HubPageId =
  | 'home'
  | 'play'
  | 'missions'
  | 'leaderboard'
  | 'stats'
  | 'store'
  | 'premium'
  | 'badges'
  | 'community'
  | 'guides'
  | 'support'
  | 'profile'
  | 'notifications'
  | 'messages';

export type HubNavRail = 'left' | 'right';

export type HubNavItemDef = {
  id: HubPageId;
  label: string;
  defaultRail: HubNavRail;
  /** Cannot be disabled / moved away from left */
  locked?: boolean;
};

/** All player-facing hub destinations (admin / inventory / VIP handled separately). */
export const HUB_NAV_CATALOG: HubNavItemDef[] = [
  { id: 'home', label: 'Home', defaultRail: 'left', locked: true },
  { id: 'play', label: 'Play', defaultRail: 'left' },
  { id: 'missions', label: 'Missions', defaultRail: 'left' },
  { id: 'leaderboard', label: 'Leaderboard', defaultRail: 'left' },
  { id: 'stats', label: 'Statistics', defaultRail: 'left' },
  { id: 'store', label: 'Store', defaultRail: 'left' },
  { id: 'premium', label: 'Premium', defaultRail: 'left' },
  { id: 'badges', label: 'Badges', defaultRail: 'right' },
  { id: 'community', label: 'Community', defaultRail: 'right' },
  { id: 'guides', label: 'Guides', defaultRail: 'right' },
  { id: 'support', label: 'Support', defaultRail: 'right' },
  { id: 'profile', label: 'Profile', defaultRail: 'right' },
  { id: 'notifications', label: 'Notifications', defaultRail: 'right' },
  { id: 'messages', label: 'Messages', defaultRail: 'right' },
];

export type HubPagesConfig = Record<HubPageId, boolean>;

export type HubNavLayout = {
  left: HubPageId[];
  right: HubPageId[];
};

export type HubChromeConfig = {
  showHeader: boolean;
  showFooter: boolean;
  showLandingSlider: boolean;
};

export function defaultHubPages(): HubPagesConfig {
  const pages = {} as HubPagesConfig;
  for (const item of HUB_NAV_CATALOG) {
    pages[item.id] = true;
  }
  return pages;
}

export function defaultHubNav(): HubNavLayout {
  return {
    left: HUB_NAV_CATALOG.filter((i) => i.defaultRail === 'left').map((i) => i.id),
    right: HUB_NAV_CATALOG.filter((i) => i.defaultRail === 'right').map((i) => i.id),
  };
}

export function defaultHubChrome(): HubChromeConfig {
  return {
    showHeader: true,
    showFooter: true,
    showLandingSlider: true,
  };
}

export function parseHubPages(raw: unknown): HubPagesConfig {
  const base = defaultHubPages();
  if (typeof raw !== 'string' && (typeof raw !== 'object' || raw === null)) return base;
  let obj: Record<string, unknown> = {};
  try {
    obj = typeof raw === 'string' ? (JSON.parse(raw || '{}') as Record<string, unknown>) : (raw as Record<string, unknown>);
  } catch {
    return base;
  }
  for (const item of HUB_NAV_CATALOG) {
    if (item.locked) {
      base[item.id] = true;
      continue;
    }
    if (typeof obj[item.id] === 'boolean') base[item.id] = obj[item.id] as boolean;
  }
  return base;
}

export function parseHubNav(raw: unknown): HubNavLayout {
  const fallback = defaultHubNav();
  let obj: { left?: unknown; right?: unknown } = {};
  try {
    obj =
      typeof raw === 'string'
        ? (JSON.parse(raw || '{}') as { left?: unknown; right?: unknown })
        : ((raw as { left?: unknown; right?: unknown }) ?? {});
  } catch {
    return fallback;
  }
  const valid = new Set(HUB_NAV_CATALOG.map((i) => i.id));
  const clean = (arr: unknown): HubPageId[] =>
    Array.isArray(arr)
      ? arr.filter((id): id is HubPageId => typeof id === 'string' && valid.has(id as HubPageId))
      : [];
  let left = clean(obj.left);
  let right = clean(obj.right);
  // Ensure home stays on left first
  left = left.filter((id) => id !== 'home');
  left = ['home', ...left];
  right = right.filter((id) => id !== 'home');
  // Deduplicate — prefer left
  const seen = new Set<HubPageId>();
  left = left.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  right = right.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  // Append any missing catalog items to their default rail
  for (const item of HUB_NAV_CATALOG) {
    if (seen.has(item.id)) continue;
    if (item.defaultRail === 'left') left.push(item.id);
    else right.push(item.id);
  }
  return { left, right };
}

export function parseHubChrome(raw: unknown): HubChromeConfig {
  const base = defaultHubChrome();
  let obj: Record<string, unknown> = {};
  try {
    obj =
      typeof raw === 'string'
        ? (JSON.parse(raw || '{}') as Record<string, unknown>)
        : ((raw as Record<string, unknown>) ?? {});
  } catch {
    return base;
  }
  if (typeof obj.showHeader === 'boolean') base.showHeader = obj.showHeader;
  if (typeof obj.showFooter === 'boolean') base.showFooter = obj.showFooter;
  if (typeof obj.showLandingSlider === 'boolean') {
    base.showLandingSlider = obj.showLandingSlider;
  }
  return base;
}

export function isHubPageEnabled(
  pages: HubPagesConfig,
  page: string,
  isStaff: boolean
): boolean {
  if (isStaff) return true;
  if (page === 'admin' || page === 'lobby' || page === 'public-profile') return true;
  if (!(page in pages)) return true;
  return pages[page as HubPageId] !== false;
}
