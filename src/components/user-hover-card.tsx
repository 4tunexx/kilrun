'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Crown, Loader2, ThumbsUp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LevelBar } from '@/components/ui/level-bar';
import { useHoverCapable } from '@/hooks/use-hover-capable';
import { useProfileNavigation } from '@/components/providers/profile-navigation-context';
import { getPublicProfileSummary } from '@/lib/public-profile-actions';
import { bannerAnimationClass, bannerStyle, normalizeBannerConfig } from '@/lib/banner';
import { cn } from '@/lib/utils';

type Summary = Awaited<ReturnType<typeof getPublicProfileSummary>>;

/**
 * Wraps a username anywhere in the hub (forum, chat, leaderboard, friends,
 * messages...). Desktop: hovering shows a mini profile card; clicking the
 * username or the card navigates to the full public profile. Touch: first
 * tap opens the card, tapping again (the username or the card) navigates.
 */
export function UserHoverCard({
  userId,
  children,
  className,
}: {
  userId: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary>(null);
  const [loading, setLoading] = useState(false);
  const hoverCapable = useHoverCapable();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { openProfile } = useProfileNavigation();

  const load = () => {
    if (summary || loading) return;
    setLoading(true);
    getPublicProfileSummary(userId)
      .then((data) => setSummary(data))
      .finally(() => setLoading(false));
  };

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hoverCapable) {
      openProfile(userId);
      return;
    }
    if (open) {
      openProfile(userId);
    } else {
      load();
      setOpen(true);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'text-left font-semibold transition-colors hover:text-primary hover:underline underline-offset-2',
            className
          )}
          onMouseEnter={
            hoverCapable
              ? () => {
                  load();
                  setOpen(true);
                }
              : undefined
          }
          onMouseLeave={hoverCapable ? scheduleClose : undefined}
          onClick={handleTriggerClick}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        onMouseEnter={hoverCapable ? cancelClose : undefined}
        onMouseLeave={hoverCapable ? scheduleClose : undefined}
        align="start"
        className="w-72 overflow-hidden border-slate-700 bg-slate-900/95 p-0 text-white backdrop-blur-md"
      >
        {loading || !summary ? (
          <div className="flex items-center justify-center p-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <MiniProfileCard summary={summary} onViewProfile={() => openProfile(userId)} />
        )}
      </PopoverContent>
    </Popover>
  );
}

function MiniProfileCard({
  summary,
  onViewProfile,
}: {
  summary: NonNullable<Summary>;
  onViewProfile: () => void;
}) {
  const banner = summary.equippedBannerConfig
    ? normalizeBannerConfig(summary.equippedBannerConfig)
    : null;

  return (
    <button type="button" onClick={onViewProfile} className="block w-full text-left group">
      <div
        className={cn(
          'h-16 w-full',
          banner ? bannerAnimationClass(banner) : 'bg-gradient-to-r from-slate-800 to-slate-700'
        )}
        style={banner ? bannerStyle(banner) : undefined}
      />
      <div className="-mt-8 p-4 pt-0">
        <Avatar className="h-16 w-16 border-4 border-slate-900 shadow-lg">
          <AvatarImage src={summary.avatarUrl} alt={summary.username} />
          <AvatarFallback>{summary.username.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="truncate font-bold text-lg text-white transition-colors group-hover:text-primary">
            {summary.username}
          </p>
          {summary.isVip && (
            <Badge className="h-5 bg-yellow-500 text-[10px] text-black">VIP</Badge>
          )}
        </div>
        <p className="flex items-center gap-1 text-xs font-semibold text-yellow-400">
          <Crown className="h-3 w-3" /> {summary.currentRank}
        </p>
        <div className="mt-3">
          <LevelBar
            level={summary.level}
            xpIntoLevel={summary.xpIntoLevel}
            xpForNextLevel={summary.xpForNextLevel}
            percent={summary.levelProgressPercent}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" /> {summary.reputation} reputation
          </span>
          <span className="text-primary group-hover:underline">View profile →</span>
        </div>
      </div>
    </button>
  );
}
