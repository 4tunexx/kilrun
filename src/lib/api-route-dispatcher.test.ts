import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { dispatchApiRoute, type ApiRouteTable } from './api-route-dispatcher';

function context(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe('dispatchApiRoute', () => {
  it('dispatches the matching path and method', async () => {
    const handler = vi.fn(() => new Response('matched'));
    const routes: ApiRouteTable = { 'steam/callback': { GET: handler } };

    const response = await dispatchApiRoute(
      new NextRequest('https://kil.run/api/auth/steam/callback'),
      context('steam', 'callback'),
      routes
    );

    expect(await response.text()).toBe('matched');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('uses the fallback handler for catch-all auth paths', async () => {
    const handler = vi.fn(() => new Response('auth'));
    const response = await dispatchApiRoute(
      new NextRequest('https://kil.run/api/auth/session'),
      context('session'),
      {},
      { GET: handler }
    );

    expect(await response.text()).toBe('auth');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('returns 404 for unmapped paths and 405 for unsupported methods', async () => {
    const routes: ApiRouteTable = { catalog: { GET: () => new Response('ok') } };

    const missing = await dispatchApiRoute(
      new NextRequest('https://kil.run/api/engine/unknown'),
      context('unknown'),
      routes
    );
    const unsupported = await dispatchApiRoute(
      new NextRequest('https://kil.run/api/engine/catalog', { method: 'POST' }),
      context('catalog'),
      routes
    );

    expect(missing.status).toBe(404);
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
  });

  it('handles HEAD through GET and supplies an automatic OPTIONS response', async () => {
    const handler = vi.fn(() => new Response('ok'));
    const routes: ApiRouteTable = { catalog: { GET: handler } };

    const head = await dispatchApiRoute(
      new NextRequest('https://kil.run/api/engine/catalog', { method: 'HEAD' }),
      context('catalog'),
      routes
    );
    const options = await dispatchApiRoute(
      new NextRequest('https://kil.run/api/engine/catalog', { method: 'OPTIONS' }),
      context('catalog'),
      routes
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(head.status).toBe(200);
    expect(options.status).toBe(204);
    expect(options.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
  });
});
