'use client';

import { useEffect, useState } from 'react';
import type { KillFeedEvent } from '@shared/kill-feed';
import { catalogWeaponLabel } from '@/lib/weapon-catalog';

const LINE_MS = 4000;
const MAX_LINES = 6;

type FeedLine = KillFeedEvent & { id: number };

/**
 * Top-right in-match kill ticker. Newest at the bottom, fade after ~4s.
 */
export function KillFeed({
  event,
}: {
  event: (KillFeedEvent & { token: number }) | null;
}) {
  const [lines, setLines] = useState<FeedLine[]>([]);

  useEffect(() => {
    if (!event || event.token <= 0) return;
    const id = event.token;
    setLines((prev) => [...prev, { ...event, id }].slice(-MAX_LINES));
    const t = window.setTimeout(() => {
      setLines((prev) => prev.filter((row) => row.id !== id));
    }, LINE_MS);
    return () => window.clearTimeout(t);
  }, [event]);

  if (lines.length === 0) return null;

  return (
    <div className="absolute top-16 right-4 z-[118] pointer-events-none flex flex-col items-end gap-1">
      {lines.map((row) => (
        <KillFeedLine key={row.id} row={row} />
      ))}
    </div>
  );
}

function KillFeedLine({ row }: { row: FeedLine }) {
  const weapon = catalogWeaponLabel(row.weaponId) ?? '';
  const killer = row.killer || (row.kind === 'world' ? 'World' : row.kind === 'trap' ? 'Trap' : '');
  return (
    <div className="px-2.5 py-1 rounded-sm bg-black/55 border border-white/10 text-[11px] font-bold tracking-wide text-white/85 shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
      {killer ? <span className="text-sky-200">{killer}</span> : null}
      {weapon ? <span className="mx-1.5 text-white/35 uppercase">{weapon}</span> : killer ? <span className="mx-1.5 text-white/30">›</span> : null}
      <span className={row.kind === 'monster' ? 'text-amber-200' : 'text-rose-200'}>{row.victim}</span>
    </div>
  );
}
