export const KILRUN_ENGINE_PROTOCOL = 'kilrun-engine';

export type EngineDeepLinkOpts = {
  mapId?: string;
  action?: 'open' | 'new' | 'auth';
  token?: string;
};

export function buildEngineDeepLink(opts: EngineDeepLinkOpts = {}): string {
  if (opts.action === 'auth' && opts.token) {
    return `${KILRUN_ENGINE_PROTOCOL}://auth?token=${encodeURIComponent(opts.token)}`;
  }
  const params = new URLSearchParams();
  if (opts.mapId) params.set('map', opts.mapId);
  if (opts.action && opts.action !== 'open') params.set('action', opts.action);
  const query = params.toString();
  return query ? `${KILRUN_ENGINE_PROTOCOL}://open?${query}` : `${KILRUN_ENGINE_PROTOCOL}://open`;
}

export function parseEngineDeepLink(raw: string): EngineDeepLinkOpts {
  try {
    const trimmed = raw.trim();
    const withoutScheme = trimmed.replace(/^kilrun-engine:(\/\/)?/i, '');
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

/**
 * Ask Windows to open Kilrun Engine.exe without navigating the current tab away.
 * Browsers only honor custom protocols from a user gesture reliably — callers
 * should prefer an actual <a href> for the primary CTA.
 */
export function tryLaunchKilrunEngine(opts: EngineDeepLinkOpts = {}): boolean {
  if (typeof document === 'undefined') return false;
  const href = buildEngineDeepLink(opts);
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = href;
    document.body.appendChild(iframe);
    window.setTimeout(() => iframe.remove(), 2500);
    return true;
  } catch {
    return false;
  }
}
