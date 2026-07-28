'use server';

/**
 * Ghost WR — store / load best Deathrun-style runs (sampled positions).
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export type GhostSample = { t: number; x: number; y: number; z: number };

export type GhostRunSummary = {
  id: string;
  mapId: string;
  userId: string;
  username: string;
  finishMs: number;
  sampleCount: number;
};

const MAX_SAMPLES = 900;
const MAX_JSON = 120_000;

function packSamples(samples: GhostSample[]): string {
  const trimmed = samples.slice(0, MAX_SAMPLES).map((s) => ({
    t: Math.round(s.t),
    x: Math.round(s.x * 1000) / 1000,
    y: Math.round(s.y * 1000) / 1000,
    z: Math.round(s.z * 1000) / 1000,
  }));
  const json = JSON.stringify(trimmed);
  if (json.length > MAX_JSON) {
    // Decimate
    const step = Math.ceil(trimmed.length / 400);
    return JSON.stringify(trimmed.filter((_, i) => i % step === 0));
  }
  return json;
}

export async function getMapWorldRecord(
  mapId: string
): Promise<(GhostRunSummary & { samples: GhostSample[] }) | null> {
  if (!mapId) return null;
  const row = await prisma.mapGhostRun.findFirst({
    where: { mapId },
    orderBy: { finishMs: 'asc' },
  });
  if (!row) return null;
  let samples: GhostSample[] = [];
  try {
    samples = JSON.parse(row.samplesJson) as GhostSample[];
  } catch {
    samples = [];
  }
  return {
    id: row.id,
    mapId: row.mapId,
    userId: row.userId,
    username: row.username,
    finishMs: row.finishMs,
    sampleCount: samples.length,
    samples,
  };
}

export async function getMyMapGhost(
  mapId: string
): Promise<(GhostRunSummary & { samples: GhostSample[] }) | null> {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId || !mapId) return null;
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) return null;
  const row = await prisma.mapGhostRun.findUnique({
    where: { mapId_userId: { mapId, userId: user.id } },
  });
  if (!row) return null;
  let samples: GhostSample[] = [];
  try {
    samples = JSON.parse(row.samplesJson) as GhostSample[];
  } catch {
    samples = [];
  }
  return {
    id: row.id,
    mapId: row.mapId,
    userId: row.userId,
    username: row.username,
    finishMs: row.finishMs,
    sampleCount: samples.length,
    samples,
  };
}

/** Upsert PB if finishMs is better (or first). Returns whether WR improved. */
export async function submitGhostRun(input: {
  mapId: string;
  finishMs: number;
  samples: GhostSample[];
}): Promise<{ ok: true; personalBest: boolean; worldRecord: boolean; finishMs: number }> {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Sign in to save ghosts');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned) throw new Error('Not allowed');

  const mapId = input.mapId.trim();
  const finishMs = Math.max(1, Math.round(input.finishMs));
  if (!mapId || !input.samples?.length) {
    throw new Error('Invalid ghost');
  }

  const samplesJson = packSamples(input.samples);
  const existing = await prisma.mapGhostRun.findUnique({
    where: { mapId_userId: { mapId, userId: user.id } },
  });

  let personalBest = false;
  if (!existing || finishMs < existing.finishMs) {
    personalBest = true;
    await prisma.mapGhostRun.upsert({
      where: { mapId_userId: { mapId, userId: user.id } },
      create: {
        mapId,
        userId: user.id,
        username: user.username || 'Runner',
        finishMs,
        samplesJson,
      },
      update: {
        finishMs,
        samplesJson,
        username: user.username || 'Runner',
      },
    });
  }

  const wr = await prisma.mapGhostRun.findFirst({
    where: { mapId },
    orderBy: { finishMs: 'asc' },
    select: { userId: true, finishMs: true },
  });
  const worldRecord = !!wr && wr.userId === user.id && wr.finishMs === finishMs && personalBest;

  return { ok: true, personalBest, worldRecord, finishMs };
}
