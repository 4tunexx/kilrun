import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_PALETTE,
  hexToHsl,
  parseThemePalette,
  themePaletteCssVariables,
} from './theme-palette';

describe('theme palettes', () => {
  it('uses the default palette for missing or invalid settings', () => {
    expect(parseThemePalette('{}')).toEqual(DEFAULT_THEME_PALETTE);
    expect(parseThemePalette('not json')).toEqual(DEFAULT_THEME_PALETTE);
  });

  it('keeps valid custom colors and replaces invalid color values', () => {
    const palette = parseThemePalette({
      id: 'custom',
      primary: '#22c55e',
      background: 'url(javascript:alert(1))',
    });

    expect(palette.id).toBe('custom');
    expect(palette.primary).toBe('#22c55e');
    expect(palette.background).toBe(DEFAULT_THEME_PALETTE.background);
  });

  it('converts colors into HSL CSS tokens and selects readable button text', () => {
    expect(hexToHsl('#ffffff')).toBe('0 0% 100%');
    expect(hexToHsl('#ff0000')).toBe('0 100% 50%');

    const variables = themePaletteCssVariables({
      ...DEFAULT_THEME_PALETTE,
      primary: '#ffffff',
    });
    expect(variables['--primary']).toBe('0 0% 100%');
    expect(variables['--primary-foreground']).toBe('222 27% 12%');
  });
});
