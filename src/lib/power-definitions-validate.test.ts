import { describe, expect, it } from 'vitest';
import { validatePowerRecord } from '@/lib/power-definitions-validate';

const valid = {
  key: 'dash_burst',
  name: 'Dash Burst',
  effectType: 'burst_effect',
  cost: { type: 'flat', base: 1 },
  effectParams: { kind: 'range_dash', energyCost: -4, cooldownMs: 200 },
};

describe('validatePowerRecord', () => {
  it('rejects missing name and bad keys', () => {
    expect(validatePowerRecord(null).ok).toBe(false);
    expect(validatePowerRecord({ ...valid, key: 'no spaces' }).ok).toBe(false);
    expect(validatePowerRecord({ ...valid, name: '  ' }).ok).toBe(false);
  });

  it('accepts a well-formed record and clamps negative effect numbers', () => {
    const result = validatePowerRecord(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.key).toBe('dash_burst');
    expect(result.record.isCore).toBe(false);
    const params = result.record.effectParams as { energyCost?: number };
    expect(params.energyCost).toBe(0);
  });
});
