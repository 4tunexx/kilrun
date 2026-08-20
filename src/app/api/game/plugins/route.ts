import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseCatalogManifestJson } from '@/lib/engine/plugin-catalog';
import { clipPluginSource } from '@shared/plugin-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Public: latest Engine-published plugin catalog for the game server.
 */
export async function GET(_req: NextRequest) {
  try {
    const rows = await prisma.gamePlugin.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 64,
    });
    const plugins = rows.map((row) => {
      const parsed = parseCatalogManifestJson(row.manifestJson);
      return {
        pluginId: row.pluginId,
        version: row.version,
        source: clipPluginSource(row.source),
        permissions: parsed.permissions,
        modes: parsed.modes,
        weapons: parsed.weapons,
        shopItems: parsed.shopItems,
        entry: parsed.entry,
      };
    });
    return NextResponse.json(
      { ok: true, plugins },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err) {
    console.error('[api/game/plugins]', err);
    return NextResponse.json({ ok: true, plugins: [] }, { status: 200 });
  }
}
