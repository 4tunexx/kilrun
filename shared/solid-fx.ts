/**
 * Shared vanish / unveil / glitch solid-FX state machine.
 * No Three.js — Play Test, live rooms, and unit tests all call this.
 *
 * `progress` is reveal amount: 0 = fully hidden, 1 = fully visible.
 * Collision uses `passThrough` (true = pad is skipped like an open door).
 */

export type SolidFxMode = 'appear' | 'disappear';
export type SolidFxTrigger = 'proximity' | 'step' | 'either';
export type SolidFxStyle = 'unveil' | 'glitch' | 'matrix' | 'fade';
export type SolidFxPhase = 'idle' | 'delay' | 'anim' | 'hold' | 'restore';

export interface SolidFxConfig {
  enabled: boolean;
  mode: SolidFxMode;
  trigger: SolidFxTrigger;
  style: SolidFxStyle;
  /** World/sim units. Default 2. */
  radius: number;
  delayMs: number;
  durationMs: number;
  /** 0 = stay in the end state forever. */
  restoreMs: number;
  /** 0–1 reveal threshold where collision flips. Default 0.5. */
  collideAt: number;
}

export interface SolidFxRuntimeState {
  phase: SolidFxPhase;
  phaseStartedAt: number;
}

export interface SolidFxEvalInput {
  distance: number;
  standingOn: boolean;
  nowMs: number;
}

export interface SolidFxEvalResult {
  progress: number;
  passThrough: boolean;
}

export interface SolidFxPad {
  id?: string;
  entityId?: string;
  x: number;
  y: number;
  z: number;
  fxHidden?: boolean;
  fxProgress?: number;
}

export interface SolidFxPlayer {
  x: number;
  y: number;
  z: number;
  supportPadId: string | null;
}

export const SOLID_FX_PRESETS: Record<string, Partial<SolidFxConfig> & { label: string }> = {
  unveil: {
    label: 'Unveil platform',
    enabled: true,
    mode: 'appear',
    trigger: 'proximity',
    style: 'unveil',
    radius: 2,
    delayMs: 0,
    durationMs: 700,
    restoreMs: 0,
    collideAt: 0.5,
  },
  glitch: {
    label: 'Glitch appear',
    enabled: true,
    mode: 'appear',
    trigger: 'step',
    style: 'glitch',
    radius: 2,
    delayMs: 0,
    durationMs: 550,
    restoreMs: 0,
    collideAt: 0.45,
  },
  matrix: {
    label: 'Matrix appear',
    enabled: true,
    mode: 'appear',
    trigger: 'step',
    style: 'matrix',
    radius: 2,
    delayMs: 0,
    durationMs: 800,
    restoreMs: 0,
    collideAt: 0.5,
  },
  vanish: {
    label: 'Disappearing floor',
    enabled: true,
    mode: 'disappear',
    trigger: 'step',
    style: 'fade',
    radius: 2,
    delayMs: 180,
    durationMs: 650,
    restoreMs: 0,
    collideAt: 0.5,
  },
};

export function defaultSolidFx(): SolidFxConfig {
  return {
    enabled: false,
    mode: 'appear',
    trigger: 'proximity',
    style: 'unveil',
    radius: 2,
    delayMs: 0,
    durationMs: 700,
    restoreMs: 0,
    collideAt: 0.5,
  };
}

export function ensureSolidFx(partial?: Partial<SolidFxConfig> | null): SolidFxConfig {
  const base = defaultSolidFx();
  if (!partial) return base;
  const collideAt = clamp01(partial.collideAt ?? base.collideAt);
  return {
    enabled: partial.enabled ?? base.enabled,
    mode: partial.mode === 'disappear' ? 'disappear' : 'appear',
    trigger: parseTrigger(partial.trigger) ?? base.trigger,
    style: parseStyle(partial.style) ?? base.style,
    radius: finiteOr(partial.radius, base.radius),
    delayMs: Math.max(0, finiteOr(partial.delayMs, base.delayMs)),
    durationMs: Math.max(1, finiteOr(partial.durationMs, base.durationMs)),
    restoreMs: Math.max(0, finiteOr(partial.restoreMs, base.restoreMs)),
    collideAt,
  };
}

export function createSolidFxRuntime(): SolidFxRuntimeState {
  return { phase: 'idle', phaseStartedAt: 0 };
}

export function idleProgress(mode: SolidFxMode): number {
  return mode === 'appear' ? 0 : 1;
}

