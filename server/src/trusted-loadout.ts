/**
 * Fetch DB-trusted loadout from Next.js (skins + weapon), falling back to
 * client join options when the web app is unreachable.
 */

function resolveWebAppUrl(): string | null {
  const raw = (process.env.WEB_APP_URL || process.env.CLIENT_ORIGIN || '').trim();
  if (!raw || raw === '*') return null;
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return null;
  return raw.replace(/\/$/, '');
}

export async function fetchTrustedLoadout(userId: string): Promise<{
  equippedSkinsJson?: string;
  weaponCombat?: unknown;
  abilityStatBonuses?: {
    maxHealthBonus?: number;
    speedMultiplier?: number;
    jumpMultiplier?: number;
    maxEnergyBonus?: number;
    punchDamageMultiplier?: number;
  };
<<<<<<< HEAD
=======
  abilityLevels?: Record<string, number>;
>>>>>>> origin/main
} | null> {
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
      abilityStatBonuses?: {
        maxHealthBonus?: number;
        speedMultiplier?: number;
        jumpMultiplier?: number;
        maxEnergyBonus?: number;
        punchDamageMultiplier?: number;
      };
<<<<<<< HEAD
=======
      abilityLevels?: Record<string, number>;
>>>>>>> origin/main
    };
    if (!data?.ok) return null;
    return {
      equippedSkinsJson: data.equippedSkinsJson,
      weaponCombat: data.weaponCombat,
      abilityStatBonuses: data.abilityStatBonuses,
<<<<<<< HEAD
=======
      abilityLevels: data.abilityLevels,
>>>>>>> origin/main
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
