/** Curated ISO 3166-1 alpha-2 list for profile country / flag. */
export const COUNTRIES = [
  { code: 'us', name: 'United States' },
  { code: 'gb', name: 'United Kingdom' },
  { code: 'ca', name: 'Canada' },
  { code: 'au', name: 'Australia' },
  { code: 'de', name: 'Germany' },
  { code: 'fr', name: 'France' },
  { code: 'es', name: 'Spain' },
  { code: 'it', name: 'Italy' },
  { code: 'nl', name: 'Netherlands' },
  { code: 'be', name: 'Belgium' },
  { code: 'pt', name: 'Portugal' },
  { code: 'pl', name: 'Poland' },
  { code: 'se', name: 'Sweden' },
  { code: 'no', name: 'Norway' },
  { code: 'dk', name: 'Denmark' },
  { code: 'fi', name: 'Finland' },
  { code: 'ie', name: 'Ireland' },
  { code: 'ch', name: 'Switzerland' },
  { code: 'at', name: 'Austria' },
  { code: 'cz', name: 'Czechia' },
  { code: 'ro', name: 'Romania' },
  { code: 'hu', name: 'Hungary' },
  { code: 'gr', name: 'Greece' },
  { code: 'tr', name: 'Turkey' },
  { code: 'ru', name: 'Russia' },
  { code: 'ua', name: 'Ukraine' },
  { code: 'br', name: 'Brazil' },
  { code: 'mx', name: 'Mexico' },
  { code: 'ar', name: 'Argentina' },
  { code: 'cl', name: 'Chile' },
  { code: 'co', name: 'Colombia' },
  { code: 'jp', name: 'Japan' },
  { code: 'kr', name: 'South Korea' },
  { code: 'cn', name: 'China' },
  { code: 'in', name: 'India' },
  { code: 'ph', name: 'Philippines' },
  { code: 'id', name: 'Indonesia' },
  { code: 'th', name: 'Thailand' },
  { code: 'vn', name: 'Vietnam' },
  { code: 'sg', name: 'Singapore' },
  { code: 'my', name: 'Malaysia' },
  { code: 'nz', name: 'New Zealand' },
  { code: 'za', name: 'South Africa' },
  { code: 'eg', name: 'Egypt' },
  { code: 'sa', name: 'Saudi Arabia' },
  { code: 'ae', name: 'United Arab Emirates' },
  { code: 'il', name: 'Israel' },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]['code'];

export function getCountryName(code: string | null | undefined): string | null {
  if (!code) return null;
  const hit = COUNTRIES.find((c) => c.code === code.toLowerCase());
  return hit?.name ?? null;
}

export function flagUrl(code: string, width = 24): string {
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`;
}
