  if (isUnlimitedAmmoActive(player as never, now)) {
    return true;
  }
  const mag = player.weaponMagSize ?? 0;
  if (mag <= 0) return true;
  if ((player.ammoInMag ?? 0) <= 0) return false;
  player.ammoInMag = (player.ammoInMag ?? 0) - 1;
  return true;
}

const MAX_SKIN_JSON_CHARS = 48_000;

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function sanitizeFireMode(raw: unknown, fallback: WeaponFireMode = 'semi'): WeaponFireMode {
  const s = String(raw || fallback);
  if (s === 'auto' || s === 'bolt' || s === 'semi') return s;
  return fallback;
}

export function sanitizeWeaponCombat(raw: unknown): SanitizedWeapon {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WEAPON };
  const o = raw as Record<string, unknown>;
  const kindRaw = String(o.kind || 'hitscan');
  const kind: WeaponKind =
    kindRaw === 'melee' || kindRaw === 'cosmetic' || kindRaw === 'hitscan'
      ? kindRaw
      : 'hitscan';

  if (kind === 'cosmetic') {
    return {
      kind: 'cosmetic',
      range: 0,
      damage: 0,
      cooldownMs: 500,
      coneRadians: 0.18,
      fireMode: 'semi',
      pellets: 1,
      adsZoomFov: 0,
      adsConeScale: 1,
      hipfireConeScale: 1,
      magSize: 0,
      reserveAmmo: 0,
      reloadMs: 0,
    };
  }

  if (kind === 'melee') {
    return {
      kind: 'melee',
      range: clamp(Number(o.range ?? 2.4), 0.8, 3.5),
      damage: clamp(Number(o.damage ?? 20), 1, 80),
      cooldownMs: clamp(Number(o.cooldownMs ?? 500), 200, 1200),
      coneRadians: clamp(Number(o.coneRadians ?? 0.5), 0.2, 0.9),
      fireMode: sanitizeFireMode(o.fireMode, 'semi'),
      pellets: 1,
      adsZoomFov: 0,
      adsConeScale: 1,
      hipfireConeScale: 1,
      magSize: 0,
      reserveAmmo: 0,
      reloadMs: 0,
    };
  }

  return {
    kind: 'hitscan',
    range: clamp(Number(o.range ?? 14), 4, 28),
    damage: clamp(Number(o.damage ?? 25), 1, 100),
    cooldownMs: clamp(Number(o.cooldownMs ?? 280), 80, 2000),
    coneRadians: clamp(Number(o.coneRadians ?? 0.18), 0.02, 0.55),
    fireMode: sanitizeFireMode(o.fireMode, 'semi'),
    pellets: Math.max(1, Math.min(16, Math.floor(Number(o.pellets ?? 1) || 1))),
    adsZoomFov: clamp(Number(o.adsZoomFov ?? 0), 0, 90),
    adsConeScale: clamp(Number(o.adsConeScale ?? 0.85), 0.1, 2),
    hipfireConeScale: clamp(Number(o.hipfireConeScale ?? 1), 0.5, 6),
    magSize: clamp(Math.floor(Number(o.magSize ?? 12)), 0, 120),
    reserveAmmo: clamp(Math.floor(Number(o.reserveAmmo ?? 48)), 0, 400),
    reloadMs: clamp(Math.floor(Number(o.reloadMs ?? 1600)), 200, 5000),
  };
}

/**
 * Strip huge data-URL textures/models for network sync — keep sculpt/shape/color.
 * Remotes still see primitive/catalog skins; full GLB data URLs stay local-only until cloud.
 */
export function compactSkinAttachmentsJson(raw: unknown): string {
  if (!Array.isArray(raw)) return '[]';
  const compact = raw.slice(0, 16).map((att) => {
    if (!att || typeof att !== 'object') return null;
    const a = { ...(att as Record<string, unknown>) };
    if (typeof a.customModelUrl === 'string' && a.customModelUrl.startsWith('data:')) {
      delete a.customModelUrl;
    }
    if (typeof a.textureUrl === 'string' && a.textureUrl.startsWith('data:')) {
      delete a.textureUrl;
    }
    if (a.sculpt && typeof a.sculpt === 'object') {
      const s = a.sculpt as { positions?: unknown; count?: unknown };
      if (Array.isArray(s.positions) && s.positions.length > 24_000) {
        delete a.sculpt;
      }
    }
    if (Array.isArray(a.bonded)) {
      a.bonded = a.bonded.slice(0, 12).map((b) => {
        if (!b || typeof b !== 'object') return b;
        const part = { ...(b as Record<string, unknown>) };
        if (part.sculpt && typeof part.sculpt === 'object') {
          const s = part.sculpt as { positions?: unknown };
          if (Array.isArray(s.positions) && s.positions.length > 24_000) {
            delete part.sculpt;
          }
        }
        return part;
      });
    }
    return a;
  });
  const filtered = compact.filter(Boolean);
  let json = JSON.stringify(filtered);
  if (json.length > MAX_SKIN_JSON_CHARS) {
    // Drop sculpt data first, then truncate list.
    const noSculpt = filtered.map((a) => {
      if (!a || typeof a !== 'object') return a;
      const copy = { ...a } as Record<string, unknown>;
      delete copy.sculpt;
      if (Array.isArray(copy.bonded)) {
        copy.bonded = copy.bonded.map((b) => {
          if (!b || typeof b !== 'object') return b;
          const part = { ...(b as Record<string, unknown>) };
          delete part.sculpt;
          return part;
        });
      }
      return copy;
    });
    json = JSON.stringify(noSculpt);
  }
  if (json.length > MAX_SKIN_JSON_CHARS) {
    json = JSON.stringify(filtered.slice(0, 4));
  }
  return json.length > MAX_SKIN_JSON_CHARS ? '[]' : json;
}

export function extractWeaponFromSkinsJson(skinsJson: string): SanitizedWeapon {
  try {
    const atts = JSON.parse(skinsJson || '[]');
    if (!Array.isArray(atts)) return { ...DEFAULT_WEAPON };
    const weapon = atts.find(
      (a) => a && typeof a === 'object' && (a as { slot?: string }).slot === 'weapon'
    ) as { weapon?: unknown } | undefined;
    if (!weapon?.weapon) return { ...DEFAULT_WEAPON };
    return sanitizeWeaponCombat(weapon.weapon);
  } catch {
    return { ...DEFAULT_WEAPON };
  }
}

export function applyLoadoutToPlayer(
  player: {
    equippedSkinsJson: string;
    weaponKind: string;
    weaponRange: number;
    weaponDamage: number;
    weaponCooldownMs: number;
    weaponConeRadians: number;
    weaponFireMode?: string;
    weaponPellets?: number;
    weaponAdsZoomFov?: number;
    weaponAdsConeScale?: number;
    weaponHipfireConeScale?: number;
  },
  options: { equippedSkinsJson?: string; weaponCombat?: unknown }
) {
  const skinsJson =
    typeof options.equippedSkinsJson === 'string' && options.equippedSkinsJson
      ? options.equippedSkinsJson.length > MAX_SKIN_JSON_CHARS
        ? '[]'
        : options.equippedSkinsJson
      : '[]';
  player.equippedSkinsJson = skinsJson;
  const weapon =
    options.weaponCombat !== undefined
      ? sanitizeWeaponCombat(options.weaponCombat)
      : extractWeaponFromSkinsJson(skinsJson);
  applySanitizedWeaponToPlayer(player, weapon);
}
