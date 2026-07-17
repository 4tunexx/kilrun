'use client';

import { Award, Crown, Package, Trophy, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ShowcaseDisplayItem, ShowcaseItemType } from '@/lib/showcase';

const TYPE_ICONS: Record<ShowcaseItemType, LucideIcon> = {
  rank: Crown,
  badge: Award,
  achievement: Trophy,
  inventory: Package,
};

const TYPE_COLORS: Record<ShowcaseItemType, string> = {
  rank: 'text-yellow-400',
  badge: 'text-primary',
  achievement: 'text-yellow-400',
  inventory: 'text-cyan-400',
};

/**
 * Compact showcase chips shown on the mini hover card and public profile.
 * Text + a small icon today; swaps in the item's own image the moment one
 * is uploaded (achievements/badges/cosmetics all support `iconImageUrl`).
 */
export function ShowcaseChips({
  items,
  compact = false,
}: {
  items: ShowcaseDisplayItem[];
  compact?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => {
        const Icon = TYPE_ICONS[item.itemType] ?? Award;
        return (
          <Badge
            key={i}
            variant="outline"
            className={`flex items-center gap-1 border-slate-700 bg-slate-800/60 font-normal text-slate-200 ${
              compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
            }`}
            title={item.title}
          >
            {item.iconImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.iconImageUrl}
                alt=""
                className={compact ? 'h-3 w-3 rounded object-cover' : 'h-3.5 w-3.5 rounded object-cover'}
              />
            ) : (
              <Icon className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} ${TYPE_COLORS[item.itemType]}`} />
            )}
            <span className="max-w-[110px] truncate">{item.title}</span>
          </Badge>
        );
      })}
    </div>
  );
}
