'use client';

/**
 * Combat Editor — standalone fullscreen panel for physics and gameplay tuning.
 *
 * Sections:
 *   movement   — walk speed, sprint, crouch
 *   jump       — jump velocity, double-jump, coyote, buffer, jump-cut
 *   slide      — slide enable, speed, duration, cooldown
 *   walljump   — wall-jump enable, horizontal/vertical velocity, wall-slide gravity
 *   gravity    — gravity, max fall, apex multiplier
 *   recoil     — camera kick, recovery, weapon kick
 *   sway       — idle sway amplitude/speed, movement sway
 *   shake      — camera shake on fire / hit / land
 *   deathrun   — arms-only mode, power-up pool (deathrun specific)
 */

import React, { useState } from 'react';
import {
  X,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Zap,
  PersonStanding,
  Move3d,
  Settings2,
  Target,
  Waves,
  ArrowUp,
  ArrowDown,
  Wind,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_COMBAT_SETTINGS,
  type CombatSettings,
  type MapDocument,
  ensureCombatSettings,
} from './map-document';

// ── Shared helpers ──────────────────────────────────────────────────────────

function Section({
  title,
  accent = 'sky',
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  accent?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-${accent}-300/80 hover:bg-white/5`}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  defaultValue,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  defaultValue?: number;
  onChange: (v: number) => void;
}) {
  const displayVal = step >= 1 ? value.toFixed(0) : step >= 0.1 ? value.toFixed(1) : value.toFixed(3);
  const isDefault = defaultValue !== undefined && Math.abs(value - defaultValue) < step * 0.5;
  return (
    <label className="flex items-center gap-2 text-[10px] text-white/50">
      <div className="w-36 shrink-0">
        <span className="leading-tight">{label}</span>
        {hint && <span className="block text-[9px] text-white/28 leading-tight mt-0.5">{hint}</span>}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-sky-400"
      />
      <span className={`w-14 text-right tabular-nums ${isDefault ? 'text-white/35' : 'text-sky-300/90'}`}>
        {displayVal}
        {unit ? <span className="text-white/30 text-[9px] ml-0.5">{unit}</span> : null}
      </span>
      {defaultValue !== undefined && !isDefault && (
        <button
          type="button"
          title={`Reset to default (${defaultValue})`}
          onClick={() => onChange(defaultValue)}
          className="text-white/25 hover:text-white/60 text-[9px] shrink-0"
        >
          ↩
        </button>
      )}
    </label>
  );
}

function Toggle({
  label,
  hint,
  value,
  accentTrue = 'emerald',
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  accentTrue?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <div
        onClick={() => onChange(!value)}
        className={`w-8 h-4 rounded-full mt-0.5 shrink-0 relative transition-colors cursor-pointer ${
          value ? `bg-${accentTrue}-500` : 'bg-white/15'
        }`}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
      <div>
        <p className="text-[10px] text-white/60">{label}</p>
        {hint && <p className="text-[9px] text-white/30 leading-tight">{hint}</p>}
      </div>
    </label>
  );
}

type Tab =
  | 'movement'
  | 'jump'
  | 'slide'
  | 'walljump'
  | 'gravity'
  | 'recoil'
  | 'sway'
  | 'shake'
  | 'deathrun';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'movement', label: 'Movement', icon: <PersonStanding className="w-3.5 h-3.5" /> },
  { id: 'jump', label: 'Jump', icon: <ArrowUp className="w-3.5 h-3.5" /> },
  { id: 'slide', label: 'Slide', icon: <Wind className="w-3.5 h-3.5" /> },
  { id: 'walljump', label: 'Wall', icon: <Shield className="w-3.5 h-3.5" /> },
  { id: 'gravity', label: 'Gravity', icon: <ArrowDown className="w-3.5 h-3.5" /> },
  { id: 'recoil', label: 'Recoil', icon: <Zap className="w-3.5 h-3.5" /> },
  { id: 'sway', label: 'Sway', icon: <Waves className="w-3.5 h-3.5" /> },
  { id: 'shake', label: 'Shake', icon: <Move3d className="w-3.5 h-3.5" /> },
  { id: 'deathrun', label: 'Deathrun', icon: <Target className="w-3.5 h-3.5" /> },
];

// ── Main component ──────────────────────────────────────────────────────────

export function CombatEditor({
  isMobile,
  mapDoc,
  onClose,
  onSaveToMap,
}: {
  isMobile?: boolean;
  mapDoc: MapDocument;
  onClose: () => void;
  onSaveToMap: (settings: Partial<CombatSettings>) => void;
}) {
  const [settings, setSettings] = useState<CombatSettings>(() => ensureCombatSettings(mapDoc));
  const [tab, setTab] = useState<Tab>('movement');
  const [dirty, setDirty] = useState(false);

  const patch = (partial: Partial<CombatSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  };

  const save = () => {
    onSaveToMap(settings);
    setDirty(false);
  };

  const resetAll = () => {
    setSettings({ ...DEFAULT_COMBAT_SETTINGS });
    setDirty(true);
  };

  const D = DEFAULT_COMBAT_SETTINGS;

  const gameMode = mapDoc.gameMode ?? 'deathrun';

  return (
    <div className="fixed inset-0 z-[3000] flex flex-col bg-slate-950/96 backdrop-blur-md">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-slate-900/60 shrink-0">
        <Settings2 className="w-4 h-4 text-sky-300" />
        <span className="text-sm font-black text-white tracking-tight">Combat Editor</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={resetAll}
            className="text-white/50 hover:text-white/80 gap-1 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset all
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={!dirty}
            className={`gap-1 text-xs ${dirty ? 'bg-sky-500 hover:bg-sky-400 text-white' : ''}`}
          >
            <Save className="w-3.5 h-3.5" />
            {dirty ? 'Save to Map •' : 'Saved'}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-white/10 text-white/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Tab strip ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/10 bg-slate-900/40 shrink-0 overflow-x-auto">
        {TABS.map((t) => (
          t.id === 'deathrun' && gameMode !== 'deathrun' ? null : (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'bg-sky-500/30 border border-sky-400/50 text-sky-100'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          )
        ))}
      </div>

      {/* ── Content area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className={`${isMobile ? 'max-w-full' : 'max-w-2xl'} mx-auto px-4 py-4 space-y-3`}>

          {/* ── MOVEMENT ─────────────────────────────────────────────── */}
          {tab === 'movement' && (
            <>
              <InfoBox>
                Walk, sprint, and crouch speed. These values match the server simulation — changes
                are applied immediately in Play Test and loaded into match rooms via loadCustomMap.
              </InfoBox>
              <Section title="Walk Speed" accent="sky" icon={<PersonStanding className="w-3.5 h-3.5" />}>
                <Slider label="Walk speed" hint="Base movement speed" value={settings.walkSpeed} min={1} max={12} step={0.25} unit="u/s" defaultValue={D.walkSpeed} onChange={(v) => patch({ walkSpeed: v })} />
                <Slider label="Sprint mult" hint="Multiplied when holding sprint" value={settings.sprintMult} min={1} max={3} step={0.05} defaultValue={D.sprintMult} onChange={(v) => patch({ sprintMult: v })} />
                <Slider label="Crouch mult" hint="Speed fraction when crouching" value={settings.crouchMult} min={0.1} max={1} step={0.05} defaultValue={D.crouchMult} onChange={(v) => patch({ crouchMult: v })} />
              </Section>
              <PhysicsNote text="Sprint uses energy (drains while held, regenerates at rest). Exhausted players slow to 72% of walk speed." />
            </>
          )}

          {/* ── JUMP ─────────────────────────────────────────────────── */}
          {tab === 'jump' && (
            <>
              <InfoBox>
                Tune the feel of jumping: first jump height, double-jump, coyote time
                (lingering jump window after walking off a ledge), and jump-cut (variable jump height).
              </InfoBox>
              <Section title="Jump Force" accent="emerald" icon={<ArrowUp className="w-3.5 h-3.5" />}>
                <Slider label="Jump velocity" hint="Vertical velocity on jump" value={settings.jumpVelocity} min={4} max={20} step={0.25} unit="u/s" defaultValue={D.jumpVelocity} onChange={(v) => patch({ jumpVelocity: v })} />
                <Slider label="Jump-cut mult" hint="Velocity fraction when jump released early" value={settings.jumpCutMult} min={0.1} max={1} step={0.05} defaultValue={D.jumpCutMult} onChange={(v) => patch({ jumpCutMult: v })} />
                <Slider label="Coyote time" hint="ms window after leaving edge to still jump" value={settings.coyoteMs} min={0} max={500} step={10} unit="ms" defaultValue={D.coyoteMs} onChange={(v) => patch({ coyoteMs: v })} />
                <Slider label="Jump buffer" hint="ms to queue a jump before landing" value={settings.jumpBufferMs} min={0} max={400} step={10} unit="ms" defaultValue={D.jumpBufferMs} onChange={(v) => patch({ jumpBufferMs: v })} />
              </Section>
              <Section title="Double Jump" accent="emerald">
                <Toggle label="Double jump enabled" value={settings.doubleJumpEnabled} accentTrue="emerald" onChange={(v) => patch({ doubleJumpEnabled: v })} />
                {settings.doubleJumpEnabled && (
                  <Slider label="Double-jump velocity" hint="Vertical velocity on second jump" value={settings.doubleJumpVelocity} min={2} max={18} step={0.25} unit="u/s" defaultValue={D.doubleJumpVelocity} onChange={(v) => patch({ doubleJumpVelocity: v })} />
                )}
              </Section>
              <PhysicsNote text="Jump energy cost is 4 units (fixed). Sprint + double-jump can drain energy rapidly." />
            </>
          )}

          {/* ── SLIDE ─────────────────────────────────────────────────── */}
          {tab === 'slide' && (
            <>
              <InfoBox>
                Slide: crouch while sprinting to enter a low-drag ground slide. Great for
                momentum-based movement in Horde or Competitive maps.
              </InfoBox>
              <Section title="Slide" accent="violet" icon={<Wind className="w-3.5 h-3.5" />}>
                <Toggle label="Enable slide" hint="Crouch while sprinting triggers slide" value={settings.slideEnabled} accentTrue="violet" onChange={(v) => patch({ slideEnabled: v })} />
                {settings.slideEnabled && (
                  <>
                    <Slider label="Slide speed mult" hint="Multiplier over walk speed" value={settings.slideMult} min={1} max={5} step={0.1} defaultValue={D.slideMult} onChange={(v) => patch({ slideMult: v })} />
                    <Slider label="Slide duration" value={settings.slideDurationMs} min={100} max={2000} step={50} unit="ms" defaultValue={D.slideDurationMs} onChange={(v) => patch({ slideDurationMs: v })} />
                    <Slider label="Slide cooldown" value={settings.slideCooldownMs} min={200} max={5000} step={100} unit="ms" defaultValue={D.slideCooldownMs} onChange={(v) => patch({ slideCooldownMs: v })} />
                  </>
                )}
              </Section>
              <PhysicsNote text="Slide preserves momentum from sprint. Camera dips slightly during slide. Slide-jump (jump while sliding) is always enabled when slide is on." />
            </>
          )}

          {/* ── WALL JUMP ─────────────────────────────────────────────── */}
          {tab === 'walljump' && (
            <>
              <InfoBox>
                Wall jump and wall slide: players can grab onto tall solid walls (height ≥ 2u)
                and either slide slowly down or jump off for traversal in vertical maps.
              </InfoBox>
              <Section title="Wall Jump" accent="rose" icon={<Shield className="w-3.5 h-3.5" />}>
                <Toggle label="Enable wall jump" hint="Grab wall and jump off" value={settings.wallJumpEnabled} accentTrue="rose" onChange={(v) => patch({ wallJumpEnabled: v })} />
                {settings.wallJumpEnabled && (
                  <>
                    <Slider label="Horiz velocity" hint="Horizontal push away from wall" value={settings.wallJumpHorizVel} min={1} max={12} step={0.25} unit="u/s" defaultValue={D.wallJumpHorizVel} onChange={(v) => patch({ wallJumpHorizVel: v })} />
                    <Slider label="Vert velocity" hint="Vertical boost on wall-jump" value={settings.wallJumpVertVel} min={3} max={16} step={0.25} unit="u/s" defaultValue={D.wallJumpVertVel} onChange={(v) => patch({ wallJumpVertVel: v })} />
                  </>
                )}
              </Section>
              <Section title="Wall Slide" accent="rose">
                <Toggle label="Wall slide (slow fall on wall)" hint="Touch wall while airborne to slide" value={settings.wallJumpEnabled} accentTrue="rose" onChange={(v) => patch({ wallJumpEnabled: v })} />
                {settings.wallJumpEnabled && (
                  <Slider label="Wall-slide gravity" hint="Fraction of normal gravity while on wall" value={settings.wallSlideGravMult} min={0.05} max={1} step={0.05} defaultValue={D.wallSlideGravMult} onChange={(v) => patch({ wallSlideGravMult: v })} />
                )}
              </Section>
              <PhysicsNote text="Wall-jump requires at least 2 units tall solid blocks. Works in all 3 modes. Players can chain wall-jumps between parallel walls to climb." />
            </>
          )}

          {/* ── GRAVITY ─────────────────────────────────────────────── */}
          {tab === 'gravity' && (
            <>
              <InfoBox>
                Global gravity and fall physics. Apex gravity multiplier lets you create
                floaty / heavy jumps by changing gravity only at the top of the arc.
              </InfoBox>
              <Section title="Gravity" accent="amber" icon={<ArrowDown className="w-3.5 h-3.5" />}>
                <Slider label="Gravity" hint="Downward acceleration (u/s²)" value={settings.gravity} min={4} max={60} step={0.5} unit="u/s²" defaultValue={D.gravity} onChange={(v) => patch({ gravity: v })} />
                <Slider label="Max fall speed" hint="Terminal velocity downward" value={settings.maxFallSpeed} min={8} max={80} step={1} unit="u/s" defaultValue={D.maxFallSpeed} onChange={(v) => patch({ maxFallSpeed: v })} />
                <Slider label="Apex gravity mult" hint="Gravity multiplier at jump apex (1=normal, <1=floaty)" value={settings.apexGravMult} min={0.1} max={2} step={0.05} defaultValue={D.apexGravMult} onChange={(v) => patch({ apexGravMult: v })} />
              </Section>
              <PhysicsNote text="High gravity with low jump velocity = snappy, game-feel heavy. Low gravity with high jump = floaty. Jump pads ignore these values and use their own boost." />
            </>
          )}

          {/* ── RECOIL ─────────────────────────────────────────────────── */}
          {tab === 'recoil' && (
            <>
              <InfoBox>
                Visual recoil — camera pitch kick and weapon model push-back on each shot.
                These are visual only and don&apos;t affect server-side hitscan accuracy.
                Per-weapon overrides in the Weapon Editor take priority.
              </InfoBox>
              <Section title="Camera Recoil" accent="orange" icon={<Zap className="w-3.5 h-3.5" />}>
                <Slider label="Camera kick" hint="Upward pitch on each shot (degrees)" value={settings.recoilKickDeg} min={0} max={20} step={0.25} unit="°" defaultValue={D.recoilKickDeg} onChange={(v) => patch({ recoilKickDeg: v })} />
                <Slider label="Recovery speed" hint="deg/s pull-back after kick" value={settings.recoilRecoverySpeed} min={10} max={500} step={5} unit="°/s" defaultValue={D.recoilRecoverySpeed} onChange={(v) => patch({ recoilRecoverySpeed: v })} />
              </Section>
              <Section title="Weapon Kick" accent="orange">
                <Slider label="Weapon kick Z" hint="Weapon mesh push-back distance per shot" value={settings.weaponKickZ} min={0} max={0.25} step={0.005} unit="u" defaultValue={D.weaponKickZ} onChange={(v) => patch({ weaponKickZ: v })} />
              </Section>
              <PhysicsNote text="Recoil is applied client-side only. Server does not account for recoil in shot resolution — it uses the cone (coneRadians) set in Weapon Editor." />
            </>
          )}

          {/* ── SWAY ────────────────────────────────────────────────── */}
          {tab === 'sway' && (
            <>
              <InfoBox>
                Weapon idle sway and movement sway. Creates organic breathing-like oscillation
                while standing still, amplified when moving.
              </InfoBox>
              <Section title="Idle Sway" accent="teal" icon={<Waves className="w-3.5 h-3.5" />}>
                <Toggle label="Enable weapon sway" value={settings.swayEnabled} accentTrue="teal" onChange={(v) => patch({ swayEnabled: v })} />
                {settings.swayEnabled && (
                  <>
                    <Slider label="Amplitude" hint="Peak swing distance (degrees)" value={settings.swayAmplitudeDeg} min={0.1} max={8} step={0.1} unit="°" defaultValue={D.swayAmplitudeDeg} onChange={(v) => patch({ swayAmplitudeDeg: v })} />
                    <Slider label="Speed" hint="Oscillation frequency (Hz)" value={settings.swaySpeedHz} min={0.1} max={4} step={0.05} unit="Hz" defaultValue={D.swaySpeedHz} onChange={(v) => patch({ swaySpeedHz: v })} />
                    <Slider label="Move mult" hint="Sway multiplier while moving" value={settings.swayMoveMult} min={1} max={6} step={0.1} defaultValue={D.swayMoveMult} onChange={(v) => patch({ swayMoveMult: v })} />
                  </>
                )}
              </Section>
              <PhysicsNote text="Sway is applied to the weapon mesh position in view space. Independent from cloth/cape sway which is driven by vertex simulation." />
            </>
          )}

          {/* ── SHAKE ───────────────────────────────────────────────── */}
          {tab === 'shake' && (
            <>
              <InfoBox>
                Camera shake on impactful events. Adds juice and feedback. Set to 0 to disable.
              </InfoBox>
              <Section title="Camera Shake" accent="yellow" icon={<Move3d className="w-3.5 h-3.5" />}>
                <Slider label="On fire" hint="Shake amplitude when shooting" value={settings.shakeOnFire} min={0} max={0.15} step={0.005} defaultValue={D.shakeOnFire} onChange={(v) => patch({ shakeOnFire: v })} />
                <Slider label="On hit" hint="Shake when taking damage" value={settings.shakeOnHit} min={0} max={0.2} step={0.005} defaultValue={D.shakeOnHit} onChange={(v) => patch({ shakeOnHit: v })} />
                <Slider label="On land" hint="Shake on hard landing from height" value={settings.shakeOnLand} min={0} max={0.15} step={0.005} defaultValue={D.shakeOnLand} onChange={(v) => patch({ shakeOnLand: v })} />
              </Section>
              <PhysicsNote text="Shake decays exponentially. Duration is ~200ms by default. All shake values are in camera-space units." />
            </>
          )}

          {/* ── DEATHRUN ────────────────────────────────────────────── */}
          {tab === 'deathrun' && (
            <>
              <InfoBox>
                Deathrun-specific combat settings. Arms-only mode shows floating arms instead
                of the full body in first person. Power-ups can be purchased in the shop.
              </InfoBox>
              <Section title="Arms Mode" accent="red" icon={<Target className="w-3.5 h-3.5" />}>
                <Toggle
                  label="Arms-only mode"
                  hint="Show floating arms + weapon only (no full body visible)"
                  value={settings.armsOnlyMode}
                  accentTrue="red"
                  onChange={(v) => patch({ armsOnlyMode: v })}
                />
              </Section>
              <Section title="Power-up Pool" accent="red">
                <p className="text-[10px] text-white/45 leading-snug mb-1.5">
                  Comma-separated power-up IDs available for purchase in the deathrun shop.
                  Leave blank for no shop.
                </p>
                <input
                  type="text"
                  value={settings.powerUpPool}
                  onChange={(e) => patch({ powerUpPool: e.target.value })}
                  placeholder="speed_boost, double_jump, shield, …"
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-2.5 py-1.5 text-[11px] text-white/80"
                />
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {POWER_UP_PRESETS.map((pu) => {
                    const active = settings.powerUpPool.includes(pu.id);
                    return (
                      <button
                        key={pu.id}
                        type="button"
                        onClick={() => {
                          const ids = settings.powerUpPool
                            ? settings.powerUpPool.split(',').map((s) => s.trim()).filter(Boolean)
                            : [];
                          const next = active
                            ? ids.filter((id) => id !== pu.id)
                            : [...ids, pu.id];
                          patch({ powerUpPool: next.join(', ') });
                        }}
                        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[10px] transition-colors ${
                          active
                            ? 'border-red-400/60 bg-red-500/20 text-red-100'
                            : 'border-white/10 text-white/50 hover:bg-white/5'
                        }`}
                      >
                        <span>{pu.icon}</span>
                        <div>
                          <p className="font-bold">{pu.label}</p>
                          <p className="text-white/35 text-[9px]">{pu.hint}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Section>
            </>
          )}

        </div>
      </div>

      {/* ── Bottom status bar ─────────────────────────────────────────── */}
      <div className="border-t border-white/10 bg-slate-900/50 px-4 py-2 flex items-center gap-3 shrink-0">
        <p className="text-[10px] text-white/30 flex-1">
          Changes saved to map document → applied in Play Test and live match via loadCustomMap.
        </p>
        {dirty && (
          <p className="text-[10px] text-amber-300/70 font-semibold animate-pulse">
            Unsaved changes
          </p>
        )}
      </div>
    </div>
  );
}

