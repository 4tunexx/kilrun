import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { collectPluginModesFromSources } from '@/lib/engine/plugin-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Public: extra game modes from the plugin catalog and published MAIN maps.
 * Catalog modes appear even without a MAIN map (Play hub disables Queue until hasMain).
 */
export async function GET(_req: NextRequest) {
  try {
    const [maps, catalog] = await Promise.all([
      prisma.gameMap.findMany({
        where: { isActive: true },
        select: { mode: true, name: true, documentJson: true, isActive: true },
        orderBy: { updatedAt: 'desc' },
        take: 80,
      }),
      prisma.gamePlugin.findMany({ select: { manifestJson: true }, take: 64 }).catch(() => []),
    ]);

    const modes = collectPluginModesFromSources({
      catalogManifests: catalog.map((row) => row.manifestJson),
      maps,
    });

    return NextResponse.json(
      { ok: true, modes },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err) {
    console.error('[api/game/plugin-modes]', err);
    return NextResponse.json({ ok: false, error: 'Failed to list plugin modes' }, { status: 500 });
  }
}
