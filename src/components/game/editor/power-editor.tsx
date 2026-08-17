'use client';

/**
 * Power Editor — admin panel for the data-driven "Powers" skill-tree system.
 *
 * Unlike Weapon/Combat Editor (per-map overrides stored on MapDocument),
 * powers are ACCOUNT-WIDE — persisted via the `PowerDefinition` Prisma model
 * and the `/api/game/power-definitions` CRUD route, not the map document.
 * This panel still lives in the same map-editor tab bar per product
 * decision, it just talks to its own API instead of `onSaveToMap`.
 *
 * Effect templates (see shared/power-definitions.ts):
 *   stat_bonus    passive stat modifier — fully wired end-to-end.
 *   timed_buff    press-to-activate reskin of an existing buff mechanic
 *                 (invisibility / fly / berserk / unlimited ammo) — fully wired.
 *   burst_effect  press-to-activate reskin of thunder (radius+damage) or
 *                 hook (range+pull) — fully wired.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Save, Trash2, Plus, Sparkles, Lock, RefreshCw, Upload, Image as ImageIcon, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getPowerTreeConfig, updatePowerTreeConfig, type PowerTreeConfig } from '@/lib/power-tree-config';
import {
  costForLevelFormula,
  effectLabelGeneric,
  computeRadialHexLayout,
  isImageIcon,
  type PowerDefinitionRecord,
  type PowerEffectType,
  type StatBonusEntry,
  type StatBonusStat,
  type TimedBuffKind,
  type BurstEffectKind,
  type StatBonusParams,
  type TimedBuffParams,
  type BurstEffectParams,
} from '@shared/power-definitions';
import { getLucideIcon } from '@/lib/move-icons';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Renders a power's `icon` as an uploaded image, a lucide icon (auto-
 * created custom-move powers use "lucide:Name"), or the legacy emoji glyph
 * — same convention used in-game (game-menu.tsx). */
function PowerIcon({ icon, className }: { icon: string; className?: string }) {
  const Lucide = getLucideIcon(icon);
  if (Lucide) return <Lucide className={className ?? 'w-5 h-5'} />;
  if (isImageIcon(icon)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className={className ?? 'w-5 h-5 object-contain'} />;
  }
  return <span className={className ?? 'text-base leading-none'}>{icon}</span>;
}

/** Flat-top hexagon — same shape used by the in-game skill menu so both
 * surfaces share a visual language. */
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';

const STAT_OPTIONS: {
  value: StatBonusStat;
  label: string;
  suggestedMode: 'additive' | 'multiplicative';
  wired?: boolean;
}[] = [
  { value: 'maxHealth', label: 'Max Health', suggestedMode: 'additive', wired: true },
  { value: 'maxEnergy', label: 'Max Energy', suggestedMode: 'additive', wired: true },
  { value: 'speed', label: 'Move Speed', suggestedMode: 'multiplicative', wired: true },
  { value: 'jump', label: 'Jump Height', suggestedMode: 'multiplicative', wired: true },
  { value: 'punchDamage', label: 'Punch Damage', suggestedMode: 'multiplicative', wired: true },
  { value: 'reloadSpeed', label: 'Reload Speed', suggestedMode: 'multiplicative', wired: true },
  { value: 'fallDamageReduction', label: 'Fall Damage Reduction', suggestedMode: 'multiplicative', wired: true },
];

const BUFF_KIND_OPTIONS: { value: TimedBuffKind; label: string }[] = [
  { value: 'invisibility', label: 'Invisibility (reskin)' },
  { value: 'fly', label: 'Fly (reskin)' },
  { value: 'berserk', label: 'Berserk — invuln + 1-hit KO (reskin)' },
  { value: 'unlimited_ammo', label: 'Unlimited Ammo (reskin)' },
];

const BURST_KIND_OPTIONS: { value: BurstEffectKind; label: string }[] = [
  { value: 'radius_damage', label: 'Radius Damage Pulse (thunder-style)' },
  { value: 'range_pull', label: 'Range + Pull (hook-style)' },
  { value: 'range_dash', label: 'Range + Dash away (backflip-style)' },
];

