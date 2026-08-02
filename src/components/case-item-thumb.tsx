'use client';

import { Coins, Gift } from 'lucide-react';
import { BannerFill } from '@/components/banner-fill';
import { normalizeBannerConfig } from '@/lib/banner';
import {
  frameAnimationClass,
  frameWrapperStyle,
  nicknameEffectClass,
  nicknameEffectStyle,
  normalizeFrameConfig,
  normalizeNicknameConfig,
} from '@/lib/cosmetics';
import { cn } from '@/lib/utils';

export type CaseItemThumbData = {
  rewardType: string;
  displayName: string;
  displayImage: string;
  cosmeticSlot?: string | null;
  bannerConfig?: unknown;
  cosmeticConfig?: unknown;
};

/** Crate item thumb — renders banners/frames/nicknames from their live
 *  config (same as the shop grid), falling back to a static image or a
 *  generic icon for weapon skins / currency rewards. */
export function CaseItemThumb({
  item,
  className,
  iconClassName,
}: {
  item: CaseItemThumbData;
  /** Applied to the image/config preview element. */
  className?: string;
  /** Applied to the Coins/Gift fallback icon. */
  iconClassName?: string;
}) {
  if (item.rewardType === 'currency') {
    return <Coins className={cn(iconClassName)} />;
  }
  if (item.bannerConfig) {
    return (
      <BannerFill
        banner={normalizeBannerConfig(item.bannerConfig)}
        className={cn('rounded', className)}
      />
    );
  }
  if (item.cosmeticSlot === 'frame' && item.cosmeticConfig) {
    const frame = normalizeFrameConfig(item.cosmeticConfig);
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <div className={cn('rounded-full', frameAnimationClass(frame))} style={frameWrapperStyle(frame)}>
          <div className="h-full w-full rounded-full border-2 border-slate-900/60 bg-slate-800" />
        </div>
      </div>
    );
  }
  if (item.cosmeticSlot === 'nickname' && item.cosmeticConfig) {
    const nick = normalizeNicknameConfig(item.cosmeticConfig);
    return (
      <div className={cn('flex items-center justify-center px-1', className)}>
        <span
          className={cn('text-[10px] font-black truncate max-w-full', nicknameEffectClass(nick))}
          style={nicknameEffectStyle(nick)}
        >
          {item.displayName}
        </span>
      </div>
    );
  }
  if (item.displayImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.displayImage} alt="" className={cn('object-contain', className)} draggable={false} />
    );
  }
  return <Gift className={cn(iconClassName)} />;
}
