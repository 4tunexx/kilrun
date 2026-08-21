import { describe, expect, it } from 'vitest';
import { computeAbilityStatBonuses, type PowerDefinitionRecord } from '@shared/power-definitions';

describe('computeAbilityStatBonuses', () => {
  it('applies reloadSpeed multipliers from stat_bonus powers', () => {
    const defs: PowerDefinitionRecord[] = [
      {
        key: 'quick_hands',
        name: 'Quick Hands',
        description: '',
        icon: '',
        maxLevel: 5,
        unlockLevel: 0,
        prerequisites: [],
        cost: { type: 'flat', base: 1 },
        effectType: 'stat_bonus',
        effectParams: {
          bonuses: [{ stat: 'reloadSpeed', mode: 'multiplicative', perLevel: 0.1 }],
        },
        isCore: false,
        sortOrder: 0,
        posX: null,
        posY: null,
      },
    ];
    const bonuses = computeAbilityStatBonuses({ quick_hands: 3 }, defs);
    expect(bonuses.reloadSpeedMultiplier).toBeCloseTo(1.3);
  });
});
