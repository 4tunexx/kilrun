/** Default public asset paths for Kilrun brand marks. */
export const DEFAULT_MARK_LOGO = '/K2.png';
export const DEFAULT_HEADER_LOGO = '/kilrun.png';
export const DEFAULT_HOME_HERO =
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&q=80';

export function resolveMarkLogo(url?: string | null) {
  return url?.trim() || DEFAULT_MARK_LOGO;
}

export function resolveHeaderLogo(url?: string | null) {
  return url?.trim() || DEFAULT_HEADER_LOGO;
}

export function resolveHomeHeroImage(url?: string | null) {
  return url?.trim() || DEFAULT_HOME_HERO;
}
