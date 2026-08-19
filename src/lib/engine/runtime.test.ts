import { describe, expect, it } from 'vitest';
import { buildEngineDeepLink, parseEngineDeepLink, parseEngineLoopbackUrl } from './protocol';
import { detectEngineEnv, isKilrunEngineDesktop, isWindowsClient } from './runtime';
import { shouldOfferEngineLaunch } from './launch-pref';

describe('kilrun engine protocol', () => {
  it('builds an open link without a map id', () => {
    expect(buildEngineDeepLink()).toBe('kilrun-engine://open');
  });

  it('includes map id and optional action', () => {
    expect(buildEngineDeepLink({ mapId: 'map_abc' })).toBe(
      'kilrun-engine://open?map=map_abc'
    );
    expect(buildEngineDeepLink({ mapId: 'map_abc', action: 'new' })).toBe(
      'kilrun-engine://open?map=map_abc&action=new'
    );
  });

  it('parses deep links back into options', () => {
    expect(parseEngineDeepLink('kilrun-engine://open?map=map_1')).toEqual({
      mapId: 'map_1',
      action: 'open',
    });
    expect(parseEngineDeepLink('kilrun-engine:open?action=new')).toEqual({
      mapId: undefined,
      action: 'new',
    });
    expect(parseEngineDeepLink('kilrun-engine://auth?token=abc.def')).toEqual({
      action: 'auth',
      token: 'abc.def',
    });
  });
});

describe('engine loopback auth url', () => {
  it('accepts only local engine-auth URLs', () => {
    expect(parseEngineLoopbackUrl('http://127.0.0.1:54321/engine-auth')).toBe(
      'http://127.0.0.1:54321/engine-auth'
    );
    expect(parseEngineLoopbackUrl('http://evil.example/engine-auth')).toBeNull();
    expect(parseEngineLoopbackUrl('https://127.0.0.1:54321/engine-auth')).toBeNull();
  });
});

describe('kilrun engine runtime', () => {
  it('treats missing window as not-desktop', () => {
    expect(isKilrunEngineDesktop()).toBe(false);
  });

  it('does not claim Windows without a navigator', () => {
    expect(isWindowsClient()).toBe(false);
  });

  it('defaults env to local without a browser host', () => {
    expect(detectEngineEnv()).toBe('local');
  });
});

describe('engine launch offer', () => {
  it('never offers launch inside the desktop app itself', () => {
    expect(
      shouldOfferEngineLaunch({ isWindows: true, isDesktopEngine: true })
    ).toBe(false);
  });

  it('does not offer launch on non-Windows browsers', () => {
    expect(
      shouldOfferEngineLaunch({ isWindows: false, isDesktopEngine: false })
    ).toBe(false);
  });
});
