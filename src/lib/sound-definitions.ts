/**
 * Next.js-side bridge to the persisted `SoundDefinition` Mongo rows — the
 * per-event uploaded-file bindings for the Sound Board. The event CATALOG
 * (labels/categories) lives in shared/sound-events.ts; this only tracks
 * which file (if any) is bound to each event key. Cached briefly so hot
 * paths (the client's GET on match load) don't hit Mongo every request.
 */

import { prisma } from '@/lib/prisma';

export interface SoundDefinitionRow {
  eventKey: string;
  fileUrl: string;
  fileName: string;
  volume: number;
}

let cache: { at: number; rows: SoundDefinitionRow[] } | null = null;
const CACHE_TTL_MS = 15_000;

export async function loadSoundDefinitions(opts?: { force?: boolean }): Promise<SoundDefinitionRow[]> {
  const now = Date.now();
  if (!opts?.force && cache && now - cache.at < CACHE_TTL_MS) {
    return cache.rows;
  }
  try {
    const rows = await prisma.soundDefinition.findMany();
    const mapped = rows.map((r) => ({
      eventKey: r.eventKey,
      fileUrl: r.fileUrl,
      fileName: r.fileName,
      volume: r.volume,
    }));
    cache = { at: now, rows: mapped };
    return mapped;
  } catch (err) {
    console.error('[loadSoundDefinitions]', err);
    return cache?.rows ?? [];
  }
}

export function invalidateSoundDefinitionsCache(): void {
  cache = null;
}
