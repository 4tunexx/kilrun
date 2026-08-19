import { describe, expect, it } from 'vitest';
import { shouldAttemptReconnect } from './connection';

describe('shouldAttemptReconnect', () => {
  it('retries ordinary drops (proxy idle, server restart, network blip)', () => {
    expect(shouldAttemptReconnect(1001)).toBe(true);
    expect(shouldAttemptReconnect(1006)).toBe(true);
    expect(shouldAttemptReconnect(4001)).toBe(true);
  });

  it('does not retry consented leave, abandon, or oversized payloads', () => {
    expect(shouldAttemptReconnect(4000)).toBe(false); // consented
    expect(shouldAttemptReconnect(4002)).toBe(false); // abandon
    expect(shouldAttemptReconnect(1009)).toBe(false); // message too big
  });
});
