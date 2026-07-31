/**
 * Client playback engine for the admin-uploaded Sound Board. Fetches the
 * event->file map once (cached in-memory for the session) from
 * /api/admin/sound-definitions, then plays a pooled HTMLAudioElement per
 * event key on demand. Silently no-ops for any event with nothing uploaded
 * yet — that's the expected state for most events until an admin populates
 * the board, so callers can fire playSound() unconditionally at every
 * trigger point without checking "is this wired up yet".
 */

interface SoundEntry {
  fileUrl: string;
  volume: number;
}

let cache: Record<string, SoundEntry> = {};
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const audioPool = new Map<string, HTMLAudioElement[]>();
const POOL_SIZE_PER_EVENT = 6;

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
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  void ensureLoaded().then(() => {
    const entry = cache[eventKey];
    if (!entry?.fileUrl) return;
    try {
      let pool = audioPool.get(eventKey);
      if (!pool) {
        pool = [];
        audioPool.set(eventKey, pool);
      }
      // Reuse a free element so rapid repeats (multi-pellet hits, fast
      // footsteps) don't spawn unbounded Audio() instances.
      let audio = pool.find((a) => a.paused || a.ended);
      if (!audio) {
        audio = new Audio();
        if (pool.length < POOL_SIZE_PER_EVENT) pool.push(audio);
      }
      if (audio.src !== entry.fileUrl) audio.src = entry.fileUrl;
      audio.volume = Math.max(0, Math.min(1, (opts?.volume ?? 1) * entry.volume));
      audio.currentTime = 0;
      void audio.play().catch(() => {
        // Autoplay policy before first user gesture — expected, ignore.
      });
    } catch {
      // Never let audio playback break gameplay.
    }
  });
}
