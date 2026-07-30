'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, UserX, VolumeX, Ban } from 'lucide-react';
import type { NetPlayerState } from '../net/types';

const ROLE_LABEL: Record<string, string> = {
  trapper: 'Trapper',
  runner: 'Runner',
  survivor: 'Survivor',
  team_a: 'Team A',
  team_b: 'Team B',
};

/**
 * Press-X in-game admin panel — view connected players + kick/mute/ban.
 * Admin-only (gated by the isAdmin prop the caller already checks before
 * rendering); the server independently re-checks adminSessions on every
 * action regardless, so this is a convenience gate, not the real boundary.
 *
 * Deliberately does NOT expose match-score editing — kick/mute/ban cover
 * the cheater-response case without risking match-integrity bugs from
 * live score edits (see the phased build-order discussion this shipped
 * under).
 */
export function AdminInGamePanel({
  open,
  onClose,
  playersRef,
  localSessionIdRef,
  onKick,
  onMute,
  onBan,
}: {
  open: boolean;
  onClose: () => void;
  playersRef: React.MutableRefObject<Map<string, NetPlayerState>>;
  localSessionIdRef: React.MutableRefObject<string | null>;
  onKick: (sessionId: string) => void;
  onMute: (sessionId: string, minutes: number) => void;
  onBan: (sessionId: string) => void;
}) {
  const [rows, setRows] = useState<NetPlayerState[]>([]);
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const tick = () => {
      setRows(Array.from(playersRef.current.values()));
      setLocalSessionId(localSessionIdRef.current);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [open, playersRef, localSessionIdRef]);

  useEffect(() => {
    if (!open) setConfirmBan(null);
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[270] flex items-start justify-center pt-16 pointer-events-none">
      <div className="w-full max-w-2xl mx-4 rounded-2xl border border-rose-500/30 bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl shadow-2xl overflow-hidden pointer-events-auto">
        <div className="px-5 py-3 border-b border-white/10 bg-rose-500/[0.08] flex items-center justify-between">
          <p className="text-sm font-black text-white tracking-wide flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" /> Admin Panel
          </p>
          <button
            onClick={onClose}
            className="text-xs text-white/50 hover:text-white px-2 py-1 rounded"
          >
            Close (X)
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/50 text-xs border-b border-white/10">
                <th className="px-4 py-2 font-medium">Player</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const isSelf = p.sessionId === localSessionId;
                return (
                  <tr key={p.sessionId} className="border-b border-white/5">
                    <td className="px-4 py-2 text-white font-medium truncate max-w-[160px]">
                      {p.username}
                      {isSelf && <span className="text-white/40 ml-1">(you)</span>}
                    </td>
                    <td className="px-4 py-2 text-white/70">
                      {ROLE_LABEL[p.role] ?? p.role}
                    </td>
                    <td className="px-4 py-2">
                      {isSelf ? (
                        <span className="text-white/30 text-xs block text-right">—</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            title="Mute (5 min)"
                            onClick={() => onMute(p.sessionId, 5)}
                            className="p-1.5 rounded-md bg-white/5 hover:bg-amber-500/20 text-amber-300"
                          >
                            <VolumeX className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title="Kick"
                            onClick={() => onKick(p.sessionId)}
                            className="p-1.5 rounded-md bg-white/5 hover:bg-orange-500/20 text-orange-300"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                          {confirmBan === p.sessionId ? (
                            <button
                              title="Confirm ban"
                              onClick={() => {
                                onBan(p.sessionId);
                                setConfirmBan(null);
                              }}
                              className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                            >
                              Confirm ban?
                            </button>
                          ) : (
                            <button
                              title="Ban"
                              onClick={() => setConfirmBan(p.sessionId)}
                              className="p-1.5 rounded-md bg-white/5 hover:bg-rose-500/20 text-rose-300"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-white/40 text-sm">
                    No players connected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
