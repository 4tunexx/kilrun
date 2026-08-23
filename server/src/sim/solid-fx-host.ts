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

/** Per-room FX bookkeeping so vanish / unveil stays world-authoritative. */
export class SolidFxHost {
  configs = new Map<string, SolidFxConfig>();
  runtimes = new Map<string, SolidFxRuntimeState>();

  load(pads: Array<{ entityId?: string; fx?: Partial<SolidFxConfig> | null }>) {
    this.configs = configsFromFxPads(pads);
    this.runtimes.clear();
    for (const id of this.configs.keys()) {
      this.runtimes.set(id, createSolidFxRuntime());
    }
  }

  tick(
    platforms: SolidFxPad[],
    players: SolidFxPlayer[],
    nowMs: number
  ): Map<string, SolidFxEvalResult> {
    if (this.configs.size === 0) return new Map();
    return applySolidFxToPads(platforms, this.configs, this.runtimes, players, nowMs);
  }
}
