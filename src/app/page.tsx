import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { withPrismaRetry } from '@/lib/prisma';
import GameHubInterface from '@/components/game-hub-interface';

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

  return (
    <GameHubInterface
      user={{
        id: user.id,
        steamId: user.steamId,
        username: user.username,
        avatarUrl: user.avatarUrl,
        vpCurrency: user.vpCurrency,
        xpProgress: user.xpProgress,
        currentRank: user.currentRank,
        role: user.role,
        isVip: user.isVip,
        bio: user.bio,
      }}
    />
  );
}
