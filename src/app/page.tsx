import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { withPrismaRetry } from '@/lib/prisma';
import GameHubInterface from '@/components/game-hub-interface';
import { isPremiumActive } from '@/lib/premium';
import { getRankForKp, KP_DEFAULT } from '@/lib/kp';
import { getSiteSettings } from '@/lib/progression-actions';

export default async function Page() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;

  if (!steamId) {
    redirect('/landing');
  }

  let user;
  try {
    user = await withPrismaRetry((db) =>
      db.user.findUnique({ where: { steamId } })
    );
  } catch (error) {
    console.error('[home] failed to load user', error);
    redirect('/landing?error=db_unavailable');
  }

  if (!user) {
    redirect('/landing');
  }

  if (user.isBanned) {
    redirect('/landing?error=banned');
  }

  const kp =
    typeof (user as { kp?: number }).kp === 'number'
      ? (user as { kp: number }).kp
      : KP_DEFAULT;
  const peakKp = Math.max(
    typeof (user as { peakKp?: number }).peakKp === 'number'
      ? (user as { peakKp: number }).peakKp
      : kp,
    kp
  );
  const peakRank =
    (user as { peakRank?: string }).peakRank || getRankForKp(peakKp);
  const premiumExpiresAt =
    (user as { premiumExpiresAt?: Date | null }).premiumExpiresAt ?? null;
  const premium = isPremiumActive({
    isVip: user.isVip,
    premiumExpiresAt,
  });
  const kpRank = getRankForKp(kp);

  let siteSettings: Awaited<ReturnType<typeof getSiteSettings>> | null = null;
  try {
    siteSettings = await getSiteSettings();
  } catch (error) {
    console.error('[home] failed to load site settings', error);
  }

  return (
    <GameHubInterface
      user={{
        id: user.id,
        steamId: user.steamId,
        username: user.username,
        avatarUrl: user.avatarUrl,
        vpCurrency: user.vpCurrency,
        xpProgress: user.xpProgress,
        currentRank: premium ? kpRank : 'Go Premium',
        kp,
        role: user.role,
        isVip: user.isVip,
        isPremium: premium,
        premiumExpiresAt: premiumExpiresAt
          ? new Date(premiumExpiresAt).toISOString()
          : null,
        bio: user.bio,
        email: user.email,
        emailVerified: user.emailVerified,
        equippedFrameConfig: user.equippedFrameConfig ?? null,
        equippedNicknameConfig: user.equippedNicknameConfig ?? null,
      }}
      initialSiteSettings={
        siteSettings
          ? {
              logoUrl: siteSettings.logoUrl ?? null,
              headerLogoUrl:
                (siteSettings as { headerLogoUrl?: string }).headerLogoUrl ??
                null,
              headerLogoStyle:
                (siteSettings as { headerLogoStyle?: string })
                  .headerLogoStyle ?? null,
              homeHeroImage:
                (siteSettings as { homeHeroImage?: string }).homeHeroImage ??
                null,
              backgroundUrl: siteSettings.backgroundUrl ?? null,
              headerTitle: siteSettings.headerTitle ?? null,
              headerSubtitle: siteSettings.headerSubtitle ?? null,
              hubPagesJson:
                (siteSettings as { hubPagesJson?: string }).hubPagesJson ??
                null,
              hubNavJson:
                (siteSettings as { hubNavJson?: string }).hubNavJson ?? null,
              hubChromeJson:
                (siteSettings as { hubChromeJson?: string }).hubChromeJson ??
                null,
            }
          : null
      }
    />
  );
}
