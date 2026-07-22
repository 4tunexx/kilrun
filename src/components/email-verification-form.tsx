'use client';

import { useState, type FormEvent } from 'react';
import { useSession } from 'next-auth/react';
import { useSignUp } from '@clerk/nextjs';
import { Loader2, Mail, ShieldCheck, Sparkles, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type Step = 'email' | 'code' | 'success';

export function EmailVerificationForm({
  onComplete,
  compact = false,
}: {
  onComplete?: () => void;
  compact?: boolean;
}) {
  const { data: session } = useSession();
  const { isLoaded, signUp, setActive } = useSignUp();
  const { toast } = useToast();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoaded) {
      setError('Email service is still loading. Wait a second and try again.');
      return;
    }
    if (!steamId) {
      setError('Steam session missing. Log out and log in with Steam again.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await signUp.create({
        emailAddress: email.trim(),
        unsafeMetadata: { steamId },
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setStep('code');
      toast({
        title: 'Code sent',
        description: `Check ${email.trim()} for your 6-digit Kilrun verification code.`,
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
        toast({ title: 'Email confirmed!' });
        onComplete?.();
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

  const BrandHeader = () => (
    <div className="flex items-center gap-3 mb-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/api/site-favicon"
        alt="Kilrun"
        className="h-10 w-10 rounded-lg object-contain bg-slate-950/80 border border-slate-700/60 p-1"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = '/K2.png';
        }}
      />
      <div>
        <p className="font-black text-lg tracking-tight text-white">Kilrun</p>
        <p className="text-[11px] text-slate-500 leading-snug max-w-[16rem]">
          Kilrun sends a branded code email (Resend + Clerk webhook).
        </p>
      </div>
    </div>
  );

  if (step === 'success') {
    return (
      <div className="text-center space-y-3 py-2">
        <BrandHeader />
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center">
          <ShieldCheck className="w-7 h-7 text-emerald-400" />
        </div>
        <p className="font-semibold text-emerald-300">Email confirmed</p>
        <p className="text-sm text-slate-400">
          Your profile Settings will show a green Confirmed badge after refresh.
        </p>
        {onComplete && (
          <Button className="w-full" onClick={onComplete}>
            Done
          </Button>
        )}
      </div>
    );
  }

  if (step === 'code') {
    return (
      <form onSubmit={handleVerifyCode} className="space-y-4">
        <BrandHeader />
        <p className={`text-sm text-slate-400 ${compact ? '' : ''}`}>
          Enter the 6-digit Kilrun verification code sent to{' '}
          <span className="text-white font-medium">{email}</span>
        </p>
        <Input
          inputMode="numeric"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className="text-center text-2xl font-mono tracking-[0.4em] bg-slate-950/60 border-slate-700 text-white"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          disabled={isSubmitting || code.length < 6}
          className="w-full"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Confirm email
        </Button>
        <button
          type="button"
          onClick={() => {
            setStep('email');
            setCode('');
            setError(null);
          }}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mx-auto"
        >
          <ArrowLeft className="w-3 h-3" /> Use a different email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSendCode} className="space-y-4">
      <BrandHeader />
      <p className="text-sm text-slate-400">
        {compact
          ? 'We will email a 6-digit Kilrun verification code.'
          : 'Type your email, then we will send a 6-digit Kilrun verification code.'}{' '}
        First-time verify unlocks{' '}
        <span className="text-primary font-semibold">+100 VP</span>.
      </p>
      <div className="space-y-2">
        <Label htmlFor="kilrun-email">Email address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            id="kilrun-email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="pl-9 bg-slate-950/60 border-slate-700 text-white"
          />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <Sparkles className="w-4 h-4 mr-2" />
        )}
        Send verification code
      </Button>
      {/* Required by Clerk bot protection during signUp.create() */}
      <div id="clerk-captcha" />
    </form>
  );
}
