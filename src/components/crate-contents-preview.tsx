'use client';

import { Coins } from 'lucide-react';
import type { CaseItemPublic } from '@/lib/case-actions';
import { rarityStyle } from '@/components/crate-unbox-modal';
import { CaseItemThumb } from '@/components/case-item-thumb';

/** Contents list shown in a hover/tap popover on a crate icon — item name, rarity, and drop odds. */
export function CrateContentsPreview({
  name,
  items,
}: {
  name: string;
  items: CaseItemPublic[];
}) {
  const sorted = [...items].sort((a, b) => a.chancePercent - b.chancePercent);
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-slate-100">{name} — possible drops</p>
      <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
        {sorted.map((item) => {
          const style = rarityStyle(item.rarity);
          return (
            <div
              key={item.id}
              className={`flex items-center gap-2 rounded-md border ${style.ring} bg-slate-950/50 px-2 py-1.5`}
            >
              {item.rewardType === 'currency' ? (
                <Coins className={`h-4 w-4 shrink-0 ${style.text}`} />
              ) : (
                <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded">
                  <CaseItemThumb item={item} className="h-6 w-6" iconClassName={`h-4 w-4 ${style.text}`} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-slate-200 truncate">
                  {item.displayName}
                </p>
                <p className={`text-[9px] uppercase tracking-wide ${style.text}`}>{item.rarity}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

