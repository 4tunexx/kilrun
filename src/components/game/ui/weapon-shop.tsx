'use client';

import React from 'react';
import { Sword, Crosshair, Zap, Shield } from 'lucide-react';

export interface WeaponPreset {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  accentClass: string;
  kind: 'hitscan' | 'melee';
  damage: number;
  range: number;
  cooldownMs: number;
  coneRadians: number;
}

export const WEAPON_PRESETS: WeaponPreset[] = [
  {
    id: 'pistol',
    label: 'Pistol',
    description: 'Balanced hitscan — medium damage, fast fire',
    icon: <Crosshair className="w-5 h-5" />,
    accentClass: 'border-sky-400/60 bg-sky-500/15 hover:bg-sky-500/25',
    kind: 'hitscan',
    damage: 25,
    range: 14,
    cooldownMs: 350,
    coneRadians: 0.18,
  },
  {
    id: 'sniper',
    label: 'Sniper',
    description: 'High damage, long range, slow fire',
    icon: <Crosshair className="w-5 h-5 text-amber-300" />,
    accentClass: 'border-amber-400/60 bg-amber-500/15 hover:bg-amber-500/25',
    kind: 'hitscan',
    damage: 80,
    range: 22,
    cooldownMs: 1200,
    coneRadians: 0.05,
  },
  {
    id: 'shotgun',
    label: 'Shotgun',
    description: 'High close-range damage, slow fire, wide spread',
    icon: <Zap className="w-5 h-5 text-orange-300" />,
    accentClass: 'border-orange-400/60 bg-orange-500/15 hover:bg-orange-500/25',
    kind: 'hitscan',
    damage: 60,
    range: 6,
    cooldownMs: 900,
    coneRadians: 0.45,
  },
  {
    id: 'smg',
    label: 'SMG',
    description: 'Low damage but very fast fire rate',
    icon: <Zap className="w-5 h-5 text-emerald-300" />,
    accentClass: 'border-emerald-400/60 bg-emerald-500/15 hover:bg-emerald-500/25',
    kind: 'hitscan',
    damage: 15,
    range: 10,
    cooldownMs: 150,
    coneRadians: 0.28,
  },
  {
    id: 'sword',
    label: 'Sword',
    description: 'Melee — high damage, very close range',
    icon: <Sword className="w-5 h-5 text-rose-300" />,
    accentClass: 'border-rose-400/60 bg-rose-500/15 hover:bg-rose-500/25',
    kind: 'melee',
    damage: 50,
    range: 2.4,
    cooldownMs: 500,
    coneRadians: 0.5,
  },
  {
    id: 'fists',
    label: 'Fists',
    description: 'Melee — light damage, fast swing',
    icon: <Shield className="w-5 h-5 text-purple-300" />,
    accentClass: 'border-purple-400/60 bg-purple-500/15 hover:bg-purple-500/25',
    kind: 'melee',
    damage: 20,
    range: 1.8,
    cooldownMs: 300,
    coneRadians: 0.6,
  },
];

interface WeaponShopProps {
  /** Seconds remaining in the buy phase. */
  buySecondsLeft: number;
  /** Currently equipped weapon kind. */
  currentWeaponKind?: string;
  onBuy: (preset: WeaponPreset) => void;
}

export const WeaponShop: React.FC<WeaponShopProps> = ({
  buySecondsLeft,
  currentWeaponKind,
  onBuy,
}) => {
  if (buySecondsLeft <= 0) return null;

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[135] w-full max-w-xl px-3 pointer-events-auto">
      <div className="rounded-2xl border border-white/20 bg-slate-950/85 backdrop-blur-md p-3 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-300">
            Buy Phase
          </p>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-[11px] font-bold text-white tabular-nums">
              {buySecondsLeft}s
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {WEAPON_PRESETS.map((preset) => {
            const isActive = currentWeaponKind === preset.kind;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onBuy(preset)}
                className={`flex flex-col items-start gap-1 rounded-xl border px-2.5 py-2 text-left transition-all active:scale-95 ${preset.accentClass}`}
              >
                <div className="flex items-center gap-1.5">
                  {preset.icon}
                  <span className="text-xs font-bold text-white">{preset.label}</span>
                  {isActive && (
                    <span className="ml-auto text-[9px] font-bold text-emerald-300 uppercase tracking-wide">
                      Equipped
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-white/55 leading-snug">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
