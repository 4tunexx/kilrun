'use server';

/**
 * Skill-tree canvas appearance (background image/color) for the Power
 * Editor and the in-game skill menu — both render the same
 * computeRadialHexLayout tree, so they share this one config. Stored on
 * the SiteSettings singleton (powerTreeConfigJson), same JSON-blob-on-a-
 * singleton convention as premiumConfigJson / rankConfigJson etc.
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';

export type PowerTreeConfig = {
  backgroundUrl: string;
  backgroundColor: string;
  /** 0–1, how strongly the background image shows through the dark canvas. */
  backgroundOpacity: number;
};

const DEFAULT_CONFIG: PowerTreeConfig = {
  backgroundUrl: '',
  backgroundColor: '',
  backgroundOpacity: 0.5,
};

function parseConfig(json: string | null | undefined): PowerTreeConfig {
  if (!json) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(json) as Partial<PowerTreeConfig>;
    return {
      backgroundUrl: typeof parsed.backgroundUrl === 'string' ? parsed.backgroundUrl : '',
      backgroundColor: typeof parsed.backgroundColor === 'string' ? parsed.backgroundColor : '',
      backgroundOpacity:
        typeof parsed.backgroundOpacity === 'number' && Number.isFinite(parsed.backgroundOpacity)
          ? Math.min(1, Math.max(0, parsed.backgroundOpacity))
          : DEFAULT_CONFIG.backgroundOpacity,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function getPowerTreeConfig(): Promise<PowerTreeConfig> {
  const settings = await prisma.siteSettings.findUnique({ where: { singletonKey: 'default' } });
  return parseConfig((settings as { powerTreeConfigJson?: string } | null)?.powerTreeConfigJson);
}

async function requireAdmin() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) throw new Error('Forbidden');
  return user;
}

export async function updatePowerTreeConfig(
  input: Partial<PowerTreeConfig>
): Promise<PowerTreeConfig> {
  await requireAdmin();
  const current = await getPowerTreeConfig();

  let backgroundUrl = current.backgroundUrl;
  if (typeof input.backgroundUrl === 'string') {
    backgroundUrl = input.backgroundUrl;
    if (backgroundUrl.startsWith('data:image/')) {
      const { persistSiteImage } = await import('@/lib/site-asset-upload');
      backgroundUrl = await persistSiteImage(backgroundUrl, 'bg');
    }
  }

  const next: PowerTreeConfig = {
    backgroundUrl,
    backgroundColor: typeof input.backgroundColor === 'string' ? input.backgroundColor : current.backgroundColor,
    backgroundOpacity:
      typeof input.backgroundOpacity === 'number' && Number.isFinite(input.backgroundOpacity)
        ? Math.min(1, Math.max(0, input.backgroundOpacity))
        : current.backgroundOpacity,
  };

  await prisma.siteSettings.upsert({
    where: { singletonKey: 'default' },
    create: { singletonKey: 'default', powerTreeConfigJson: JSON.stringify(next) },
    update: { powerTreeConfigJson: JSON.stringify(next) },
  });

  return next;
}