// ── Minor sub-components ────────────────────────────────────────────────────

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-sky-400/20 bg-sky-500/5 px-3 py-2.5 text-[10px] text-white/50 leading-snug">
      {children}
    </div>
  );
}

function PhysicsNote({ text }: { text: string }) {
  return (
    <p className="text-[9px] text-white/28 italic leading-snug px-1">
      {text}
    </p>
  );
}

// ── Power-up presets ─────────────────────────────────────────────────────────

const POWER_UP_PRESETS = [
  { id: 'speed_boost', label: 'Speed Boost', icon: '⚡', hint: 'Temporary +50% run speed' },
  { id: 'double_jump', label: 'Double Jump', icon: '🦘', hint: 'Grants one extra jump' },
  { id: 'shield', label: 'Shield', icon: '🛡️', hint: 'Absorbs next 50 damage' },
  { id: 'invisibility', label: 'Invisible', icon: '👻', hint: 'Hide from trapper for 5s' },
  { id: 'super_jump', label: 'Super Jump', icon: '🚀', hint: '3× jump height for 8s' },
  { id: 'heal', label: 'Heal', icon: '❤️', hint: 'Restore 50 HP instantly' },
  { id: 'slow_trapper', label: 'Slow Trap', icon: '🕸️', hint: 'Slow trapper for 5s' },
  { id: 'checkpoint', label: 'Checkpoint', icon: '📍', hint: 'Set respawn here instantly' },
];
