import { describe, expect, it } from 'vitest';
import { engineCorsHeaders } from '@/lib/engine/engine-cors';

describe('engineCorsHeaders', () => {
  it('allows desktop origins and PATCH/DELETE methods', () => {
    const headers = engineCorsHeaders(
      new Request('https://kilrun.example/api/engine/sounds', {
        headers: { origin: 'https://tauri.localhost' },
      })
    );
    expect(headers['Access-Control-Allow-Origin']).toBe('https://tauri.localhost');
    expect(headers['Access-Control-Allow-Methods']).toContain('PATCH');
    expect(headers['Access-Control-Allow-Methods']).toContain('DELETE');
  });

  it('rejects non-desktop origins', () => {
    const headers = engineCorsHeaders(
      new Request('https://kilrun.example/api/engine/sounds', {
        headers: { origin: 'https://evil.example' },
      })
    );
    expect(headers['Access-Control-Allow-Origin']).toBe('null');
  });
});
