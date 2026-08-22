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
import { absolutizeSiteAssetUrl, publicSiteUrl } from '@/lib/engine/runtime';

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
const CACHE_TTL_MS = 15_000;
let masterVolume = 1;
let sfxVolume = 1;
let musicVolume = 1;
let musicDuck = 1;

export function getMasterVolume(): number {
  return masterVolume;
}

function clamp01(volume: number, fallback = 1): number {
  return Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : fallback));
}

export function setMasterVolume(volume: number): void {
  masterVolume = clamp01(volume);
  applyLoopGains();
}

export function setSfxVolume(volume: number): void {
  sfxVolume = clamp01(volume);
  applyLoopGains();
}

export function setMusicVolume(volume: number): void {
  musicVolume = clamp01(volume);
  applyLoopGains();
}

/** 1 = full music, ~0.22 ducks the bed under the pause menu. */
export function setMusicDuck(factor: number): void {
  musicDuck = clamp01(factor);
  applyLoopGains();
}

export function applyPlayerMatchAudio(settings: {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
}): void {
  masterVolume = clamp01(settings.masterVolume);
  sfxVolume = clamp01(settings.sfxVolume);
  musicVolume = clamp01(settings.musicVolume);
  applyLoopGains();
}

function busFor(eventKey: string): 'music' | 'sfx' {
  return eventKey.startsWith('music_') ? 'music' : 'sfx';
}

function mixedVolume(
  optsVolume: number | undefined,
  entryVolume: number,
  bus: 'music' | 'sfx'
): number {
  const busVol = bus === 'music' ? musicVolume * musicDuck : sfxVolume;
  return Math.max(0, Math.min(1, (optsVolume ?? 1) * entryVolume * masterVolume * busVol));
}

export function normalizeSoundEntries<T extends { fileUrl: string }>(
  sounds: Record<string, T>
): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [key, entry] of Object.entries(sounds)) {
    next[key] = {
      ...entry,
      fileUrl: absolutizeSiteAssetUrl(entry.fileUrl) ?? entry.fileUrl,
    };
  }
  return next;
}

function ensureLoaded(): Promise<void> {
  if (loaded && Date.now() - loadedAt < CACHE_TTL_MS) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch(publicSiteUrl('/api/admin/sound-definitions'))
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { ok?: boolean; sounds?: Record<string, SoundEntry> } | null) => {
      if (data?.ok && data.sounds) cache = normalizeSoundEntries(data.sounds);
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

type LoopVoice = {
  src: AudioBufferSourceNode;
  gain: GainNode;
  eventKey: string;
  optsVolume: number;
  entryVolume: number;
};

// Active looping voices (e.g. sprint-while-held), keyed by eventKey, so a
// caller can start a loop once and stop it later without tracking the node.
const loopVoices = new Map<string, LoopVoice>();

function applyLoopGains(): void {
  for (const voice of loopVoices.values()) {
    voice.gain.gain.value = mixedVolume(
      voice.optsVolume,
      voice.entryVolume,
      busFor(voice.eventKey)
    );
  }
}

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
      const optsVolume = opts?.volume ?? 1;
      gain.gain.value = mixedVolume(optsVolume, entry.volume, busFor(eventKey));
      src.connect(gain).connect(ctx.destination);
      src.onended = () => {
        if (loopVoices.get(eventKey)?.src === src) loopVoices.delete(eventKey);
      };
      src.start();
      loopVoices.set(eventKey, {
        src,
        gain,
        eventKey,
        optsVolume,
        entryVolume: entry.volume,
      });
    } catch {
      // Never let audio playback break gameplay.
    }
  });
}

/** Stop a loop previously started with playLoopedSound(eventKey). No-op if
 * nothing is currently looping for that event. */
export function stopLoopedSound(eventKey: string): void {
  const voice = loopVoices.get(eventKey);
  if (!voice) return;
  loopVoices.delete(eventKey);
  try {
    voice.src.onended = null;
    voice.src.stop();
  } catch {
    // Already stopped/ended — fine.
  }
}

export function playMenuMusic(): void {
  stopLoopedSound('music_ingame');
  playLoopedSound('music_menu');
}

export function stopMenuMusic(): void {
  stopLoopedSound('music_menu');
}

export function playIngameMusic(): void {
  stopLoopedSound('music_menu');
  playLoopedSound('music_ingame');
}

export function stopIngameMusic(): void {
  stopLoopedSound('music_ingame');
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
      gain.gain.value = mixedVolume(opts?.volume, entry.volume, busFor(eventKey));
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
