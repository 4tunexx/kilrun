'use client';

import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';

import { cn } from '@/lib/utils';

/**
 * Shared by missions, XP LevelBar, home missions, profiles, etc.
 * Solid fill + soft charging comet only on the empty track.
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => {
  const pct = Math.min(100, Math.max(0, value || 0));
  const empty = 100 - pct;

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
                background:
                  'linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.1) 30%, hsl(var(--primary) / 0.32) 65%, hsl(var(--primary) / 0.14) 85%, transparent 100%)',
              }}
            />
          </span>
        </span>
      )}

      <ProgressPrimitive.Indicator
        className="absolute left-0 top-0 z-[2] h-full bg-primary transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, transform: 'none' }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
