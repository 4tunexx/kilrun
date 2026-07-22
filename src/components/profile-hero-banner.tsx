'use client';

import type { ReactNode } from 'react';
import { BannerFill } from '@/components/banner-fill';
import type { BannerConfig } from '@/lib/banner';
import { cn } from '@/lib/utils';

/**
 * Profile / public-profile hero: full-color banner strip + identity row below
 * so the nickname never sits under/behind the overlapping avatar.
 */
export function ProfileHeroBanner({
  banner,
  topLeft,
  avatar,
  title,
  subtitle,
  trailing,
  className,
  rounded,
}: {
  banner: BannerConfig | null;
  topLeft?: ReactNode;
  avatar: ReactNode;
  /** Nickname + flag — rendered to the RIGHT of the avatar, clear of overlap. */
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  rounded?: boolean;
}) {
  return (
    <div className={cn('relative w-full', className)}>
      {/* Banner only — overflow clips art, NOT the identity row */}
      <div className={cn('relative w-full h-36 sm:h-44 md:h-52', rounded && 'rounded-t-xl overflow-hidden')}>
        <BannerFill
          banner={banner}
          showProfileOverlay
          className="absolute inset-0"
        />
        {topLeft ? (
          <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20">{topLeft}</div>
        ) : null}
      </div>

      {/* Identity sits UNDER the banner edge with avatar peek; name is beside avatar */}
      <div className="relative z-20 px-4 sm:px-8 -mt-12 sm:-mt-14 mb-4 flex items-end gap-4 sm:gap-5 min-w-0">
        <div className="shrink-0 relative z-10">{avatar}</div>
        <div className="min-w-0 flex-1 pb-1 sm:pb-2 relative z-20">
          {title}
          {subtitle}
        </div>
        {trailing ? <div className="shrink-0 pb-1 hidden sm:block">{trailing}</div> : null}
      </div>
    </div>
  );
}
