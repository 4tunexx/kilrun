import { NextRequest } from 'next/server';
import { engineJson, engineOptions, requireEngineStaff } from '@/lib/engine/engine-api';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { mintGameJoinToken } from '@/lib/game-join-token';
import { isPremiumActive, canAccessRankedCompetitive } from '@/lib/premium';
import { parsePremiumConfig } from '@/lib/premium-config';
import { getSiteSettings } from '@/lib/progression-actions';
import { KP_DEFAULT } from '@/lib/kp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

export async function POST(req: NextRequest) {
  try {
    const staff = await requireEngineStaff(req);
    const user = await prisma.user.findUnique({ where: { id: staff.id } });
    if (!user || user.isBanned || !canAccessAdmin(user.role)) {
      return engineJson(req, { ok: false, error: 'Staff only' }, 403);
    }

    const settings = await getSiteSettings();
    const premiumCfg = parsePremiumConfig(
      (settings as { premiumConfigJson?: string }).premiumConfigJson ?? '{}'
    );
    const isPremium = isPremiumActive({
      isVip: user.isVip,
      premiumExpiresAt: user.premiumExpiresAt,
    });
    const rankedAccess = canAccessRankedCompetitive({
      isPremium,
      config: premiumCfg,
    });
    const kp = typeof user.kp === 'number' ? user.kp : KP_DEFAULT;

    let token: string | null = null;
    try {
      token = mintGameJoinToken({
        userId: user.id,
        steamId: user.steamId || '',
        username: user.username || 'Player',
        avatarUrl: user.avatarUrl || '',
        isAdmin: user.role === 'admin',
        isStaff: true,
        isPremium,
        rankedAccess,
        kp,
      });
    } catch {
      // Local/development Engine sessions may not have a game join secret.
    }

    return engineJson(req, {
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl || '',
        role: user.role,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Not authenticated';
    const status = /staff only/i.test(message) ? 403 : 401;
    return engineJson(req, { ok: false, error: message }, status);
  }
}
