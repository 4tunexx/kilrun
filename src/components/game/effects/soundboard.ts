/**
 * Client playback engine for the admin-uploaded Sound Board. Fetches the
 * event->file map once (cached in-memory for the session) from
 * /api/admin/sound-definitions, then plays each event through the shared
 * Web Audio pipeline (src/lib/audio-fx.ts) — crop/EQ/noise-gate applied,
 * decoded+processed buffer cached per event so repeat fires (footsteps,
 * multi-pellet hits) are cheap. Silently no-ops for any event with nothing
 * uploaded yet — that's the expected state for most events until an admin
 * populates the board, so callers can fire playSound() unconditionally at
 * every trigger point without checking "is this wired up yet".
 */

import { getAudioContext, getProcessedBuffer, type SoundFxParams } from '@/lib/audio-fx';

interface SoundEntry extends SoundFxParams {
  fileUrl: string;
  volume: number;
}

let cache: Record<string, SoundEntry> = {};
let loaded = false;
let loadedAt = 0;
let loadingPromise: Promise<void> | null = null;
// Caps rapid repeats (multi-pellet hits, fast footsteps) from stacking
// unboundedly loud/overlapping voices for the same event.
const activeVoices = new Map<string, number>();
const MAX_CONCURRENT_PER_EVENT = 6;
// Safety-net TTL mirroring the 15s server-side cache in
// src/lib/sound-definitions.ts, in case an admin-edit call site forgets to
// invalidate explicitly.
const CACHE_TTL_MS = 15_000;

function ensureLoaded(): Promise<void> {
  if (loaded && Date.now() - loadedAt < CACHE_TTL_MS) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch('/api/admin/sound-definitions')
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { ok?: boolean; sounds?: Record<string, SoundEntry> } | null) => {
      if (data?.ok && data.sounds) cache = data.sounds;
      loaded = true;
      loadedAt = Date.now();
    })
    .catch(() => {
      // Never retry-storm on failure — just stay silent for the session.
      loaded = true;
      loadedAt = Date.now();
    })
    .finally(() => {
      loadingPromise = null;
    });
  return loadingPromise;
}

/** Call once when entering a match to warm the cache before the first
 * gameplay event fires (avoids a missed sound on the very first trigger). */
export function preloadSoundboard(): void {
  void ensureLoaded();
}

/** Invalidate the in-memory sound-definitions cache so the next playSound
 * (or preloadSoundboard) call re-fetches fresh data. Call this after an
 * admin edits/saves a sound definition (see sound-board-editor.tsx) so
 * test-play doesn't keep using stale (e.g. un-cropped) audio. */
export function refreshSoundboard(): void {
  loaded = false;
  loadedAt = 0;
  loadingPromise = null;
  void ensureLoaded();
}

// Active looping voices (e.g. sprint-while-held), keyed by eventKey, so a
// caller can start a loop once and stop it later without tracking the node.
const loopVoices = new Map<string, AudioBufferSourceNode>();

/** Start looping playback for a game-engine event (see shared/sound-events.ts
 * for valid keys) and keep it playing until stopLoopedSound(eventKey) is
 * called. Safe to call repeatedly while already looping — it's a no-op in
 * that case, so callers can invoke it every frame while a held input
 * (e.g. sprint) is active. No-ops if nothing is bound to the event. */
export function playLoopedSound(eventKey: string, opts?: { volume?: number }): void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
  if (loopVoices.has(eventKey)) return;
  void ensureLoaded().then(async () => {
    if (loopVoices.has(eventKey)) return;
    const entry = cache[eventKey];
    if (!entry?.fileUrl) return;
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const buffer = await getProcessedBuffer(entry.fileUrl, entry);
      if (loopVoices.has(eventKey)) return; // lost a race while awaiting decode
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, (opts?.volume ?? 1) * entry.volume));
      src.connect(gain).connect(ctx.destination);
      src.onended = () => {
        if (loopVoices.get(eventKey) === src) loopVoices.delete(eventKey);
      };
      src.start();
      loopVoices.set(eventKey, src);
    } catch {
      // Never let audio playback break gameplay.
    }
  });
}

/** Stop a loop previously started with playLoopedSound(eventKey). No-op if
 * nothing is currently looping for that event. */
export function stopLoopedSound(eventKey: string): void {
  const src = loopVoices.get(eventKey);
  if (!src) return;
  loopVoices.delete(eventKey);
  try {
    src.onended = null;
    src.stop();
  } catch {
    // Already stopped/ended — fine.
  }
}

/** Play `eventKey`, falling back to `fallbackKey` when no clip is bound to it.
 * Lets a specific cue (monster_hit) degrade to its generic parent (hit_dealt)
 * on sound boards that never filled the specific slot. */
export function playSoundOrFallback(
  eventKey: string,
  fallbackKey: string,
  opts?: { volume?: number }
): void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
  void ensureLoaded().then(() => {
    playSound(cache[eventKey]?.fileUrl ? eventKey : fallbackKey, opts);
  });
}

/** Fire-and-forget playback for a game-engine event (see
 * shared/sound-events.ts for valid keys). No-ops if nothing is bound. */
export function playSound(eventKey: string, opts?: { volume?: number }): void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
  void ensureLoaded().then(async () => {
    const entry = cache[eventKey];
    if (!entry?.fileUrl) return;
    const active = activeVoices.get(eventKey) ?? 0;
    if (active >= MAX_CONCURRENT_PER_EVENT) return;
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const buffer = await getProcessedBuffer(entry.fileUrl, entry);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, (opts?.volume ?? 1) * entry.volume));
      src.connect(gain).connect(ctx.destination);
      activeVoices.set(eventKey, active + 1);
      src.onended = () => {
        activeVoices.set(eventKey, Math.max(0, (activeVoices.get(eventKey) ?? 1) - 1));
      };
      src.start();
    } catch {
      // Never let audio playback break gameplay.
    }
  });
}
