'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { X, Sparkles, Plus, Minus, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getNewlyUnlockedAbilities,
  type AbilityDefinition,
  type AbilityKey,
} from '@shared/ability-progression';
import {
  STATIC_FALLBACK_POWERS,
  costForLevelFormula,
  effectLabelGeneric,
  computeRadialHexLayout,
  isImageIcon,
  type PowerDefinitionRecord,
} from '@shared/power-definitions';
import type { GameProgressionSnapshot } from '@/lib/game-progression-actions';
import { getPowerTreeConfig, type PowerTreeConfig } from '@/lib/power-tree-config';
import { playSound } from '../effects/soundboard';

/** Flat-top hexagon — matches the shape used by the admin Power Editor so
 * both surfaces share a visual language. */
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';

/** Renders a power's `icon` as an uploaded image when it's a URL, else as
 * the plain emoji glyph — mirrors the admin Power Editor's PowerIcon. */
function PowerIcon({ icon, className }: { icon: string; className?: string }) {
  if (isImageIcon(icon)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className={(className ?? '') + ' object-contain'} />;
  }
  return <span className={className}>{icon}</span>;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface GameMenuProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  avatarUrl?: string;
  /** Loaded lazily so the game doesn't stall waiting on this. */
  progression: GameProgressionSnapshot | null;
  loading: boolean;
  upgrading: AbilityKey | null;
  error?: string | null;
  onUpgrade: (ability: AbilityKey) => void;
  /** Data-driven power list (core + any custom powers from the Power
   * Editor), fetched at runtime — falls back to the static 12 on failure. */
  powers?: PowerDefinitionRecord[];
  /** Viewing someone else's tree (public profile) — hides the Buy button.
   * Spending is also blocked server-side (assertCanMutateUser), this just
   * keeps the UI honest about what a visitor can actually do here. */
  readOnly?: boolean;
  /**
   * In a live match this renders as an overlay inside the game canvas
   * (`absolute`, sized to a positioned ancestor). Opened from a normal page
   * (profile), there's no such ancestor to size against, so it needs to
   * cover the viewport directly instead. Default 'overlay' keeps existing
   * in-match behavior byte-identical.
   */
  positioning?: 'overlay' | 'viewport';
}

/**
 * IN-GAME level/XP + power upgrade menu — opened with M during a match.
 * Entirely separate from the website account level shown elsewhere in the
 * HUD (that ring uses `xpProgress` / `src/lib/progression.ts`).
 */
