export const KILRUN_ENGINE_PROTOCOL = 'kilrun-engine';
/** Windows/Tauri also registers the bundle id as a URL protocol. Chrome shows this name. */
export const KILRUN_ENGINE_IDENTIFIER_PROTOCOL = 'com.kilrun.engine';

/** Loopback port Kilrun Engine.exe listens on so the website can detect it. */
export const ENGINE_PRESENCE_PORT = 17832;
export const ENGINE_PRESENCE_ORIGIN = `http://127.0.0.1:${ENGINE_PRESENCE_PORT}`;

/** Same-origin installer links. Live site: https://kilrun.vercel.app/api/engine/download */
export const ENGINE_INSTALLER_API_PATH = '/api/engine/download';
export const ENGINE_INSTALLER_FILE_PATH = '/downloads/Kilrun-Engine-Setup.exe';

export type EngineDeepLinkOpts = {
  mapId?: string;
  action?: 'open' | 'new' | 'auth';
  token?: string;
};

export function parseEngineLoopbackUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:') return null;
    if (url.hostname !== '127.0.0.1') return null;
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    if (url.pathname !== '/engine-auth') return null;
    return `http://127.0.0.1:${port}/engine-auth`;
  } catch {
    return null;
  }
}

function engineDeepLinkQuery(opts: EngineDeepLinkOpts): string {
  if (opts.action === 'auth' && opts.token) {
    return `auth?token=${encodeURIComponent(opts.token)}`;
  }
  const params = new URLSearchParams();
  if (opts.mapId) params.set('map', opts.mapId);
  if (opts.action && opts.action !== 'open') params.set('action', opts.action);
  const query = params.toString();
  return query ? `open?${query}` : 'open';
}

export function buildEngineDeepLink(opts: EngineDeepLinkOpts = {}): string {
  return `${KILRUN_ENGINE_PROTOCOL}://${engineDeepLinkQuery(opts)}`;
}

export function buildEngineIdentifierDeepLink(opts: EngineDeepLinkOpts = {}): string {
  return `${KILRUN_ENGINE_IDENTIFIER_PROTOCOL}://${engineDeepLinkQuery(opts)}`;
}

export function parseEngineDeepLink(raw: string): EngineDeepLinkOpts {
  try {
    const trimmed = raw.trim();
    const withoutScheme = trimmed.replace(
      /^(kilrun-engine|com\.kilrun\.engine):(\/\/)?/i,
      ''
    );
    const url = new URL(`https://engine.invalid/${withoutScheme.replace(/^\/+/, '')}`);
    const token = url.searchParams.get('token') || undefined;
    const hostOrPath = `${url.hostname}${url.pathname}`.replace(/^\./, '');
    const isAuth =
      url.pathname === '/auth' ||
      url.hostname === 'auth' ||
      hostOrPath.startsWith('auth') ||
      url.searchParams.get('action') === 'auth';
    if (isAuth || token) {
      return { action: 'auth', token };
    }
    const mapId = url.searchParams.get('map') || undefined;
    const actionRaw = url.searchParams.get('action');
    const action = actionRaw === 'new' ? 'new' : 'open';
    return { mapId, action };
  } catch {
    return { action: 'open' };
  }
}

export type EnginePresence = {
  ok: true;
  app: string;
  version: string;
};

export type EngineInstallerInfo = {
  downloadUrl: string;
  latest: string;
  notes: string;
};

/**
 * True when Kilrun Engine.exe is running on this PC (loopback ping).
 * Works from the public website because the EXE allows CORS + private-network.
 */
const PRESENCE_PING_PATHS = ['/engine-ping', '/engine-ping'];
const PRESENCE_OPEN_PATHS = ['/engine-open', '/engine-open'];

async function fetchPresence(path: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  if (typeof fetch === 'undefined') return null;
  const ctrl = new AbortController();
  const timer = globalThis.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${ENGINE_PRESENCE_ORIGIN}${path}`, {
      ...init,
      mode: 'cors',
      cache: 'no-store',
      signal: ctrl.signal,
      // Chrome: public https → 127.0.0.1 is Private Network Access.
      targetAddressSpace: 'loopback',
    } as RequestInit);
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function probeKilrunEngine(timeoutMs = 800): Promise<EnginePresence | null> {
  for (const path of PRESENCE_PING_PATHS) {
    const res = await fetchPresence(path, { method: 'GET' }, timeoutMs);
    if (!res?.ok) continue;
    try {
      const data = (await res.json()) as { ok?: boolean; app?: string; version?: string };
      if (!data?.ok) continue;
      return {
        ok: true,
        app: String(data.app || 'kilrun-engine'),
        version: String(data.version || ''),
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function requestKilrunEngineOpen(opts: EngineDeepLinkOpts = {}): Promise<boolean> {
  const params = new URLSearchParams();
  if (opts.mapId) params.set('map', opts.mapId);
  if (opts.action && opts.action !== 'open') params.set('action', opts.action);
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : '';
  for (const path of PRESENCE_OPEN_PATHS) {
    const res = await fetchPresence(`${path}${suffix}`, { method: 'POST' }, 1200);
    if (res?.ok) return true;
  }
  return false;
}

function clickProtocolHref(href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Ask Windows to open Kilrun Engine.exe without navigating the current tab away.
 * Must run inside a user gesture. Hidden iframes are ignored by Chrome/Edge.
 * Clicks both kilrun-engine:// and com.kilrun.engine:// (what Chrome's dialog shows).
 */
export function tryLaunchKilrunEngine(opts: EngineDeepLinkOpts = {}): boolean {
  if (typeof document === 'undefined') return false;
  try {
    clickProtocolHref(buildEngineDeepLink(opts));
    clickProtocolHref(buildEngineIdentifierDeepLink(opts));
    return true;
  } catch {
    return false;
  }
}

export async function waitForKilrunEngine(timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeKilrunEngine(400)) return true;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 350));
  }
  return false;
}

/**
 * After a user-gesture protocol launch: talk to a running EXE, or wait for it
 * to boot. Returns `missing` when nothing is installed / listening.
 */
export async function completeKilrunEngineLaunch(
  opts: EngineDeepLinkOpts = {}
): Promise<'running' | 'missing'> {
  if (await probeKilrunEngine()) {
    await requestKilrunEngineOpen(opts);
    return 'running';
  }
  return (await waitForKilrunEngine()) ? 'running' : 'missing';
}

export async function fetchEngineInstaller(): Promise<EngineInstallerInfo | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch('/api/engine/version', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      downloadUrl?: string;
      latest?: string;
      notes?: string;
    };
    return {
      downloadUrl: String(data.downloadUrl || '').trim(),
      latest: String(data.latest || '').trim(),
      notes: String(data.notes || '').trim(),
    };
  } catch {
    return null;
  }
}
