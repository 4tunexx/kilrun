export type PanelShape = 'chamfer' | 'square' | 'rounded';

export type ThemePalette = {
  id: string;
  name: string;
  primary: string;
  primaryHover: string;
  primaryHoverOpacity: number;
  secondary: string;
  secondaryHover: string;
  secondaryHoverOpacity: number;
  accent: string;
  destructive: string;
  destructiveHover: string;
  destructiveHoverOpacity: number;
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  border: string;
  glassStroke: string;
  icon: string;
  iconHover: string;
  glassTint: string;
  insetTint: string;
  panelHoverTint: string;
  panelHoverBorder: string;
  glassGradientTint: string;
  glassShadowTint: string;
  glassOpacity: number;
  insetOpacity: number;
  glassBlur: number;
  insetBlur: number;
  glassSaturation: number;
  insetSaturation: number;
  gradientStrength: number;
  borderOpacity: number;
  insetBorderOpacity: number;
  panelHoverOpacity: number;
  buttonHoverBrightness: number;
  panelShape: PanelShape;
  panelCut: number;
  panelRadius: number;
};

const ORIGINAL_STYLE = {
  primary: '#e13d48',
  primaryHover: '#e13d48',
  primaryHoverOpacity: 90,
  secondary: '#2d374e',
  secondaryHover: '#2d374e',
  secondaryHoverOpacity: 80,
  accent: '#fafafa',
  destructive: '#811d1d',
  destructiveHover: '#a12323',
  destructiveHoverOpacity: 90,
  background: '#161b27',
  surface: '#1e2434',
  foreground: '#fafafa',
  muted: '#a1a1a1',
  border: '#2d374e',
  glassStroke: '#94a3b8',
  icon: '#e13d48',
  iconHover: '#e13d48',
  glassTint: '#0f172a',
  insetTint: '#0f172a',
  panelHoverTint: '#1e293b',
  panelHoverBorder: '#fb923c',
  glassGradientTint: '#1e293b',
  glassShadowTint: '#020617',
  glassOpacity: 90,
  insetOpacity: 72,
  glassBlur: 20,
  insetBlur: 14,
  glassSaturation: 130,
  insetSaturation: 120,
  gradientStrength: 8,
  borderOpacity: 20,
  insetBorderOpacity: 16,
  panelHoverOpacity: 84,
  buttonHoverBrightness: 110,
  panelShape: 'chamfer' as const,
  panelCut: 10,
  panelRadius: 12,
};

function createPalette(id: string, name: string, colors: Partial<ThemePalette> = {}): ThemePalette {
  return { ...ORIGINAL_STYLE, id, name, ...colors };
}

export const THEME_PALETTES: ThemePalette[] = [
  createPalette('kilrun-original', 'Kilrun Original'),
  createPalette('light-gray', 'Light Gray', {
    primary: '#d1d5db',
    primaryHover: '#b8bec8',
    accent: '#d1d5db',
    background: '#20242b',
    surface: '#30363f',
    foreground: '#f8fafc',
    muted: '#b0b8c2',
    border: '#4b5563',
    icon: '#d1d5db',
  }),
  createPalette('charcoal', 'Blackish', {
    primary: '#f97316',
    primaryHover: '#ea650d',
    accent: '#f97316',
    background: '#101114',
    surface: '#1b1c20',
    foreground: '#f4f4f5',
    muted: '#a1a1aa',
    border: '#3f3f46',
    icon: '#f97316',
    glassTint: '#08090b',
    insetTint: '#08090b',
  }),
  createPalette('emerald', 'Green', {
    primary: '#34d399',
    primaryHover: '#22b981',
    secondary: '#24483d',
    secondaryHover: '#315b4e',
    accent: '#34d399',
    background: '#101d1a',
    surface: '#192a25',
    foreground: '#f0fdf4',
    muted: '#9ab5aa',
    border: '#36534a',
    icon: '#34d399',
    glassTint: '#0d1815',
    insetTint: '#0d1815',
  }),
];

