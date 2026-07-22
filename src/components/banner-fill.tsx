'use client';

import {
  bannerAnimationClass,
  bannerPatternStyle,
  bannerStyle,
  bannerTextureStyle,
  normalizeBannerConfig,
  type BannerConfig,
} from '@/lib/banner';
import { cn } from '@/lib/utils';

/**
 * Shared banner fill — gradient + optional pattern + texture.
 * Used by profile hero, admin studio, store cards, hover cards.
 */
export function BannerFill({
  banner,
  className,
  showProfileOverlay = false,
  rounded,
}: {
  banner: BannerConfig | null | undefined;
  className?: string;
  /** Same dark wash as the profile hero strip. */
  showProfileOverlay?: boolean;
  rounded?: boolean;
}) {
  if (!banner) {
    return (
      <div
        className={cn(
          'relative overflow-hidden bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800',
          rounded && 'rounded-t-xl',
          className
        )}
      />
    );
  }

  const cfg = normalizeBannerConfig(banner);
  const pattern = bannerPatternStyle(cfg);
  const texture = bannerTextureStyle(cfg);

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        rounded && 'rounded-t-xl',
        bannerAnimationClass(cfg),
        className
      )}
    >
      <div className="absolute inset-0" style={bannerStyle(cfg)} />
      {pattern ? <div className="absolute inset-0" style={pattern} /> : null}
      {texture ? <div className="absolute inset-0" style={texture} /> : null}
      {showProfileOverlay ? (
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-black/10" />
      ) : null}
    </div>
  );
}
