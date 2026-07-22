'use client';

import { resolveMarkLogo } from '@/lib/branding';

const PANEL =
  'bg-slate-900/60 backdrop-blur-md border-t border-slate-700/30';

export function HubFooter({
  markLogoUrl,
  onNavigate,
}: {
  markLogoUrl?: string;
  onNavigate?: (page: string) => void;
}) {
  const mark = resolveMarkLogo(markLogoUrl);

  return (
    <footer className={`${PANEL} shrink-0`}>
      <div className="px-4 sm:px-8 py-5 flex flex-wrap justify-between items-center gap-3 text-slate-400 text-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mark}
            alt=""
            className="h-7 w-7 object-contain shrink-0"
          />
          <p className="truncate">&copy; {new Date().getFullYear()} Kilrun. All Rights Reserved.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <span className="text-slate-500">Deathrun hub · Community · Store</span>
          {onNavigate ? (
            <button
              type="button"
              onClick={() => onNavigate('support')}
              className="hover:text-primary transition"
            >
              Support
            </button>
          ) : (
            <span className="text-slate-500">Support</span>
          )}
        </div>
      </div>
    </footer>
  );
}
