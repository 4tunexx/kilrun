'use client';

/**
 * Global "Controls" panel — view and rebind every keyboard action (movement,
 * core actions, the 7 power keys) from one place. Unlike every other Studio
 * tab (Weapon/Combat/Powers/Sound/etc.), this is NOT per-map: it's stored on
 * the SiteSettings singleton (see src/lib/key-bindings-config.ts) and
 * applies to every map, every live match, and Play Test alike — per product
 * decision (map-specific control schemes would let different maps fight
 * over what a key does, which is worse than one consistent scheme players
 * can learn once).
 *
 * Also lists the *current* map's custom moves (read-only reference, edited
 * in Player Model Studio → Moves) so an author sees the full picture — every
 * key in play — in one screen, with live conflict detection across both.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Keyboard, RotateCcw, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getKeyBindings, updateKeyBindings } from '@/lib/key-bindings-config';
import {
  DEFAULT_KEY_BINDINGS,
  KEY_BIND_ACTIONS,
  canonicalBindKey,
  findConflicts,
  formatBindKey,
  isValidBindKey,
  type KeyBindAction,
  type KeyBindGroup,
} from '@shared/key-bindings';
import type { CustomMoveDef } from './map-document';

function displayKey(key: string): string {
  return formatBindKey(key).toUpperCase();
}

const GROUPS: KeyBindGroup[] = ['Movement', 'Actions', 'Interface', 'Powers'];

export function ControlsPanel({
  onClose,
  embedded,
  customMoves,
}: {
  onClose: () => void;
  embedded?: boolean;
  customMoves?: CustomMoveDef[];
}) {
  const { toast } = useToast();
  const [saved, setSaved] = useState<Record<KeyBindAction, string>>(DEFAULT_KEY_BINDINGS);
  const [draft, setDraft] = useState<Record<KeyBindAction, string>>(DEFAULT_KEY_BINDINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listeningFor, setListeningFor] = useState<KeyBindAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const bindings = await getKeyBindings();
      setSaved(bindings);
      setDraft(bindings);
    } catch {
      toast({ title: 'Failed to load controls', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Capture the next physical keypress or mouse button while rebinding a slot.
  useEffect(() => {
    if (!listeningFor) return;
    const applyBind = (raw: string) => {
      const normalized = canonicalBindKey(raw);
      if (!isValidBindKey(normalized)) {
        toast({ title: `"${raw}" can't be bound`, variant: 'destructive' });
        setListeningFor(null);
        return;
      }
      setDraft((prev) => ({ ...prev, [listeningFor]: normalized }));
      const conflicts = findConflicts({ ...draft, [listeningFor]: normalized }, normalized, listeningFor);
      if (conflicts.length > 0) {
        toast({
          title: 'Key already in use',
          description: `"${displayKey(normalized)}" is also bound to ${conflicts
            .map((c) => c.label)
            .join(', ')}. You can still save, but one of them won't fire reliably.`,
          variant: 'destructive',
        });
      }
      const customConflict = (customMoves ?? []).find(
        (m) => canonicalBindKey(m.key) === normalized
      );
      if (customConflict) {
        toast({
          title: 'Key already in use',
          description: `"${displayKey(normalized)}" is used by this map's custom move "${customConflict.name}" (Player Model Studio → Moves).`,
          variant: 'destructive',
        });
      }
      setListeningFor(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'Escape' && listeningFor !== 'pause') {
        setListeningFor(null);
        return;
      }
      applyBind(e.key === ' ' ? ' ' : e.key);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.button === 0 && target?.closest('button, input, a, [data-rebind]')) return;
      e.preventDefault();
      applyBind(`mouse${e.button}`);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('contextmenu', onContextMenu, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('mousedown', onMouseDown, { capture: true });
      window.removeEventListener('contextmenu', onContextMenu, { capture: true });
    };
  }, [listeningFor, draft, customMoves, toast]);

  const dirty = GROUPS.flatMap((g) => KEY_BIND_ACTIONS.filter((a) => a.group === g)).some(
    (meta) => draft[meta.action] !== saved[meta.action]
  );

  const allConflicts = KEY_BIND_ACTIONS.flatMap((meta) =>
    findConflicts(draft, draft[meta.action], meta.action).length > 0 ? [meta] : []
  );

  const handleSave = async () => {
    if (allConflicts.length > 0) {
      toast({
        title: 'Resolve conflicts before saving',
        description: `${allConflicts.map((m) => m.label).join(', ')} share a key with something else.`,
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const next = await updateKeyBindings(draft);
      setSaved(next);
      setDraft(next);
      toast({ title: 'Controls saved', description: 'Applies to every map, live matches, and Play Test.' });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to save controls',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(DEFAULT_KEY_BINDINGS);
    toast({ title: 'Reset to defaults', description: 'Click Save to apply.' });
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
          <Keyboard className="w-4 h-4 text-cyan-300" />
          <span className="text-sm font-black text-white tracking-tight">Controls</span>
          <span
            className="text-[10px] font-bold uppercase tracking-wide text-sky-300 border border-sky-400/40 bg-sky-500/10 rounded-full px-2 py-0.5"
            title="One scheme for the whole platform — changes here apply to every map, every live match, and Play Test, not just the one currently open."
          >
            Global, not per-map
          </span>
          {dirty && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-300 border border-amber-400/40 bg-amber-500/10 rounded-full px-2 py-0.5">
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleReset} className="text-white/50 hover:text-white/80 gap-1">
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to defaults
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="gap-1 bg-emerald-500 hover:bg-emerald-400 text-black disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </Button>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10 text-white/60">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
        {loading ? (
          <p className="text-sm text-white/50">Loading…</p>
        ) : (
          <>
            {GROUPS.map((group) => (
              <div key={group} className="space-y-1.5">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-white/40">{group}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {KEY_BIND_ACTIONS.filter((meta) => meta.group === group).map((meta) => {
                    const key = draft[meta.action];
                    const conflicts = findConflicts(draft, key, meta.action);
                    const customConflict = (customMoves ?? []).find(
                      (m) => canonicalBindKey(m.key) === canonicalBindKey(key)
                    );
                    const hasConflict = conflicts.length > 0 || Boolean(customConflict);
                    const isListening = listeningFor === meta.action;
                    return (
                      <div
                        key={meta.action}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${
                          hasConflict ? 'border-rose-400/50 bg-rose-500/5' : 'border-white/10 bg-black/25'
                        }`}
                      >
                        <span className="text-[12px] text-white/80">{meta.label}</span>
                        <button
                          type="button"
                          onClick={() => setListeningFor(meta.action)}
                          data-rebind=""
                          title={hasConflict ? 'Key conflict — click to rebind' : 'Click to rebind'}
                          className={`shrink-0 min-w-[64px] text-center rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wide border ${
                            isListening
                              ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200 animate-pulse'
                              : hasConflict
                                ? 'border-rose-400/60 bg-rose-500/15 text-rose-200'
                                : 'border-white/15 bg-white/5 text-white/70 hover:border-cyan-400/40 hover:text-white'
                          }`}
                        >
                          {isListening ? 'Press key or mouse…' : displayKey(key)}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-white/40">
                This map&apos;s custom moves (read-only — edit in Player Model Studio → Moves)
              </h3>
              {(customMoves ?? []).length === 0 ? (
                <p className="text-[11px] text-white/40">No custom moves on this map.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {(customMoves ?? []).map((m) => {
                    const conflicts = findConflicts(draft, m.key);
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${
                          conflicts.length > 0 ? 'border-rose-400/50 bg-rose-500/5' : 'border-white/10 bg-black/25'
                        }`}
                      >
                        <span className="text-[12px] text-white/80">{m.name}</span>
                        <span
                          className={`shrink-0 min-w-[64px] text-center rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wide border ${
                            conflicts.length > 0
                              ? 'border-rose-400/60 bg-rose-500/15 text-rose-200'
                              : 'border-white/15 bg-white/5 text-white/70'
                          }`}
                        >
                          {displayKey(m.key)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
