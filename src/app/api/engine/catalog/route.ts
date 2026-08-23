import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { engineJson, engineOptions } from '@/lib/engine/engine-api';
import { parseCatalogManifestJson } from '@/lib/engine/plugin-catalog';
import { clipPluginSource } from '@shared/plugin-source';
import { parseModuleKind } from '@/lib/engine/module-kind';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

/** Public: official modules every Engine client should install without a new EXE. */
export async function GET(req: NextRequest) {
  try {
    const rows = await prisma.gamePlugin.findMany({
      where: { official: true },
      orderBy: { updatedAt: 'desc' },
      take: 64,
    });
    const modules = rows.map((row) => {
      const parsed = parseCatalogManifestJson(row.manifestJson);
      return {
        moduleId: row.pluginId,
        kind: parseModuleKind(row.kind),
        version: row.version,
        source: clipPluginSource(row.source),
        entry: parsed.entry || 'index.js',
        name: parsed.name || row.pluginId,
        permissions: parsed.permissions,
        modes: parsed.modes,
      };
    });
    return engineJson(req, { ok: true, modules });
  } catch (err) {
    console.error('[api/engine/catalog]', err);
    return engineJson(req, { ok: true, modules: [] });
  }
}
