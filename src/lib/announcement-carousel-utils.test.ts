import { describe, expect, it } from 'vitest';
import { ANNOUNCEMENT_ACTIVITY_LOOKBACK_DAYS, getAnnouncementActivityCutoff } from './announcement-carousel-utils';

describe('announcement carousel utils', () => {
  it('uses a 90-day lookback window for user activity items', () => {
    const now = new Date('2026-07-27T12:00:00.000Z');
    const cutoff = getAnnouncementActivityCutoff(now);

    expect(ANNOUNCEMENT_ACTIVITY_LOOKBACK_DAYS).toBe(90);
    expect(cutoff.toISOString()).toBe('2026-04-28T12:00:00.000Z');
  });
});
