'use client';

/**
 * Sound Board — admin panel for binding an uploaded .wav/.mp3 clip to every
 * sound-triggering event in the game engine (see shared/sound-events.ts for
 * the full catalog). Lives in the map editor tab bar alongside Power Editor
 * / Weapon Editor, same "own REST API, not the map document" pattern as
 * Power Editor (sounds are account-wide, not per-map).
 *
 * Volume plus a full filter rack (low-cut, high-cut, bass, treble, noise
 * gate) and crop (trim start/end) — all applied client-side via the Web
 * Audio pipeline in src/lib/audio-fx.ts, the same one gameplay playback
 * (soundboard.ts) uses, so Preview here always matches what plays in-game.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Volume2, Upload, Play, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { SOUND_EVENTS, type SoundEventDef, type SoundEventCategory } from '@shared/sound-events';
import { getAudioContext, getProcessedBuffer, playProcessedBuffer, clearProcessedAudioCache, type SoundFxParams } from '@/lib/audio-fx';
import { refreshSoundboard } from '@/components/game/effects/soundboard';
import { getCustomMoveSoundEvents } from '@/lib/custom-move-sound-events';

interface SoundEntry extends SoundFxParams {
  fileUrl: string;
  volume: number;
  fileName: string;
}

interface FxDraft {
  lowCutHz: number;
  highCutHz: number;
  bassGain: number;
  trebleGain: number;
  noiseGateDb: number;
  trimStartMs: number;
  trimEndMs: number | null;
}

const FX_DEFAULT: FxDraft = {
  lowCutHz: 0,
  highCutHz: 0,
  bassGain: 0,
  trebleGain: 0,
  noiseGateDb: 0,
  trimStartMs: 0,
  trimEndMs: null,
};

function fxFromBound(bound: SoundEntry | undefined): FxDraft {
  return {
    lowCutHz: bound?.lowCutHz ?? 0,
    highCutHz: bound?.highCutHz ?? 0,
    bassGain: bound?.bassGain ?? 0,
    trebleGain: bound?.trebleGain ?? 0,
    noiseGateDb: bound?.noiseGateDb ?? 0,
    trimStartMs: bound?.trimStartMs ?? 0,
    trimEndMs: bound?.trimEndMs ?? null,
  };
}

export function SoundBoardEditor({ onClose, embedded }: { onClose: () => void; embedded?: boolean }) {
  const { toast } = useToast();
  const [sounds, setSounds] = useState<Record<string, SoundEntry>>({});
  const [customMoveEvents, setCustomMoveEvents] = useState<SoundEventDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>(SOUND_EVENTS[0].key);
  const [uploading, setUploading] = useState(false);
  const [volumeDraft, setVolumeDraft] = useState(1);
  const [fxDraft, setFxDraft] = useState<FxDraft>(FX_DEFAULT);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Every map-authored custom move auto-registers its own row here (no
  // per-move opt-in needed) — see src/lib/custom-move-sound-events.ts.
  const allEvents = [...SOUND_EVENTS, ...customMoveEvents];
  const categories = Array.from(new Set(allEvents.map((e) => e.category))) as SoundEventCategory[];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, moveEvents] = await Promise.all([
        fetch('/api/admin/sound-definitions', { cache: 'no-store' }),
        getCustomMoveSoundEvents().catch(() => []),
      ]);
      const data = await res.json();
      if (data?.ok) setSounds(data.sounds ?? {});
      setCustomMoveEvents(moveEvents);
    } catch {
      toast({ title: 'Failed to load Sound Board', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedDef = allEvents.find((e) => e.key === selectedKey) ?? SOUND_EVENTS[0];
  const bound = sounds[selectedKey];

  useEffect(() => {
    setVolumeDraft(bound?.volume ?? 1);
    setFxDraft(fxFromBound(bound));
    // Selecting a different event (or a fresh upload replacing this one's
    // clip) invalidates any cached processed buffer for the OLD file at
    // this key — cheap to just drop it, decoding is lazy on next play.
  }, [selectedKey, bound]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('eventKey', selectedKey);
      form.append('file', file);
      form.append('volume', String(volumeDraft));
      const res = await fetch('/api/admin/sound-definitions', { method: 'POST', body: form });
      const data = await res.json();
      if (!data.ok) {
        toast({ title: data.error ?? 'Upload failed', variant: 'destructive' });
        return;
      }
      if (bound?.fileUrl) clearProcessedAudioCache(bound.fileUrl);
      refreshSoundboard();
      toast({ title: 'Sound uploaded', description: selectedDef.label });
      await load();
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  // Dragging a slider fires onChange on every tick — without a debounce
  // this sent one PATCH per pixel of drag, and since each request was
  // fire-and-forget with no sequencing, an earlier request that happened to
  // resolve last could overwrite a later value (last *response* wins instead
  // of last *drag position*). Debounce the network write and use a sequence
  // number so a stale response is ignored once a newer request has gone out.
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitSeq = useRef(0);

  const commitPatch = useCallback(
    (patch: Record<string, number | null>, localMerge: Partial<SoundEntry>) => {
      if (!bound) return;
      if (commitTimer.current) clearTimeout(commitTimer.current);
      const seq = ++commitSeq.current;
      commitTimer.current = setTimeout(async () => {
        try {
          const res = await fetch('/api/admin/sound-definitions', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ eventKey: selectedKey, ...patch }),
          });
          const data = await res.json();
          if (data.ok && seq === commitSeq.current) {
            clearProcessedAudioCache(bound.fileUrl);
            refreshSoundboard();
            setSounds((s) => ({ ...s, [selectedKey]: { ...s[selectedKey], ...localMerge } }));
          }
        } catch {
          // Best-effort — a failed tweak isn't worth a toast.
        }
      }, 250);
    },
    [bound, selectedKey]
  );

  const handleVolumeCommit = (v: number) => {
    setVolumeDraft(v);
    commitPatch({ volume: v }, { volume: v });
  };

  const handleFxCommit = <K extends keyof FxDraft>(key: K, value: FxDraft[K]) => {
    setFxDraft((d) => ({ ...d, [key]: value }));
    commitPatch({ [key]: value } as Record<string, number | null>, { [key]: value } as Partial<SoundEntry>);
  };

  const handleRemove = async () => {
    if (!bound) return;
    if (!confirm(`Remove the sound bound to "${selectedDef.label}"?`)) return;
    try {
      const res = await fetch(`/api/admin/sound-definitions?eventKey=${encodeURIComponent(selectedKey)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.ok) {
        toast({ title: data.error ?? 'Remove failed', variant: 'destructive' });
        return;
      }
      clearProcessedAudioCache(bound.fileUrl);
      refreshSoundboard();
      toast({ title: 'Sound removed', description: selectedDef.label });
      await load();
    } catch {
      toast({ title: 'Remove failed', variant: 'destructive' });
    }
  };

  const handlePreview = async () => {
    if (!bound?.fileUrl) return;
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      previewSourceRef.current?.stop();
      const buffer = await getProcessedBuffer(bound.fileUrl, bound);
      previewSourceRef.current = playProcessedBuffer(ctx, buffer, bound.volume);
    } catch {
      // Autoplay policy before first user gesture, or decode failure — ignore.
    }
  };

  const boundCount = Object.keys(sounds).filter((k) => sounds[k]?.fileUrl).length;
  const totalEventCount = allEvents.length;

  const trimStartSec = fxDraft.trimStartMs / 1000;
  const trimEndSec = fxDraft.trimEndMs != null ? fxDraft.trimEndMs / 1000 : null;

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
          <Volume2 className="w-4 h-4 text-sky-300" />
          <span className="text-sm font-black text-white tracking-tight">Sound Board</span>
          <span className="text-[10px] text-white/40 font-bold">
            {boundCount} / {totalEventCount} events have sound
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-wide text-sky-300 border border-sky-400/40 bg-sky-500/10 rounded-full px-2 py-0.5"
            title="Sounds are shared account-wide — changes here apply to every map, in every mode, not just the one currently open."
          >
            Account-wide, not per-map
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={load} className="text-white/50 hover:text-white/80 gap-1">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10 text-white/60">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Event list, grouped by category */}
        <div className="w-72 shrink-0 border-r border-white/10 overflow-y-auto p-2">
          {loading ? (
            <p className="text-white/40 text-sm p-2">Loading…</p>
          ) : (
            categories.map((cat) => (
              <div key={cat} className="mb-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-white/35 px-2 mb-1">{cat}</p>
                {allEvents.filter((e) => e.category === cat).map((e) => {
                  const has = Boolean(sounds[e.key]?.fileUrl);
                  const selected = e.key === selectedKey;
                  return (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => setSelectedKey(e.key)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors ${
                        selected ? 'bg-sky-500/20 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/85'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${has ? 'bg-emerald-400' : 'bg-white/20'}`} />
                      <span className="truncate">{e.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-w-0 overflow-auto p-6">
          <p className="text-[10px] font-black uppercase tracking-wide text-sky-300/70 mb-1">
            {selectedDef.category}
          </p>
          <h3 className="text-lg font-black text-white mb-1">{selectedDef.label}</h3>
          {selectedDef.description && <p className="text-xs text-white/50 mb-4">{selectedDef.description}</p>}
          <p className="text-[10px] text-white/30 font-mono mb-6">event key: {selectedDef.key}</p>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4 max-w-md">
            {bound?.fileUrl ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-white font-bold truncate">{bound.fileName || 'Uploaded clip'}</p>
                  <p className="text-[10px] text-white/40">Bound — plays whenever this event fires</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={handlePreview} className="text-emerald-300 hover:text-emerald-200">
                    <Play className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleRemove} className="text-red-300 hover:text-red-200">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-white/40">No sound uploaded yet — this event is silent.</p>
            )}

            <div>
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Volume</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volumeDraft}
                  onChange={(e) => handleVolumeCommit(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-xs text-white/60 tabular-nums w-10 text-right">
                  {Math.round(volumeDraft * 100)}%
                </span>
              </div>
            </div>

            {/* --- Filter rack: crop + EQ + noise gate, only meaningful once a clip is bound --- */}
            <div className={`space-y-3 pt-1 ${bound?.fileUrl ? '' : 'opacity-40 pointer-events-none'}`}>
              <p className="text-[10px] font-black text-white/40 uppercase tracking-wide border-t border-white/10 pt-3">
                Crop &amp; EQ
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Trim start (s)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.05}
                    value={trimStartSec.toFixed(2)}
                    onChange={(e) => {
                      const sec = Math.max(0, Number(e.target.value) || 0);
                      handleFxCommit('trimStartMs', Math.round(sec * 1000));
                    }}
                    className="w-full mt-1 rounded bg-black/30 border border-white/10 px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Trim end (s)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.05}
                    placeholder="end of clip"
                    value={trimEndSec != null ? trimEndSec.toFixed(2) : ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const ms = raw === '' ? null : Math.max(0, Math.round((Number(raw) || 0) * 1000));
                      handleFxCommit('trimEndMs', ms);
                    }}
                    className="w-full mt-1 rounded bg-black/30 border border-white/10 px-2 py-1 text-xs text-white placeholder:text-white/25"
                  />
                </div>
              </div>

              <FxSlider
                label="Low cut"
                hint="removes rumble/hum below this frequency"
                value={fxDraft.lowCutHz}
                min={0}
                max={1000}
                step={10}
                unit="Hz"
                offValue={0}
                onCommit={(v) => handleFxCommit('lowCutHz', v)}
              />
              <FxSlider
                label="High cut"
                hint="removes hiss/harshness above this frequency"
                value={fxDraft.highCutHz}
                min={0}
                max={20000}
                step={100}
                unit="Hz"
                offValue={0}
                onCommit={(v) => handleFxCommit('highCutHz', v)}
              />
              <FxSlider
                label="Bass"
                hint="low-shelf gain (~200Hz)"
                value={fxDraft.bassGain}
                min={-24}
                max={24}
                step={1}
                unit="dB"
                offValue={0}
                onCommit={(v) => handleFxCommit('bassGain', v)}
              />
              <FxSlider
                label="Treble"
                hint="high-shelf gain (~4kHz)"
                value={fxDraft.trebleGain}
                min={-24}
                max={24}
                step={1}
                unit="dB"
                offValue={0}
                onCommit={(v) => handleFxCommit('trebleGain', v)}
              />
              <FxSlider
                label="Noise gate"
                hint="silences anything quieter than this threshold"
                value={fxDraft.noiseGateDb}
                min={-60}
                max={0}
                step={1}
                unit="dB"
                offValue={0}
                offLabel="Off"
                onCommit={(v) => handleFxCommit('noiseGateDb', v === 0 ? 0 : v)}
              />
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/wav,audio/mpeg,.wav,.mp3"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                  e.target.value = '';
                }}
              />
              <Button
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5 bg-sky-500 hover:bg-sky-400 text-black w-full"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Uploading…' : bound?.fileUrl ? 'Replace .wav / .mp3' : 'Upload .wav / .mp3'}
              </Button>
              <p className="text-[9px] text-white/30 mt-1.5">
                Max ~5MB. .wav or .mp3 only. Replacing a clip resets crop/EQ below.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One filter-rack row: a slider that reads as "Off" at `offValue` (skipped
 * entirely by the audio pipeline — see hasAnyFx in src/lib/audio-fx.ts). */
function FxSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  offValue,
  offLabel = 'Off',
  onCommit,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  offValue: number;
  offLabel?: string;
  onCommit: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">{label}</label>
        <span className="text-[9px] text-white/30">{hint}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onCommit(Number(e.target.value))}
          className="flex-1"
        />
        <span className="text-xs text-white/60 tabular-nums w-14 text-right">
          {value === offValue ? offLabel : `${value > 0 && unit === 'dB' ? '+' : ''}${value}${unit}`}
        </span>
      </div>
    </div>
  );
}
