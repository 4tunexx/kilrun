import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import GameHubInterface from '@/components/game-hub-interface';

export default async function Page() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;

  if (!steamId) {
    redirect('/landing');
  }

  const user = await prisma.user.findUnique({ where: { steamId } });

  if (!user) {
    redirect('/landing');
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
      }}
    />
  );
}
