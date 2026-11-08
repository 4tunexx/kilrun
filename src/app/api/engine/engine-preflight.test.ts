import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { OPTIONS } from './[...path]/route';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

describe('Engine API preflight routing', () => {
  it.each([
    'catalog',
    'download',
    'ghosts',
    'join-token',
    'maps',
    'plugins',
    'session',
    'version',
  ])('allows desktop preflight for %s', async (path) => {
    const request = new NextRequest(`https://kilrun.example/api/engine/${path}`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://tauri.localhost',
        'access-control-request-method': path === 'maps' ? 'POST' : 'GET',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    const response = await OPTIONS(request, { params: Promise.resolve({ path: [path] }) });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tauri.localhost');
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it.each(['https://untrusted.example', 'null'])('does not allow origin %s', async (origin) => {
    const request = new NextRequest('https://kilrun.example/api/engine/maps', {
      method: 'OPTIONS',
      headers: { origin },
    });

    const response = await OPTIONS(request, { params: Promise.resolve({ path: ['maps'] }) });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
