export type ThemePalette = {
  id: string;
  name: string;
  primary: string;
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  border: string;
};

export const THEME_PALETTES: ThemePalette[] = [
  {
    id: 'kilrun-orange',
    name: 'Kilrun Orange',
    primary: '#e83d48',
    background: '#171b28',
    surface: '#202637',
    foreground: '#fafafa',
    muted: '#a1a8b5',
    border: '#374151',
  },
  {
    id: 'light-gray',
    name: 'Light Gray',
    primary: '#d1d5db',
    background: '#20242b',
    surface: '#30363f',
    foreground: '#f8fafc',
    muted: '#b0b8c2',
    border: '#4b5563',
  },
  {
    id: 'charcoal',
    name: 'Blackish',
    primary: '#f97316',
    background: '#101114',
    surface: '#1b1c20',
    foreground: '#f4f4f5',
    muted: '#a1a1aa',
    border: '#3f3f46',
  },
  {
    id: 'emerald',
    name: 'Green',
    primary: '#34d399',
    background: '#101d1a',
    surface: '#192a25',
    foreground: '#f0fdf4',
    muted: '#9ab5aa',
    border: '#36534a',
  },
];

export const DEFAULT_THEME_PALETTE = THEME_PALETTES[0];

export const THEME_COLOR_FIELDS = [
  { key: 'primary', label: 'Primary / buttons' },
  { key: 'background', label: 'Page background' },
  { key: 'surface', label: 'Panel surface' },
  { key: 'foreground', label: 'Main text' },
  { key: 'muted', label: 'Muted text' },
  { key: 'border', label: 'Panel borders' },
] as const satisfies readonly { key: keyof ThemePalette; label: string }[];

const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  const colors = {
    primary: isHexColor(parsed.primary) ? parsed.primary : preset.primary,
    background: isHexColor(parsed.background) ? parsed.background : preset.background,
    surface: isHexColor(parsed.surface) ? parsed.surface : preset.surface,
    foreground: isHexColor(parsed.foreground) ? parsed.foreground : preset.foreground,
    muted: isHexColor(parsed.muted) ? parsed.muted : preset.muted,
    border: isHexColor(parsed.border) ? parsed.border : preset.border,
  };
  const matchingPreset = THEME_PALETTES.find((palette) =>
    THEME_COLOR_FIELDS.every(({ key }) => palette[key] === colors[key])
  );
  if (matchingPreset) return { ...matchingPreset };

  return { id: 'custom', name: 'Custom', ...colors };
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

function readableForeground(hex: string): string {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const luminance = channels
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    )
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.179 ? '222 27% 12%' : '0 0% 98%';
}

export function themePaletteCssVariables(value: unknown): Record<string, string> {
  const palette = parseThemePalette(value);
  const primary = hexToHsl(palette.primary);
  const background = hexToHsl(palette.background);
  const surface = hexToHsl(palette.surface);
  const foreground = hexToHsl(palette.foreground);
  const muted = hexToHsl(palette.muted);
  const border = hexToHsl(palette.border);

  return {
    '--primary': primary,
    '--primary-foreground': readableForeground(palette.primary),
    '--ring': primary,
    '--background': background,
    '--foreground': foreground,
    '--card': surface,
    '--card-foreground': foreground,
    '--popover': surface,
    '--popover-foreground': foreground,
    '--secondary': surface,
    '--secondary-foreground': foreground,
    '--muted': surface,
    '--muted-foreground': muted,
    '--accent': primary,
    '--accent-foreground': readableForeground(palette.primary),
    '--border': border,
    '--input': border,
  };
}

export function applyThemePalette(
  value: unknown,
  root: Pick<HTMLElement, 'dataset' | 'style'>
) {
  const palette = parseThemePalette(value);
  root.dataset.themePalette = palette.id;
  for (const [property, color] of Object.entries(themePaletteCssVariables(palette))) {
    root.style.setProperty(property, color);
  }
}
