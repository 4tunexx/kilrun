'use client';

import { useRef, useState } from 'react';
import {
  Award,
  ChevronLeft,
  ChevronRight,
  Crown,
  Package,
  ThumbsUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  groupShowcaseByCategory,
  SHOWCASE_ROW_PAGE_SIZE,
  type ShowcaseAlign,
  type ShowcaseDisplayItem,
  type ShowcaseItemType,
} from '@/lib/showcase';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<ShowcaseItemType, LucideIcon> = {
  rank: Crown,
  badge: Award,
  achievement: Trophy,
  inventory: Package,
  reputation: ThumbsUp,
};

const TYPE_COLORS: Record<ShowcaseItemType, string> = {
  rank: 'text-yellow-400',
  badge: 'text-primary',
  achievement: 'text-yellow-400',
  inventory: 'text-cyan-400',
  reputation: 'text-emerald-400',
};

const ALIGN_CLASS: Record<ShowcaseAlign, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
};

/**
 * Showcase rows for mini hover card.
 * Each category is its own row (badges, then inventory, etc.), max 3 visible
 * per row with optional arrows when a category has more than 3 items.
 */
export function ShowcaseChips({
  items,
  compact = false,
  align = 'start',
}: {
  items: ShowcaseDisplayItem[];
  compact?: boolean;
  align?: ShowcaseAlign;
}) {
  const [preview, setPreview] = useState<ShowcaseDisplayItem | null>(null);
  const groups = groupShowcaseByCategory(items);

  if (groups.length === 0) return null;

  return (
    <>
      <div className="space-y-1.5">
        {groups.map((group) => (
          <CategoryRow
            key={group.type}
            items={group.items}
            compact={compact}
            align={align}
            onPreview={setPreview}
          />
        ))}
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">{preview.title}</DialogTitle>
                <DialogDescription className="capitalize text-slate-400">
                  {preview.itemType}
                  {preview.rarity ? ` · ${preview.rarity}` : ''}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3 py-4">
                {preview.iconImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.iconImageUrl}
                    alt=""
                    className="h-28 w-28 rounded-2xl object-cover border border-slate-600 shadow-xl"
                  />
                ) : (
                  (() => {
                    const Icon = TYPE_ICONS[preview.itemType] ?? Award;
                    return (
                      <div className="h-28 w-28 rounded-2xl bg-slate-800 border border-slate-600 flex items-center justify-center">
                        <Icon className={cn('h-14 w-14', TYPE_COLORS[preview.itemType])} />
                      </div>
                    );
                  })()
                )}
                {preview.value != null && (
                  <p className="text-2xl font-black text-emerald-400">+{preview.value}</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryRow({
  items,
  compact,
  align,
  onPreview,
}: {
  items: ShowcaseDisplayItem[];
  compact: boolean;
  align: ShowcaseAlign;
  onPreview: (item: ShowcaseDisplayItem) => void;
}) {
  const [page, setPage] = useState(0);
  const touchX = useRef<number | null>(null);
  const pageCount = Math.max(1, Math.ceil(items.length / SHOWCASE_ROW_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = items.slice(
    safePage * SHOWCASE_ROW_PAGE_SIZE,
    safePage * SHOWCASE_ROW_PAGE_SIZE + SHOWCASE_ROW_PAGE_SIZE
  );

  const go = (dir: -1 | 1) => {
    setPage((p) => {
      const next = p + dir;
      if (next < 0) return pageCount - 1;
      if (next >= pageCount) return 0;
      return next;
    });
  };

  return (
    <div
      className="relative"
      onTouchStart={(e) => {
        touchX.current = e.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchX.current == null || pageCount <= 1) return;
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) < 40) return;
        go(dx < 0 ? 1 : -1);
      }}
    >
      <div className={cn('flex items-center gap-1', ALIGN_CLASS[align])}>
        {pageCount > 1 && (
          <button
            type="button"
            aria-label="Previous showcase"
            className="shrink-0 rounded-md p-0.5 text-slate-400 hover:text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        <div className={cn('flex flex-wrap gap-1.5 min-w-0', ALIGN_CLASS[align])}>
          {slice.map((item, i) => {
            const Icon = TYPE_ICONS[item.itemType] ?? Award;
            return (
              <button
                key={`${item.itemType}-${item.title}-${i}`}
                type="button"
                title={item.title}
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview(item);
                }}
                className={cn(
                  'group/chip flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-800/70 font-normal text-slate-200 transition',
                  'hover:scale-105 hover:border-cyan-400/50 hover:bg-slate-800',
                  compact
                    ? 'text-[10px] px-1.5 py-1 max-w-[5.5rem]'
                    : 'text-xs px-2 py-1.5 max-w-[7.5rem]'
                )}
              >
                {item.iconImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.iconImageUrl}
                    alt=""
                    className={cn(
                      'rounded object-cover shrink-0 transition group-hover/chip:scale-125',
                      compact ? 'h-4 w-4' : 'h-5 w-5'
                    )}
                  />
                ) : (
                  <Icon
                    className={cn(
                      'shrink-0 transition group-hover/chip:scale-125',
                      compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
                      TYPE_COLORS[item.itemType]
                    )}
                  />
                )}
                <span className="truncate">{item.title}</span>
              </button>
            );
          })}
        </div>

        {pageCount > 1 && (
          <button
            type="button"
            aria-label="Next showcase"
            className="shrink-0 rounded-md p-0.5 text-slate-400 hover:text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
