'use client';

import { useRef, useState, type ReactNode } from 'react';
import { ExternalLink, Loader2, ThumbsUp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LevelBar } from '@/components/ui/level-bar';
import { RankLabel } from '@/components/ui/rank-badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShowcaseChips } from '@/components/showcase-chips';
import { AvatarWithFrame } from '@/components/avatar-with-frame';
import { NicknameEffectText } from '@/components/nickname-effect';
import { useHoverCapable } from '@/hooks/use-hover-capable';
import { useProfileNavigation } from '@/components/providers/profile-navigation-context';
import { getPublicProfileSummary } from '@/lib/public-profile-actions';
import { getSiteUrl } from '@/lib/site-url';
import { bannerAnimationClass, bannerStyle, normalizeBannerConfig } from '@/lib/banner';
import {
  DEFAULT_SHOWCASE_LAYOUT,
  type ShowcaseAlign,
  type ShowcaseDisplayItem,
  type ShowcaseLayout,
  type ShowcasePosition,
} from '@/lib/showcase';
import { DEFAULT_MARK_LOGO, resolveMarkLogo } from '@/lib/branding';
import { getRoleTextColorClass } from '@/lib/role-colors';
import { cn } from '@/lib/utils';

type Summary = Awaited<ReturnType<typeof getPublicProfileSummary>>;

export type MiniProfileSummary = {
  username: string;
  avatarUrl: string;
  role: string;
  isVip: boolean;
  currentRank: string;
  /** Admin-panel tier badge image (optional). */
  rankImage?: string | null;
  /** Admin-panel tier color hex. */
  rankColor?: string | null;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  levelProgressPercent: number;
  reputation: number;
  equippedBannerConfig: unknown | null;
  equippedFrameConfig?: unknown | null;
  equippedNicknameConfig?: unknown | null;
  showcase: ShowcaseDisplayItem[];
  showcaseLayout?: ShowcaseLayout;
};

/**
 * Wraps a username anywhere in the hub. Desktop hover → mini card; click navigates.
 */
