import { describe, expect, it } from 'vitest';
import { buildEngineFetchHeaders } from '@/lib/engine/engine-fetch-headers';

describe('buildEngineFetchHeaders', () => {
  it('sets JSON content-type for string bodies and Bearer token', () => {
    const headers = buildEngineFetchHeaders({ method: 'POST', body: '{"a":1}' }, 'tok');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });

  it('does not force JSON content-type on FormData (boundary must be browser-set)', () => {
    const headers = buildEngineFetchHeaders({ method: 'POST', body: new FormData() }, 'tok');
    expect(headers.get('Content-Type')).toBeNull();
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });
});
