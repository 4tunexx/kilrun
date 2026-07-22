'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { NetPlayerState, NetRoomState } from '../net/types';
import { getLevelFromXp, getLevelProgress } from '@/lib/progression';
import { RunnerHud } from '../modes/deathrun/runner-hud';
import type { WeaponCombatKind } from '@/lib/weapons';

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function weaponLabel(kind?: WeaponCombatKind | null): string {
  if (kind === 'hitscan') return 'HITSCAN';
  if (kind === 'cosmetic') return 'UNARMED';
  if (kind === 'melee') return 'MELEE';
  return 'MELEE';
}

function useSmooth(target: number, speed = 8) {
  const [v, setV] = useState(target);
  useEffect(() => {
    let raf = 0;
    let cur = v;
    const tick = () => {
      cur += (target - cur) * Math.min(1, speed * 0.016);
      if (Math.abs(target - cur) < 0.05) cur = target;
      setV(cur);
      if (cur !== target) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, speed]);
  return v;
}

function DockedAvatar({
  avatarUrl,
  username,
  progress,
  level,
}: {
  avatarUrl?: string;
  username: string;
  progress: number;
  level: number;
}) {
  const size = 92;
  const stroke = 7;
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const smooth = useSmooth(Math.max(0, Math.min(1, progress)), 4);
  const offset = c * (1 - smooth);

  return (
    <div
      className="absolute z-20"
      style={{ left: 6, top: 10, width: size, height: size, transform: 'rotate(-7deg)' }}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90 overflow-visible">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(28,32,42,0.95)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(230,45,45,0.98)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.35s ease-out' }}
        />
        {/* Leading charge tip */}
        <circle
          cx={size / 2 + r * Math.cos(2 * Math.PI * smooth - Math.PI / 2)}
          cy={size / 2 + r * Math.sin(2 * Math.PI * smooth - Math.PI / 2)}
          r={3.2}
          fill="#fff"
          className="animate-pulse"
        />
      </svg>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{
          inset: 12,
          background:
            'radial-gradient(circle at 40% 35%, #f5e6a8 0%, #c9a227 35%, #1a1a1a 70%, #0a0a0a 100%)',
          boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.45)',
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
        ) : (
          <svg viewBox="0 0 64 64" className="w-full h-full p-2">
            <ellipse cx="32" cy="32" rx="22" ry="14" fill="#f0d45a" stroke="#1a1a1a" strokeWidth="3" />
            <circle cx="32" cy="32" r="8" fill="#111" />
            <circle cx="35" cy="29" r="2.5" fill="#f5e6a8" />
            <path d="M18 24 Q32 10 46 24" fill="none" stroke="#1a1a1a" strokeWidth="3" />
          </svg>
        )}
      </div>
      <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-black border-2 border-red-500 text-[12px] font-black text-red-400 flex items-center justify-center tabular-nums z-30">
        {level}
      </span>
    </div>
  );
}

function ChargeBar({
  left,
  top,
  width,
  height,
  value,
  max = 100,
  fill,
  zIndex = 10,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  value: number;
  max?: number;
  fill: string;
  zIndex?: number;
}) {
  const pct = useSmooth(Math.max(0, Math.min(100, (value / max) * 100)), 10);
  return (
    <div
      className="absolute overflow-hidden"
      style={{
        left,
        top,
        width,
        height,
        transform: 'skewX(-14deg)',
        background: 'rgba(32,44,60,0.55)',
        zIndex,
      }}
    >
      <div
        className="h-full relative"
        style={{
          width: `${pct}%`,
          background: fill,
          transition: 'width 0.12s linear',
        }}
      >
        {/* Shine sweep */}
        <div
          className="absolute inset-y-0 w-8 opacity-40"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)',
            animation: 'hudShine 2.4s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  );
}

/**
 * Godot KillRun HUD — bars tucked behind / into the avatar ring.
 */
