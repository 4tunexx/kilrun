export type KilrunEngineEnv = 'local' | 'production';

declare global {
  interface Window {
    __KILRUN_ENGINE__?: boolean;
    __KILRUN_ENGINE_VERSION__?: string;
    __KILRUN_PLATFORM_URL__?: string;
    __TAURI_INTERNALS__?: unknown;
  }
}

/** True when the UI is running inside Kilrun Engine.exe (Tauri WebView). */
export function isKilrunEngineDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.__KILRUN_ENGINE__ || window.__TAURI_INTERNALS__);
}

export function isWindowsClient(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Windows/i.test(navigator.userAgent) || /Win32|Win64/.test(navigator.platform);
}

/**
 * Platform origin the Engine should talk to. Never invent hosts — local is
 * the current page on localhost, production is the current page origin (or
 * NEXT_PUBLIC_SITE_URL when that is a full URL).
 */
export function resolvePlatformOrigin(): string {
  if (typeof window !== 'undefined' && window.__KILRUN_PLATFORM_URL__) {
    return window.__KILRUN_PLATFORM_URL__.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/$/, '');
    if (!/tauri\.localhost/i.test(origin)) return origin;
  }
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && (window.__KILRUN_ENGINE__ || window.__TAURI_INTERNALS__)) {
    return 'https://kilrun.vercel.app';
  }
  return 'http://localhost:3000';
}

export function detectEngineEnv(): KilrunEngineEnv {
  if (typeof window === 'undefined') return 'local';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'local';
  return 'production';
}

export function gameServerUrlHint(): string {
  return process.env.NEXT_PUBLIC_GAME_SERVER_URL || 'ws://localhost:2567';
}
