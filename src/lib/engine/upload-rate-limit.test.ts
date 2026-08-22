import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkUploadRateLimit, resetUploadRateLimitForTests } from './upload-rate-limit';

describe('checkUploadRateLimit', () => {
  beforeEach(() => {
    resetUploadRateLimitForTests();
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(() => checkUploadRateLimit('staff-1', 5)).not.toThrow();
    }
  });

  it('throws once a key exceeds its limit within the window', () => {
    for (let i = 0; i < 3; i += 1) checkUploadRateLimit('staff-1', 3);
    expect(() => checkUploadRateLimit('staff-1', 3)).toThrow(/too many uploads/i);
  });

  it('tracks each key independently — one staff member cannot exhaust another\'s budget', () => {
    for (let i = 0; i < 3; i += 1) checkUploadRateLimit('staff-1', 3);
    expect(() => checkUploadRateLimit('staff-2', 3)).not.toThrow();
  });

  it('resource-scoped keys (models vs sounds) do not share a budget for the same staff id', () => {
    for (let i = 0; i < 3; i += 1) checkUploadRateLimit('models:staff-1', 3);
    expect(() => checkUploadRateLimit('sounds:staff-1', 3)).not.toThrow();
  });

  it('lets requests through again once the window has passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    checkUploadRateLimit('staff-1', 1, 1000);
    expect(() => checkUploadRateLimit('staff-1', 1, 1000)).toThrow();
    vi.setSystemTime(1001);
    expect(() => checkUploadRateLimit('staff-1', 1, 1000)).not.toThrow();
    vi.useRealTimers();
  });
});