export const HUD: React.FC<{
  player: NetPlayerState;
  room: NetRoomState;
  xpProgress?: number;
  runnersLeft?: number;
  /** Loadout weapon combat kind (from equipped skins). */
  weaponKind?: WeaponCombatKind | null;
}> = ({ player, room, xpProgress = 0, runnersLeft = 1, weaponKind = null }) => {
  const isTrapper = player.role === 'trapper';
  const level = getLevelFromXp(xpProgress);
  const levelProg = useMemo(() => getLevelProgress(xpProgress), [xpProgress]);
  const hp = Math.round(player.health);
  const energy = Math.round(player.energy ?? 100);

  const hudFont: React.CSSProperties = {
    fontFamily: 'var(--font-space-grotesk), "Oswald", Impact, sans-serif',
    letterSpacing: '0.06em',
    textShadow: '0 1px 0 rgba(0,0,0,0.85), 0 0 12px rgba(0,0,0,0.35)',
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-[110] overflow-hidden" style={hudFont}>
      <style>{`
        @keyframes hudShine {
          0% { transform: translateX(-120%); }
          60% { transform: translateX(220%); }
          100% { transform: translateX(220%); }
        }
      `}</style>

      <div className="absolute top-0 left-0 right-0 h-[92px] flex items-start justify-center pt-2">
        <div className="mt-2.5 w-[110px] h-10 flex items-center justify-center">
          <span className="text-white text-[18px] font-black uppercase tracking-wide">
            {isTrapper ? 'TRAPPER' : 'RUNNER'}
          </span>
        </div>
        <div className="w-[140px] h-[72px] flex flex-col items-center justify-center">
          <span className="text-white text-[10px] font-bold tracking-[0.22em] uppercase leading-none opacity-95">
            TIME
          </span>
          <span className="text-white text-[34px] font-black tabular-nums leading-none mt-0.5">
            {formatClock(room.matchTimeRemainingMs)}
          </span>
        </div>
        <div className="mt-2.5 w-[150px] h-10 flex items-center justify-center">
          <span className="text-white text-[16px] font-black tracking-wide">
            {isTrapper
              ? 'HUNT'
              : player.role === 'survivor'
                ? `SURVIVORS: ${runnersLeft}`
                : player.role === 'team_a' || player.role === 'team_b'
                  ? `ALIVE: ${runnersLeft}`
                  : `RUNNERS LEFT: ${runnersLeft}`}
          </span>
        </div>
      </div>

      <div className="absolute right-10 top-[42%] -translate-y-1/2 text-right">
        <p className="text-[11px] font-bold tracking-[0.25em] text-white/70">LEVEL</p>
        <p className="text-[28px] font-black text-white tabular-nums leading-none">{level}</p>
        <p className="text-[10px] font-bold text-white/55 tabular-nums mt-0.5">
          {Math.round(levelProg.percent)}% to next
        </p>
      </div>

      {/* Bottom-left cluster: bars tuck UNDER the ring (z-10 under z-20 avatar) */}
      <div
        className="absolute left-8 bottom-8 w-[360px] h-[140px]"
        style={{ transform: 'rotate(-6deg)', transformOrigin: 'left bottom' }}
      >
        <DockedAvatar
          avatarUrl={player.avatarUrl}
          username={player.username}
          progress={levelProg.percent / 100}
          level={level}
        />

        {/* Pulled left so they slide into/behind the ring */}
        <ChargeBar left={48} top={46} width={168} height={18} value={hp} fill="rgba(230,241,255,0.96)" />
        <span
          className="absolute text-[18px] font-black tabular-nums z-30"
          style={{ left: 224, top: 38, color: 'rgba(230,241,255,1)' }}
        >
          {String(hp).padStart(3, '0')}
        </span>

        <ChargeBar left={54} top={72} width={156} height={18} value={energy} fill="rgba(99,221,255,0.96)" />
        <span
          className="absolute text-[18px] font-black tabular-nums z-30"
          style={{ left: 218, top: 64, color: 'rgba(99,221,255,1)' }}
        >
          {String(energy).padStart(3, '0')}
        </span>
      </div>

      {!isTrapper && (
        <div className="absolute top-[88px] left-1/2 -translate-x-1/2 sm:top-24">
          <RunnerHud player={player} room={room} />
        </div>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center px-3 hidden sm:block">
        <p className="text-[11px] font-bold tracking-widest text-white/55 uppercase">
          • Space Jump // Shift Sprint // RMB Aim // Mouse Look // Esc Menu
        </p>
      </div>

      <div
        className="absolute right-8 bottom-8 w-[220px] text-right"
        style={{ transform: 'rotate(6deg)', transformOrigin: 'right bottom' }}
      >
        <p className="text-[8px] font-bold tracking-[0.2em] uppercase" style={{ color: 'rgba(209,230,250,0.78)' }}>
          WEAPON
        </p>
        <p className="text-[18px] font-black text-white leading-tight">{weaponLabel(weaponKind)}</p>
        <p className="text-[9px] font-black tracking-wide" style={{ color: 'rgba(209,230,250,0.9)' }}>
          READY
        </p>
      </div>
    </div>
  );
};
