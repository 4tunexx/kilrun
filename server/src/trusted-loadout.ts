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
      abilityLevels?: Record<string, number>;
    };
    if (!data?.ok) return null;
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
