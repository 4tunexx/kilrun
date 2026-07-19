'use client';

import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';

import { cn } from '@/lib/utils';

type ProgressTone = 'primary' | 'green';

/**
 * Shared by missions, XP LevelBar, home missions, profiles, etc.
 * Solid fill + soft charging comet only on the empty track.
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    tone?: ProgressTone;
  }
>(({ className, value, tone = 'primary', ...props }, ref) => {
  const pct = Math.min(100, Math.max(0, value || 0));
  const empty = 100 - pct;
  const isGreen = tone === 'green';

  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={value}
      className={cn(
        'relative h-4 w-full overflow-hidden rounded-full bg-slate-800',
        className
      )}
      {...props}
    >
      {empty > 0.5 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 z-[1] overflow-hidden"
          style={{ left: `${pct}%`, width: `${empty}%` }}
        >
          <span className="absolute inset-y-0 w-[55%] animate-xp-bar-charge">
            <span
              className="block h-full w-full"
              style={{
                background: isGreen
                  ? 'linear-gradient(90deg, transparent 0%, rgba(34,197,94,0.12) 30%, rgba(34,197,94,0.4) 65%, rgba(34,197,94,0.16) 85%, transparent 100%)'
                  : 'linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.1) 30%, hsl(var(--primary) / 0.32) 65%, hsl(var(--primary) / 0.14) 85%, transparent 100%)',
              }}
            />
          </span>
        </span>
      )}

      <ProgressPrimitive.Indicator
        className={cn(
          'absolute left-0 top-0 z-[2] h-full transition-[width] duration-500 ease-out',
          isGreen
            ? 'bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-400'
            : 'bg-primary'
        )}
        style={{ width: `${pct}%`, transform: 'none' }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
