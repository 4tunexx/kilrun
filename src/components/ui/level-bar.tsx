'use client';

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/** Straight (non-circular) level/XP progress bar used in hover cards and profiles. */
export function LevelBar({
  level,
  xpIntoLevel,
  xpForNextLevel,
  percent,
  className,
  compact = false,
}: {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  percent: number;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-white shrink-0">Level {level}</span>
        {!compact && (
          <span className="text-slate-400 truncate">
            {xpIntoLevel.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP
          </span>
        )}
      </div>
      <Progress value={percent} className="h-2 bg-slate-800" />
    </div>
  );
}
