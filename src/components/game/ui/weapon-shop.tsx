'use client';

import React from 'react';
import { Sword, Crosshair, Zap, Shield, ShoppingCart, Coins } from 'lucide-react';
import { SHOP_PRESET_TO_CATALOG, catalogWeaponUrl } from '@/lib/weapon-catalog';
import type { MapShopItem, MapShopPowerUp, MapShopSkin } from '@/components/game/editor/map-document';

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
  shopPrice?: number;
  modelUrl?: string;
  textureUrl?: string;
  fireMode?: 'auto' | 'semi' | 'bolt';
  pellets?: number;
  adsZoomFov?: number;
  adsConeScale?: number;
  hipfireConeScale?: number;
  magSize?: number;
  reserveAmmo?: number;
  reloadMs?: number;
  unlockMetric?: string;
  unlockAmount?: number;
  /** True when player has not met unlockMetric yet. */
  locked?: boolean;
  unlockHint?: string;
}

export interface PowerUpPreset {
  id: string;
  label: string;
  description: string;
  shopPrice: number;
  effect: string;
}

export interface WeaponSkinPreset {
  id: string;
  label: string;
  description: string;
  shopPrice: number;
  textureUrl: string;
}

function shopModel(id: string): string | undefined {
  const cat = SHOP_PRESET_TO_CATALOG[id];
  return cat ? catalogWeaponUrl(cat) ?? undefined : undefined;
}

function iconFor(item: Pick<WeaponPreset, 'id' | 'kind'>) {
  if (item.kind === 'melee') {
    if (/knife|fist/i.test(item.id)) return <Shield className="w-5 h-5 text-purple-300" />;
    return <Sword className="w-5 h-5 text-rose-300" />;
  }
  if (/sniper/i.test(item.id)) return <Crosshair className="w-5 h-5 text-amber-300" />;
  if (/shot/i.test(item.id)) return <Zap className="w-5 h-5 text-orange-300" />;
  if (/smg|rifle/i.test(item.id)) return <Zap className="w-5 h-5 text-emerald-300" />;
  return <Crosshair className="w-5 h-5" />;
}

function accentFor(item: Pick<WeaponPreset, 'id' | 'kind'>) {
  if (item.kind === 'melee') {
    if (/knife|fist/i.test(item.id)) return 'border-purple-400/60 bg-purple-500/15 hover:bg-purple-500/25';
    return 'border-rose-400/60 bg-rose-500/15 hover:bg-rose-500/25';
  }
  if (/sniper/i.test(item.id)) return 'border-amber-400/60 bg-amber-500/15 hover:bg-amber-500/25';
  if (/shot/i.test(item.id)) return 'border-orange-400/60 bg-orange-500/15 hover:bg-orange-500/25';
  if (/smg|rifle/i.test(item.id)) return 'border-emerald-400/60 bg-emerald-500/15 hover:bg-emerald-500/25';
  return 'border-sky-400/60 bg-sky-500/15 hover:bg-sky-500/25';
}

