/**
 * Sanitize match loadout (skins + weapon) for Colyseus join options / PlayerState.
 * Server-only — do not trust client damage/range without clamps.
 */

export type WeaponKind = 'melee' | 'hitscan' | 'cosmetic';
export type WeaponFireMode = 'auto' | 'semi' | 'bolt';

export interface SanitizedWeapon {
  kind: WeaponKind;
  range: number;
  damage: number;
  cooldownMs: number;
  coneRadians: number;
  fireMode: WeaponFireMode;
  pellets: number;
  adsZoomFov: number;
  adsConeScale: number;
  hipfireConeScale: number;
  /** 0 = unlimited / melee (no mag). */
  magSize: number;
  reserveAmmo: number;
  reloadMs: number;
}

export const DEFAULT_WEAPON: SanitizedWeapon = {
  kind: 'hitscan',
  range: 14,
  damage: 25,
  cooldownMs: 350,
  coneRadians: 0.18,
  fireMode: 'semi',
  pellets: 1,
  adsZoomFov: 0,
  adsConeScale: 0.85,
  hipfireConeScale: 1,
  magSize: 12,
  reserveAmmo: 48,
  reloadMs: 1600,
};

/** Strip data: URLs — remotes only receive public /http paths. */
export function publicWeaponModelUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.trim()) return '';
  const s = url.trim();
  if (s.startsWith('data:')) return '';
  return s.slice(0, 512);
}

type WeaponPlayerFields = {
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
  weaponId?: string;
  weaponModelUrl?: string;
  weaponMagSize?: number;
  ammoInMag?: number;
  reserveAmmo?: number;
  weaponReloadMs?: number;
  reloadEndsAt?: number;
};

export function applySanitizedWeaponToPlayer(
  player: WeaponPlayerFields,
  weapon: SanitizedWeapon,
  opts?: { weaponId?: string; modelUrl?: string }
) {
  player.weaponKind = weapon.kind;
  player.weaponRange = weapon.range;
  player.weaponDamage = weapon.damage;
  player.weaponCooldownMs = weapon.cooldownMs;
  player.weaponConeRadians = weapon.coneRadians;
  player.weaponFireMode = weapon.fireMode;
  player.weaponPellets = weapon.pellets;
  player.weaponAdsZoomFov = weapon.adsZoomFov;
  player.weaponAdsConeScale = weapon.adsConeScale;
  player.weaponHipfireConeScale = weapon.hipfireConeScale;
  if (opts?.weaponId) player.weaponId = opts.weaponId;
  if (opts?.modelUrl !== undefined) {
    player.weaponModelUrl = publicWeaponModelUrl(opts.modelUrl);
  }

  const mag =
    weapon.kind === 'melee' || weapon.kind === 'cosmetic'
      ? 0
      : Math.max(0, Math.floor(weapon.magSize));
  if (mag <= 0) {
    player.weaponMagSize = 0;
    player.ammoInMag = 0;
    player.reserveAmmo = 0;
    player.weaponReloadMs = 0;
    player.reloadEndsAt = 0;
  } else {
    player.weaponMagSize = mag;
    player.ammoInMag = mag;
    player.reserveAmmo = Math.max(0, Math.floor(weapon.reserveAmmo));
    player.weaponReloadMs = Math.max(200, Math.floor(weapon.reloadMs) || 1600);
    player.reloadEndsAt = 0;
  }
}

/** Finish a pending reload when reloadEndsAt has passed. */
export function finishReloadIfDue(player: WeaponPlayerFields, now: number) {
  const ends = player.reloadEndsAt ?? 0;
  if (ends <= 0 || now < ends) return;
  const mag = player.weaponMagSize ?? 0;
  if (mag <= 0) {
    player.reloadEndsAt = 0;
    return;
  }
  const need = Math.max(0, mag - (player.ammoInMag ?? 0));
  const take = Math.min(need, player.reserveAmmo ?? 0);
  player.ammoInMag = (player.ammoInMag ?? 0) + take;
  player.reserveAmmo = Math.max(0, (player.reserveAmmo ?? 0) - take);
  player.reloadEndsAt = 0;
}

/** Start reload if mag not full and reserve remains. */
export function tryStartReload(player: WeaponPlayerFields, now: number): boolean {
  finishReloadIfDue(player, now);
  const mag = player.weaponMagSize ?? 0;
  if (mag <= 0) return false;
  if ((player.reloadEndsAt ?? 0) > now) return false;
  if ((player.ammoInMag ?? 0) >= mag) return false;
  if ((player.reserveAmmo ?? 0) <= 0) return false;
  const ms = Math.max(200, player.weaponReloadMs ?? 1600);
  player.reloadEndsAt = now + ms;
  return true;
}

/**
 * Gate a shot on ammo/reload. Melee / magSize 0 = unlimited.
 * Returns false if empty or mid-reload.
 */
export function tryConsumeShotAmmo(player: WeaponPlayerFields, now: number): boolean {
  finishReloadIfDue(player, now);
  if ((player.reloadEndsAt ?? 0) > now) return false;
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
