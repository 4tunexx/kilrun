'use client';

import Image from 'next/image';
import { bannerAnimationClass, bannerStyle, normalizeBannerConfig } from '@/lib/banner';
import {
  frameAnimationClass,
  frameWrapperStyle,
  nicknameEffectClass,
  nicknameEffectStyle,
  normalizeFrameConfig,
  normalizeNicknameConfig,
} from '@/lib/cosmetics';
import { resolveShopImageUrl } from '@/lib/shop-images';
import { cn } from '@/lib/utils';

export type StoreItemPreviewData = {
  itemName: string;
  itemCategory?: string | null;
  imageUrl?: string | null;
  cosmeticSlot?: string | null;
  bannerConfig?: unknown;
  cosmeticConfig?: unknown;
};

/** Shared catalog preview — banners/frames/nicknames use live cosmetic config. */
export function StoreItemPreview({
  item,
  className,
}: {
  item: StoreItemPreviewData;
  className?: string;
}) {
  if (item.bannerConfig) {
    const cfg = normalizeBannerConfig(item.bannerConfig);
    return (
      <div
        className={cn('absolute inset-0', bannerAnimationClass(cfg), className)}
        style={bannerStyle(cfg)}
      />
    );
  }
  if (item.cosmeticSlot === 'frame' && item.cosmeticConfig) {
    const frame = normalizeFrameConfig(item.cosmeticConfig);
    return (
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center bg-slate-950',
          className
        )}
      >
        <div
          className={cn('rounded-full', frameAnimationClass(frame))}
          style={frameWrapperStyle(frame)}
        >
          <div className="h-16 w-16 rounded-full bg-slate-800 border-2 border-slate-900" />
        </div>
      </div>
    );
  }
  if (item.cosmeticSlot === 'nickname' && item.cosmeticConfig) {
    const nick = normalizeNicknameConfig(item.cosmeticConfig);
    return (
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center bg-slate-950 px-3',
          className
        )}
      >
        <span
          className={cn('text-xl font-black truncate', nicknameEffectClass(nick))}
          style={nicknameEffectStyle(nick)}
        >
          Player
        </span>
      </div>
    );
  }
  const imageSrc = resolveShopImageUrl(item.imageUrl);
  if (imageSrc) {
    return (
      <Image
        src={imageSrc}
        alt={item.itemName}
        fill
        className={cn(
          'object-cover group-hover:scale-110 transition-transform duration-300',
          className
        )}
        unoptimized={
          imageSrc.includes('placehold.co') ||
          imageSrc.endsWith('.svg') ||
          !/^https?:\/\//i.test(imageSrc)
        }
      />
    );
  }
  return (
    <div
      className={cn(
        'absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950',
        className
      )}
    >
      <span className="text-4xl font-black uppercase tracking-wider text-slate-600">
        {(item.itemCategory || '?').slice(0, 1)}
      </span>
    </div>
  );
}
