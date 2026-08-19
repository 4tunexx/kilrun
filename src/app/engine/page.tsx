import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { withPrismaRetry } from '@/lib/prisma';
import { isAdminRole } from '@/lib/roles';
import { EngineApp } from '@/components/engine/engine-app';

export const metadata = {
  title: 'Kilrun Engine',
  description: 'Kilrun Windows map editor and game-development application.',
};

export default async function EnginePage({
  searchParams,
}: {
  searchParams: Promise<{ map?: string }>;
}) {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) {
    redirect('/landing?next=/engine');
  }

  let user;
  try {
    user = await withPrismaRetry((db) => db.user.findUnique({ where: { steamId } }));
  } catch (error) {
    console.error('[engine] failed to load user', error);
    redirect('/landing?error=db_unavailable&next=/engine');
  }

  if (!user) redirect('/landing?next=/engine');
  if (user.isBanned) redirect('/landing?error=banned');
  if (!isAdminRole(user.role)) redirect('/');

  const params = await searchParams;

  return (
    <EngineApp
      user={{
        username: user.username,
        role: user.role,
        avatarUrl: user.avatarUrl,
      }}
      initialMapId={params.map}
    />
  );
}
