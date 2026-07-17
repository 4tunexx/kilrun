'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useSignUp } from '@clerk/nextjs';
import { Loader2, Mail, ShieldCheck, KeyRound, Sparkles, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getSessionUser } from '@/lib/actions';

type Step = 'checking' | 'signed-out' | 'already-verified' | 'email' | 'code' | 'success';

function VerifyEmailForm() {
  const { status: sessionStatus } = useSession();
  const { isLoaded, signUp, setActive } = useSignUp();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceChange = searchParams.get('change') === '1';

  const [step, setStep] = useState<Step>('checking');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [wasVerified, setWasVerified] = useState(false);

  const { data: session } = useSession();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!steamId) {
      setStep('signed-out');
      return;
    }
    getSessionUser().then((user) => {
      setCurrentEmail(user?.email ?? null);
      setWasVerified(Boolean(user?.emailVerified));
      if (user?.emailVerified && !forceChange) {
        setStep('already-verified');
      } else {
        setStep('email');
      }
    });
  }, [sessionStatus, steamId, forceChange]);

  const handleSendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !steamId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await signUp.create({
        emailAddress: email,
        unsafeMetadata: { steamId },
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setStep('code');
      toast({
        title: 'Arcade Verification Key sent!',
        description: `Check ${email} for your 6-digit code.`,
      });
    } catch (err: unknown) {
      const message =
        (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
        'Could not send verification code. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
        }
        setStep('success');
      } else {
        setError('Invalid or expired code. Please try again.');
      }
    } catch (err: unknown) {
      const message =
        (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
        'Invalid code. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-slate-900/70 backdrop-blur-xl shadow-[0_0_40px_rgba(239,68,68,0.25)] p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.35)]">
          <KeyRound className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Arcade Verification Key
          </h1>
          <p className="text-sm text-slate-400">
            {forceChange || wasVerified
              ? 'Change your email address'
              : 'Secure your player profile'}
          </p>
        </div>
      </div>

      {step === 'checking' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          Checking your session...
        </div>
      )}

      {step === 'signed-out' && (
        <div className="text-center py-8 space-y-4">
          <ShieldCheck className="w-10 h-10 mx-auto text-slate-500" />
          <p className="text-slate-300">
            Log in with Steam first, then come back here to verify your email.
          </p>
          <Button asChild className="w-full">
            <Link href="/landing">Go to Login</Link>
          </Button>
        </div>
      )}

      {step === 'already-verified' && (
        <div className="text-center py-8 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shadow-[0_0_25px_rgba(16,185,129,0.35)]">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          </div>
          <p className="text-slate-200 font-semibold">Your email is confirmed.</p>
          {currentEmail && (
            <p className="text-sm text-emerald-300 font-medium">{currentEmail}</p>
          )}
          <Button variant="outline" className="w-full" onClick={() => setStep('email')}>
            Change email
          </Button>
          <Button className="w-full" onClick={() => router.push('/')}>
            Back to Hub
          </Button>
        </div>
      )}

      {step === 'email' && (
        <form onSubmit={handleSendCode} className="space-y-5">
          <p className="text-sm text-slate-400">
            {forceChange || wasVerified ? (
              'Enter a new email to receive a 6-digit verification code.'
            ) : (
              <>
                Enter your email to receive a secure 6-digit Arcade Verification Key and unlock a{' '}
                <span className="text-primary font-semibold">100 VP Welcome Bonus</span>.
              </>
            )}
          </p>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="pl-9 bg-slate-950/60 border-slate-700 focus-visible:ring-primary focus-visible:border-primary text-white"
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={!isLoaded || isSubmitting}
            className="w-full shadow-[0_0_20px_rgba(239,68,68,0.35)]"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Send Verification Key
          </Button>
          <div id="clerk-captcha" />
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={handleVerifyCode} className="space-y-5">
          <p className="text-sm text-slate-400">
            Enter the 6-digit code sent to{' '}
            <span className="text-white font-medium">{email}</span>.
          </p>
          <div className="space-y-2">
            <Label htmlFor="code" className="text-slate-300">
              Verification Key
            </Label>
            <Input
              id="code"
              inputMode="numeric"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="text-center text-2xl font-mono tracking-[0.5em] bg-slate-950/60 border-slate-700 focus-visible:ring-primary focus-visible:border-primary text-white"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={isSubmitting || code.length < 6}
            className="w-full shadow-[0_0_20px_rgba(239,68,68,0.35)]"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Confirm email
          </Button>
          <button
            type="button"
            onClick={() => setStep('email')}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mx-auto"
          >
            <ArrowLeft className="w-3 h-3" /> Use a different email
          </button>
        </form>
      )}

      {step === 'success' && (
        <div className="text-center py-6 space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.45)]">
            <ShieldCheck className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-xl font-black text-white">Email confirmed!</h2>
          <p className="text-slate-300">
            {forceChange || wasVerified ? (
              'Your email was updated successfully.'
            ) : (
              <>
                +<span className="text-primary font-bold">100 VP</span> Welcome Bonus credited to
                your account.
              </>
            )}
          </p>
          <Button className="w-full" onClick={() => router.push('/')}>
            Return to Hub
          </Button>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen w-full bg-slate-950 relative overflow-hidden flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(239,68,68,0.15),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(56,189,248,0.12),transparent_50%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="relative z-10 w-full max-w-md">
        <Suspense
          fallback={
            <div className="rounded-2xl border border-primary/30 bg-slate-900/70 p-8 flex justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          }
        >
          <VerifyEmailForm />
        </Suspense>
      </div>
    </div>
  );
}
