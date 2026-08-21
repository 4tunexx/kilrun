'use client';

import type { ReactElement } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** Hover card for toolbar / property headers. Keep native `title` on the child as a fallback. */
export function EditorTip({
  content,
  shortcut,
  children,
  side = 'top',
}: {
  content: string;
  shortcut?: string;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        className="max-w-xs border-white/15 bg-[#10151e] text-slate-100 px-2.5 py-1.5"
      >
        <p className="text-xs leading-snug">{content}</p>
        {shortcut ? (
          <p className="text-[10px] text-cyan-300/80 mt-0.5 font-mono tracking-wide">{shortcut}</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
