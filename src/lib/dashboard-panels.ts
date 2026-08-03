/** Toggleable panels on the home dashboard. Order matches on-page layout. */
export const DASHBOARD_PANEL_KEYS = [
  'hero',
  'stats',
  'promo',
  'chat',
  'dailyMissions',
  'missions',
  'forum',
  'news',
] as const;

export type DashboardPanelKey = (typeof DASHBOARD_PANEL_KEYS)[number];

export const DASHBOARD_PANEL_LABELS: Record<DashboardPanelKey, string> = {
  hero: 'Hero banner',
  stats: 'Stats strip',
  promo: 'Promo banner',
  chat: 'Live chat',
  dailyMissions: 'Daily missions',
  missions: 'Main missions',
  forum: 'Latest forum',
  news: 'Latest news',
};

export type DashboardPanelPrefs = Partial<Record<DashboardPanelKey, boolean>>;

export function isDashboardPanelKey(value: string): value is DashboardPanelKey {
  return (DASHBOARD_PANEL_KEYS as readonly string[]).includes(value);
}

/** Missing/invalid keys default to visible — new panels ship on by default. */
export function isDashboardPanelVisible(
  prefs: DashboardPanelPrefs | null | undefined,
  key: DashboardPanelKey
): boolean {
  return prefs?.[key] !== false;
}

/** Strips unknown keys and coerces values to boolean before persisting. */
export function sanitizeDashboardPanelPrefs(
  input: Record<string, unknown>
): DashboardPanelPrefs {
  const result: DashboardPanelPrefs = {};
  for (const key of DASHBOARD_PANEL_KEYS) {
    if (typeof input[key] === 'boolean') result[key] = input[key] as boolean;
  }
  return result;
}
