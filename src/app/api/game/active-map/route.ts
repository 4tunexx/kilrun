import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeKilrunMode } from '@/lib/game-modes';
import type { MapDocument } from '@/components/game/editor/map-document';
import { ensureShopSettings } from '@/components/game/editor/map-document';
import {
  mapDocHealthFloors,
  mapDocMonsterSpawns,
  mapDocPlayerSpawns,
  mapDocPushPayloads,
  mapDocRedZones,
  mapDocRevivePads,
  mapDocSpawnPoints,
  mapDocTeamSpawns,
  mapDocToSimActions,
  mapDocToSimButtons,
  mapDocToSimFinishes,
  mapDocToSimHazards,
  mapDocToSimPlatforms,
  mapDocToSimTeleports,
  mapDocToWorldBounds,
  mapDocWaveAnchors,
  prepareDocForPlayTest,
} from '@/components/game/editor/prefab-storage';

export const runtime = 'nodejs';

/**
 * Public (match-server) endpoint: active MAIN cloud map for a mode, already
 * converted to the `loadCustomMap` payload shape. Colyseus rooms fetch this on
 * create so sim authority does not depend on a client push.
 */
export async function GET(req: NextRequest) {
  const modeRaw = req.nextUrl.searchParams.get('mode') || 'deathrun';
  const mode = normalizeKilrunMode(modeRaw);

  try {
    const row = await prisma.gameMap.findFirst({
      where: { mode, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) {
      return NextResponse.json({ ok: true, map: null });
    }

    let document: MapDocument;
    try {
      document = JSON.parse(row.documentJson) as MapDocument;
    } catch {
      return NextResponse.json({ ok: false, error: 'Corrupt map document' }, { status: 500 });
    }

    const prepared = prepareDocForPlayTest(document).doc;
    const platforms = mapDocToSimPlatforms(prepared);
    if (!platforms.length) {
      return NextResponse.json({ ok: true, map: null, reason: 'empty_platforms' });
    }

    const finishes = mapDocToSimFinishes(prepared);
    const payload = {
      platforms,
      obstacles: mapDocToSimHazards(prepared),
      finishes,
      buttons: mapDocToSimButtons(prepared),
      actions: mapDocToSimActions(prepared),
      teleports: mapDocToSimTeleports(prepared),
      spawn: mapDocSpawnPoints(prepared).runner ?? mapDocPlayerSpawns(prepared)[0] ?? undefined,
      trapperSpawn: mapDocSpawnPoints(prepared).trapper ?? undefined,
      playerSpawns: mapDocPlayerSpawns(prepared),
      monsterSpawns: mapDocMonsterSpawns(prepared),
      waveAnchors: mapDocWaveAnchors(prepared),
      teamASpawns: mapDocTeamSpawns(prepared).teamA,
      teamBSpawns: mapDocTeamSpawns(prepared).teamB,
      healthFloors: mapDocHealthFloors(prepared),
      redZones: mapDocRedZones(prepared),
      revivePads: mapDocRevivePads(prepared),
      pushPayloads: mapDocPushPayloads(prepared),
      worldBounds: mapDocToWorldBounds(prepared, platforms, finishes),
      modeSettings: prepared.modeSettings as Record<string, unknown> | undefined,
      combatSettings: prepared.combatSettings as Record<string, unknown> | undefined,
      shopSettings: ensureShopSettings(prepared) as unknown as Record<string, unknown>,
      customMoves: prepared.customMoves as unknown as Record<string, unknown>[] | undefined,
    };

    return NextResponse.json({
      ok: true,
      map: {
        id: row.id,
        name: row.name,
        mode,
        thumbnailUrl: row.thumbnailUrl,
        payload,
      },
    });
  } catch (err) {
    console.error('[api/game/active-map]', err);
    return NextResponse.json({ ok: false, error: 'Failed to load map' }, { status: 500 });
  }
}
