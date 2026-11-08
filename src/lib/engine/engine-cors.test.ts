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

  it.each(['https://evil.example', 'null'])('rejects origin %s', (origin) => {
    const headers = engineCorsHeaders(
      new Request('https://kilrun.example/api/engine/sounds', {
        headers: { origin },
      })
    );
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('allows requests without an origin', () => {
    const headers = engineCorsHeaders(new Request('https://kilrun.example/api/engine/sounds'));
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