/** Legacy hardcoded presets (fallback when map has no shopSettings). */
export const WEAPON_PRESETS: WeaponPreset[] = [
  {
    id: 'pistol',
    label: 'Pistol',
    description: 'Balanced hitscan',
    icon: <Crosshair className="w-5 h-5" />,
    accentClass: 'border-sky-400/60 bg-sky-500/15 hover:bg-sky-500/25',
    kind: 'hitscan',
    damage: 25,
    range: 14,
    cooldownMs: 350,
    coneRadians: 0.18,
    shopPrice: 0,
    modelUrl: shopModel('pistol'),
  },
  {
    id: 'sniper',
    label: 'Sniper',
    description: 'High damage, long range',
    icon: <Crosshair className="w-5 h-5 text-amber-300" />,
    accentClass: 'border-amber-400/60 bg-amber-500/15 hover:bg-amber-500/25',
    kind: 'hitscan',
    damage: 80,
    range: 22,
    cooldownMs: 1200,
    coneRadians: 0.05,
    shopPrice: 350,
    modelUrl: shopModel('sniper'),
  },
  {
    id: 'shotgun',
    label: 'Shotgun',
    description: 'Close-range blast',
    icon: <Zap className="w-5 h-5 text-orange-300" />,
    accentClass: 'border-orange-400/60 bg-orange-500/15 hover:bg-orange-500/25',
    kind: 'hitscan',
    damage: 60,
    range: 6,
    cooldownMs: 900,
    coneRadians: 0.45,
    shopPrice: 250,
    modelUrl: shopModel('shotgun'),
  },
  {
    id: 'smg',
    label: 'SMG',
    description: 'Fast fire',
    icon: <Zap className="w-5 h-5 text-emerald-300" />,
    accentClass: 'border-emerald-400/60 bg-emerald-500/15 hover:bg-emerald-500/25',
    kind: 'hitscan',
    damage: 15,
    range: 10,
    cooldownMs: 150,
    coneRadians: 0.28,
    shopPrice: 150,
    modelUrl: shopModel('smg'),
  },
  {
    id: 'sword',
    label: 'Axe',
    description: 'Heavy melee',
    icon: <Sword className="w-5 h-5 text-rose-300" />,
    accentClass: 'border-rose-400/60 bg-rose-500/15 hover:bg-rose-500/25',
    kind: 'melee',
    damage: 50,
    range: 2.4,
    cooldownMs: 500,
    coneRadians: 0.5,
    shopPrice: 0,
    modelUrl: shopModel('sword'),
  },
  {
    id: 'fists',
    label: 'Knife',
    description: 'Fast melee',
    icon: <Shield className="w-5 h-5 text-purple-300" />,
    accentClass: 'border-purple-400/60 bg-purple-500/15 hover:bg-purple-500/25',
    kind: 'melee',
    damage: 20,
    range: 1.8,
    cooldownMs: 300,
    coneRadians: 0.6,
    shopPrice: 0,
    modelUrl: shopModel('fists'),
  },
];

export function mapShopItemsToPresets(
  items: MapShopItem[],
  metricCounts?: Record<string, number>
): WeaponPreset[] {
  return items.map((it) => {
    const need = it.unlockAmount ?? 0;
    const metric = it.unlockMetric;
    const have = metric && metricCounts ? metricCounts[metric] ?? 0 : need;
    const locked = !!(metric && need > 0 && have < need);
    return {
      id: it.id,
      label: it.label,
      description:
        it.description ||
        `${it.fireMode || 'semi'} · ${it.pellets && it.pellets > 1 ? `${it.pellets} pellets · ` : ''}${it.damage} dmg · ${it.range}u`,
      icon: iconFor(it),
      accentClass: accentFor(it),
      kind: it.kind,
      damage: it.damage,
      range: it.range,
      cooldownMs: it.cooldownMs,
      coneRadians: it.coneRadians,
      shopPrice: it.shopPrice,
      modelUrl: it.modelUrl || (it.catalogId ? catalogWeaponUrl(it.catalogId) ?? undefined : undefined),
      textureUrl: it.textureUrl,
      fireMode: it.fireMode,
      pellets: it.pellets,
      adsZoomFov: it.adsZoomFov,
      adsConeScale: it.adsConeScale,
      hipfireConeScale: it.hipfireConeScale,
      magSize: it.magSize,
      reserveAmmo: it.reserveAmmo,
      reloadMs: it.reloadMs,
      unlockMetric: metric,
      unlockAmount: need,
      locked,
      unlockHint: locked && metric ? `Need ${metric.replace(/_/g, ' ')} ${have}/${need}` : undefined,
    };
  });
}

export function mapPowerUpsToPresets(items: MapShopPowerUp[]): PowerUpPreset[] {
  return items.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description || p.effect,
    shopPrice: p.shopPrice,
    effect: p.effect,
  }));
}

export function mapShopSkinsToPresets(items: MapShopSkin[]): WeaponSkinPreset[] {
  return items.map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description || 'Weapon skin',
    shopPrice: s.shopPrice,
    textureUrl: s.textureUrl,
  }));
}

interface WeaponShopProps {
  buySecondsLeft: number;
  currentWeaponId?: string;
  currentWeaponKind?: string;
  currentSkinId?: string;
  credits?: number;
  items?: WeaponPreset[];
  powerUps?: PowerUpPreset[];
  skins?: WeaponSkinPreset[];
  onBuy: (preset: WeaponPreset) => void;
  onBuyPowerUp?: (powerUp: PowerUpPreset) => void;
  onBuySkin?: (skin: WeaponSkinPreset) => void;
}

