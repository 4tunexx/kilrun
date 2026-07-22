import { describe, expect, it } from 'vitest';
import {
  DAILY_MISSION_SEEDS,
  isDailyMissionRow,
  isSameLocalDay,
  isWebMissionRow,
  missionPeriodKey,
  startOfLocalDay,
} from './daily-missions';
import { getSiteUrl } from './site-url';

describe('daily-missions UTC helpers', () => {
  it('missionPeriodKey uses UTC calendar day', () => {
    const d = new Date(Date.UTC(2026, 6, 22, 23, 30, 0));
    expect(missionPeriodKey(d)).toBe('2026-07-22');
  });

  it('startOfLocalDay is UTC midnight', () => {
    const d = new Date(Date.UTC(2026, 6, 22, 15, 0, 0));
    const start = startOfLocalDay(d);
    expect(start.toISOString()).toBe('2026-07-22T00:00:00.000Z');
  });

  it('isSameLocalDay compares UTC dates', () => {
    const a = new Date(Date.UTC(2026, 6, 22, 1, 0, 0));
    const b = new Date(Date.UTC(2026, 6, 22, 23, 0, 0));
    const c = new Date(Date.UTC(2026, 6, 23, 0, 30, 0));
    expect(isSameLocalDay(a, b)).toBe(true);
    expect(isSameLocalDay(a, c)).toBe(false);
  });

  it('classifies daily vs web mission rows', () => {
    expect(
      isDailyMissionRow({ category: 'daily', templateKey: 'daily_login' })
    ).toBe(true);
    expect(
      isDailyMissionRow({ category: 'game', templateKey: 'daily_play' })
    ).toBe(true);
    expect(
      isWebMissionRow({ category: 'website', templateKey: 'web_login_1' })
    ).toBe(true);
    expect(
      isWebMissionRow({ category: 'daily', templateKey: 'daily_login' })
    ).toBe(false);
  });

  it('has seven daily seeds', () => {
    expect(DAILY_MISSION_SEEDS).toHaveLength(7);
  });
});

describe('getSiteUrl', () => {
  it('falls back to localhost when env unset', () => {
    const prevSite = process.env.NEXT_PUBLIC_SITE_URL;
    const prevAuth = process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXTAUTH_URL;
    expect(getSiteUrl()).toBe('http://localhost:3000');
    if (prevSite !== undefined) process.env.NEXT_PUBLIC_SITE_URL = prevSite;
    else delete process.env.NEXT_PUBLIC_SITE_URL;
    if (prevAuth !== undefined) process.env.NEXTAUTH_URL = prevAuth;
    else delete process.env.NEXTAUTH_URL;
  });
});
