/**
 * Horde / Competitive weapon meshes under `/game/weapons/*.glb`.
 * Wire into Weapon Editor + in-match shop (deathrun keeps prototype sword/shield).
 */

import type { WeaponCombatConfig, WeaponCombatKind } from '@/lib/weapons';
import { defaultCombatForKind } from '@/lib/weapons';

export type CatalogWeaponId =
  | 'axe_001'
  | 'baseball_bat_001'
  | 'hockey_stick_001'
  | 'knife_001'
  | 'pistol_001'
  | 'rifle_001'
  | 'shotgun_001'
  | 'sniper_rifle_001';

export type CatalogWeaponDef = {
  id: CatalogWeaponId;
  /** Shop / editor label */
  label: string;
  /** Public URL for the GLB */
  modelUrl: string;
  kind: WeaponCombatKind;
  /** Defaults merged into WeaponCombatConfig */
  combat: Partial<WeaponCombatConfig>;
  /** Modes that show this weapon in the buy shop */
  modes: Array<'horde' | 'competitive'>;
  /** Hint for grip attach in Weapon Editor */
  gripHint: string;
};

const W = (file: CatalogWeaponId) => `/game/weapons/${file}.glb`;

export const CATALOG_WEAPONS: CatalogWeaponDef[] = [
  {
    id: 'pistol_001',
    label: 'Pistol',
    modelUrl: W('pistol_001'),
    kind: 'hitscan',
    combat: { damage: 25, range: 14, cooldownMs: 350, coneRadians: 0.18, muzzleOffset: [0, 0.05, 0.35] },
    modes: ['horde', 'competitive'],
    gripHint: 'Right hand — pistol grip, barrel along +Z',
  },
  {
    id: 'rifle_001',
    label: 'Rifle',
    modelUrl: W('rifle_001'),
    kind: 'hitscan',
    combat: { damage: 15, range: 12, cooldownMs: 150, coneRadians: 0.22, muzzleOffset: [0, 0.04, 0.55] },
    modes: ['horde', 'competitive'],
    gripHint: 'Right hand — rifle stock against shoulder',
  },
  {
    id: 'shotgun_001',
    label: 'Shotgun',
    modelUrl: W('shotgun_001'),
    kind: 'hitscan',
    combat: { damage: 60, range: 6, cooldownMs: 900, coneRadians: 0.45, muzzleOffset: [0, 0.05, 0.5] },
    modes: ['horde', 'competitive'],
    gripHint: 'Right hand — pump shotgun',
  },
  {
    id: 'sniper_rifle_001',
    label: 'Sniper',
    modelUrl: W('sniper_rifle_001'),
    kind: 'hitscan',
    combat: { damage: 80, range: 22, cooldownMs: 1200, coneRadians: 0.05, muzzleOffset: [0, 0.06, 0.7] },
    modes: ['horde', 'competitive'],
    gripHint: 'Right hand — long rifle, scoped',
  },
  {
    id: 'axe_001',
    label: 'Axe',
    modelUrl: W('axe_001'),
    kind: 'melee',
    combat: { damage: 55, range: 2.5, cooldownMs: 550, coneRadians: 0.55, attackStyle: 'attack' },
    modes: ['horde', 'competitive'],
    gripHint: 'Right hand — axe handle',
  },
  {
    id: 'baseball_bat_001',
    label: 'Baseball Bat',
    modelUrl: W('baseball_bat_001'),
    kind: 'melee',
    combat: { damage: 45, range: 2.6, cooldownMs: 480, coneRadians: 0.55, attackStyle: 'attack' },
    modes: ['horde', 'competitive'],
    gripHint: 'Right hand — bat grip',
  },
  {
    id: 'hockey_stick_001',
    label: 'Hockey Stick',
    modelUrl: W('hockey_stick_001'),
    kind: 'melee',
    combat: { damage: 40, range: 2.8, cooldownMs: 450, coneRadians: 0.5, attackStyle: 'attack' },
    modes: ['horde', 'competitive'],
    gripHint: 'Right hand — stick shaft',
  },
  {
    id: 'knife_001',
    label: 'Knife',
    modelUrl: W('knife_001'),
    kind: 'melee',
    combat: { damage: 30, range: 1.9, cooldownMs: 280, coneRadians: 0.6, attackStyle: 'punch' },
    modes: ['horde', 'competitive'],
    gripHint: 'Right hand — blade forward',
  },
];

export function catalogWeaponUrl(id: string): string | null {
  const hit = CATALOG_WEAPONS.find((w) => w.id === id || w.modelUrl.endsWith(`/${id}.glb`));
  return hit?.modelUrl ?? null;
}

export function resolveCatalogCombat(id: string): WeaponCombatConfig {
  const hit = CATALOG_WEAPONS.find((w) => w.id === id);
  if (!hit) return defaultCombatForKind('hitscan');
  return { ...defaultCombatForKind(hit.kind), ...hit.combat, kind: hit.kind };
}

/** Shop preset id → catalog mesh (Horde / Competitive buy phase). */
export const SHOP_PRESET_TO_CATALOG: Record<string, CatalogWeaponId> = {
  pistol: 'pistol_001',
  smg: 'rifle_001',
  shotgun: 'shotgun_001',
  sniper: 'sniper_rifle_001',
  sword: 'axe_001',
  fists: 'knife_001',
};
