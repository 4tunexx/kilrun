/**
 * Requirement catalog — built-in progression metrics + shop unlock channels,
 * with SiteSettings overlays for custom types and label edits.
 *
 * Built-in metrics must stay in sync with `metricCount()` in progression-actions.
 * Custom metrics are stored per-user in `User.customMetrics` and need no code change.
 */

import {
  REQUIREMENT_CATEGORY_LABELS,
  REQUIREMENT_TYPES,
  type RequirementCategory,
  type RequirementType,
} from '@/lib/requirement-types';

export type { RequirementCategory, RequirementType };

export type UnlockChannel = {
  id: string;
  label: string;
  hint: string;
  enabled: boolean;
  /** Built-in channels ship with the app; customs are editable/deletable. */
  builtIn: boolean;
};

export type CatalogMetric = RequirementType & {
  enabled: boolean;
  builtIn: boolean;
  /** `wired` = handled in metricCount; `custom` = User.customMetrics */
  source: 'wired' | 'custom';
};

export type RequirementCatalog = {
  metrics: CatalogMetric[];
  unlockChannels: UnlockChannel[];
};

/** Every metric key that `metricCount()` implements (for the admin scanner). */
export const WIRED_METRIC_KEYS: readonly string[] = [
  'runs',
  'wins',
  'horde_runs',
  'horde_wins',
  'horde_waves',
  'horde_kills',
  'competitive_runs',
  'competitive_wins',
  'kp',
  'distance',
  'score',
  'friends',
  'messages',
  'forum',
  'purchases',
  'email',
  'level',
  'vip',
  'chat',
  'logins',
  'missions_completed',
  'forum_replies',
  'vp_spent',
  'reputation',
  'daily_login_streak',
  'trapper_wins',
  'runner_survives',
  'losses',
  'eliminated',
  'badges_earned',
  'achievements_unlocked',
  'support_tickets',
  'cosmetic_owned',
  'banner_owned',
  'frame_owned',
  'nickname_owned',
  'cosmetics_equipped',
  'cosmetics_deleted',
  'cosmetics_resold',
  'daily_login',
  'daily_chat',
  'daily_forum',
  'daily_runs',
  'daily_horde',
  'daily_competitive',
  'daily_leaderboard',
];

export const DEFAULT_UNLOCK_CHANNELS: UnlockChannel[] = [
  {
    id: 'purchase',
    label: 'Purchase (VP)',
    hint: 'Players buy it in the shop',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'event',
    label: 'Event reward',
    hint: 'Won during a timed event / promo',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'mission',
    label: 'Mission reward',
    hint: 'Granted by completing a mission',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'achievement',
    label: 'Achievement reward',
    hint: 'Granted by an achievement',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'badge',
    label: 'Badge reward',
    hint: 'Comes with a badge',
    enabled: true,
    builtIn: true,
  },
];

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export function builtinCatalogMetrics(): CatalogMetric[] {
  const wired = new Set(WIRED_METRIC_KEYS);
  return REQUIREMENT_TYPES.map((t) => ({
    ...t,
    enabled: true,
    builtIn: true,
    source: wired.has(t.value) ? ('wired' as const) : ('custom' as const),
  }));
}

export function parseRequirementCatalog(raw: unknown): RequirementCatalog {
  let obj: Record<string, unknown> = {};
  try {
    if (typeof raw === 'string') {
      obj = JSON.parse(raw || '{}') as Record<string, unknown>;
    } else if (raw && typeof raw === 'object') {
      obj = raw as Record<string, unknown>;
    }
  } catch {
    obj = {};
  }

  const builtins = builtinCatalogMetrics();
  const byValue = new Map(builtins.map((m) => [m.value, { ...m }]));

  const customOrOverrides = Array.isArray(obj.metrics) ? obj.metrics : [];
  for (const row of customOrOverrides) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const value =
      typeof r.value === 'string' && r.value.trim()
        ? slugify(r.value)
        : '';
    if (!value) continue;
    const existing = byValue.get(value);
    const category = (typeof r.category === 'string' && r.category in REQUIREMENT_CATEGORY_LABELS
      ? r.category
      : existing?.category || 'game') as RequirementCategory;
    const next: CatalogMetric = {
      value,
      label:
        typeof r.label === 'string' && r.label.trim()
          ? r.label.trim().slice(0, 80)
          : existing?.label || value,
      description:
        typeof r.description === 'string'
          ? r.description.trim().slice(0, 240)
          : existing?.description || '',
      category,
      enabled: r.enabled === false ? false : true,
      builtIn: existing?.builtIn ?? false,
      source: existing?.builtIn
        ? existing.source
        : ('custom' as const),
    };
    byValue.set(value, next);
  }

  const unlockById = new Map(DEFAULT_UNLOCK_CHANNELS.map((u) => [u.id, { ...u }]));
  const unlockRows = Array.isArray(obj.unlockChannels) ? obj.unlockChannels : [];
  for (const row of unlockRows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id =
      typeof r.id === 'string' && r.id.trim() ? slugify(r.id) : '';
    if (!id) continue;
    const existing = unlockById.get(id);
    unlockById.set(id, {
      id,
      label:
        typeof r.label === 'string' && r.label.trim()
          ? r.label.trim().slice(0, 80)
          : existing?.label || id,
      hint:
        typeof r.hint === 'string'
          ? r.hint.trim().slice(0, 160)
          : existing?.hint || '',
      enabled: r.enabled === false ? false : true,
      builtIn: existing?.builtIn ?? false,
    });
  }

  return {
    metrics: Array.from(byValue.values()).sort((a, b) =>
      a.category === b.category
        ? a.label.localeCompare(b.label)
        : a.category.localeCompare(b.category)
    ),
    unlockChannels: Array.from(unlockById.values()),
  };
}

