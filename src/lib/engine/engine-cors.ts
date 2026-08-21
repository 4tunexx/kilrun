function isDesktopOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    return (
      host === 'tauri.localhost' ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === 'ipc.localhost'
    );
  } catch {
    return false;
  }
}

export function engineCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allow = !origin || isDesktopOrigin(origin);
  return {
    'Access-Control-Allow-Origin': allow ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
