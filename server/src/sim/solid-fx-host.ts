import {
  applySolidFxToPads,
  configsFromFxPads,
  createSolidFxRuntime,
  type SolidFxConfig,
  type SolidFxEvalResult,
  type SolidFxPad,
  type SolidFxPlayer,
  type SolidFxRuntimeState,
} from '../../../shared/solid-fx.js';

type FxVol = NonNullable<SolidFxPad['fxVol']>;

/** Per-room FX bookkeeping so vanish / unveil stays world-authoritative. */
export class SolidFxHost {
  configs = new Map<string, SolidFxConfig>();
  runtimes = new Map<string, SolidFxRuntimeState>();
  volumes = new Map<string, FxVol>();

  load(
    pads: Array<{
      entityId?: string;
      fx?: Partial<SolidFxConfig> | null;
      fxVol?: FxVol | null;
    }>
  ) {
    this.configs = configsFromFxPads(pads);
    this.runtimes.clear();
    this.volumes.clear();
    for (const id of this.configs.keys()) {
      this.runtimes.set(id, createSolidFxRuntime());
    }
    for (const pad of pads) {
      if (pad.entityId && pad.fxVol && !this.volumes.has(pad.entityId)) {
        this.volumes.set(pad.entityId, pad.fxVol);
      }
    }
  }

  tick(
    platforms: SolidFxPad[],
    players: SolidFxPlayer[],
    nowMs: number
  ): Map<string, SolidFxEvalResult> {
    if (this.configs.size === 0) return new Map();
    for (const platform of platforms) {
      if (platform.fxVol || !platform.entityId) continue;
      const vol = this.volumes.get(platform.entityId);
      if (vol) platform.fxVol = vol;
    }
    return applySolidFxToPads(platforms, this.configs, this.runtimes, players, nowMs);
  }
}
