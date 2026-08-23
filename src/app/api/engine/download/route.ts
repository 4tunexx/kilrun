import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { engineJson, engineOptions } from '@/lib/engine/engine-api';
import { resolveEngineInstallerUrl } from '@/lib/engine/installer-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILENAME = 'Kilrun-Engine-Setup.exe';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

function localInstallerPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'public/downloads', FILENAME),
    path.join(process.cwd(), 'desktop/dist', 'Kilrun Engine Setup.exe'),
  ];
  return candidates.find((file) => existsSync(file)) ?? null;
}

/**
 * Live: https://kilrun.vercel.app/api/engine/download
 * Resolves from Vercel env / Blob. Does not ship the EXE in git.
 */
export async function GET(req: NextRequest) {
  const remote = await resolveEngineInstallerUrl();
  if (remote) {
    return NextResponse.redirect(remote, 302);
  }

  const filePath = localInstallerPath();
  if (filePath) {
    const stat = statSync(filePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${FILENAME}"`,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  return engineJson(
    req,
    {
      ok: false,
      error:
        'Installer is not in Vercel Blob yet. Upload Kilrun Engine Setup.exe to the kilrun-assets store (path engine/Kilrun-Engine-Setup.exe), or set KILRUN_ENGINE_DOWNLOAD_URL.',
    },
    404
  );
}
