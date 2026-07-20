/**
 * Weapon skins = visual mesh on the hand (Model Editor) + combat stats.
 *
 * Recommended pipeline (fits Kilrun today):
 * 1. Model Editor → Weapon slot → sculpt / upload GLB / catalog sword
 * 2. Place with Offset on the right hand (Follow bone) — same spot in play
 * 3. Set combat: Melee / Hitscan / Cosmetic-only
 * 4. Character plays attack/punch clip on swing (not a second animated weapon rig)
 *
 * Why not full animated weapon GLBs as the main path?
 * - Combat is cone/hitscan abstract (server already does this for trappers)
 * - Skins already parent to hand bones; character AnimationMixer drives the swing
 * - Dual mixers + retargeting is heavy for little gameplay gain
 *
 * Optional later: idle fidget / reload VFX clips on the weapon mesh only.
 */

export type WeaponCombatKind = 'melee' | 'hitscan' | 'cosmetic';

export type WeaponAttackStyle = 'attack' | 'punch';

export interface WeaponCombatConfig {
  /** melee = short cone; hitscan = longer aim cone; cosmetic = looks only */
  kind: WeaponCombatKind;
  range: number;
  damage: number;
  cooldownMs: number;
  /** Aim cone half-angle (radians). */
  coneRadians?: number;
  /**
   * Tip / muzzle offset from the weapon grip (local).
   * Used for VFX / future ray origin — not mesh collision.
   */
  muzzleOffset?: [number, number, number];
  /** Which character anim slot to prefer when swinging. */
  attackStyle?: WeaponAttackStyle;
}

export const WEAPON_COMBAT_KINDS: {
  id: WeaponCombatKind;
  label: string;
  hint: string;
}[] = [
  {
    id: 'melee',
    label: 'Melee',
    hint: 'Sword / punch — short range cone in front',
  },
  {
    id: 'hitscan',
    label: 'Hitscan',
    hint: 'Gun / staff — longer aim cone (trapper-style)',
  },
  {
    id: 'cosmetic',
    label: 'Look only',
    hint: 'Shows on character but does not change combat',
  },
];

export const DEFAULT_MELEE_COMBAT: WeaponCombatConfig = {
  kind: 'melee',
  range: 2.4,
  damage: 20,
  /** Foundry MeleeDurationTimer 0.5s; cooldown ~same cadence. */
  cooldownMs: 500,
  coneRadians: 0.5,
  muzzleOffset: [0, 0.35, 0],
  attackStyle: 'attack',
};

export const DEFAULT_HITSCAN_COMBAT: WeaponCombatConfig = {
  kind: 'hitscan',
  range: 14,
  damage: 25,
  cooldownMs: 280,
  coneRadians: 0.18,
  muzzleOffset: [0, 0.05, 0.45],
  attackStyle: 'attack',
};

export const DEFAULT_COSMETIC_COMBAT: WeaponCombatConfig = {
  kind: 'cosmetic',
  range: 0,
  damage: 0,
  cooldownMs: 500,
  attackStyle: 'punch',
};

export function defaultCombatForKind(kind: WeaponCombatKind): WeaponCombatConfig {
  if (kind === 'hitscan') return { ...DEFAULT_HITSCAN_COMBAT };
  if (kind === 'cosmetic') return { ...DEFAULT_COSMETIC_COMBAT };
  return { ...DEFAULT_MELEE_COMBAT };
}

/** Resolve combat from a weapon skin attachment (or defaults). */
export function resolveWeaponCombat(
  weaponAtt:
    | {
        weapon?: WeaponCombatConfig | null;
        slot?: string;
      }
    | null
    | undefined
): WeaponCombatConfig {
  if (weaponAtt?.weapon?.kind) {
    const base = defaultCombatForKind(weaponAtt.weapon.kind);
    return {
      ...base,
      ...weaponAtt.weapon,
      muzzleOffset: weaponAtt.weapon.muzzleOffset ?? base.muzzleOffset,
    };
  }
  return { ...DEFAULT_MELEE_COMBAT };
}

/** Pick the active weapon attachment from a skin list. */
export function findWeaponAttachment<T extends { slot: string }>(
  attachments: T[] | null | undefined
): T | undefined {
  return attachments?.find((a) => a.slot === 'weapon');
}
