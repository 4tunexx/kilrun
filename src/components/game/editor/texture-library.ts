/** Custom textures stored as data-URLs in localStorage for the map editor. */

const KEY = 'kilrun.customTextures.v1';

export interface CustomTexture {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
}

export function listCustomTextures(): CustomTexture[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as CustomTexture[];
  } catch {
    return [];
  }
}

export function saveCustomTexture(name: string, dataUrl: string): CustomTexture {
  const item: CustomTexture = {
    id: `tex_${Date.now().toString(36)}`,
    name,
    dataUrl,
    createdAt: new Date().toISOString(),
  };
  const next = [item, ...listCustomTextures()].slice(0, 40);
  localStorage.setItem(KEY, JSON.stringify(next));
  return item;
}

export function deleteCustomTexture(id: string) {
  localStorage.setItem(KEY, JSON.stringify(listCustomTextures().filter((t) => t.id !== id)));
}

export const BUILTIN_TEXTURES = [
  { id: 'colormap', name: 'Colormap', url: '/game/prototype/textures/colormap.png' },
  { id: 'variation-a', name: 'Variation A', url: '/game/prototype/textures/variation-a.png' },
  { id: 'variation-b', name: 'Variation B', url: '/game/prototype/textures/variation-b.png' },
  { id: 'variation-c', name: 'Variation C', url: '/game/prototype/textures/variation-c.png' },
] as const;
