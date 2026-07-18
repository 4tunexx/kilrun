'use client';

import { resolveMarkLogo } from '@/lib/branding';

const PANEL =
  'bg-slate-900/60 backdrop-blur-md border-t border-slate-700/30';

export function HubFooter({ markLogoUrl }: { markLogoUrl?: string }) {
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
          <a href="#support" className="hover:text-primary transition">
            Support
          </a>
          <a href="#terms" className="hover:text-primary transition">
            Terms
          </a>
          <a href="#privacy" className="hover:text-primary transition">
            Privacy
          </a>
        </div>
      </div>
    </footer>
  );
}
