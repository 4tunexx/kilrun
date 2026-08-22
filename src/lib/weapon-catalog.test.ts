import { describe, expect, it } from 'vitest';
import { catalogWeaponLabel } from '@/lib/weapon-catalog';

describe('catalogWeaponLabel', () => {
  it('resolves catalog slugs and shop preset ids', () => {
    expect(catalogWeaponLabel('pistol_001')).toBe('Pistol');
    expect(catalogWeaponLabel('sniper_rifle_001')).toBe('Sniper');
    expect(catalogWeaponLabel('pistol')).toBe('Pistol');
    expect(catalogWeaponLabel('sword')).toBe('Axe');
    expect(catalogWeaponLabel('')).toBeNull();
    expect(catalogWeaponLabel(undefined)).toBeNull();
    expect(catalogWeaponLabel('not_a_weapon')).toBeNull();
  });
});