export const DEFAULT_THEME_PALETTE = THEME_PALETTES[0];

export const THEME_COLOR_FIELDS = [
  { key: 'primary', label: 'Primary buttons' },
  { key: 'primaryHover', label: 'Primary button hover' },
  { key: 'secondaryHover', label: 'Secondary button hover' },
  { key: 'background', label: 'Page background' },
  { key: 'surface', label: 'Panel surface' },
  { key: 'secondary', label: 'Secondary controls' },
  { key: 'accent', label: 'Highlight / ghost hover' },
  { key: 'destructive', label: 'Destructive buttons' },
  { key: 'destructiveHover', label: 'Destructive button hover' },
  { key: 'foreground', label: 'Main text' },
  { key: 'muted', label: 'Muted text' },
  { key: 'border', label: 'Panel borders' },
  { key: 'glassStroke', label: 'Glass panel strokes' },
  { key: 'icon', label: 'Accent icons' },
  { key: 'iconHover', label: 'Accent icon hover' },
  { key: 'glassTint', label: 'Glass tint' },
  { key: 'insetTint', label: 'Inset glass tint' },
  { key: 'panelHoverTint', label: 'Panel hover fill' },
  { key: 'panelHoverBorder', label: 'Panel hover stroke' },
  { key: 'glassGradientTint', label: 'Glass gradient mid-tone' },
  { key: 'glassShadowTint', label: 'Glass gradient shadow' },
] as const satisfies readonly { key: keyof ThemePalette; label: string }[];

export const THEME_SLIDER_FIELDS = [
  { key: 'glassOpacity', label: 'Main glass visibility', min: 50, max: 100, unit: '%' },
  { key: 'insetOpacity', label: 'Inset glass visibility', min: 35, max: 95, unit: '%' },
  { key: 'glassBlur', label: 'Main panel blur', min: 0, max: 36, unit: 'px' },
  { key: 'insetBlur', label: 'Inset panel blur', min: 0, max: 30, unit: 'px' },
  { key: 'glassSaturation', label: 'Glass color richness', min: 80, max: 180, unit: '%' },
  { key: 'insetSaturation', label: 'Inset color richness', min: 80, max: 180, unit: '%' },
  { key: 'gradientStrength', label: 'Glass highlight', min: 0, max: 20, unit: '%' },
  { key: 'borderOpacity', label: 'Panel stroke visibility', min: 0, max: 100, unit: '%' },
  { key: 'insetBorderOpacity', label: 'Inset stroke visibility', min: 0, max: 100, unit: '%' },
  { key: 'buttonHoverBrightness', label: 'Button hover brightness', min: 100, max: 125, unit: '%' },
  { key: 'primaryHoverOpacity', label: 'Primary hover fill', min: 50, max: 100, unit: '%' },
  { key: 'secondaryHoverOpacity', label: 'Secondary hover fill', min: 50, max: 100, unit: '%' },
  { key: 'destructiveHoverOpacity', label: 'Destructive hover fill', min: 50, max: 100, unit: '%' },
  { key: 'panelHoverOpacity', label: 'Panel hover fill', min: 40, max: 100, unit: '%' },
] as const satisfies readonly {
  key: keyof ThemePalette;
  label: string;
  min: number;
  max: number;
  unit: string;
}[];

const COLOR_KEYS = THEME_COLOR_FIELDS.map(({ key }) => key);
const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.max(min, Math.min(max, value)));
}

function isPanelShape(value: unknown): value is PanelShape {
  return value === 'chamfer' || value === 'square' || value === 'rounded';
}

