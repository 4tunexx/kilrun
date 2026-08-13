/**
 * Client-side Web Audio processing pipeline for Sound Board clips: crop
 * (trim), low/high-cut filters, bass/treble shelving, and a static noise
 * gate. Runs entirely in-browser (fetch + decodeAudioData + an
 * OfflineAudioContext render pass) so uploaded .wav/.mp3 files never need
 * server-side DSP — the same processed AudioBuffer is used for both the
 * admin panel's preview button and actual gameplay playback (soundboard.ts).
 *
 * Results are cached per (url + param set) so repeated playSound() calls
 * don't re-decode/re-render every time.
 */

export interface SoundFxParams {
  /** Crop: ms offset into the source clip where playback starts. */
  trimStartMs?: number | null;
  /** Crop: ms offset into the source clip where playback ends (null = to the end). */
  trimEndMs?: number | null;
  /** High-pass cutoff Hz — attenuates everything below this (rumble/hum). */
  lowCutHz?: number | null;
  /** Low-pass cutoff Hz — attenuates everything above this (hiss). */
  highCutHz?: number | null;
  /** Low-shelf gain in dB (~200Hz corner). */
  bassGain?: number | null;
  /** High-shelf gain in dB (~4kHz corner). */
  trebleGain?: number | null;
  /** Static noise gate threshold in dBFS — quieter samples are silenced. */
  noiseGateDb?: number | null;
}

type AudioContextCtor = typeof AudioContext;
type OfflineAudioContextCtor = typeof OfflineAudioContext;

function getContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ?? null;
}

function getOfflineContextCtor(): OfflineAudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return (
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: OfflineAudioContextCtor }).webkitOfflineAudioContext ??
    null
  );
}

let sharedCtx: AudioContext | null = null;
/** Lazily-created, page-lifetime-shared AudioContext for gameplay + preview playback. */
export function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    const Ctor = getContextCtor();
    if (!Ctor) throw new Error('Web Audio API unavailable');
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

const rawBufferCache = new Map<string, Promise<AudioBuffer>>();

async function decodeSource(url: string): Promise<AudioBuffer> {
  let pending = rawBufferCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((arrayBuf) => getAudioContext().decodeAudioData(arrayBuf.slice(0)));
    rawBufferCache.set(url, pending);
    pending.catch(() => rawBufferCache.delete(url));
  }
  return pending;
}

function hasAnyFx(fx?: SoundFxParams | null): boolean {
  if (!fx) return false;
  return Boolean(
    fx.trimStartMs || fx.trimEndMs != null || fx.lowCutHz || fx.highCutHz || fx.bassGain || fx.trebleGain || fx.noiseGateDb != null
  );
}

function paramsKey(url: string, fx?: SoundFxParams | null): string {
  if (!hasAnyFx(fx)) return url;
  const f = fx!;
  return [
    url,
    f.trimStartMs ?? '',
    f.trimEndMs ?? '',
    f.lowCutHz ?? '',
    f.highCutHz ?? '',
    f.bassGain ?? '',
    f.trebleGain ?? '',
    f.noiseGateDb ?? '',
  ].join('|');
}

function cloneBuffer(ctx: AudioContext | OfflineAudioContext, src: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    out.copyToChannel(src.getChannelData(ch).slice(), ch);
  }
  return out;
}

function trimBuffer(ctx: AudioContext, src: AudioBuffer, startMs?: number | null, endMs?: number | null): AudioBuffer {
  const sr = src.sampleRate;
  const startSample = Math.max(0, Math.min(src.length, Math.round(((startMs ?? 0) / 1000) * sr)));
  const endSample =
    endMs != null ? Math.max(startSample, Math.min(src.length, Math.round((endMs / 1000) * sr))) : src.length;
  const len = Math.max(1, endSample - startSample);
  if (startSample === 0 && len >= src.length) return src;
  const out = ctx.createBuffer(src.numberOfChannels, len, sr);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    out.copyToChannel(src.getChannelData(ch).subarray(startSample, startSample + len), ch);
  }
  return out;
}

function applyNoiseGate(buffer: AudioBuffer, thresholdDb?: number | null): void {
  if (thresholdDb == null) return;
  const linThresh = Math.pow(10, thresholdDb / 20);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) < linThresh) data[i] = 0;
    }
  }
}

async function applyFilters(buffer: AudioBuffer, fx: SoundFxParams): Promise<AudioBuffer> {
  const needsFilter = Boolean(fx.lowCutHz || fx.highCutHz || fx.bassGain || fx.trebleGain);
  if (!needsFilter) return buffer;
  const OfflineCtor = getOfflineContextCtor();
  if (!OfflineCtor) return buffer;
  const offline = new OfflineCtor(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  let node: AudioNode = source;
  if (fx.lowCutHz) {
    const hp = offline.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = fx.lowCutHz;
    node.connect(hp);
    node = hp;
  }
  if (fx.highCutHz) {
    const lp = offline.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = fx.highCutHz;
    node.connect(lp);
    node = lp;
  }
  if (fx.bassGain) {
    const shelf = offline.createBiquadFilter();
    shelf.type = 'lowshelf';
    shelf.frequency.value = 200;
    shelf.gain.value = fx.bassGain;
    node.connect(shelf);
    node = shelf;
  }
  if (fx.trebleGain) {
    const shelf = offline.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 4000;
    shelf.gain.value = fx.trebleGain;
    node.connect(shelf);
    node = shelf;
  }
  node.connect(offline.destination);
  source.start();
  return offline.startRendering();
}

const processedCache = new Map<string, Promise<AudioBuffer>>();

/** Decode + crop + filter + gate a sound clip once per distinct param set, cached thereafter. */
export async function getProcessedBuffer(url: string, fx?: SoundFxParams | null): Promise<AudioBuffer> {
  const key = paramsKey(url, fx);
  const cached = processedCache.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const raw = await decodeSource(url);
    if (!hasAnyFx(fx)) return raw;
    const ctx = getAudioContext();
    let buf = trimBuffer(ctx, raw, fx!.trimStartMs, fx!.trimEndMs);
    buf = await applyFilters(buf, fx!);
    if (fx!.noiseGateDb != null) {
      // trimBuffer/applyFilters both return fresh buffers UNLESS both were
      // no-ops, in which case `buf` still aliases the shared cached decode —
      // never mutate that in place, or the gate bakes into every other
      // event/preview sharing the same source file.
      if (buf === raw) buf = cloneBuffer(ctx, raw);
      applyNoiseGate(buf, fx!.noiseGateDb);
    }
    return buf;
  })();
  processedCache.set(key, pending);
  pending.catch(() => processedCache.delete(key));
  return pending;
}

/** Drop cached decodes/renders for one file (or everything) — call after re-uploading or re-tuning a clip. */
export function clearProcessedAudioCache(url?: string): void {
  if (!url) {
    processedCache.clear();
    rawBufferCache.clear();
    return;
  }
  for (const key of Array.from(processedCache.keys())) {
    if (key === url || key.startsWith(`${url}|`)) processedCache.delete(key);
  }
  rawBufferCache.delete(url);
}

/** Play a processed buffer through a GainNode for per-call volume; returns the source node. */
export function playProcessedBuffer(ctx: AudioContext, buffer: AudioBuffer, volume: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume));
  src.connect(gain).connect(ctx.destination);
  src.start();
  return src;
}
