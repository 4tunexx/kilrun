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

/** Strip huge data URLs before sending skins over the wire.
 * NOTE: Full-body skins need their custom model URLs to render at all.
 * Preserve customModelUrl unless it would blow the 48KB cap, in which
 * case we also clear the fullbody slot marker so rendering falls back to
 * the default base body (otherwise base body is hidden + no FBX = invisible).
 */
export function compactSkinsForMatch(attachments: SkinAttachment[]): SkinAttachment[] {
  return attachments.slice(0, 16).map((att) => {
    const next: SkinAttachment = { ...att };
    const isFullbody = next.slot === 'fullbody';

    // Never blindly delete customModelUrl for full-body costumes —
    // those ARE the player mesh and we would otherwise render nothing.
    if (!isFullbody && next.customModelUrl?.startsWith('data:')) {
      delete next.customModelUrl;
    } else if (
      isFullbody &&
      next.customModelUrl?.startsWith('data:') &&
      next.customModelUrl.length > 32_000
    ) {
      // Data FBX too large for network strip: demote so attach code falls
      // through to default body instead of hiding base with no replacement.
      delete next.customModelUrl;
      next.slot = 'body';
    }

    if (next.textureUrl?.startsWith('data:')) {
      // Data URLs can't be sent over the network; fall back to shared pack atlas
      // so live matches render textured skins instead of black.
      next.textureUrl = '/game/skins/Textures.png';
    }
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
