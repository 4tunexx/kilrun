'use client';

import { findRankTierDef, type RankTierDef } from '@/lib/rank-config';
import { cn } from '@/lib/utils';

/** Small rank badge — image when set, else colored initials. */
export function RankBadge({
  rank,
  imageUrl,
  color,
  tiers,
  className,
  size = 20,
}: {
  rank?: string | null;
  imageUrl?: string | null;
  color?: string | null;
  tiers?: RankTierDef[];
  className?: string;
  size?: number;
}) {
  if (!rank) return null;
  const tier = tiers ? findRankTierDef(rank, tiers) : undefined;
  const url = imageUrl || tier?.imageUrl;
  const tint = color || tier?.color || '#facc15';

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={rank}
        title={rank}
        width={size}
        height={size}
        className={cn('inline-block rounded-sm object-contain shrink-0', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      title={rank}
      className={cn(
        'inline-flex items-center justify-center rounded-sm border border-white/10 text-[9px] font-black uppercase shrink-0',
        className
      )}
      style={{
        width: size,
        height: size,
        color: tint,
        background: `${tint}22`,
      }}
    >
      {rank.slice(0, 2)}
    </span>
  );
}
