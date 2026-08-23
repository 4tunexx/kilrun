/**
 * Live installer URL. Always comes from Vercel env / Blob — never from git.
 *
 * 1. KILRUN_ENGINE_DOWNLOAD_URL (Vercel project env, public Blob URL)
 * 2. Else list kilrun-assets for the Setup.exe using BLOB_READ_WRITE_TOKEN
 */
const INSTALLER_PREFIXES = ['engine/Kilrun-Engine-Setup.exe', 'engine/', 'Kilrun-Engine-Setup.exe', 'Kilrun Engine Setup.exe', 'Kilrun'];

function isInstallerBlob(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return lower.endsWith('.exe') && lower.includes('kilrun');
}

export async function resolveEngineInstallerUrl(): Promise<string | null> {
  const fromEnv = (process.env.KILRUN_ENGINE_DOWNLOAD_URL || '').trim();
  if (fromEnv) return fromEnv;

  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  try {
    const { list } = await import('@vercel/blob');
    for (const prefix of INSTALLER_PREFIXES) {
      const { blobs } = await list({ prefix, limit: 20 });
      const match = blobs.find((blob) => isInstallerBlob(blob.pathname));
      if (match?.url) return match.url;
    }
  } catch (err) {
    console.error('[engine-installer] blob list failed', err);
  }

  return null;
}