export function serializeRequirementCatalog(catalog: RequirementCatalog): string {
  // Persist only customs + builtins that were disabled / relabeled from defaults.
  const builtins = builtinCatalogMetrics();
  const builtinMap = new Map(builtins.map((b) => [b.value, b]));
  const metricsOut: CatalogMetric[] = [];
  for (const m of catalog.metrics) {
    const base = builtinMap.get(m.value);
    if (!base) {
      metricsOut.push({ ...m, builtIn: false, source: 'custom' });
      continue;
    }
    if (
      m.enabled !== base.enabled ||
      m.label !== base.label ||
      m.description !== base.description ||
      m.category !== base.category
    ) {
      metricsOut.push({ ...m, builtIn: true, source: base.source });
    }
  }

  const unlockOut: UnlockChannel[] = [];
  const defaultUnlock = new Map(DEFAULT_UNLOCK_CHANNELS.map((u) => [u.id, u]));
  for (const u of catalog.unlockChannels) {
    const base = defaultUnlock.get(u.id);
    if (!base) {
      unlockOut.push({ ...u, builtIn: false });
      continue;
    }
    if (u.enabled !== base.enabled || u.label !== base.label || u.hint !== base.hint) {
      unlockOut.push({ ...u, builtIn: true });
    }
  }

  return JSON.stringify({ metrics: metricsOut, unlockChannels: unlockOut });
}

export function enabledMetrics(catalog: RequirementCatalog): CatalogMetric[] {
  return catalog.metrics.filter((m) => m.enabled);
}

export function enabledUnlockChannels(catalog: RequirementCatalog): UnlockChannel[] {
  return catalog.unlockChannels.filter((u) => u.enabled);
}

export function groupCatalogMetrics(
  metrics: CatalogMetric[]
): Record<RequirementCategory, CatalogMetric[]> {
  const groups: Record<RequirementCategory, CatalogMetric[]> = {
    game: [],
    progression: [],
    website: [],
    social: [],
    cosmetics: [],
    daily: [],
  };
  for (const m of metrics) {
    (groups[m.category] ?? groups.game).push(m);
  }
  return groups;
}

export function scanRequirementCoverage(catalog: RequirementCatalog): {
  wired: string[];
  unwiredBuiltin: string[];
  custom: string[];
  orphanWired: string[];
} {
  const wiredSet = new Set(WIRED_METRIC_KEYS);
  const catalogValues = new Set(catalog.metrics.map((m) => m.value));
  const wired: string[] = [];
  const unwiredBuiltin: string[] = [];
  const custom: string[] = [];
  for (const m of catalog.metrics) {
    if (!m.builtIn || m.source === 'custom') {
      if (!m.builtIn) custom.push(m.value);
      else if (!wiredSet.has(m.value)) unwiredBuiltin.push(m.value);
      else wired.push(m.value);
    } else if (wiredSet.has(m.value)) {
      wired.push(m.value);
    } else {
      unwiredBuiltin.push(m.value);
    }
  }
  const orphanWired = WIRED_METRIC_KEYS.filter((k) => !catalogValues.has(k));
  return { wired, unwiredBuiltin, custom, orphanWired };
}

export { REQUIREMENT_CATEGORY_LABELS, slugify as slugifyRequirementValue };
