'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { runAsTrustedServer } from '@/lib/trusted-server';

async function requireSessionSteamUser() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');
  if (user.isBanned) throw new Error('Banned');
  return user;
}

/**
 * After Clerk email verification completes, bind the Clerk user to the
 * signed-in Steam profile via publicMetadata.steamId and mark email verified
 * (+100 VP once). Webhook remains a backup using public_metadata only.
 */
export async function linkVerifiedClerkEmail(clerkUserId: string) {
  const sessionUser = await requireSessionSteamUser();
  const id = clerkUserId?.trim();
  if (!id) throw new Error('Missing Clerk user id');

  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error('CLERK_SECRET_KEY is not configured');

  const { createClerkClient } = await import('@clerk/backend');
  const clerk = createClerkClient({ secretKey: secret });

  const clerkUser = await clerk.users.updateUser(id, {
    publicMetadata: { steamId: sessionUser.steamId },
  });

  const primaryEmail =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) {
    throw new Error('Clerk user has no email address');
  }

  const alreadyVerified = sessionUser.emailVerified;

  await prisma.user.update({
    where: { id: sessionUser.id },
    data: {
      clerkId: id,
      email: primaryEmail,
      emailVerified: true,
      ...(alreadyVerified ? {} : { vpCurrency: { increment: 100 } }),
    },
  });

  if (!alreadyVerified) {
    const { processWebsiteAction } = await import('@/lib/progression-actions');
    await runAsTrustedServer(async () => {
      await processWebsiteAction(sessionUser.id, 'email');
    });
  }

  return { ok: true as const, email: primaryEmail };
}