export function parseThemePalette(value: unknown): ThemePalette {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return { ...DEFAULT_THEME_PALETTE };
    }
  }
  if (!isRecord(parsed)) return { ...DEFAULT_THEME_PALETTE };

  const preset =
    THEME_PALETTES.find((palette) => palette.id === parsed.id) ??
    DEFAULT_THEME_PALETTE;
  const colors = Object.fromEntries(
    COLOR_KEYS.map((key) => [
      key,
      isHexColor(parsed[key]) ? parsed[key] : preset[key],
    ])
  ) as Pick<ThemePalette, (typeof COLOR_KEYS)[number]>;
  const style = {
    glassOpacity: boundedNumber(parsed.glassOpacity, ORIGINAL_STYLE.glassOpacity, 50, 100),
    insetOpacity: boundedNumber(parsed.insetOpacity, ORIGINAL_STYLE.insetOpacity, 35, 95),
    glassBlur: boundedNumber(parsed.glassBlur, ORIGINAL_STYLE.glassBlur, 0, 36),
    insetBlur: boundedNumber(parsed.insetBlur, ORIGINAL_STYLE.insetBlur, 0, 30),
    glassSaturation: boundedNumber(parsed.glassSaturation, ORIGINAL_STYLE.glassSaturation, 80, 180),
    insetSaturation: boundedNumber(
      parsed.insetSaturation,
      ORIGINAL_STYLE.insetSaturation,
      80,
      180
    ),
    gradientStrength: boundedNumber(parsed.gradientStrength, ORIGINAL_STYLE.gradientStrength, 0, 20),
    borderOpacity: boundedNumber(parsed.borderOpacity, ORIGINAL_STYLE.borderOpacity, 0, 100),
    insetBorderOpacity: boundedNumber(
      parsed.insetBorderOpacity,
      ORIGINAL_STYLE.insetBorderOpacity,
      0,
      100
    ),
    panelHoverOpacity: boundedNumber(
      parsed.panelHoverOpacity,
      ORIGINAL_STYLE.panelHoverOpacity,
      40,
      100
    ),
    primaryHoverOpacity: boundedNumber(
      parsed.primaryHoverOpacity,
      ORIGINAL_STYLE.primaryHoverOpacity,
      50,
      100
    ),
    secondaryHoverOpacity: boundedNumber(
      parsed.secondaryHoverOpacity,
      ORIGINAL_STYLE.secondaryHoverOpacity,
      50,
      100
    ),
    destructiveHoverOpacity: boundedNumber(
      parsed.destructiveHoverOpacity,
      ORIGINAL_STYLE.destructiveHoverOpacity,
      50,
      100
    ),
    buttonHoverBrightness: boundedNumber(parsed.buttonHoverBrightness, ORIGINAL_STYLE.buttonHoverBrightness, 100, 125),
    panelShape: isPanelShape(parsed.panelShape) ? parsed.panelShape : ORIGINAL_STYLE.panelShape,
    panelCut: boundedNumber(parsed.panelCut, ORIGINAL_STYLE.panelCut, 0, 24),
    panelRadius: boundedNumber(parsed.panelRadius, ORIGINAL_STYLE.panelRadius, 0, 24),
  };
  const matchingPreset = THEME_PALETTES.find(
    (palette) =>
      COLOR_KEYS.every((key) => palette[key] === colors[key]) &&
      Object.keys(style).every(
        (key) =>
          style[key as keyof typeof style] ===
          palette[key as keyof ThemePalette]
      )
  );
  const isOriginal = matchingPreset?.id === DEFAULT_THEME_PALETTE.id;
  const name = isOriginal ? 'Kilrun Original' : matchingPreset?.name ?? 'Custom';

  return {
    id: isOriginal ? 'kilrun-original' : matchingPreset?.id ?? 'custom',
    name,
    ...colors,
    ...style,
  };
}

export function serializeThemePalette(value: unknown): string {
  return JSON.stringify(parseThemePalette(value));
}

