'use client';

import { DEFAULT_RANK_TIERS, findRankTierDef, type RankTierDef } from '@/lib/rank-config';
import { cn } from '@/lib/utils';

/** Small rank badge — image when set, else colored initials from admin tier color. */
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
  const pool = tiers?.length ? tiers : DEFAULT_RANK_TIERS;
  const tier = findRankTierDef(rank, pool);
  const url = imageUrl || tier?.imageUrl;
  const tint = color || tier?.color || '#94a3b8';

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
        borderColor: `${tint}55`,
      }}
    >
      {rank.slice(0, 2)}
    </span>
  );
}

/** Badge + rank name tinted from admin panel color (never hardcoded gold Gem). */
export function RankLabel({
  rank,
  imageUrl,
  color,
  tiers,
  className,
  size = 14,
  textClassName,
}: {
  rank?: string | null;
  imageUrl?: string | null;
  color?: string | null;
  tiers?: RankTierDef[];
  className?: string;
  size?: number;
  textClassName?: string;
}) {
  if (!rank) return null;
  const pool = tiers?.length ? tiers : DEFAULT_RANK_TIERS;
  const tier = findRankTierDef(rank, pool);
  const tint = color || tier?.color || '#94a3b8';

  return (
    <span className={cn('inline-flex items-center gap-1 shrink-0', className)} title={rank}>
      <RankBadge rank={rank} imageUrl={imageUrl ?? tier?.imageUrl} color={tint} size={size} />
      <span className={cn('font-semibold', textClassName)} style={{ color: tint }}>
        {rank}
      </span>
    </span>
  );
}
