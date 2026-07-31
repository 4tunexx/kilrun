'use client';

/**
 * Sound Board — admin panel for binding an uploaded .wav/.mp3 clip to every
 * sound-triggering event in the game engine (see shared/sound-events.ts for
 * the full catalog). Lives in the map editor tab bar alongside Power Editor
 * / Weapon Editor, same "own REST API, not the map document" pattern as
 * Power Editor (sounds are account-wide, not per-map).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Volume2, Upload, Play, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { SOUND_EVENTS, getSoundEventCategories } from '@shared/sound-events';

interface SoundEntry {
  fileUrl: string;
  volume: number;
  fileName: string;
}

export function SoundBoardEditor({ onClose, embedded }: { onClose: () => void; embedded?: boolean }) {
  const { toast } = useToast();
  const [sounds, setSounds] = useState<Record<string, SoundEntry>>({});
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>(SOUND_EVENTS[0].key);
  const [uploading, setUploading] = useState(false);
  const [volumeDraft, setVolumeDraft] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sound-definitions', { cache: 'no-store' });
      const data = await res.json();
      if (data?.ok) setSounds(data.sounds ?? {});
    } catch {
      toast({ title: 'Failed to load Sound Board', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedDef = SOUND_EVENTS.find((e) => e.key === selectedKey) ?? SOUND_EVENTS[0];
  const bound = sounds[selectedKey];
  const categories = getSoundEventCategories();

  useEffect(() => {
    setVolumeDraft(bound?.volume ?? 1);
  }, [selectedKey, bound?.volume]);

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
      toast({ title: 'Sound uploaded', description: selectedDef.label });
      await load();
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleVolumeCommit = async (v: number) => {
    setVolumeDraft(v);
    if (!bound) return;
    try {
      const res = await fetch('/api/admin/sound-definitions', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventKey: selectedKey, volume: v }),
      });
      const data = await res.json();
      if (data.ok) {
        setSounds((s) => ({ ...s, [selectedKey]: { ...s[selectedKey], volume: v } }));
      }
    } catch {
      // Best-effort — a failed volume tweak isn't worth a toast.
    }
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
      toast({ title: 'Sound removed', description: selectedDef.label });
      await load();
    } catch {
      toast({ title: 'Remove failed', variant: 'destructive' });
    }
  };

  const handlePreview = () => {
    if (!bound?.fileUrl) return;
    if (!previewRef.current) previewRef.current = new Audio();
    previewRef.current.src = bound.fileUrl;
    previewRef.current.volume = bound.volume;
    void previewRef.current.play().catch(() => {});
  };

  const boundCount = Object.keys(sounds).filter((k) => sounds[k]?.fileUrl).length;

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
            {boundCount} / {SOUND_EVENTS.length} events have sound
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
                {SOUND_EVENTS.filter((e) => e.category === cat).map((e) => {
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
              <p className="text-[9px] text-white/30 mt-1.5">Max ~5MB. .wav or .mp3 only.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