export function evaluateSolidFx(
  fx: SolidFxConfig,
  input: SolidFxEvalInput,
  state: SolidFxRuntimeState
): SolidFxEvalResult {
  const cfg = ensureSolidFx(fx);
  if (!cfg.enabled) {
    return { progress: 1, passThrough: false };
  }

  const triggered = isTriggered(cfg.trigger, input.distance, cfg.radius, input.standingOn);
  const now = input.nowMs;
  const duration = Math.max(1, cfg.durationMs);

  if (state.phase === 'idle') {
    if (triggered) {
      state.phase = cfg.delayMs > 0 ? 'delay' : 'anim';
      state.phaseStartedAt = now;
    }
  }

  if (state.phase === 'delay') {
    if (now - state.phaseStartedAt >= cfg.delayMs) {
      state.phase = 'anim';
      state.phaseStartedAt = now;
    }
  }

  if (state.phase === 'anim') {
    const t = clamp01((now - state.phaseStartedAt) / duration);
    if (t >= 1) {
      state.phase = 'hold';
      state.phaseStartedAt = now;
    }
    const progress = cfg.mode === 'appear' ? t : 1 - t;
    return { progress, passThrough: progress < cfg.collideAt };
  }

  if (state.phase === 'hold') {
    const progress = cfg.mode === 'appear' ? 1 : 0;
    if (cfg.restoreMs > 0 && now - state.phaseStartedAt >= cfg.restoreMs) {
      state.phase = 'restore';
      state.phaseStartedAt = now;
    }
    return { progress, passThrough: progress < cfg.collideAt };
  }

  if (state.phase === 'restore') {
    const t = clamp01((now - state.phaseStartedAt) / duration);
    if (t >= 1) {
      state.phase = 'idle';
      state.phaseStartedAt = now;
      const progress = idleProgress(cfg.mode);
      return { progress, passThrough: progress < cfg.collideAt };
    }
    const progress = cfg.mode === 'appear' ? 1 - t : t;
    return { progress, passThrough: progress < cfg.collideAt };
  }

  const progress = idleProgress(cfg.mode);
  return { progress, passThrough: progress < cfg.collideAt };
}

export function configsFromFxPads(
  pads: Array<{ entityId?: string; fx?: Partial<SolidFxConfig> | null }>
): Map<string, SolidFxConfig> {
  const map = new Map<string, SolidFxConfig>();
  for (const pad of pads) {
    if (!pad.entityId || !pad.fx?.enabled || map.has(pad.entityId)) continue;
    map.set(pad.entityId, ensureSolidFx(pad.fx));
  }
  return map;
}

/**
 * Evaluate every FX entity, write `fxHidden` onto all of its pads, and return
 * per-entity visual progress.
 */
export function applySolidFxToPads(
  pads: SolidFxPad[],
  configs: Map<string, SolidFxConfig>,
  runtimes: Map<string, SolidFxRuntimeState>,
  players: SolidFxPlayer[],
  nowMs: number
): Map<string, SolidFxEvalResult> {
  const results = new Map<string, SolidFxEvalResult>();
  if (configs.size === 0) return results;

  const padsByEntity = new Map<string, SolidFxPad[]>();
  for (const pad of pads) {
    const id = pad.entityId;
    if (!id || !configs.has(id)) continue;
    const list = padsByEntity.get(id);
    if (list) list.push(pad);
    else padsByEntity.set(id, [pad]);
  }

  for (const [entityId, fxPads] of padsByEntity) {
    const cfg = configs.get(entityId);
    if (!cfg) continue;
    let runtime = runtimes.get(entityId);
    if (!runtime) {
      runtime = createSolidFxRuntime();
      runtimes.set(entityId, runtime);
    }

    let distance = Infinity;
    let standingOn = false;
    for (const player of players) {
      for (const pad of fxPads) {
        const dx = player.x - pad.x;
        const dy = player.y - pad.y;
        const dz = player.z - pad.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < distance) distance = d;
        if (player.supportPadId && (player.supportPadId === pad.id || player.supportPadId === pad.entityId)) {
          standingOn = true;
        }
      }
    }

    const result = evaluateSolidFx(cfg, { distance, standingOn, nowMs }, runtime);
    results.set(entityId, result);
    for (const pad of fxPads) {
      pad.fxHidden = result.passThrough;
      pad.fxProgress = result.progress;
    }
  }

  return results;
}

function isTriggered(
  trigger: SolidFxTrigger,
  distance: number,
  radius: number,
  standingOn: boolean
): boolean {
  const near = distance <= radius;
  if (trigger === 'proximity') return near;
  if (trigger === 'step') return standingOn;
  return near || standingOn;
}

function parseTrigger(value: unknown): SolidFxTrigger | null {
  if (value === 'proximity' || value === 'step' || value === 'either') return value;
  return null;
}

function parseStyle(value: unknown): SolidFxStyle | null {
  if (value === 'unveil' || value === 'glitch' || value === 'matrix' || value === 'fade') return value;
  return null;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}