export function GameMenu({
  open,
  onClose,
  username,
  avatarUrl,
  progression,
  loading,
  upgrading,
  error,
  onUpgrade,
  powers,
  readOnly = false,
  positioning = 'overlay',
}: GameMenuProps) {
  const activePowers = powers && powers.length > 0 ? powers : STATIC_FALLBACK_POWERS;

  const tree = useMemo(
    () => computeRadialHexLayout(activePowers, { hexWidth: 128, hexHeight: 136, centerHexSize: 120 }),
    [activePowers]
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [treeBackground, setTreeBackground] = useState<PowerTreeConfig | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPowerTreeConfig()
      .then((cfg) => {
        if (!cancelled) setTreeBackground(cfg);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // --- Pan/zoom viewport (touch pinch + drag on mobile, wheel + drag on
  // desktop) so the full radial tree doesn't have to fit on screen at once. ---
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    mode: 'none' | 'pan' | 'pinch';
    lastX: number;
    lastY: number;
    startDist: number;
    startZoom: number;
  }>({ mode: 'none', lastX: 0, lastY: 0, startDist: 0, startZoom: 1 });

  const fitToView = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (!width || !height) return;
    const fit = Math.min(1, (width - 24) / tree.width, (height - 24) / tree.height);
    setZoom(clamp(fit, MIN_ZOOM, 1));
    setPan({ x: 0, y: 0 });
  }, [tree.width, tree.height]);

  useEffect(() => {
    if (!open) return;
    // Layout needs a frame to settle (dialog just mounted) before measuring.
    const raf = requestAnimationFrame(fitToView);
    return () => cancelAnimationFrame(raf);
  }, [open, fitToView]);

  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedKey && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedKey]);

  const onTreePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      gestureRef.current.mode = 'pan';
      gestureRef.current.lastX = e.clientX;
      gestureRef.current.lastY = e.clientY;
    } else if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      gestureRef.current.mode = 'pinch';
      gestureRef.current.startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      gestureRef.current.startZoom = zoom;
    }
  };

  const onTreePointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gestureRef.current.mode === 'pan' && pointersRef.current.size === 1) {
      const dx = e.clientX - gestureRef.current.lastX;
      const dy = e.clientY - gestureRef.current.lastY;
      gestureRef.current.lastX = e.clientX;
      gestureRef.current.lastY = e.clientY;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else if (gestureRef.current.mode === 'pinch' && pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setZoom(clamp(gestureRef.current.startZoom * (dist / gestureRef.current.startDist), MIN_ZOOM, MAX_ZOOM));
    }
  };

  const onTreePointerEnd = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 1) {
      const [[, pt]] = Array.from(pointersRef.current.entries());
      gestureRef.current.mode = 'pan';
      gestureRef.current.lastX = pt.x;
      gestureRef.current.lastY = pt.y;
    } else if (pointersRef.current.size === 0) {
      gestureRef.current.mode = 'none';
    }
  };

  const onTreeWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => clamp(z - e.deltaY * 0.001, MIN_ZOOM, MAX_ZOOM));
  };

  if (!open) return null;

  const level = progression?.level ?? 1;
  const percent = progression?.percent ?? 0;
  const skillPoints = progression?.skillPoints ?? 0;
  const abilityLevels = progression?.abilities ?? {};
  const selectedPower = activePowers.find((p) => p.key === selectedKey) ?? null;

  return (
    <div
      className={`${positioning === 'viewport' ? 'fixed' : 'absolute'} inset-0 z-[260] flex items-center justify-center bg-black/70 backdrop-blur-md pointer-events-auto p-4`}
    >
      <div className="w-full max-w-6xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/15 bg-gradient-to-b from-white/[0.09] to-white/[0.02] backdrop-blur-2xl shadow-2xl shadow-black/50">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-b from-[#0f1724]/95 to-[#0f1724]/80 backdrop-blur-xl px-6 py-4">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={username} className="w-11 h-11 rounded-full object-cover border-2 border-white/20 shadow-lg" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-white/10 border-2 border-white/20" />
            )}
            <div>
              <p className="text-white font-black text-lg leading-tight">{username}</p>
              <p className="text-[11px] font-bold tracking-widest text-amber-300/80 uppercase">
                In-Game Level {level}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
            <X className="w-5 h-5 text-white" />
          </Button>
        </div>

        <div className="px-6 pt-4">
          <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-[width] duration-300"
              style={{ width: `${Math.max(2, percent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[11px] font-bold text-white/50">
              {loading ? 'Loading…' : `${Math.round(percent)}% to level ${level + 1}`}
            </p>
            <p className="flex items-center gap-1 text-[12px] font-black text-amber-300">
              <Sparkles className="w-3.5 h-3.5" />
              {skillPoints} Skill Point{skillPoints === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {error && (
          <p className="mx-6 mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-[12px] font-bold text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-col lg:flex-row gap-4 p-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3 gap-2">
              <p className="text-[10px] font-black uppercase tracking-wide text-white/30">
                Power Tree — tap a hex to inspect it · pinch or scroll to zoom · drag to pan
              </p>
            </div>
            <div
              ref={viewportRef}
              className="relative mx-auto w-full h-[380px] sm:h-[460px] overflow-hidden rounded-xl border border-white/10 bg-black/20 touch-none select-none cursor-grab active:cursor-grabbing"
              onPointerDown={onTreePointerDown}
              onPointerMove={onTreePointerMove}
              onPointerUp={onTreePointerEnd}
              onPointerCancel={onTreePointerEnd}
              onPointerLeave={onTreePointerEnd}
              onWheel={onTreeWheel}
              onDoubleClick={fitToView}
            >
            {treeBackground && (treeBackground.backgroundUrl || treeBackground.backgroundColor) && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: treeBackground.backgroundUrl
                    ? `url(${treeBackground.backgroundUrl})`
                    : undefined,
                  backgroundColor: treeBackground.backgroundColor || undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  opacity: treeBackground.backgroundOpacity,
                }}
              />
            )}
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: tree.width,
                height: tree.height,
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            >
              <svg className="absolute inset-0 pointer-events-none" width={tree.width} height={tree.height}>
                {/* Root powers (no prerequisites) link straight to the player
                    hub so every branch visibly connects to the center. */}
                {activePowers.map((p) => {
                  if ((p.prerequisites ?? []).length > 0) return null;
                  const to = tree.positions.get(p.key);
                  if (!to) return null;
                  const unlocked = level >= p.unlockLevel;
                  return (
                    <line
                      key={`center->${p.key}`}
                      x1={tree.centerX}
                      y1={tree.centerY}
                      x2={tree.centerX + to.x}
                      y2={tree.centerY + to.y}
                      stroke={unlocked ? 'rgba(251,191,36,0.45)' : 'rgba(255,255,255,0.12)'}
                      strokeWidth={2}
                    />
                  );
                })}
                {activePowers.map((p) =>
                  (p.prerequisites ?? []).map((prereq) => {
                    const from = tree.positions.get(prereq.key);
                    const to = tree.positions.get(p.key);
                    if (!from || !to) return null;
                    const met = (abilityLevels[prereq.key] ?? 0) >= prereq.level;
                    return (
                      <line
                        key={`${prereq.key}->${p.key}`}
                        x1={tree.centerX + from.x}
                        y1={tree.centerY + from.y}
                        x2={tree.centerX + to.x}
                        y2={tree.centerY + to.y}
                        stroke={met ? 'rgba(56,189,248,0.55)' : 'rgba(255,255,255,0.12)'}
                        strokeWidth={2}
                      />
                    );
                  })
                )}
              </svg>

              {/* Central hex — the player */}
              <div
                className="absolute flex items-center justify-center border-2 border-amber-300/70 bg-gradient-to-b from-amber-500/30 to-black/50 shadow-[0_0_28px_rgba(251,191,36,0.3)]"
                style={{
                  left: tree.centerX - tree.centerHexSize / 2,
                  top: tree.centerY - tree.centerHexSize / 2,
                  width: tree.centerHexSize,
                  height: tree.centerHexSize,
                  clipPath: HEX_CLIP,
                }}
              >
                <div className="flex flex-col items-center">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={username} className="w-10 h-10 rounded-full object-cover border border-amber-200/60" />
                  ) : (
                    <svg viewBox="0 0 64 64" className="w-10 h-10 opacity-90">
                      <circle cx="32" cy="22" r="12" fill="rgba(253,230,138,0.9)" />
                      <path d="M12 56c2-14 12-20 20-20s18 6 20 20" fill="rgba(253,230,138,0.9)" />
                    </svg>
                  )}
                  <p className="text-[9px] font-black text-amber-200 mt-0.5">Lv {level}</p>
                </div>
              </div>

              {activePowers.map((p) => {
                const pos = tree.positions.get(p.key);
                if (!pos) return null;
                // Always build from the freshly-fetched record `p` (not the
                // static ABILITY_DEFINITIONS fallback) so admin-tuned numbers
                // for core powers show up immediately, not just on custom ones.
                const lvl = abilityLevels[p.key] ?? 0;
                const atMax = lvl >= p.maxLevel;
                const accountLocked = level < p.unlockLevel;
                const unmetPrereq = (p.prerequisites ?? []).find(
                  (req) => (abilityLevels[req.key] ?? 0) < req.level
                );
                const locked = accountLocked || !!unmetPrereq;
                const selected = selectedKey === p.key;
                const stateCls = locked
                  ? 'border-white/10 bg-white/[0.02] opacity-50 grayscale'
                  : atMax
                  ? 'border-amber-300/80 bg-gradient-to-b from-amber-500/25 to-black/40 shadow-[0_0_16px_rgba(251,191,36,0.35)]'
                  : lvl > 0
                  ? 'border-emerald-300/70 bg-gradient-to-b from-emerald-500/20 to-black/40 shadow-[0_0_14px_rgba(52,211,153,0.3)]'
                  : 'border-sky-300/50 bg-gradient-to-b from-sky-500/10 to-black/40 hover:border-sky-300/80';
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setSelectedKey(p.key)}
                    className={`absolute flex flex-col items-center justify-center gap-0.5 border-2 p-1.5 text-center transition ${stateCls} ${
                      selected ? 'ring-2 ring-white/80 ring-offset-0' : ''
                    }`}
                    style={{
                      left: tree.centerX + pos.x - tree.hexWidth / 2,
                      top: tree.centerY + pos.y - tree.hexHeight / 2,
                      width: tree.hexWidth,
                      height: tree.hexHeight,
                      clipPath: HEX_CLIP,
                    }}
                    title={locked ? 'Locked' : p.name}
                  >
                    {locked ? (
                      <span className="text-xl leading-none">🔒</span>
                    ) : (
                      <PowerIcon icon={p.icon} className="text-xl leading-none w-6 h-6" />
                    )}
                    <p className="text-white font-black text-[10px] leading-tight truncate w-full px-1">{p.name}</p>
                    <span
                      className={`rounded-full px-1.5 py-0 text-[9px] font-black ${
                        atMax ? 'bg-amber-400 text-black' : lvl > 0 ? 'bg-emerald-400 text-black' : 'bg-black/50 text-white/50'
                      }`}
                    >
                      {atMax ? 'MAX' : `x${lvl}`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Zoom controls — fixed to the viewport corner, unaffected by pan/zoom. */}
            <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setZoom((z) => clamp(z + 0.25, MIN_ZOOM, MAX_ZOOM))}
                className="w-8 h-8 rounded-lg bg-black/60 border border-white/15 text-white flex items-center justify-center hover:bg-black/80 transition"
                aria-label="Zoom in"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => clamp(z - 0.25, MIN_ZOOM, MAX_ZOOM))}
                className="w-8 h-8 rounded-lg bg-black/60 border border-white/15 text-white flex items-center justify-center hover:bg-black/80 transition"
                aria-label="Zoom out"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={fitToView}
                className="w-8 h-8 rounded-lg bg-black/60 border border-white/15 text-white flex items-center justify-center hover:bg-black/80 transition"
                aria-label="Reset view"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
            </div>
          </div>

          {/* Side panel — selected node detail, WayneTech-style */}
          <div ref={panelRef} className="w-full lg:w-[260px] shrink-0 rounded-xl border border-white/10 bg-black/30 p-4">
            {!selectedPower ? (
              <p className="text-[11px] text-white/40">Click a power hex to see its details here.</p>
            ) : (
              (() => {
                const p = selectedPower;
                const lvl = abilityLevels[p.key] ?? 0;
                const atMax = lvl >= p.maxLevel;
                const cost = costForLevelFormula(p.cost, lvl);
                const accountLocked = level < p.unlockLevel;
                const unmetPrereq = (p.prerequisites ?? []).find(
                  (req) => (abilityLevels[req.key] ?? 0) < req.level
                );
                const locked = accountLocked || !!unmetPrereq;
                const canAfford = !locked && !atMax && skillPoints >= cost;
                return (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <PowerIcon icon={p.icon} className="text-2xl leading-none w-8 h-8" />
                      <div className="min-w-0">
                        <p className="text-white font-black text-sm leading-tight truncate">{p.name}</p>
                        <p className="text-[10px] font-bold tracking-wide text-white/40 uppercase">
                          Level {lvl} / {p.maxLevel}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: p.maxLevel }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 flex-1 rounded-full ${i < lvl ? 'bg-emerald-400' : 'bg-white/10'}`}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-white/60 leading-snug">{p.description}</p>
                    <p className="text-[11px] font-bold text-sky-300 leading-snug">
                      {locked ? 'Locked' : effectLabelGeneric(p, lvl)}
                    </p>
                    {locked && (
                      <p className="text-[10px] font-bold text-red-300/80 rounded-lg bg-red-500/10 border border-red-500/20 px-2 py-1.5">
                        {unmetPrereq
                          ? `Requires ${activePowers.find((ap) => ap.key === unmetPrereq.key)?.name ?? unmetPrereq.key} at Lv ${unmetPrereq.level}`
                          : `Requires account level ${p.unlockLevel}`}
                      </p>
                    )}
                    {!locked && atMax && (
                      <p className="text-[10px] font-black text-amber-300 uppercase tracking-wide">Maxed out</p>
                    )}
                    {readOnly && !locked && !atMax && (
                      <p className="text-[10px] font-bold text-white/35 uppercase tracking-wide">
                        Viewing {username}&apos;s tree — visit your own profile to spend points
                      </p>
                    )}
                    {!readOnly && !locked && !atMax && (
                      <Button
                        onClick={() => onUpgrade(p.key)}
                        disabled={!canAfford || upgrading === p.key}
                        className="w-full gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black disabled:opacity-40"
                      >
                        {upgrading === p.key
                          ? 'Upgrading…'
                          : `Buy · ${cost} Skill Point${cost === 1 ? '' : 's'}`}
                      </Button>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>

        <div className="px-6 pb-6">
          <p className="text-[10px] font-bold text-white/30 text-center">
            {positioning === 'viewport'
              ? 'Kill enemies and win matches to earn XP and Skill Points'
              : 'Press M to close · Kill enemies and win matches to earn XP and Skill Points'}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Nice popup shown when the player's in-game level just went up — lists any
 * abilities that just became unlockable in that jump (e.g. hit level 10,
 * "Invisibility" is now spendable).
 */
export function LevelUpPopup({
  event,
  onDismiss,
}: {
  event: { fromLevel: number; toLevel: number; unlocked: AbilityDefinition[] } | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (event) playSound('level_up');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  if (!event) return null;
  return (
    <div className="absolute inset-0 z-[270] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto p-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-400/25 bg-gradient-to-b from-white/[0.09] to-white/[0.02] backdrop-blur-2xl shadow-2xl shadow-black/50 overflow-hidden">
        <div className="flex flex-col items-center gap-2 px-6 pt-8 pb-6 text-center">
          <Sparkles className="w-9 h-9 text-amber-300" />
          <p className="text-2xl font-black text-white">Level Up!</p>
          <p className="text-sm font-bold text-amber-300">
            Level {event.fromLevel} → {event.toLevel}
          </p>
        </div>
        {event.unlocked.length > 0 && (
          <div className="px-6 pb-2">
            <p className="text-[11px] font-black uppercase tracking-wide text-white/40 mb-2 text-center">
              New power{event.unlocked.length > 1 ? 's' : ''} unlocked
            </p>
            <div className="flex flex-col gap-2">
              {event.unlocked.map((def) => (
                <div
                  key={def.key}
                  className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2"
                >
                  <PowerIcon icon={def.icon} className="text-2xl leading-none w-8 h-8" />
                  <div className="text-left">
                    <p className="text-white font-black text-sm leading-tight">{def.name}</p>
                    <p className="text-[11px] text-white/50">{def.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="px-6 pb-6 pt-4">
          <Button className="w-full font-black" onClick={onDismiss}>
            Nice!
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook that owns fetching/upgrading in-game progression for the local
 * player, plus whether a "+" level-up indicator should show on the HUD.
 */
export function useGameProgression(userId: string | null | undefined) {
  const [progression, setProgression] = useState<GameProgressionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState<AbilityKey | null>(null);
  const [powers, setPowers] = useState<PowerDefinitionRecord[]>(STATIC_FALLBACK_POWERS);
  const [levelUpEvent, setLevelUpEvent] = useState<{
    fromLevel: number;
    toLevel: number;
    unlocked: ReturnType<typeof getNewlyUnlockedAbilities>;
  } | null>(null);
  const [, startTransition] = useTransition();

  // Fetch the data-driven power list once — core (tuned) + any custom
  // powers created in the Power Editor. Falls back to the static 12 (the
  // initial state above) on any failure, so the menu never breaks.
  useEffect(() => {
    let cancelled = false;
    import('@/lib/game-progression-actions')
      .then(({ getPowerDefinitionsForMenu }) => getPowerDefinitionsForMenu())
      .then((list) => {
        if (!cancelled && Array.isArray(list) && list.length > 0) setPowers(list);
      })
      .catch(() => {
        /* keep static fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const checkLevelUp = React.useCallback(
    (snap: GameProgressionSnapshot | null) => {
      if (!snap || !userId || typeof window === 'undefined') return;
      const key = `kilrun.gameLevel.lastSeen.${userId}`;
      const stored = window.localStorage.getItem(key);
      const lastSeen = stored ? parseInt(stored, 10) : snap.level;
      if (Number.isFinite(lastSeen) && snap.level > lastSeen) {
        setLevelUpEvent({
          fromLevel: lastSeen,
          toLevel: snap.level,
          unlocked: getNewlyUnlockedAbilities(lastSeen, snap.level),
        });
      }
      window.localStorage.setItem(key, String(snap.level));
    },
    [userId]
  );

  const refresh = React.useCallback(() => {
    if (!userId) return;
    setLoading(true);
    import('@/lib/game-progression-actions')
      .then(({ getGameProgression }) => getGameProgression(userId))
      .then((snap) => {
        setProgression(snap);
        checkLevelUp(snap);
      })
      .catch(() => setError('Could not load progression'))
      .finally(() => setLoading(false));
  }, [userId, checkLevelUp]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upgrade = (ability: AbilityKey) => {
    if (!userId || upgrading) return;
    setUpgrading(ability);
    setError(null);
    startTransition(() => {
      import('@/lib/game-progression-actions')
        .then(({ upgradeGameAbility }) => upgradeGameAbility(userId, ability))
        .then((snap) => {
          setProgression(snap);
          checkLevelUp(snap);
          playSound('skill_point_spent');
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Upgrade failed'))
        .finally(() => setUpgrading(null));
    });
  };

  const hasUnspentPoints = (progression?.skillPoints ?? 0) > 0;

  return {
    progression,
    loading,
    error,
    upgrading,
    powers,
    refresh,
    upgrade,
    hasUnspentPoints,
    levelUpEvent,
    dismissLevelUp: () => setLevelUpEvent(null),
  };
}
