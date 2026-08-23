import { NextRequest } from 'next/server';
import { engineJson, engineOptions } from '@/lib/engine/engine-api';
import { resolveEngineInstallerUrl } from '@/lib/engine/installer-url';
import { KILRUN_ENGINE_VERSION } from '@/lib/engine/version';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

/**
 * Public: recommended Engine EXE version. Feature updates ship as official
 * modules; this endpoint is only for native-shell / installer upgrades.
 */
export async function GET(req: NextRequest) {
  const latest = (process.env.KILRUN_ENGINE_LATEST_VERSION || KILRUN_ENGINE_VERSION).trim();
  const notes = (process.env.KILRUN_ENGINE_UPDATE_NOTES || '').trim();
  const origin = req.nextUrl.origin.replace(/\/$/, '');
  const downloadUrl = (await resolveEngineInstallerUrl()) || `${origin}/api/engine/download`;
  return engineJson(req, {
    ok: true,
    current: KILRUN_ENGINE_VERSION,
    latest,
    downloadUrl,
    notes,
  });
}