export const WeaponShop: React.FC<WeaponShopProps> = ({
  buySecondsLeft,
  currentWeaponId,
  currentWeaponKind,
  currentSkinId,
  credits = 0,
  items,
  powerUps,
  skins,
  onBuy,
  onBuyPowerUp,
  onBuySkin,
}) => {
  if (buySecondsLeft <= 0) return null;
  const list = items && items.length > 0 ? items : WEAPON_PRESETS;

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[135] w-full max-w-xl px-3 pointer-events-auto">
      <div className="rounded-2xl border border-white/20 bg-slate-950/85 backdrop-blur-md p-3 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
            <ShoppingCart className="w-3.5 h-3.5" />
            Buy Phase
          </p>
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-bold text-amber-200 tabular-nums flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" />
              {Math.floor(credits)}
            </p>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <p className="text-[11px] font-bold text-white tabular-nums">{buySecondsLeft}s</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {list.map((preset) => {
            const price = preset.shopPrice ?? 0;
            const locked = !!preset.locked;
            const canAfford = !locked && (price <= 0 || credits >= price);
            const isActive =
              (currentWeaponId != null && currentWeaponId === preset.id) ||
              (currentWeaponId == null && currentWeaponKind === preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                disabled={!canAfford}
                onClick={() => canAfford && onBuy(preset)}
                className={`flex flex-col items-start gap-1 rounded-xl border px-2.5 py-2 text-left transition-all active:scale-95 ${
                  canAfford ? preset.accentClass : 'border-white/10 bg-white/5 opacity-40 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-1.5 w-full">
                  {preset.icon}
                  <span className="text-xs font-bold text-white truncate">{preset.label}</span>
                  {locked && (
                    <span className="ml-auto text-[9px] font-bold text-amber-300/90 uppercase tracking-wide shrink-0">
                      Locked
                    </span>
                  )}
                  {!locked && isActive && (
                    <span className="ml-auto text-[9px] font-bold text-emerald-300 uppercase tracking-wide shrink-0">
                      Equipped
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-white/55 leading-snug">
                  {locked ? preset.unlockHint || 'Locked' : preset.description}
                </p>
                <p className="text-[9px] font-bold text-amber-200/90">
                  {locked ? '—' : price > 0 ? `${price} cr` : 'FREE'}
                </p>
              </button>
            );
          })}
        </div>

        {skins && skins.length > 0 && onBuySkin && (
          <div className="mt-2 pt-2 border-t border-white/10">
            <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-300 mb-1.5">
              Weapon skins
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {skins.map((sk) => {
                const canAfford = sk.shopPrice <= 0 || credits >= sk.shopPrice;
                const isActive = currentSkinId === sk.id;
                return (
                  <button
                    key={sk.id}
                    type="button"
                    disabled={!canAfford}
                    onClick={() => canAfford && onBuySkin(sk)}
                    className={`rounded-xl border px-2 py-1.5 text-left ${
                      canAfford
                        ? 'border-cyan-400/50 bg-cyan-500/15 hover:bg-cyan-500/25'
                        : 'border-white/10 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sk.textureUrl}
                      alt=""
                      className="h-8 w-full rounded object-cover mb-1 border border-white/10"
                    />
                    <p className="text-[10px] font-bold text-white truncate">{sk.label}</p>
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-[9px] text-amber-200/80">
                        {sk.shopPrice > 0 ? `${sk.shopPrice} cr` : 'FREE'}
                      </p>
                      {isActive && (
                        <span className="text-[8px] font-bold text-emerald-300 uppercase">On</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {powerUps && powerUps.length > 0 && onBuyPowerUp && (
          <div className="mt-2 pt-2 border-t border-white/10">
            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-300 mb-1.5">
              Power-ups
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {powerUps.map((pu) => {
                const canAfford = pu.shopPrice <= 0 || credits >= pu.shopPrice;
                return (
                  <button
                    key={pu.id}
                    type="button"
                    disabled={!canAfford}
                    onClick={() => canAfford && onBuyPowerUp(pu)}
                    className={`rounded-xl border px-2 py-1.5 text-left ${
                      canAfford
                        ? 'border-violet-400/50 bg-violet-500/15 hover:bg-violet-500/25'
                        : 'border-white/10 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <p className="text-[10px] font-bold text-white truncate">{pu.label}</p>
                    <p className="text-[9px] text-amber-200/80">
                      {pu.shopPrice > 0 ? `${pu.shopPrice} cr` : 'FREE'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
