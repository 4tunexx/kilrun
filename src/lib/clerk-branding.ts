'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';

async function requireStaff() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) {
    throw new Error('Forbidden');
  }
  return user;
}

/**
 * Clerk verification emails use the Dashboard application name ("My Application"
 * by default). We can't fully redesign Clerk's hosted email HTML from code, but
 * we can push display name + brand color when the Backend API allows it, and
 * return clear dashboard steps for logo / email template edits.
 */
export async function syncClerkBrandingToKilrun(): Promise<{
  ok: boolean;
  message: string;
  steps: string[];
}> {
  await requireStaff();

  const steps = [
    'Open Clerk Dashboard → your Kilrun application',
    'Configure → Application → set Name to “Kilrun” (fixes “My Application” in emails)',
    'Customize → Emails → upload the Kilrun K mark as the email logo',
    'Set brand color to #E33B4A (Kilrun red) and save',
    'Send a test verification code to confirm the subject says Kilrun',
  ];

  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    return {
      ok: false,
      message: 'CLERK_SECRET_KEY is missing — set it in .env, then use the dashboard steps below.',
      steps,
    };
  }

  try {
    const { createClerkClient } = await import('@clerk/backend');
    const clerk = createClerkClient({ secretKey: secret });

    // Best-effort: update instance support/display fields when supported.
    // Application display name for emails is primarily a Dashboard setting;
    // this call may no-op depending on Clerk plan / API version.
    const instance = clerk.instance as {
      update?: (body: Record<string, unknown>) => Promise<unknown>;
    };
    if (typeof instance?.update === 'function') {
      await instance.update({
        application_name: 'Kilrun',
      });
      return {
        ok: true,
        message:
          'Requested Clerk instance update for “Kilrun”. Also complete the email logo steps below — hosted templates are edited in the Clerk Dashboard.',
        steps,
      };
    }

    return {
      ok: true,
      message:
        'Clerk Backend is connected. Rename the app to Kilrun and upload the logo in the Dashboard (API does not expose full email template editing).',
      steps,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : 'Could not reach Clerk API — use the Dashboard steps.',
      steps,
    };
  }
}
