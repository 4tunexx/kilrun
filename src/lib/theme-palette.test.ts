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
    expect(DEFAULT_THEME_PALETTE).toMatchObject({
      primary: '#e13d48',
      background: '#161b27',
      surface: '#1e2434',
      secondary: '#2d374e',
      glassTint: '#0f172a',
      glassOpacity: 90,
      insetOpacity: 72,
      glassBlur: 20,
      insetBlur: 14,
      glassSaturation: 130,
      insetSaturation: 120,
      borderOpacity: 20,
      insetBorderOpacity: 16,
      panelShape: 'chamfer',
      panelCut: 10,
    });
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

  it('clamps saved visual controls and exposes glass and shape CSS variables', () => {
    const palette = parseThemePalette({
      ...DEFAULT_THEME_PALETTE,
      glassOpacity: 200,
      glassBlur: -5,
      panelCut: 100,
      panelShape: 'rounded',
    });
    const variables = themePaletteCssVariables(palette);

    expect(palette.glassOpacity).toBe(100);
    expect(palette.glassBlur).toBe(0);
    expect(palette.panelCut).toBe(24);
    expect(variables['--hub-glass-opacity']).toBe('1');
    expect(variables['--hub-glass-blur']).toBe('0px');
    expect(palette.panelShape).toBe('rounded');
  });
});
