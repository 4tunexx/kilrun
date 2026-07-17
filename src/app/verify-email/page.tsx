'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, ShieldCheck, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmailVerificationForm } from '@/components/email-verification-form';
import { getSessionUser } from '@/lib/actions';

function VerifyEmailContent() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceChange = searchParams.get('change') === '1';

  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  const [ready, setReady] = useState(false);
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (sessionStatus === 'loading') return;

    if (!steamId) {
      setReady(true);
      return;
    }

    // Never block the email form on DB — show it immediately for logged-in players.
    setReady(true);
    setShowForm(true);

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      // If Mongo is slow/down, keep the typeable form visible.
      if (!cancelled) setShowForm(true);
    }, 2500);

    getSessionUser()
      .then((user) => {
        if (cancelled) return;
        setCurrentEmail(user?.email ?? null);
        const verified = Boolean(user?.emailVerified);
        setAlreadyVerified(verified);
        if (verified && !forceChange) {
          setShowForm(false);
        } else {
          setShowForm(true);
        }
      })
      .catch(() => {
        if (!cancelled) setShowForm(true);
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [sessionStatus, steamId, forceChange]);

  if (sessionStatus === 'loading' || !ready) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        Checking your session...
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 text-slate-400"
          onClick={() => {
            setReady(true);
            setShowForm(true);
          }}
        >
          Skip — enter email now
        </Button>
      </div>
    );
  }

  if (!steamId) {
    return (
      <div className="text-center py-8 space-y-4">
        <ShieldCheck className="w-10 h-10 mx-auto text-slate-500" />
        <p className="text-slate-300">
          Log in with Steam first, then come back here to verify your email.
        </p>
        <Button asChild className="w-full">
          <Link href="/landing">Go to Login</Link>
        </Button>
      </div>
    );
  }

  if (alreadyVerified && !showForm) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
          <ShieldCheck className="w-8 h-8 text-emerald-400" />
        </div>
        <p className="text-slate-200 font-semibold">Your email is confirmed.</p>
        {currentEmail && (
          <p className="text-sm text-emerald-300 font-medium">{currentEmail}</p>
        )}
        <Button variant="outline" className="w-full" onClick={() => setShowForm(true)}>
          Change email
        </Button>
        <Button className="w-full" onClick={() => router.push('/')}>
          Back to Hub
        </Button>
      </div>
    );
  }

  return (
    <EmailVerificationForm
      onComplete={() => {
        router.push('/');
        router.refresh();
      }}
    />
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen w-full bg-slate-950 relative overflow-hidden flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(239,68,68,0.15),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(56,189,248,0.12),transparent_50%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-primary/30 bg-slate-900/70 backdrop-blur-xl shadow-[0_0_40px_rgba(239,68,68,0.25)] p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">
                Arcade Verification Key
              </h1>
              <p className="text-sm text-slate-400">Type your email to confirm</p>
            </div>
          </div>

          <Suspense
            fallback={
              <div className="flex justify-center py-8 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            }
          >
            <VerifyEmailContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
