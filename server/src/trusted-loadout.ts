/**
 * Fetch DB-trusted loadout from Next.js (skins + weapon), falling back to
 * client join options when the web app is unreachable.
 * Prefers an HMAC loadout token (hub-minted from DB) over unsigned client JSON.
 */
import { loadoutSecretFromEnv, verifyLoadoutToken } from '../../shared/signed-loadout.js';

function resolveWebAppUrl(): string | null {
  const raw = (process.env.WEB_APP_URL || process.env.CLIENT_ORIGIN || '').trim();
  if (!raw || raw === '*') return null;
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return null;
  return raw.replace(/\/$/, '');
}

export async function fetchTrustedLoadout(
  userId: string,
  loadoutToken?: string
): Promise<{
  equippedSkinsJson?: string;
  weaponCombat?: unknown;
  abilityStatBonuses?: {
    maxHealthBonus?: number;
    speedMultiplier?: number;
    jumpMultiplier?: number;
    maxEnergyBonus?: number;
    punchDamageMultiplier?: number;
    reloadSpeedMultiplier?: number;
    fallDamageReduction?: number;
  };
  abilityLevels?: Record<string, number>;
} | null> {
  const hmacSecret = loadoutSecretFromEnv();
  if (loadoutToken && hmacSecret && userId) {
    const verified = verifyLoadoutToken(loadoutToken, hmacSecret);
    if (verified && verified.userId === userId) {
      return {
        equippedSkinsJson: verified.equippedSkinsJson,
        weaponCombat: verified.weaponCombat,
      };
    }
  }

  const base = resolveWebAppUrl();
  const secret = (process.env.GAME_SERVER_ADMIN_SECRET || '').trim();
  if (!base || !secret || !userId) return null;

  const url = `${base}/api/game/player-loadout?userId=${encodeURIComponent(userId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: { 'x-admin-secret': secret, accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      equippedSkinsJson?: string;
      weaponCombat?: unknown;
      loadoutToken?: string;
      userId?: string;
      abilityStatBonuses?: {
        maxHealthBonus?: number;
        speedMultiplier?: number;
        jumpMultiplier?: number;
        maxEnergyBonus?: number;
        punchDamageMultiplier?: number;
        reloadSpeedMultiplier?: number;
        fallDamageReduction?: number;
      };
      abilityLevels?: Record<string, number>;
    };
    if (!data?.ok) return null;
    if (data.loadoutToken && hmacSecret) {
      const verified = verifyLoadoutToken(data.loadoutToken, hmacSecret);
      if (verified && (!userId || verified.userId === userId || verified.userId === data.userId)) {
        return {
          equippedSkinsJson: verified.equippedSkinsJson,
          weaponCombat: verified.weaponCombat,
          abilityStatBonuses: data.abilityStatBonuses,
          abilityLevels: data.abilityLevels,
        };
      }
    }
    return {
      equippedSkinsJson: data.equippedSkinsJson,
      weaponCombat: data.weaponCombat,
      abilityStatBonuses: data.abilityStatBonuses,
      abilityLevels: data.abilityLevels,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
