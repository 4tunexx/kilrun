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
let loadingPromise: Promise<void> | null = null;
// Caps rapid repeats (multi-pellet hits, fast footsteps) from stacking
// unboundedly loud/overlapping voices for the same event.
const activeVoices = new Map<string, number>();
const MAX_CONCURRENT_PER_EVENT = 6;

function ensureLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch('/api/admin/sound-definitions')
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { ok?: boolean; sounds?: Record<string, SoundEntry> } | null) => {
      if (data?.ok && data.sounds) cache = data.sounds;
      loaded = true;
    })
    .catch(() => {
      // Never retry-storm on failure — just stay silent for the session.
      loaded = true;
    });
  return loadingPromise;
}

/** Call once when entering a match to warm the cache before the first
 * gameplay event fires (avoids a missed sound on the very first trigger). */
export function preloadSoundboard(): void {
  void ensureLoaded();
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
