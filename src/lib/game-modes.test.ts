import { describe, expect, it } from 'vitest';
import {
  clearPluginModes,
  getKilrunModeInfo,
  isCoreKilrunMode,
  isKilrunMode,
  listKilrunModes,
  normalizeKilrunMode,
  registerPluginMode,
  resolveModeBase,
} from './game-modes';

describe('game modes', () => {
  it('keeps unknown plugin slugs instead of coercing to deathrun', () => {
    expect(normalizeKilrunMode('gauntlet')).toBe('gauntlet');
    expect(isKilrunMode('gauntlet')).toBe(true);
    expect(isCoreKilrunMode('gauntlet')).toBe(false);
    expect(normalizeKilrunMode('deathrun_practice')).toBe('deathrun');
    expect(normalizeKilrunMode('???')).toBe('deathrun');
  });

  it('registers a 4th mode from a plugin spec', () => {
    clearPluginModes();
    const info = registerPluginMode({
      id: 'gauntlet',
      title: 'Gauntlet',
      base: 'deathrun',
      editorBlurb: 'Plugin deathrun variant',
    });
    expect(info?.id).toBe('gauntlet');
    expect(listKilrunModes()).toContain('gauntlet');
    expect(resolveModeBase('gauntlet')).toBe('deathrun');
    expect(getKilrunModeInfo('gauntlet').shortTitle).toBe('Gauntlet');
    clearPluginModes();
  });
});
