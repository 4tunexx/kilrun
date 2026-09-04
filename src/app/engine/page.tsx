import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { withPrismaRetry } from '@/lib/prisma';
import { isAdminRole } from '@/lib/roles';
import { EngineApp } from '@/components/engine/engine-app';
import { Lock, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ENGINE_INVITE_COOKIE } from '@/lib/engine/engine-invite';
import { findActiveStoredInvite } from '@/lib/engine/engine-invite-actions';

export const metadata = {
  title: 'Kilrun Engine — Invite only',
  description: 'Kilrun Engine Studio is available only with an admin invite link.',
};

function LockedEngine({
  reason,
  loginHref,
}: {
  reason: 'missing' | 'invalid' | 'login';
  loginHref?: string;
}) {
  const copy =
    reason === 'login'
      ? 'This invite is valid. Sign in with Steam to open Kilrun Engine.'
      : reason === 'invalid'
        ? 'That invite link is invalid or has expired. Ask an admin for a new one.'
        : 'Kilrun Engine is invite-only. Open the special link an admin sent you.';
  return (
    <div className="min-h-screen bg-[#080b12] text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-red-500/40 bg-red-500/10 text-red-200 text-xs font-bold uppercase tracking-widest">
          <Lock className="w-3.5 h-3.5" /> Invite only
        </div>
        <h1 className="text-3xl font-black tracking-tight">Kilrun Engine</h1>
        <p className="text-slate-300 text-sm leading-relaxed">{copy}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {loginHref ? (
            <Button asChild className="bg-red-600 hover:bg-red-500">
              <a href={loginHref}>Sign in with Steam</a>
            </Button>
          ) : null}
          <Button asChild variant="outline" className="border-white/20 text-white hover:bg-white/10">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Arcade Hub
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default async function EnginePage({
  searchParams,
}: {
  searchParams: Promise<{ map?: string; invite?: string }>;
}) {
  const params = await searchParams;
  const inviteFromUrl = typeof params.invite === 'string' ? params.invite.trim() : '';

  if (inviteFromUrl && inviteFromUrl !== 'invalid') {
    const qs = new URLSearchParams({ invite: inviteFromUrl });
    if (params.map) qs.set('map', params.map);
    redirect(`/api/engine/accept-invite?${qs.toString()}`);
  }

  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  let user = null;
  if (steamId) {
    try {
      user = await withPrismaRetry((db) => db.user.findUnique({ where: { steamId } }));
    } catch (error) {
      console.error('[engine] failed to load user', error);
    }
  }

  const adminBypass = Boolean(user && !user.isBanned && isAdminRole(user.role));
  const jar = await cookies();
  const cookieToken = jar.get(ENGINE_INVITE_COOKIE)?.value;
  const stored = cookieToken ? await findActiveStoredInvite(cookieToken) : null;
  const inviteOk = Boolean(stored);

  if (!adminBypass && !inviteOk) {
    return <LockedEngine reason={inviteFromUrl === 'invalid' ? 'invalid' : 'missing'} />;
  }

  if (!user) {
    return <LockedEngine reason="login" loginHref="/api/auth/steam?next=/engine" />;
  }

  if (user.isBanned) {
    return <LockedEngine reason="invalid" />;
  }

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