export function hexToHsl(value: string): string {
  if (!isHexColor(value)) return '0 0% 0%';
  const red = parseInt(value.slice(1, 3), 16) / 255;
  const green = parseInt(value.slice(3, 5), 16) / 255;
  const blue = parseInt(value.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(
    lightness * 100
  )}%`;
}

function hexToRgb(value: string): string {
  if (!isHexColor(value)) return '0 0 0';
  return [1, 3, 5]
    .map((index) => parseInt(value.slice(index, index + 2), 16))
    .join(' ');
}

function readableForeground(hex: string): string {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const luminance = channels
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    )
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.179 ? '222 27% 12%' : '0 0% 98%';
}

function alpha(value: number): string {
  return Number((value / 100).toFixed(2)).toString();
}

export function themePaletteCssVariables(value: unknown): Record<string, string> {
  const palette = parseThemePalette(value);
  const primary = hexToHsl(palette.primary);
  const primaryForeground = readableForeground(palette.primary);
  const secondary = hexToHsl(palette.secondary);
  const background = hexToHsl(palette.background);
  const surface = hexToHsl(palette.surface);
  const foreground = hexToHsl(palette.foreground);
  const muted = hexToHsl(palette.muted);
  const border = hexToHsl(palette.border);

  return {
    '--primary': primary,
    '--primary-foreground': primaryForeground,
    '--primary-hover': hexToHsl(palette.primaryHover),
    '--primary-hover-opacity': alpha(palette.primaryHoverOpacity),
    '--ring': primary,
    '--background': background,
    '--foreground': foreground,
    '--card': surface,
    '--card-foreground': foreground,
    '--popover': surface,
    '--popover-foreground': foreground,
    '--secondary': secondary,
    '--secondary-foreground': foreground,
    '--secondary-hover': hexToHsl(palette.secondaryHover),
    '--secondary-hover-opacity': alpha(palette.secondaryHoverOpacity),
    '--muted': secondary,
    '--muted-foreground': muted,
    '--accent': hexToHsl(palette.accent),
    '--accent-foreground': readableForeground(palette.accent),
    '--destructive': hexToHsl(palette.destructive),
    '--destructive-foreground': readableForeground(palette.destructive),
    '--destructive-hover': hexToHsl(palette.destructiveHover),
    '--destructive-hover-opacity': alpha(palette.destructiveHoverOpacity),
    '--border': border,
    '--input': border,
    '--hub-glass-stroke': hexToHsl(palette.glassStroke),
    '--icon-color': hexToHsl(palette.icon),
    '--icon-hover-color': hexToHsl(palette.iconHover),
    '--hub-glass-tint': hexToRgb(palette.glassTint),
    '--hub-inset-tint': hexToRgb(palette.insetTint),
    '--hub-panel-hover-tint': hexToRgb(palette.panelHoverTint),
    '--hub-panel-hover-border': hexToHsl(palette.panelHoverBorder),
    '--hub-glass-gradient-tint': hexToRgb(palette.glassGradientTint),
    '--hub-glass-shadow-tint': hexToRgb(palette.glassShadowTint),
    '--hub-glass-opacity': alpha(palette.glassOpacity),
    '--hub-inset-opacity': alpha(palette.insetOpacity),
    '--hub-glass-blur': `${palette.glassBlur}px`,
    '--hub-inset-blur': `${palette.insetBlur}px`,
    '--hub-glass-saturation': `${palette.glassSaturation}%`,
    '--hub-inset-saturation': `${palette.insetSaturation}%`,
    '--hub-glass-highlight': alpha(palette.gradientStrength),
    '--hub-border-opacity': alpha(palette.borderOpacity),
    '--hub-inset-border-opacity': alpha(palette.insetBorderOpacity),
    '--hub-panel-hover-opacity': alpha(palette.panelHoverOpacity),
    '--button-hover-brightness': (palette.buttonHoverBrightness / 100).toFixed(2),
    '--panel-cut': `${palette.panelCut}px`,
    '--panel-radius': `${palette.panelRadius}px`,
  };
}

export function applyThemePalette(
  value: unknown,
  root: Pick<HTMLElement, 'dataset' | 'style'>
) {
  const palette = parseThemePalette(value);
  root.dataset.themePalette = palette.id;
  root.dataset.panelShape = palette.panelShape;
  for (const [property, color] of Object.entries(themePaletteCssVariables(palette))) {
    root.style.setProperty(property, color);
  }
}
