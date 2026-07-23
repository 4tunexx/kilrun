'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserHoverCard } from '@/components/user-hover-card';
import { getAnnouncementCarouselItems } from '@/lib/announcement-carousel-actions';
import type { AnnouncementItem } from '@/lib/announcement-carousel-actions';
import type { AnnouncementCarouselConfig } from '@/lib/announcement-carousel-config';

type CarouselData = Awaited<ReturnType<typeof getAnnouncementCarouselItems>>;

/**
 * Hub-wide announcement ticker rendered between the page banner and content area.
 * It fetches data client-side on mount and refreshes every 2 minutes.
 *
 * The ticker is a pure-CSS marquee (CSS animation) to avoid layout jank.
 * On hover / pointer-down the animation is paused.
 */
export function HubAnnouncementCarousel() {
  const [data, setData] = useState<CarouselData | null>(null);
  const [paused, setPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await getAnnouncementCarouselItems();
        if (!cancelled) setData(result);
      } catch {
        /* non-fatal */
      }
    };

    load();
    const id = setInterval(load, 2 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data || !data.config.enabled || data.items.length === 0) return null;

  const { config, items } = data;

  return (
    <CarouselBand
      config={config}
      items={items}
      paused={paused}
      setPaused={setPaused}
      containerRef={containerRef}
    />
  );
}

function CarouselBand({
  config,
  items,
  paused,
  setPaused,
  containerRef,
}: {
  config: AnnouncementCarouselConfig;
  items: AnnouncementItem[];
  paused: boolean;
  setPaused: (v: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { thickness, direction } = config;

  // Double the items so the marquee loops seamlessly: when the first set scrolls
  // fully off-screen, the second set (identical) is already in view, so we restart.
  const doubled = [...items, ...items];

  // Estimate track width: ~260px average chip width * doubled items count.
  // Duration = track_width / speed (px/s) gives a consistent linear motion.
  const durationSeconds = Math.max(8, Math.round((doubled.length * 260) / config.speed));

  // Left direction: hub-marquee (0 → -50%)
  // Right direction: hub-marquee-rtl (-50% → 0)
  const animName = direction === 'right' ? 'hub-marquee-rtl' : 'hub-marquee';

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-slate-900/70 backdrop-blur-sm border-b border-slate-700/40 select-none z-10 shrink-0"
      style={{ height: `${thickness}px` }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
    >
      {/* Faded edge gradient masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 z-20 bg-gradient-to-r from-slate-900/90 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 z-20 bg-gradient-to-l from-slate-900/90 to-transparent" />

      <div
        className="absolute inset-y-0 flex items-center gap-0"
        style={{
          animation: `${animName} ${durationSeconds}s linear infinite`,
          animationPlayState: paused ? 'paused' : 'running',
          willChange: 'transform',
        }}
      >
        {doubled.map((item, idx) => (
          <CarouselChip key={`${item.id}-${idx}`} item={item} thickness={thickness} />
        ))}
      </div>
    </div>
  );
}

function CarouselChip({
  item,
  thickness,
}: {
  item: AnnouncementItem;
  thickness: number;
}) {
  const avatarSize = Math.max(20, Math.min(thickness - 12, 28));

  return (
    <div className="flex items-center gap-2 px-5 shrink-0 whitespace-nowrap">
      {/* Separator */}
      <span className="text-slate-600 text-xs mr-1">•</span>

      {/* Event type label */}
      <span className="text-xs font-semibold text-slate-300 tracking-wide">
        {item.label}
      </span>

      {/* User avatar + name with hover-card */}
      {item.user ? (
        <span className="flex items-center gap-1.5">
          <Avatar
            className="shrink-0 border border-slate-600/50"
            style={{ width: avatarSize, height: avatarSize }}
          >
            <AvatarImage src={item.user.avatarUrl} alt={item.user.username} />
            <AvatarFallback style={{ fontSize: Math.max(8, avatarSize / 2.5) }}>
              {item.user.username.charAt(0)}
            </AvatarFallback>
          </Avatar>

          {/*
           * UserHoverCard applies getRoleTextColorClass internally (line 131 in
           * user-hover-card.tsx) when no nickname effect is equipped, and renders
           * NicknameEffectText when one is. We pass both role/isVip and the
           * equipped nickname config so the ticker honours the same cosmetics as
           * the rest of the hub.
           */}
          <UserHoverCard
            userId={item.user.id}
            role={item.user.role}
            isVip={item.user.isVip}
            nicknameEffect={item.user.equippedNicknameConfig}
            className="text-xs font-bold"
          >
            {item.user.username}
          </UserHoverCard>
        </span>
      ) : null}

      {/* Event detail text */}
      <span className="text-xs text-slate-400">{item.detail}</span>
    </div>
  );
}
