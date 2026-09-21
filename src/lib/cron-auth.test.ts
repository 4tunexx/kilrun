import { describe, expect, it } from 'vitest';
import { checkCronAuth } from './cron-auth';

describe('checkCronAuth', () => {
  it('fails closed with 503 when no secret is configured, even with a header', () => {
    expect(checkCronAuth('Bearer x', undefined)).toMatchObject({ ok: false, status: 503 });
    expect(checkCronAuth('Bearer x', '')).toMatchObject({ ok: false, status: 503 });
    expect(checkCronAuth('Bearer ', '')).toMatchObject({ ok: false, status: 503 });
    expect(checkCronAuth(null, null)).toMatchObject({ ok: false, status: 503 });
  });

  it('rejects missing, malformed and wrong credentials with 401', () => {
    for (const h of [null, undefined, '', 'Bearer ', 'bearer secret', 'secret', 'Basic secret', 'Bearer wrong', 'Bearer secret2', 'Bearer secre']) {
      expect(checkCronAuth(h, 'secret')).toMatchObject({ ok: false, status: 401 });
    }
  });

  it('accepts the exact bearer token', () => {
    expect(checkCronAuth('Bearer secret', 'secret')).toEqual({ ok: true });
  });

  it('does not throw on length mismatch (timingSafeEqual would)', () => {
    expect(() => checkCronAuth('Bearer a', 'a-much-longer-secret')).not.toThrow();
  });
});
