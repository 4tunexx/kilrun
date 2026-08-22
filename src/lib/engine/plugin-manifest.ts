import {
  isPluginModeId,
  parsePluginModeSpec,
  type PluginModeSpec,
} from '@/lib/game-modes';
import { KILRUN_ENGINE_VERSION } from './version';

export const PLUGIN_PERMISSIONS = [
  'editor',
  'map',
  'playtest',
  'weapons',
  'assets',
  'modes',
  'server',
] as const;
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  engine?: string;
  entry: string;
  permissions?: PluginPermission[];
  modes?: PluginModeSpec[];
};

export type InstalledPlugin = PluginManifest & {
  enabled: boolean;
  path: string;
};

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/;

export function isPluginPermission(value: unknown): value is PluginPermission {
  return PLUGIN_PERMISSIONS.includes(value as PluginPermission);
}

/**
 * Missing `permissions` (legacy manifests, predating this permission system)
 * allow everything EXCEPT `server` — that one gate exists specifically to
 * keep a plugin's server-executable source out of the live catalog unless
 * the manifest opts in explicitly (see `catalogSourceForPublish`). Defaulting
 * it to allow-everything meant simply omitting `permissions` bypassed that
 * gate entirely, shipping arbitrary server-side code with no opt-in at all.
 * An empty list still denies every gated API, same as before.
 */
export function pluginHasPermission(
  permissions: readonly string[] | undefined | null,
  need: PluginPermission
): boolean {
  if (need === 'server') return permissions != null && permissions.includes('server');
  if (permissions == null) return true;
  if (need === 'editor' || need === 'map') {
    return permissions.includes('editor') || permissions.includes('map');
  }
  return permissions.includes(need);
}

export function permissionForHostMessage(type: string): PluginPermission | null {
  switch (type) {
    case 'registerPanel':
    case 'mutateDoc':
      return 'editor';
    case 'registerWeapon':
    case 'registerShopItem':
      return 'weapons';
    case 'registerMode':
      return 'modes';
    case 'startPlay':
      return 'playtest';
    case 'assetRequest':
      return 'assets';
    default:
      return null;
  }
}

export function hostMessageAllowed(
  permissions: readonly string[] | undefined | null,
  type: string
): boolean {
  const need = permissionForHostMessage(type);
  if (!need) return true;
  return pluginHasPermission(permissions, need);
}

export function parseVersionParts(version: string): [number, number, number] {
  const bits = String(version || '0')
    .split('.')
    .map((part) => Number.parseInt(part.replace(/[^\d]/g, ''), 10) || 0);
  return [bits[0] ?? 0, bits[1] ?? 0, bits[2] ?? 0];
}

export function engineMeetsRequirement(required?: string, current = KILRUN_ENGINE_VERSION): boolean {
  if (!required?.trim()) return true;
  const need = parseVersionParts(required);
  const have = parseVersionParts(current);
  for (let i = 0; i < 3; i++) {
    if (have[i] > need[i]) return true;
    if (have[i] < need[i]) return false;
  }
  return true;
}

export function parsePluginManifest(raw: unknown): PluginManifest {
  if (!raw || typeof raw !== 'object') throw new Error('plugin.json is invalid');
  const row = raw as Record<string, unknown>;
  const id = String(row.id || '').trim();
  if (!ID_RE.test(id)) throw new Error('plugin.json id must be letters, numbers, _ or -');
  const name = String(row.name || id).trim();
  const version = String(row.version || '0.0.0').trim();
  const entry = String(row.entry || 'index.js').replace(/\\/g, '/').trim();
  if (!entry || entry.includes('..') || entry.startsWith('/')) {
    throw new Error('plugin.json entry path is invalid');
  }
  const permissions = Array.isArray(row.permissions)
    ? row.permissions.filter(isPluginPermission)
    : undefined;
  const modes = Array.isArray(row.modes)
    ? row.modes.map(parsePluginModeSpec).filter((spec): spec is PluginModeSpec => Boolean(spec))
    : [];
  if (row.modes && !Array.isArray(row.modes)) {
    throw new Error('plugin.json modes must be an array');
  }
  for (const spec of modes) {
    if (!isPluginModeId(spec.id)) throw new Error(`plugin.json mode id "${spec.id}" is invalid`);
  }
  return {
    id,
    name,
    version,
    author: row.author ? String(row.author) : undefined,
    description: row.description ? String(row.description) : undefined,
    engine: row.engine ? String(row.engine) : undefined,
    entry,
    permissions,
    modes: modes.length ? modes : undefined,
  };
}
