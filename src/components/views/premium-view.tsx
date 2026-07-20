'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  Crown,
  Gem,
  Loader2,
  Shield,
  Swords,
  Timer,
  CreditCard,
  Coins,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  purchasePremiumWithVp,
  requestPremiumCardCheckout,
} from '@/lib/social-actions';
import {
  PREMIUM_DURATION_DAYS,
  PREMIUM_MONTHLY_USD,
  PREMIUM_VP_COST,
  formatPremiumCountdown,
  isPremiumActive,
  premiumMsRemaining,
} from '@/lib/premium';
import { useToast } from '@/hooks/use-toast';

interface PremiumViewProps {
  vpBalance: number;
  isVip: boolean;
  premiumExpiresAt?: string | null;
  currentRank?: string;
  kp?: number;
  onPurchased?: (next: { vpBalance: number; premiumExpiresAt: string }) => void;
  onGoRanked?: () => void;
}

const PERKS = [
  {
    icon: Swords,
    title: 'Ranked Competitive',
    body: 'Enter the Premium Ranked queue — KP Elo, Faceit-style ranks, anti-cheat lobby.',
  },
  {
    icon: Shield,
    title: 'Safe ranked environment',
    body: 'Premium-only matches with tighter lobby rules and ranked integrity.',
  },
  {
    icon: Crown,
    title: 'Premium badge & cosmetics',
    body: 'Hub badge, orange name styling, exclusive banner / frame / nickname effects.',
  },
  {
    icon: Gem,
    title: 'Ranked leaderboard',
    body: 'Appear on the Ranked (KP) board — Call of Duty style premium ladder.',
  },
];

export default function PremiumView({
  vpBalance,
  isVip,
  premiumExpiresAt,
  currentRank,
  kp,
  onPurchased,
  onGoRanked,
}: PremiumViewProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<'vp' | 'card' | null>(null);
  const [expiresAt, setExpiresAt] = useState(premiumExpiresAt ?? null);
  const [balance, setBalance] = useState(vpBalance);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setExpiresAt(premiumExpiresAt ?? null);
  }, [premiumExpiresAt]);

  useEffect(() => {
    setBalance(vpBalance);
  }, [vpBalance]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const active = isPremiumActive({ isVip, premiumExpiresAt: expiresAt });
  const remaining = premiumMsRemaining(expiresAt);
  // re-read now so countdown updates
  void now;

  const buyVp = async () => {
    setBusy('vp');
    try {
      const result = await purchasePremiumWithVp();
      if (!result.ok) {
        toast({
          title: result.error ?? 'Purchase failed',
          description: `Premium is ${PREMIUM_VP_COST} VP / ${PREMIUM_DURATION_DAYS} days.`,
          variant: 'destructive',
        });
        return;
      }
      setBalance((b) => b - PREMIUM_VP_COST);
      if (result.premiumExpiresAt) {
        setExpiresAt(result.premiumExpiresAt);
        onPurchased?.({
          vpBalance: balance - PREMIUM_VP_COST,
          premiumExpiresAt: result.premiumExpiresAt,
        });
      }
      toast({
        title: 'Premium activated',
        description: `${PREMIUM_DURATION_DAYS} days of Ranked Competitive unlocked.`,
      });
    } finally {
      setBusy(null);
    }
  };

  const buyCard = async () => {
    setBusy('card');
    try {
      await requestPremiumCardCheckout();
      toast({
        title: 'Card checkout requested',
        description:
          'Stripe billing is finishing setup. Use 5000 VP to start now, or check Support for billing help.',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="px-4 sm:px-8 py-6 space-y-6 max-w-5xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 p-6 sm:p-8">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <Badge className="bg-amber-500/20 text-amber-200 border-amber-400/40 mb-3">
              Kilrun Premium
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              Ranked. Rewarded. Exclusive.
            </h1>
            <p className="mt-2 text-slate-300 max-w-xl text-sm sm:text-base">
              Compete in Premium Ranked 4v4 with Killrun Points (KP), climb Immortal, and show your
              Premium badge next to Steam & email verification.
            </p>
          </div>
          {active ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 min-w-[12rem]">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wide">
                <Timer className="h-3.5 w-3.5" /> Active
              </div>
              <p className="text-2xl font-black text-white mt-1 tabular-nums">
                {expiresAt ? formatPremiumCountdown(remaining) : 'Lifetime'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {expiresAt
                  ? `Expires ${new Date(expiresAt).toLocaleString()}`
                  : 'Legacy Premium (no expiry)'}
              </p>
              {currentRank && (
                <p className="text-xs text-amber-200 mt-2">
                  Rank {currentRank}
                  {typeof kp === 'number' ? ` · ${kp} KP` : ''}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-600/50 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
              Rank shows <span className="text-amber-300 font-semibold">Go Premium</span> until you
              subscribe.
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PERKS.map((p) => (
          <Card key={p.title} className="bg-slate-900/50 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <p.icon className="h-4 w-4 text-amber-300" />
                {p.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-400">{p.body}</CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-amber-500/40 bg-gradient-to-b from-amber-500/10 to-slate-900/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-300" />
              Pay with Vault Points
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-black text-white">
              {PREMIUM_VP_COST.toLocaleString()}{' '}
              <span className="text-lg text-amber-200">VP</span>
            </p>
            <p className="text-sm text-slate-400">
              {PREMIUM_DURATION_DAYS} days · stacks if you renew early · balance{' '}
              <span className="text-slate-200 font-semibold">{balance.toLocaleString()} VP</span>
            </p>
            <ul className="text-xs text-slate-400 space-y-1">
              {['Ranked Competitive queue', 'KP Elo ranks', 'Premium hub badge'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> {t}
                </li>
              ))}
            </ul>
            <Button
              className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold"
              disabled={busy !== null || balance < PREMIUM_VP_COST}
              onClick={() => void buyVp()}
            >
              {busy === 'vp' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Gem className="h-4 w-4 mr-2" />
              )}
              {active ? 'Extend Premium' : 'Unlock Premium'}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-sky-500/30 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-sky-300" />
              Monthly card
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-black text-white">
              ${PREMIUM_MONTHLY_USD.toFixed(2)}
              <span className="text-lg text-slate-400 font-semibold"> / mo</span>
            </p>
            <p className="text-sm text-slate-400">
              Same Premium perks billed monthly. Card checkout is finishing setup — request now and
              we&apos;ll follow up, or unlock instantly with VP.
            </p>
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy !== null}
              onClick={() => void buyCard()}
            >
              {busy === 'card' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              Request ${PREMIUM_MONTHLY_USD.toFixed(2)} checkout
            </Button>
          </CardContent>
        </Card>
      </div>

      {active && onGoRanked && (
        <div className="flex justify-center">
          <Button size="lg" onClick={onGoRanked} className="font-bold uppercase tracking-wide">
            <Swords className="h-4 w-4 mr-2" /> Play Ranked Competitive
          </Button>
        </div>
      )}
    </div>
  );
}
