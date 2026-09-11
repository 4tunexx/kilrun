import { describe, expect, it } from 'vitest';
import { clampPluginDamage, isPluginSandboxEnvelope } from './plugin-sandbox';

describe('plugin-sandbox host guards', () => {
  it('clamps playtest damage to 0–250', () => {
    expect(clampPluginDamage(12)).toBe(12);
    expect(clampPluginDamage(-4)).toBe(0);
    expect(clampPluginDamage(999)).toBe(250);
    expect(clampPluginDamage('nope')).toBe(0);
  });

  it('accepts only kilrun-plugin envelopes', () => {
    expect(isPluginSandboxEnvelope({ ns: 'kilrun-plugin', pluginId: 'p1', type: 'toast' })).toBe(
      true
    );
    expect(isPluginSandboxEnvelope({ ns: 'other', pluginId: 'p1' })).toBe(false);
    expect(isPluginSandboxEnvelope({ ns: 'kilrun-plugin' })).toBe(false);
    expect(isPluginSandboxEnvelope(null)).toBe(false);
  });
});
