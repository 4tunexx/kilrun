'use client';

import { useEffect, useState } from 'react';
import type { NetPlayerState } from '../net/types';

const ROLE_LABEL: Record<string, string> = {
  trapper: 'Trapper',
  runner: 'Runner',
  survivor: 'Survivor',
  team_a: 'Team A',
  team_b: 'Team B',
};

const ROLE_ACCENT: Record<string, string> = {
  trapper: 'text-rose-300',
  runner: 'text-emerald-300',
  survivor: 'text-emerald-300',
  team_a: 'text-sky-300',
  team_b: 'text-orange-300',
};

/**
 * Held-Tab scoreboard — classic FPS pattern: hold to show, release to hide.
 * Glass/chrome panel treatment shared with GameMenu.
 */
export function Scoreboard({
  open,
  playersRef,
  localSessionIdRef,
}: {
  open: boolean;
  playersRef: React.MutableRefObject<Map<string, NetPlayerState>>;
  localSessionIdRef: React.MutableRefObject<string | null>;
}) {
  const [rows, setRows] = useState<NetPlayerState[]>([]);
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const tick = () => {
      const list = Array.from(playersRef.current.values());
      list.sort((a, b) => (b.score ?? b.kills ?? 0) - (a.score ?? a.kills ?? 0));
      setRows(list);
      setLocalSessionId(localSessionIdRef.current);
    };
    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [open, playersRef, localSessionIdRef]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[260] flex items-start justify-center pt-20 pointer-events-none">
      <div className="w-full max-w-2xl mx-4 rounded-2xl border border-white/15 bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl shadow-2xl overflow-hidden pointer-events-auto">
        <div className="px-5 py-3 border-b border-white/10 bg-white/[0.03]">
          <p className="text-sm font-black text-white tracking-wide">Scoreboard</p>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-wider text-white/35">
                <th className="text-left px-5 py-2">Player</th>
                <th className="text-left px-3 py-2">Role</th>
                <th className="text-right px-3 py-2">Kills</th>
                <th className="text-right px-3 py-2">Deaths</th>
                <th className="text-right px-5 py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.sessionId}
                  className={`border-t border-white/5 ${
                    p.sessionId === localSessionId ? 'bg-sky-400/10' : ''
                  } ${!p.isAlive ? 'opacity-40' : ''}`}
                >
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2">
                      {p.avatarUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.avatarUrl}
                          alt=""
                          className="w-6 h-6 rounded-full border border-white/10"
                        />
                      )}
                      <span className="font-bold text-white truncate max-w-[160px]">
                        {p.username}
                        {p.sessionId === localSessionId && (
                          <span className="text-sky-300 font-black"> (you)</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className={`px-3 py-2 font-bold ${ROLE_ACCENT[p.role] ?? 'text-white/50'}`}>
                    {ROLE_LABEL[p.role] ?? p.role}
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-white/80">{p.kills ?? 0}</td>
                  <td className="px-3 py-2 text-right font-bold text-white/50">{p.deaths ?? 0}</td>
                  <td className="px-5 py-2 text-right font-black text-amber-300">
                    {p.score ?? 0}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-white/30 text-xs">
                    No players yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2 border-t border-white/10 bg-white/[0.02] text-center">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-wide">
            Hold Tab
          </p>
        </div>
      </div>
    </div>
  );
}
