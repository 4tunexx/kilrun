export const MODULE_KINDS = ['plugin', 'extension', 'addon'] as const;
export type ModuleKind = (typeof MODULE_KINDS)[number];

export const MODULE_KIND_META: Record<
  ModuleKind,
  {
    label: string;
    plural: string;
    tagline: string;
    folder: 'Plugins' | 'Extensions' | 'Addons';
    archiveExt: string;
    manifestFile: string;
  }
> = {
  plugin: {
    label: 'Plugin',
    plural: 'Plugins',
    tagline: 'Gameplay actions — modes, weapons, entity scripts',
    folder: 'Plugins',
    archiveExt: '.kplugin',
    manifestFile: 'plugin.json',
  },
  extension: {
    label: 'Extension',
    plural: 'Extensions',
    tagline: 'Editor tools — toolbar actions that never run on the live server',
    folder: 'Extensions',
    archiveExt: '.kext',
    manifestFile: 'extension.json',
  },
  addon: {
    label: 'Addon',
    plural: 'Addons',
    tagline: 'Engine Packs — themes, content, and official client upgrades',
    folder: 'Addons',
    archiveExt: '.kaddon',
    manifestFile: 'addon.json',
  },
};

export function isModuleKind(value: unknown): value is ModuleKind {
  return MODULE_KINDS.includes(value as ModuleKind);
}

export function parseModuleKind(value: unknown, fallback: ModuleKind = 'plugin'): ModuleKind {
  return isModuleKind(value) ? value : fallback;
}

export function inferKindFromManifestName(name: string): ModuleKind | null {
  const base = name.replace(/\\/g, '/').split('/').pop() || '';
  if (base === 'extension.json') return 'extension';
  if (base === 'addon.json') return 'addon';
  if (base === 'plugin.json') return 'plugin';
  return null;
}

export function kindAllowsServer(kind: ModuleKind): boolean {
  return kind === 'plugin';
}