export function UserHoverCard({
  userId,
  role,
  isVip,
  nicknameEffect,
  children,
  className,
}: {
  userId: string;
  role?: string | null;
  isVip?: boolean | null;
  /** Equipped nickname cosmetic — when set, styles the trigger name. */
  nicknameEffect?: unknown | null;
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
    }
    closeTimer.current = null;
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

  const label =
    typeof children === 'string' || typeof children === 'number' ? String(children) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'text-left font-semibold transition-colors hover:underline underline-offset-2',
            !nicknameEffect && getRoleTextColorClass(role, isVip),
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
          {label && nicknameEffect ? (
            <NicknameEffectText name={label} effect={nicknameEffect} />
          ) : (
            children
          )}
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

/** Standalone mini profile used by hover cards and the showcase live preview. */
export function MiniProfileCard({
  summary,
  onViewProfile,
  layoutOverride,
  className,
  markLogoUrl,
}: {
  summary: MiniProfileSummary;
  onViewProfile?: () => void;
  layoutOverride?: Partial<ShowcaseLayout>;
  className?: string;
  markLogoUrl?: string | null;
}) {
  const [logoOpen, setLogoOpen] = useState(false);
  const banner = summary.equippedBannerConfig
    ? normalizeBannerConfig(summary.equippedBannerConfig)
    : null;
  const layout = {
    ...DEFAULT_SHOWCASE_LAYOUT,
    ...(summary.showcaseLayout ?? {}),
    ...(layoutOverride ?? {}),
  };
  const position: ShowcasePosition = layout.position;
  const align: ShowcaseAlign = layout.align;
  const markSrc = resolveMarkLogo(markLogoUrl) || DEFAULT_MARK_LOGO;
  const siteUrl = getSiteUrl();

  const showcaseBlock =
    summary.showcase.length > 0 ? (
      <div className="mt-2 min-w-0 overflow-hidden">
        <ShowcaseChips items={summary.showcase} compact align={align} />
      </div>
    ) : null;

  const logoButton = (
    <button
      type="button"
      title="Kilrun — enlarge & visit"
      className="absolute top-1.5 right-1.5 z-20 h-7 w-7 rounded-md bg-black/35 p-0.5 backdrop-blur-sm border border-white/15 transition hover:scale-110 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setLogoOpen(true);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={markSrc}
        alt="Kilrun"
        className="h-full w-full object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] select-none"
        draggable={false}
      />
    </button>
  );

  const body = (
    <>
      <div
        className={cn(
          'relative h-24 w-full',
          banner ? bannerAnimationClass(banner) : 'bg-gradient-to-r from-slate-800 to-slate-700'
        )}
        style={
          banner
            ? {
                ...bannerStyle(banner),
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        {logoButton}
      </div>
      <div className="-mt-8 px-4 pb-4 pt-0 min-w-0">
        <div className="flex items-end gap-3 min-w-0">
          <AvatarWithFrame
            src={summary.avatarUrl}
            alt={summary.username}
            fallback={summary.username.charAt(0)}
            frameConfig={summary.equippedFrameConfig}
            sizeClass="h-14 w-14"
            borderClassName="border-4 border-slate-900 shadow-lg"
          />
          {/* Name + rank fill the space to the RIGHT of the avatar (no dead gap, no overlap) */}
          <div className="min-w-0 flex-1 pb-0.5 flex items-center gap-2 flex-nowrap">
            <NicknameEffectText
              name={summary.username}
              effect={summary.equippedNicknameConfig}
              className={cn(
                'truncate font-bold text-base leading-tight',
                !summary.equippedNicknameConfig &&
                  getRoleTextColorClass(summary.role, summary.isVip)
              )}
            />
            {summary.isVip && (
              <Badge className="h-5 shrink-0 bg-yellow-500 text-[10px] text-black">VIP</Badge>
            )}
            <RankLabel
              rank={summary.currentRank}
              imageUrl={summary.rankImage}
              color={summary.rankColor}
              size={14}
              textClassName="text-[11px]"
            />
          </div>
        </div>
        <div className="mt-2.5">
          <LevelBar
            level={summary.level}
            xpIntoLevel={summary.xpIntoLevel}
            xpForNextLevel={summary.xpForNextLevel}
            percent={summary.levelProgressPercent}
          />
        </div>
        {position === 'after_level' ? showcaseBlock : null}
        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
          <span
            className={`flex items-center gap-1 font-semibold ${
              summary.reputation > 0
                ? 'text-emerald-400'
                : summary.reputation < 0
                  ? 'text-rose-400'
                  : ''
            }`}
          >
            <ThumbsUp className="h-3 w-3" />
            {summary.reputation > 0 ? '+' : ''}
            {summary.reputation} REP
          </span>
          {onViewProfile ? (
            <span className="text-primary group-hover:underline">View profile →</span>
          ) : (
            <span className="text-slate-500">Live preview</span>
          )}
        </div>
        {position === 'bottom' ? showcaseBlock : null}
      </div>

      <Dialog open={logoOpen} onOpenChange={setLogoOpen}>
        <DialogContent
          className="bg-slate-900 border-slate-700 text-white max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Kilrun</DialogTitle>
            <DialogDescription className="text-slate-400">
              Official mark — open the hub website.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={markSrc}
              alt="Kilrun"
              className="h-28 w-28 object-contain drop-shadow-xl"
            />
            <Button
              className="w-full"
              onClick={() => {
                window.open(siteUrl, '_blank', 'noopener,noreferrer');
                setLogoOpen(false);
              }}
            >
              <ExternalLink className="h-4 w-4 mr-2" /> Visit {siteUrl.replace(/^https?:\/\//, '')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  // Outer must NOT be a <button> — the Kilrun logo control is already a button
  // (nested buttons break HTML + hydration).
  if (onViewProfile) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onViewProfile}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onViewProfile();
          }
        }}
        className={cn(
          'block w-full text-left group overflow-hidden cursor-pointer',
          className
        )}
      >
        {body}
      </div>
    );
  }

  return <div className={cn('block w-full text-left overflow-hidden', className)}>{body}</div>;
}
