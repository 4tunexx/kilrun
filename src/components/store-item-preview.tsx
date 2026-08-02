'use client';

import Image from 'next/image';
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

export type StoreItemViewer = {
  /** Real display name of whoever is looking at the shop / inventory. */
  username?: string | null;
  /** Their existing profile picture URL. */
  avatarUrl?: string | null;
};

function previewName(viewer?: StoreItemViewer | null, fallback = 'Player') {
  const n = viewer?.username?.trim();
  return n || fallback;
}

function previewAvatar(viewer?: StoreItemViewer | null) {
  const url = viewer?.avatarUrl?.trim();
  return url || undefined;
}

/** Shared catalog preview — banners/frames/nicknames use live cosmetic config. */
export function StoreItemPreview({
  item,
  viewer,
  className,
}: {
  item: StoreItemPreviewData;
  /** When set, nickname effects & frames preview as this user (unique per person). */
  viewer?: StoreItemViewer | null;
  className?: string;
}) {
  if (item.bannerConfig) {
    const cfg = normalizeBannerConfig(item.bannerConfig);
    return <BannerFill banner={cfg} className={cn('absolute inset-0', className)} />;
  }
  if (item.cosmeticSlot === 'frame' && item.cosmeticConfig) {
    const frame = normalizeFrameConfig(item.cosmeticConfig);
    const name = previewName(viewer);
    const avatar = previewAvatar(viewer);
    return (
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm',
          className
        )}
      >
        <div
          className={cn('rounded-full', frameAnimationClass(frame))}
          style={frameWrapperStyle(frame)}
        >
          <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-slate-900/60 bg-slate-800">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt={name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-black text-slate-300">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (item.cosmeticSlot === 'nickname' && item.cosmeticConfig) {
    const nick = normalizeNicknameConfig(item.cosmeticConfig);
    const name = previewName(viewer);
    return (
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-3',
          className
        )}
      >
        <span
          className={cn('text-xl font-black truncate max-w-full', nicknameEffectClass(nick))}
          style={nicknameEffectStyle(nick)}
          title={name}
        >
          {name}
        </span>
      </div>
    );
  }
  const imageSrc = resolveShopImageUrl(item.imageUrl);
  if (imageSrc) {
    return (
      <div className={cn('absolute inset-0 flex items-center justify-center p-4', className)}>
        <div className="relative h-full w-full">
          <Image
            src={imageSrc}
            alt={item.itemName}
            fill
            sizes="(max-width: 640px) 40vw, 160px"
            className="object-contain group-hover:scale-110 transition-transform duration-300"
            unoptimized={
              imageSrc.includes('placehold.co') ||
              imageSrc.endsWith('.svg') ||
              !/^https?:\/\//i.test(imageSrc)
            }
          />
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800/50 to-slate-900/60 backdrop-blur-sm',
        className
      )}
    >
      <span className="text-4xl font-black uppercase tracking-wider text-slate-500">
        {(item.itemCategory || '?').slice(0, 1)}
      </span>
    </div>
  );
}
