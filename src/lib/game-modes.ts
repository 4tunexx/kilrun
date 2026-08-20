/**
 * Shared Kilrun game-mode catalog used by Play hub, Map Editor, and progression.
 * Core modes ship in the app. Plugins may register extra mode ids (slugs) that
 * reuse a core sim ("base") without an EXE rebuild.
 */

export type CoreKilrunMode = 'deathrun' | 'horde' | 'competitive';
/** Core mode or a plugin slug such as `gauntlet`. */
export type KilrunMode = CoreKilrunMode | (string & {});

export const KILRUN_MODES: CoreKilrunMode[] = ['deathrun', 'horde', 'competitive'];

export const PLUGIN_MODE_ID_RE = /^[a-z][a-z0-9-]{1,31}$/;

const RESERVED_MODE_IDS = new Set<string>([
  'deathrun',
  'horde',
  'competitive',
  'deathrun_practice',
  'horde_practice',
  'competitive_practice',
  'competitive_ranked',
]);

export interface KilrunModeInfo {
  id: KilrunMode;
  title: string;
  shortTitle: string;
  description: string;
  players: string;
  /** Map-editor focused blurb */
  editorBlurb: string;
  accentClass: string;
  badgeClass: string;
  /** Sim this custom mode reuses. Core modes equal their own id. */
  base: CoreKilrunMode;
}

export type PluginModeSpec = {
  id: string;
  title: string;
  shortTitle?: string;
  description?: string;
  players?: string;
  editorBlurb?: string;
  base?: string;
};

export const KILRUN_MODE_INFO: Record<CoreKilrunMode, KilrunModeInfo> = {
  deathrun: {
    id: 'deathrun',
    title: 'Deathrun',
    shortTitle: 'Deathrun',
    description:
      'Platformer Deathrun: jump floating pads, dodge traps, manage Energy. One player may become the Trapper — runners race the course to the finish.',
    players: 'Up to 8',
    editorBlurb: 'Course, traps, Start/Finish, Trapper spawn, buttons & hazards.',
    accentClass: 'from-orange-500/20 to-cyan-500/20 border-orange-500/40',
    badgeClass: 'bg-orange-600/80',
    base: 'deathrun',
  },
  horde: {
    id: 'horde',
    title: 'Horde Mode',
    shortTitle: 'Horde',
    description:
      'Up to 4 players clear escalating waves of enemies. Survive, revive teammates, and push through harder waves.',
    players: '1–4 co-op',
    editorBlurb: 'Monster spawns, red zones, health floors, revive pads, player spawns.',
    accentClass: 'from-rose-500/20 to-amber-500/20 border-rose-500/40',
    badgeClass: 'bg-rose-600/80',
    base: 'horde',
  },
  competitive: {
    id: 'competitive',
    title: 'Competitive 4v4',
    shortTitle: 'Competitive',
    description:
      '4v4 · six rounds. Casual keeps XP/KD only. Ranked (Premium) moves Killrun Points (KP) Elo.',
    players: '4v4 · 6 rounds',
    editorBlurb: 'Team A / Team B spawns, arena solids, cover props.',
    accentClass: 'from-sky-500/20 to-indigo-500/20 border-sky-500/40',
    badgeClass: 'bg-sky-600/80',
    base: 'competitive',
  },
};

const pluginModes = new Map<string, KilrunModeInfo>();

export function isCoreKilrunMode(value: unknown): value is CoreKilrunMode {
  return value === 'deathrun' || value === 'horde' || value === 'competitive';
}

export function isPluginModeId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    PLUGIN_MODE_ID_RE.test(value) &&
    !RESERVED_MODE_IDS.has(value)
  );
}

export function isKilrunMode(value: unknown): value is KilrunMode {
  return isCoreKilrunMode(value) || isPluginModeId(value);
}

export function normalizeKilrunMode(value: unknown): KilrunMode {
  if (typeof value !== 'string') return 'deathrun';
  const id = value.trim().toLowerCase();
  return isKilrunMode(id) ? id : 'deathrun';
}

export function resolveModeBase(mode: string | null | undefined): CoreKilrunMode {
  const id = normalizeKilrunMode(mode);
  if (isCoreKilrunMode(id)) return id;
  const spec = pluginModes.get(id);
  return spec?.base && isCoreKilrunMode(spec.base) ? spec.base : 'deathrun';
}

export function parsePluginModeSpec(raw: unknown): PluginModeSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id || '')
    .trim()
    .toLowerCase();
  if (!isPluginModeId(id)) return null;
  const title = String(row.title || id).trim() || id;
  const baseRaw = String(row.base || 'deathrun')
    .trim()
    .toLowerCase();
  const base: CoreKilrunMode = isCoreKilrunMode(baseRaw) ? baseRaw : 'deathrun';
  return {
    id,
    title,
    shortTitle: row.shortTitle ? String(row.shortTitle) : title,
    description: row.description ? String(row.description) : `${title} (plugin mode)`,
    players: row.players ? String(row.players) : KILRUN_MODE_INFO[base].players,
    editorBlurb: row.editorBlurb ? String(row.editorBlurb) : KILRUN_MODE_INFO[base].editorBlurb,
    base,
  };
}

function specToInfo(spec: PluginModeSpec): KilrunModeInfo {
  const base = isCoreKilrunMode(spec.base) ? spec.base : 'deathrun';
  return {
    id: spec.id,
    title: spec.title,
    shortTitle: spec.shortTitle || spec.title,
    description: spec.description || `${spec.title} (plugin mode)`,
    players: spec.players || KILRUN_MODE_INFO[base].players,
    editorBlurb: spec.editorBlurb || KILRUN_MODE_INFO[base].editorBlurb,
    accentClass: 'from-red-500/20 to-fuchsia-500/20 border-red-500/40',
    badgeClass: 'bg-red-600/80',
    base,
  };
}

function emitModesChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('kilrun-plugin-modes-changed'));
}

export function registerPluginMode(raw: PluginModeSpec | unknown): KilrunModeInfo | null {
  const spec = parsePluginModeSpec(raw);
  if (!spec) return null;
  const info = specToInfo(spec);
  pluginModes.set(spec.id, info);
  emitModesChanged();
  return info;
}

export function clearPluginModes() {
  if (pluginModes.size === 0) return;
  pluginModes.clear();
  emitModesChanged();
}

export function listPluginModes(): KilrunModeInfo[] {
  return [...pluginModes.values()].sort((a, b) => a.shortTitle.localeCompare(b.shortTitle));
}

export function listKilrunModes(): KilrunMode[] {
  return [...KILRUN_MODES, ...listPluginModes().map((row) => row.id)];
}

export function getKilrunModeInfo(mode: string | null | undefined): KilrunModeInfo {
  const id = normalizeKilrunMode(mode);
  if (isCoreKilrunMode(id)) return KILRUN_MODE_INFO[id];
  return (
    pluginModes.get(id) ?? {
      id,
      title: id,
      shortTitle: id,
      description: 'Custom plugin game mode',
      players: '—',
      editorBlurb: 'Uses Deathrun tools until the plugin loads.',
      accentClass: 'from-red-500/20 to-fuchsia-500/20 border-red-500/40',
      badgeClass: 'bg-red-600/80',
      base: 'deathrun',
    }
  );
}

export function registerModesFromPluginRuntime(
  runtime: Array<{ modes?: PluginModeSpec[] }> | null | undefined
) {
  if (!runtime) return;
  for (const bundle of runtime) {
    for (const spec of bundle.modes ?? []) registerPluginMode(spec);
  }
}
