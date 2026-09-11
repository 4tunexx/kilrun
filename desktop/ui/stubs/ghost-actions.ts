import { fetchEngineGhost, submitEngineGhost } from '@/lib/engine/platform-client';

export type GhostSample = {
  t: number;
  x: number;
  y: number;
  z: number;
};

export async function getMapWorldRecord(mapId: string) {
  return fetchEngineGhost(mapId);
}

export async function getMyMapGhost(mapId: string) {
  return fetchEngineGhost(mapId);
}

export async function submitGhostRun(input: {
  mapId: string;
  finishMs: number;
  samples: GhostSample[];
}) {
  return submitEngineGhost(input);
}
