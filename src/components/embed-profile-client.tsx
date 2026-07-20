'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MiniProfileCard, type MiniProfileSummary } from '@/components/user-hover-card';
import { getPublicProfileSummary } from '@/lib/public-profile-actions';

const REFRESH_MS = 45_000;

/**
 * Embeddable live mini-profile for forums / Twitch / external sites.
 * Polls so level, REP, and showcase stay fresh inside iframes.
 */
export default function EmbedProfileClient({ userId }: { userId: string }) {
  const [summary, setSummary] = useState<MiniProfileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getPublicProfileSummary(userId)
        .then((data) => {
          if (cancelled) return;
          if (!data) {
            setError('Profile not found');
            setSummary(null);
            return;
          }
          setError(null);
          setSummary({
            username: data.username,
            avatarUrl: data.avatarUrl,
            role: data.role,
            isVip: data.isVip,
            currentRank: data.currentRank,
            level: data.level,
            xpIntoLevel: data.xpIntoLevel,
            xpForNextLevel: data.xpForNextLevel,
            levelProgressPercent: data.levelProgressPercent,
            reputation: data.reputation,
            equippedBannerConfig: data.equippedBannerConfig,
            equippedFrameConfig: data.equippedFrameConfig,
            equippedNicknameConfig: data.equippedNicknameConfig,
            showcase: data.showcase,
            showcaseLayout: data.showcaseLayout,
          });
        })
        .catch(() => {
          if (!cancelled) setError('Could not load profile');
        });
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [userId]);

  if (error) {
    return (
      <div className="flex h-[320px] w-[288px] items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-sm text-slate-400">
        {error}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex h-[320px] w-[288px] items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <a
      href={`/?profile=${encodeURIComponent(userId)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-[288px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 shadow-xl text-white no-underline"
    >
      <MiniProfileCard summary={summary} />
    </a>
  );
}