function emptyDraft(sortOrder: number): PowerDefinitionRecord {
  return {
    key: '',
    name: '',
    description: '',
    icon: '✨',
    maxLevel: 5,
    unlockLevel: 1,
    prerequisites: [],
    cost: { type: 'flat', base: 1 },
    effectType: 'stat_bonus',
    effectParams: { bonuses: [{ stat: 'maxHealth', mode: 'additive', perLevel: 5 }] } as StatBonusParams,
    isCore: false,
    sortOrder,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-white/50">
      <span className="font-bold uppercase tracking-wide text-white/40">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-sky-400/50';

/** Emoji text input + image-upload button, sharing one `icon` field — the
 * field holds either a short emoji glyph or an image URL/data URL
 * (persisted server-side on save, see resolveIcon in the API route). */
function IconField({ icon, onChange }: { icon: string; onChange: (icon: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-8 h-8 shrink-0 rounded-lg border border-white/10 bg-black/30 flex items-center justify-center overflow-hidden">
        <PowerIcon icon={icon} className={isImageIcon(icon) ? 'w-full h-full object-cover' : 'text-lg leading-none'} />
      </div>
      <input
        className={inputCls + ' flex-1'}
        value={isImageIcon(icon) ? '' : icon}
        placeholder={isImageIcon(icon) ? 'Uploaded image' : '✨'}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-white/50 hover:text-white/80 gap-1 shrink-0"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="w-3.5 h-3.5" />
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (file.size > 2_500_000) {
            toast({ title: 'Image too large (max ~2.5MB)', variant: 'destructive' });
            return;
          }
          try {
            onChange(await fileToDataUrl(file));
          } catch {
            toast({ title: 'Could not read image', variant: 'destructive' });
          }
        }}
      />
    </div>
  );
}

export function PowerEditor({ onClose, embedded }: { onClose: () => void; embedded?: boolean }) {
  const { toast } = useToast();
  const [powers, setPowers] = useState<PowerDefinitionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<PowerDefinitionRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [treeConfig, setTreeConfig] = useState<PowerTreeConfig | null>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/game/power-definitions', { cache: 'no-store' });
      const data = await res.json();
      if (data?.ok) setPowers(data.powers ?? []);
    } catch {
      toast({ title: 'Failed to load powers', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    getPowerTreeConfig().then(setTreeConfig).catch(() => setTreeConfig(null));
  }, [load]);

  const saveTreeConfig = useCallback(
    async (partial: Partial<PowerTreeConfig>) => {
      try {
        const next = await updatePowerTreeConfig(partial);
        setTreeConfig(next);
      } catch (err) {
        toast({
          title: err instanceof Error ? err.message : 'Failed to save background',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const tree = useMemo(() => computeRadialHexLayout(powers), [powers]);

  // Live-preview position while dragging a node, so the connecting lines
  // follow the cursor before the drag commits (see startDragNode).
  const positions = useMemo(() => {
    if (!dragKey || !dragPos) return tree.positions;
    const next = new Map(tree.positions);
    const base = next.get(dragKey);
    next.set(dragKey, { x: dragPos.x, y: dragPos.y, tier: base?.tier ?? 0 });
    return next;
  }, [tree.positions, dragKey, dragPos]);

  const persistPosition = useCallback(
    async (key: string, x: number | null, y: number | null) => {
      const record = powers.find((p) => p.key === key);
      if (!record) return;
      const updated: PowerDefinitionRecord = { ...record, posX: x, posY: y };
      try {
        const res = await fetch('/api/game/power-definitions', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(updated),
        });
        const data = await res.json();
        if (!data.ok) {
          toast({ title: data.error ?? 'Failed to save position', variant: 'destructive' });
          return;
        }
        setPowers((prev) => prev.map((p) => (p.key === key ? updated : p)));
        setDraft((d) => (d && d.key === key ? { ...d, posX: x, posY: y } : d));
      } catch {
        toast({ title: 'Failed to save position', variant: 'destructive' });
      }
    },
    [powers, toast]
  );

  const resetPosition = useCallback(
    (key: string) => {
      void persistPosition(key, null, null);
    },
    [persistPosition]
  );

  /** Pointer-drag a hex node to a new spot on the tree. A tap (no meaningful
   * movement) still opens it for editing instead of persisting a position. */
  const startDragNode = (e: React.PointerEvent, p: PowerDefinitionRecord) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const el = treeRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const downX = e.clientX;
    const downY = e.clientY;
    let moved = false;

    const toTreeSpace = (clientX: number, clientY: number) => ({
      x: clientX - rect.left - tree.centerX,
      y: clientY - rect.top - tree.centerY,
    });

    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - downX, ev.clientY - downY) > 4) moved = true;
      if (!moved) return;
      setDragKey(p.key);
      setDragPos(toTreeSpace(ev.clientX, ev.clientY));
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!moved) {
        selectForEdit(p);
        return;
      }
      const final = toTreeSpace(ev.clientX, ev.clientY);
      setDragKey(null);
      setDragPos(null);
      void persistPosition(p.key, final.x, final.y);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const selectForEdit = (p: PowerDefinitionRecord) => {
    setSelectedKey(p.key);
    setDraft(JSON.parse(JSON.stringify(p)));
  };

  const startCreate = () => {
    setSelectedKey(null);
    setDraft(emptyDraft(powers.length));
  };

  const patchDraft = (partial: Partial<PowerDefinitionRecord>) => {
    setDraft((d) => (d ? { ...d, ...partial } : d));
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.key.trim() || !/^[a-z0-9_]+$/i.test(draft.key.trim())) {
      toast({ title: 'Key must be alphanumeric/underscore', variant: 'destructive' });
      return;
    }
    if (!draft.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const isNew = !selectedKey;
      const res = await fetch('/api/game/power-definitions', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!data.ok) {
        toast({ title: data.error ?? 'Save failed', variant: 'destructive' });
        return;
      }
      toast({ title: isNew ? 'Power created' : 'Power updated', description: draft.name });
      await load();
      setSelectedKey(draft.key);
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: PowerDefinitionRecord) => {
    if (p.isCore) return;
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/game/power-definitions?key=${encodeURIComponent(p.key)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) {
        toast({ title: data.error ?? 'Delete failed', variant: 'destructive' });
        return;
      }
      toast({ title: 'Power deleted', description: p.name });
      if (selectedKey === p.key) {
        setSelectedKey(null);
        setDraft(null);
      }
      await load();
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  return (
    <div
      className={
        embedded
          ? 'flex flex-col h-full min-h-0 w-full bg-slate-950/95'
          : 'fixed inset-0 z-[3000] flex flex-col bg-slate-950/95 backdrop-blur-md'
      }
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span className="text-sm font-black text-white tracking-tight">Power Editor</span>
          <span className="text-[10px] text-white/40 font-bold">
            {powers.length} power{powers.length === 1 ? '' : 's'}
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-wide text-sky-300 border border-sky-400/40 bg-sky-500/10 rounded-full px-2 py-0.5"
            title="Powers are shared account-wide — changes here apply to every map, in every mode, not just the one currently open."
          >
            Account-wide, not per-map
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedKey ?? ''}
            onChange={(e) => {
              const p = powers.find((pw) => pw.key === e.target.value);
              if (p) selectForEdit(p);
            }}
            className="bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white/80 max-w-[220px]"
            title="Jump straight to a power to edit it — faster than hunting for it in the tree, especially for newly auto-created ones."
          >
            <option value="" disabled>
              Jump to power…
            </option>
            {[...powers]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                  {p.key.startsWith('custom_move_') ? ' (custom move)' : ''}
                </option>
              ))}
          </select>
          <Button size="sm" variant="ghost" onClick={load} className="text-white/50 hover:text-white/80 gap-1">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={startCreate} className="gap-1 bg-emerald-500 hover:bg-emerald-400 text-black">
            <Plus className="w-3.5 h-3.5" />
            New Power
          </Button>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10 text-white/60">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Tree view */}
        <div className="flex-1 min-w-0 overflow-auto p-6 relative">
          {treeConfig && (treeConfig.backgroundUrl || treeConfig.backgroundColor) && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: treeConfig.backgroundUrl ? `url(${treeConfig.backgroundUrl})` : undefined,
                backgroundColor: treeConfig.backgroundColor || undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: treeConfig.backgroundOpacity,
              }}
            />
          )}
          <div className="relative">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[10px] text-white/30">
                Drag a node to rearrange the skill tree — connecting lines follow live and the new
                position saves the moment you let go. Tap a node (no drag) to edit it.
              </p>
              {treeConfig && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="color"
                    value={treeConfig.backgroundColor || '#000000'}
                    onChange={(e) => void saveTreeConfig({ backgroundColor: e.target.value })}
                    className="w-6 h-6 rounded border border-white/10 bg-transparent cursor-pointer"
                    title="Background color"
                  />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={treeConfig.backgroundOpacity}
                    onChange={(e) => void saveTreeConfig({ backgroundOpacity: Number(e.target.value) })}
                    className="w-16"
                    title="Background opacity"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2 text-white/50 hover:text-white/80 gap-1"
                    onClick={() => bgFileRef.current?.click()}
                  >
                    <ImageIcon className="w-3 h-3" />
                    Background
                  </Button>
                  {(treeConfig.backgroundUrl || treeConfig.backgroundColor) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-white/40 hover:text-white/70"
                      title="Clear background"
                      onClick={() => void saveTreeConfig({ backgroundUrl: '', backgroundColor: '' })}
                    >
                      <Eraser className="w-3 h-3" />
                    </Button>
                  )}
                  <input
                    ref={bgFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      if (file.size > 2_500_000) {
                        toast({ title: 'Image too large (max ~2.5MB)', variant: 'destructive' });
                        return;
                      }
                      try {
                        const dataUrl = await fileToDataUrl(file);
                        await saveTreeConfig({ backgroundUrl: dataUrl });
                      } catch {
                        toast({ title: 'Could not read image', variant: 'destructive' });
                      }
                    }}
                  />
                </div>
              )}
            </div>
          {loading ? (
            <p className="text-white/40 text-sm">Loading…</p>
          ) : (
            <div ref={treeRef} className="relative" style={{ width: tree.width, height: tree.height }}>
              <svg className="absolute inset-0 pointer-events-none" width={tree.width} height={tree.height}>
                {powers.map((p) =>
                  (p.prerequisites ?? []).map((prereq) => {
                    const from = positions.get(prereq.key);
                    const to = positions.get(p.key);
                    if (!from || !to) return null;
                    return (
                      <line
                        key={`${prereq.key}->${p.key}`}
                        x1={tree.centerX + from.x}
                        y1={tree.centerY + from.y}
                        x2={tree.centerX + to.x}
                        y2={tree.centerY + to.y}
                        stroke="rgba(56,189,248,0.4)"
                        strokeWidth={2}
                      />
                    );
                  })
                )}
              </svg>

              {/* Central hex — represents the player/account, everything else orbits it */}
              <div
                className="absolute flex items-center justify-center border-2 border-amber-300/60 bg-gradient-to-b from-amber-500/25 to-black/40 shadow-[0_0_24px_rgba(251,191,36,0.25)]"
                style={{
                  left: tree.centerX - tree.centerHexSize / 2,
                  top: tree.centerY - tree.centerHexSize / 2,
                  width: tree.centerHexSize,
                  height: tree.centerHexSize,
                  clipPath: HEX_CLIP,
                }}
                title="Player"
              >
                <svg viewBox="0 0 64 64" className="w-1/2 h-1/2 opacity-90">
                  <circle cx="32" cy="22" r="12" fill="rgba(253,230,138,0.9)" />
                  <path d="M12 56c2-14 12-20 20-20s18 6 20 20" fill="rgba(253,230,138,0.9)" />
                </svg>
              </div>

              {powers.map((p) => {
                const pos = positions.get(p.key);
                if (!pos) return null;
                const selected = selectedKey === p.key;
                const dragging = dragKey === p.key;
                return (
                  <div
                    key={p.key}
                    onPointerDown={(e) => startDragNode(e, p)}
                    className={`absolute flex flex-col items-center justify-center gap-0.5 border-2 p-1.5 transition text-center touch-none ${
                      dragging
                        ? 'cursor-grabbing border-emerald-400/80 bg-emerald-500/15 shadow-[0_0_18px_rgba(52,211,153,0.35)] z-10'
                        : 'cursor-grab'
                    } ${
                      !dragging && selected
                        ? 'border-sky-400/80 bg-sky-500/15 shadow-[0_0_18px_rgba(56,189,248,0.35)]'
                        : !dragging
                          ? 'border-white/15 bg-white/[0.05] hover:border-white/35'
                          : ''
                    }`}
                    style={{
                      left: tree.centerX + pos.x - tree.hexWidth / 2,
                      top: tree.centerY + pos.y - tree.hexHeight / 2,
                      width: tree.hexWidth,
                      height: tree.hexHeight,
                      clipPath: HEX_CLIP,
                    }}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <PowerIcon icon={p.icon} />
                      {p.isCore ? (
                        <span title="Core power — tunable, not deletable" className="shrink-0 inline-flex">
                          <Lock className="w-2.5 h-2.5 text-white/30" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(p);
                          }}
                          className="text-red-400/70 hover:text-red-300 shrink-0"
                          title="Delete power"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-white font-black text-[10px] leading-tight truncate w-full px-1">{p.name}</p>
                    <p className="text-[8px] text-sky-300/80 leading-tight px-1 truncate w-full">
                      {effectLabelGeneric(p, p.maxLevel)}
                    </p>
                    <p className="text-[8px] text-white/30">
                      Lv gate {p.unlockLevel} · max {p.maxLevel} · {costForLevelFormula(p.cost, 0)}+ pts
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>

        {/* Edit form */}
        <div className="w-[340px] shrink-0 border-l border-white/10 overflow-y-auto p-4 space-y-3">
          {!draft ? (
            <p className="text-[11px] text-white/40">
              Select a power to tune it, or click &ldquo;New Power&rdquo; to create a custom one using a generic effect
              template.
            </p>
          ) : (
            <PowerForm
              draft={draft}
              isNew={!selectedKey}
              allPowers={powers}
              onChange={patchDraft}
              onSave={save}
              saving={saving}
              onResetPosition={selectedKey ? () => resetPosition(draft.key) : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PowerForm({
  draft,
  isNew,
  allPowers,
  onChange,
  onSave,
  saving,
  onResetPosition,
}: {
  draft: PowerDefinitionRecord;
  isNew: boolean;
  allPowers: PowerDefinitionRecord[];
  onChange: (partial: Partial<PowerDefinitionRecord>) => void;
  onSave: () => void;
  saving: boolean;
  onResetPosition?: () => void;
}) {
  const locked = draft.isCore; // effectType/key immutable once core
  const hasManualPosition = typeof draft.posX === 'number' && typeof draft.posY === 'number';

  return (
    <div className="space-y-3">
      <Field label="Key (slug)">
        <input
          className={inputCls}
          value={draft.key}
          disabled={!isNew}
          onChange={(e) => onChange({ key: e.target.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
          placeholder="e.g. ghost_step"
        />
      </Field>
      <Field label="Name">
        <input className={inputCls} value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field label="Icon (emoji or uploaded image)">
        <IconField icon={draft.icon} onChange={(icon) => onChange({ icon })} />
      </Field>
      <Field label="Description">
        <textarea
          className={inputCls}
          rows={2}
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Max Level">
          <input
            type="number"
            className={inputCls}
            value={draft.maxLevel}
            min={1}
            max={50}
            onChange={(e) => onChange({ maxLevel: Math.min(50, Math.max(1, Math.floor(Number(e.target.value) || 1))) })}
          />
        </Field>
        <Field label="Unlock Level (account)">
          <input
            type="number"
            className={inputCls}
            value={draft.unlockLevel}
            min={0}
            onChange={(e) => onChange({ unlockLevel: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          />
        </Field>
      </div>

      <Field label="Cost curve">
        <div className="flex items-center gap-1.5">
          <select
            className={inputCls}
            value={draft.cost.type}
            onChange={(e) =>
              onChange({
                cost:
                  e.target.value === 'flat'
                    ? { type: 'flat', base: draft.cost.base }
                    : { type: 'ramp', base: draft.cost.base, step: draft.cost.type === 'ramp' ? draft.cost.step : 1 },
              })
            }
          >
            <option value="flat">Flat</option>
            <option value="ramp">Ramp (base + step*level)</option>
          </select>
          <input
            type="number"
            className={inputCls + ' w-16'}
            value={draft.cost.base}
            onChange={(e) => onChange({ cost: { ...draft.cost, base: Number(e.target.value) || 0 } })}
            title="base"
          />
          {draft.cost.type === 'ramp' && (
            <input
              type="number"
              className={inputCls + ' w-16'}
              value={draft.cost.step}
              onChange={(e) => onChange({ cost: { ...draft.cost, step: Number(e.target.value) || 0 } as never })}
              title="step"
            />
          )}
        </div>
      </Field>

      <Field label="Prerequisites (skill-tree gating)">
        <PrereqPicker
          value={draft.prerequisites}
          options={allPowers.filter((p) => p.key !== draft.key)}
          onChange={(prerequisites) => onChange({ prerequisites })}
        />
      </Field>

      {onResetPosition && (
        <Field label="Skill-tree node position">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-white/40">
              {hasManualPosition ? 'Manually placed (dragged)' : 'Auto-arranged'}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!hasManualPosition}
              onClick={onResetPosition}
              className="text-white/50 hover:text-white/80 gap-1 h-6 text-[10px] px-2"
            >
              <RefreshCw className="w-3 h-3" />
              Reset to auto
            </Button>
          </div>
        </Field>
      )}

      <Field label="Effect Template">
        <select
          className={inputCls}
          value={draft.effectType}
          disabled={locked}
          onChange={(e) => {
            const t = e.target.value as PowerEffectType;
            const params: PowerDefinitionRecord['effectParams'] =
              t === 'stat_bonus'
                ? ({ bonuses: [{ stat: 'maxHealth', mode: 'additive', perLevel: 5 }] } as StatBonusParams)
                : t === 'timed_buff'
                ? ({
                    buffKind: 'invisibility',
                    durationBaseSec: 2,
                    durationPerLevelSec: 0.5,
                    energyCost: 15,
                    cooldownMs: 10000,
                  } as TimedBuffParams)
                : ({
                    kind: 'radius_damage',
                    radiusBaseMeters: 3,
                    radiusPerLevelMeters: 0.5,
                    damageBase: 15,
                    damagePerLevel: 5,
                    energyCost: 15,
                    cooldownMs: 8000,
                  } as BurstEffectParams);
            onChange({ effectType: t, effectParams: params });
          }}
        >
          <option value="stat_bonus">Stat Bonus (passive, always-on)</option>
          <option value="timed_buff">Timed Buff (press to activate)</option>
          <option value="burst_effect">Burst Effect (instant press)</option>
        </select>
      </Field>

      {draft.effectType === 'stat_bonus' && (
        <StatBonusEditor
          params={draft.effectParams as StatBonusParams}
          onChange={(p) => onChange({ effectParams: p })}
        />
      )}
      {draft.effectType === 'timed_buff' && (
        <TimedBuffEditor
          params={draft.effectParams as TimedBuffParams}
          onChange={(p) => onChange({ effectParams: p })}
        />
      )}
      {draft.effectType === 'burst_effect' && (
        <BurstEffectEditor
          params={draft.effectParams as BurstEffectParams}
          onChange={(p) => onChange({ effectParams: p })}
        />
      )}

      <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-[10px] text-white/40">
        Preview @ max level: <span className="text-sky-300">{effectLabelGeneric(draft, draft.maxLevel)}</span>
      </div>

      {draft.isCore && (
        <p className="text-[9px] text-amber-300/70">
          Core power — key and effect template are locked; you can still tune every number.
        </p>
      )}

      <Button onClick={onSave} disabled={saving} className="w-full gap-1 bg-amber-500 hover:bg-amber-400 text-black">
        <Save className="w-3.5 h-3.5" />
        {saving ? 'Saving…' : isNew ? 'Create Power' : 'Save Changes'}
      </Button>
    </div>
  );
}

function PrereqPicker({
  value,
  options,
  onChange,
}: {
  value: { key: string; level: number }[];
  options: PowerDefinitionRecord[];
  onChange: (v: { key: string; level: number }[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {value.map((p, i) => (
        <div key={p.key} className="flex items-center gap-1.5">
          <span className="flex-1 text-[11px] text-white/70 truncate">
            {options.find((o) => o.key === p.key)?.name ?? p.key}
          </span>
          <input
            type="number"
            className={inputCls + ' w-14'}
            value={p.level}
            min={1}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...next[i], level: Number(e.target.value) || 1 };
              onChange(next);
            }}
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className="text-red-400/70 hover:text-red-300"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <select
        className={inputCls + ' w-full'}
        value=""
        onChange={(e) => {
          const key = e.target.value;
          if (!key || value.some((p) => p.key === key)) return;
          onChange([...value, { key, level: 1 }]);
        }}
      >
        <option value="">+ Add prerequisite…</option>
        {options
          .filter((o) => !value.some((v) => v.key === o.key))
          .map((o) => (
            <option key={o.key} value={o.key}>
              {o.name}
            </option>
          ))}
      </select>
    </div>
  );
}

function StatBonusEditor({
  params,
  onChange,
}: {
  params: StatBonusParams;
  onChange: (p: StatBonusParams) => void;
}) {
  const bonuses = params.bonuses ?? [];
  const setBonus = (i: number, partial: Partial<StatBonusEntry>) => {
    const next = [...bonuses];
    next[i] = { ...next[i], ...partial };
    onChange({ bonuses: next });
  };
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-2">
      {bonuses.map((b, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <select
            className={inputCls + ' flex-1'}
            value={b.stat}
            onChange={(e) => setBonus(i, { stat: e.target.value as StatBonusStat })}
          >
            {STAT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value} disabled={s.wired === false}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className={inputCls + ' w-24'}
            value={b.mode}
            onChange={(e) => setBonus(i, { mode: e.target.value as 'additive' | 'multiplicative' })}
          >
            <option value="additive">Additive</option>
            <option value="multiplicative">Multiplier</option>
          </select>
          <input
            type="number"
            step={0.01}
            className={inputCls + ' w-16'}
            value={b.perLevel}
            onChange={(e) => setBonus(i, { perLevel: Number(e.target.value) || 0 })}
            title="Amount per level"
          />
          <button
            type="button"
            onClick={() => onChange({ bonuses: bonuses.filter((_, idx) => idx !== i) })}
            className="text-red-400/70 hover:text-red-300"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onChange({ bonuses: [...bonuses, { stat: 'maxHealth', mode: 'additive', perLevel: 5 }] })}
        className="text-white/50 gap-1"
      >
        <Plus className="w-3 h-3" />
        Add stat bonus
      </Button>
    </div>
  );
}

function TimedBuffEditor({ params, onChange }: { params: TimedBuffParams; onChange: (p: TimedBuffParams) => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-2">
      <Field label="Wraps existing mechanic">
        <select
          className={inputCls}
          value={params.buffKind}
          onChange={(e) => onChange({ ...params, buffKind: e.target.value as TimedBuffKind })}
        >
          {BUFF_KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Base duration (s)">
          <input
            type="number"
            min={0}
            step={0.1}
            className={inputCls}
            value={params.durationBaseSec}
            onChange={(e) => onChange({ ...params, durationBaseSec: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        <Field label="Per level (s)">
          <input
            type="number"
            min={0}
            step={0.1}
            className={inputCls}
            value={params.durationPerLevelSec}
            onChange={(e) => onChange({ ...params, durationPerLevelSec: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Energy cost to activate (0 = free)">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={params.energyCost ?? 0}
            onChange={(e) => onChange({ ...params, energyCost: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        <Field label="Cooldown ms (0 = none)">
          <input
            type="number"
            min={0}
            step={500}
            className={inputCls}
            value={params.cooldownMs ?? 0}
            onChange={(e) => onChange({ ...params, cooldownMs: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
      </div>
    </div>
  );
}

function BurstEffectEditor({
  params,
  onChange,
}: {
  params: BurstEffectParams;
  onChange: (p: BurstEffectParams) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-2">
      <Field label="Wraps existing mechanic">
        <select
          className={inputCls}
          value={params.kind}
          onChange={(e) => onChange({ ...params, kind: e.target.value as BurstEffectKind })}
        >
          {BURST_KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      {params.kind === 'radius_damage' ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Base radius (m)">
            <input
              type="number"
              min={0}
              step={0.1}
              className={inputCls}
              value={params.radiusBaseMeters ?? 0}
              onChange={(e) => onChange({ ...params, radiusBaseMeters: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Radius / level">
            <input
              type="number"
              min={0}
              step={0.1}
              className={inputCls}
              value={params.radiusPerLevelMeters ?? 0}
              onChange={(e) => onChange({ ...params, radiusPerLevelMeters: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Base damage">
            <input
              type="number"
              min={0}
              className={inputCls}
              value={params.damageBase ?? 0}
              onChange={(e) => onChange({ ...params, damageBase: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Damage / level">
            <input
              type="number"
              min={0}
              className={inputCls}
              value={params.damagePerLevel ?? 0}
              onChange={(e) => onChange({ ...params, damagePerLevel: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Base range (m)">
            <input
              type="number"
              min={0}
              step={0.1}
              className={inputCls}
              value={params.rangeBaseMeters ?? 0}
              onChange={(e) => onChange({ ...params, rangeBaseMeters: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Range / level">
            <input
              type="number"
              min={0}
              step={0.1}
              className={inputCls}
              value={params.rangePerLevelMeters ?? 0}
              onChange={(e) => onChange({ ...params, rangePerLevelMeters: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Base pull (s)">
            <input
              type="number"
              min={0}
              step={0.01}
              className={inputCls}
              value={params.pullDurationBaseSec ?? 0}
              onChange={(e) => onChange({ ...params, pullDurationBaseSec: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Pull / level (s)">
            <input
              type="number"
              min={0}
              step={0.01}
              className={inputCls}
              value={params.pullDurationPerLevelSec ?? 0}
              onChange={(e) => onChange({ ...params, pullDurationPerLevelSec: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Energy cost to activate (0 = free)">
          <input
            type="number"
            min={0}
            className={inputCls}
            value={params.energyCost ?? 0}
            onChange={(e) => onChange({ ...params, energyCost: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        <Field label="Cooldown ms (0 = none)">
          <input
            type="number"
            min={0}
            step={500}
            className={inputCls}
            value={params.cooldownMs ?? 0}
            onChange={(e) => onChange({ ...params, cooldownMs: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
      </div>
    </div>
  );
}
