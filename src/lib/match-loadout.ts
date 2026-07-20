/**
 * Client-side helpers to pack equipped skins + weapon for match join.
 */
import type { SkinAttachment } from '@/lib/player-skins';
import {
  findWeaponAttachment,
  resolveWeaponCombat,
  type WeaponCombatConfig,
} from '@/lib/weapons';

const MAX_SKIN_JSON_CHARS = 48_000;

/** Strip huge data URLs before sending skins over the wire. */
export function compactSkinsForMatch(attachments: SkinAttachment[]): SkinAttachment[] {
  return attachments.slice(0, 16).map((att) => {
    const next: SkinAttachment = { ...att };
    if (next.customModelUrl?.startsWith('data:')) delete next.customModelUrl;
    if (next.textureUrl?.startsWith('data:')) delete next.textureUrl;
    if (next.sculpt && next.sculpt.positions.length > 24_000) delete next.sculpt;
    if (next.bonded?.length) {
      next.bonded = next.bonded.slice(0, 12).map((b) => {
        const part = { ...b };
        if (part.sculpt && part.sculpt.positions.length > 24_000) delete part.sculpt;
        return part;
      });
    }
    return next;
  });
}

export function packMatchLoadout(attachments: SkinAttachment[]): {
  equippedSkinsJson: string;
  weaponCombat: WeaponCombatConfig;
} {
  const compact = compactSkinsForMatch(attachments);
  let equippedSkinsJson = JSON.stringify(compact);
  if (equippedSkinsJson.length > MAX_SKIN_JSON_CHARS) {
    equippedSkinsJson = JSON.stringify(
      compact.map((a) => {
        const { sculpt: _s, bonded, ...rest } = a;
        return {
          ...rest,
          bonded: bonded?.map(({ sculpt: _bs, ...b }) => b),
        };
      })
    );
  }
  if (equippedSkinsJson.length > MAX_SKIN_JSON_CHARS) {
    equippedSkinsJson = '[]';
  }
  const weaponCombat = resolveWeaponCombat(findWeaponAttachment(attachments));
  return { equippedSkinsJson, weaponCombat };
}

export function parseEquippedSkinsJson(raw: string | undefined | null): SkinAttachment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SkinAttachment[]) : [];
  } catch {
    return [];
  }
}
