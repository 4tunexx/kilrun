import { describe, expect, it } from 'vitest';
import {
  VIP_DURATION_DAYS,
  VIP_UNLOCK_VP_COST,
  activeVipWhere,
  addVipDays,
  formatVipCountdown,
  hasVipFlag,
  isVipActive,
  isVipPermanent,
  vipMsRemaining,
} from './vip';

const NOW = new Date('2030-06-15T12:00:00.000Z').getTime();
const DAY = 86_400_000;
const future = (ms: number) => new Date(NOW + ms).toISOString();
const past = (ms: number) => new Date(NOW - ms).toISOString();

describe('isVipActive', () => {
  it('is false for null / undefined / non-VIP', () => {
    expect(isVipActive(null, NOW)).toBe(false);
    expect(isVipActive(undefined, NOW)).toBe(false);
    expect(isVipActive({}, NOW)).toBe(false);
    expect(isVipActive({ isVip: false, role: 'player' }, NOW)).toBe(false);
  });

  it('treats VIP with no expiry as permanent (active)', () => {
    expect(isVipActive({ isVip: true, vipExpiresAt: null }, NOW)).toBe(true);
    expect(isVipActive({ isVip: true, vipExpiresAt: undefined }, NOW)).toBe(true);
    expect(isVipActive({ isVip: true, vipExpiresAt: '' }, NOW)).toBe(true);
  });

  it('is active while the expiry is in the future', () => {
    expect(isVipActive({ isVip: true, vipExpiresAt: future(DAY) }, NOW)).toBe(true);
    expect(isVipActive({ isVip: true, vipExpiresAt: new Date(NOW + 1) }, NOW)).toBe(true);
  });

  it('is INACTIVE once expired, even though the isVip boolean is still true (the reported bug)', () => {
    expect(isVipActive({ isVip: true, role: 'vip', vipExpiresAt: past(DAY) }, NOW)).toBe(false);
    expect(isVipActive({ isVip: true, role: 'vip', vipExpiresAt: past(400 * DAY) }, NOW)).toBe(false);
  });

  it('is inactive at exactly the expiry instant', () => {
    expect(isVipActive({ isVip: true, vipExpiresAt: new Date(NOW) }, NOW)).toBe(false);
  });

  it('fails closed on an unparseable expiry', () => {
    expect(isVipActive({ isVip: true, vipExpiresAt: 'not-a-date' }, NOW)).toBe(false);
    expect(isVipActive({ isVip: true, vipExpiresAt: new Date('garbage') }, NOW)).toBe(false);
  });

  it('honours role vip without the isVip boolean (legacy drift)', () => {
    expect(isVipActive({ isVip: false, role: 'vip', vipExpiresAt: null }, NOW)).toBe(true);
    expect(isVipActive({ isVip: false, role: 'vip', vipExpiresAt: past(DAY) }, NOW)).toBe(false);
  });

  it('honours isVip without role vip', () => {
    expect(isVipActive({ isVip: true, role: 'player', vipExpiresAt: future(DAY) }, NOW)).toBe(true);
  });

  it('does not make admin or moderator VIP on their own', () => {
    expect(isVipActive({ isVip: false, role: 'admin' }, NOW)).toBe(false);
    expect(isVipActive({ isVip: false, role: 'moderator' }, NOW)).toBe(false);
  });

  it('defaults `now` to the current time', () => {
    expect(isVipActive({ isVip: true, vipExpiresAt: new Date(Date.now() + DAY) })).toBe(true);
    expect(isVipActive({ isVip: true, vipExpiresAt: new Date(Date.now() - DAY) })).toBe(false);
  });
});

describe('hasVipFlag / isVipPermanent', () => {
  it('detects the flag from either field', () => {
    expect(hasVipFlag({ isVip: true })).toBe(true);
    expect(hasVipFlag({ role: 'vip' })).toBe(true);
    expect(hasVipFlag({ isVip: false, role: 'player' })).toBe(false);
  });

  it('permanent means flagged with no expiry date', () => {
    expect(isVipPermanent({ isVip: true, vipExpiresAt: null })).toBe(true);
    expect(isVipPermanent({ isVip: true, vipExpiresAt: future(DAY) })).toBe(false);
    expect(isVipPermanent({ isVip: false, vipExpiresAt: null })).toBe(false);
  });

  it('an unparseable expiry is not permanent', () => {
    expect(isVipPermanent({ isVip: true, vipExpiresAt: 'garbage' })).toBe(false);
  });
});

describe('vipMsRemaining', () => {
  it('returns Infinity for permanent, remaining ms for timed, 0 otherwise', () => {
    expect(vipMsRemaining({ isVip: true, vipExpiresAt: null }, NOW)).toBe(Infinity);
    expect(vipMsRemaining({ isVip: true, vipExpiresAt: future(3 * DAY) }, NOW)).toBe(3 * DAY);
    expect(vipMsRemaining({ isVip: true, vipExpiresAt: past(DAY) }, NOW)).toBe(0);
    expect(vipMsRemaining({ isVip: false }, NOW)).toBe(0);
    expect(vipMsRemaining(null, NOW)).toBe(0);
  });
});

describe('addVipDays (stacking)', () => {
  it('starts from now when there is no current expiry', () => {
    expect(addVipDays(null, 30, NOW).getTime()).toBe(NOW + 30 * DAY);
    expect(addVipDays(undefined, 30, NOW).getTime()).toBe(NOW + 30 * DAY);
  });

  it('starts from now when the current expiry already passed', () => {
    expect(addVipDays(past(10 * DAY), 30, NOW).getTime()).toBe(NOW + 30 * DAY);
  });

  it('stacks on top of a still-active expiry', () => {
    expect(addVipDays(future(10 * DAY), 30, NOW).getTime()).toBe(NOW + 40 * DAY);
  });

  it('ignores an unparseable current expiry', () => {
    expect(addVipDays('garbage', 30, NOW).getTime()).toBe(NOW + 30 * DAY);
  });

  it('clamps duration to at least 1 day and floors fractions', () => {
    expect(addVipDays(null, 0, NOW).getTime()).toBe(NOW + DAY);
    expect(addVipDays(null, -5, NOW).getTime()).toBe(NOW + DAY);
    expect(addVipDays(null, 2.9, NOW).getTime()).toBe(NOW + 2 * DAY);
  });
});

describe('formatVipCountdown', () => {
  it('formats permanent, expired, days, hours and minutes', () => {
    expect(formatVipCountdown(Infinity)).toBe('Permanent');
    expect(formatVipCountdown(0)).toBe('Expired');
    expect(formatVipCountdown(-5)).toBe('Expired');
    expect(formatVipCountdown(2 * DAY + 3 * 3_600_000)).toBe('2d 3h');
    expect(formatVipCountdown(5 * 3_600_000 + 7 * 60_000)).toBe('5h 7m');
    expect(formatVipCountdown(9 * 60_000)).toBe('9m');
  });
});

describe('activeVipWhere', () => {
  it('requires isVip and (no expiry OR expiry in the future)', () => {
    const now = new Date(NOW);
    expect(activeVipWhere(now)).toEqual({
      isVip: true,
      OR: [{ vipExpiresAt: null }, { vipExpiresAt: { gt: now } }],
    });
  });
});

describe('constants', () => {
  it('keeps the historical price and a 30-day default', () => {
    expect(VIP_UNLOCK_VP_COST).toBe(2500);
    expect(VIP_DURATION_DAYS).toBe(30);
  });
});

describe('withActiveVip', () => {
  it('rewrites isVip from the expiry and serialises vipExpiresAt', async () => {
    const { withActiveVip } = await import('./vip');
    const expired = withActiveVip(
      { id: 'u1', username: 'a', isVip: true, role: 'vip', vipExpiresAt: new Date(NOW - DAY) },
      NOW
    );
    expect(expired.isVip).toBe(false);
    expect(expired.vipExpiresAt).toBe(new Date(NOW - DAY).toISOString());
    expect(expired.id).toBe('u1');
    expect(expired.username).toBe('a');
  });

  it('keeps permanent and future VIP active, and null expiry as null', async () => {
    const { withActiveVip } = await import('./vip');
    expect(withActiveVip({ isVip: true, vipExpiresAt: null }, NOW)).toMatchObject({
      isVip: true,
      vipExpiresAt: null,
    });
    expect(withActiveVip({ isVip: true, vipExpiresAt: new Date(NOW + DAY) }, NOW).isVip).toBe(true);
  });

  it('handles a row with no VIP fields and an unparseable expiry', async () => {
    const { withActiveVip } = await import('./vip');
    expect(withActiveVip({ id: 'x' } as { id: string; isVip?: boolean }, NOW)).toMatchObject({
      id: 'x',
      isVip: false,
      vipExpiresAt: null,
    });
    const bad = withActiveVip({ isVip: true, vipExpiresAt: 'garbage' }, NOW);
    expect(bad.isVip).toBe(false);
    expect(bad.vipExpiresAt).toBeNull();
  });
});

describe('planVipPurchase', () => {
  const offer = { vpCost: 2500, durationDays: 30 };
  const base = { vpCurrency: 10_000, role: 'player' as string | null };

  it('never charges permanent VIP', async () => {
    const { planVipPurchase } = await import('./vip');
    expect(planVipPurchase({ ...base, isVip: true, role: 'vip', vipExpiresAt: null }, offer, NOW)).toEqual({
      kind: 'already_permanent',
    });
  });

  it('rejects when VP is short and reports the price', async () => {
    const { planVipPurchase } = await import('./vip');
    expect(planVipPurchase({ ...base, vpCurrency: 2499, isVip: false }, offer, NOW)).toEqual({
      kind: 'insufficient_vp',
      cost: 2500,
    });
  });

  it('charges exactly the price when the balance equals it', async () => {
    const { planVipPurchase } = await import('./vip');
    const plan = planVipPurchase({ ...base, vpCurrency: 2500, isVip: false }, offer, NOW);
    expect(plan.kind).toBe('charge');
  });

  it('first purchase: starts from now, promotes a player to vip, not a renewal', async () => {
    const { planVipPurchase } = await import('./vip');
    const plan = planVipPurchase({ ...base, isVip: false }, offer, NOW);
    expect(plan).toMatchObject({ kind: 'charge', cost: 2500, isRenewal: false, nextRole: 'vip' });
    if (plan.kind === 'charge') expect(plan.nextExpiresAt.getTime()).toBe(NOW + 30 * DAY);
  });

  it('renewal while active stacks on remaining time', async () => {
    const { planVipPurchase } = await import('./vip');
    const plan = planVipPurchase(
      { ...base, isVip: true, role: 'vip', vipExpiresAt: new Date(NOW + 10 * DAY) },
      offer,
      NOW
    );
    expect(plan).toMatchObject({ kind: 'charge', isRenewal: true });
    if (plan.kind === 'charge') expect(plan.nextExpiresAt.getTime()).toBe(NOW + 40 * DAY);
  });

  it('renewal AFTER expiry restarts from now (the reported user) and is not a renewal', async () => {
    const { planVipPurchase } = await import('./vip');
    const plan = planVipPurchase(
      { ...base, isVip: true, role: 'vip', vipExpiresAt: new Date(NOW - 200 * DAY) },
      offer,
      NOW
    );
    expect(plan).toMatchObject({ kind: 'charge', isRenewal: false });
    if (plan.kind === 'charge') expect(plan.nextExpiresAt.getTime()).toBe(NOW + 30 * DAY);
  });

  it('never changes an admin or moderator role', async () => {
    const { planVipPurchase } = await import('./vip');
    for (const role of ['admin', 'moderator']) {
      const plan = planVipPurchase({ ...base, role, isVip: false }, offer, NOW);
      expect(plan).toMatchObject({ kind: 'charge', nextRole: role });
    }
  });

  it('a free offer (cost 0) still charges nothing and never goes negative', async () => {
    const { planVipPurchase } = await import('./vip');
    const plan = planVipPurchase({ ...base, vpCurrency: 0, isVip: false }, { vpCost: -5, durationDays: 7 }, NOW);
    expect(plan).toMatchObject({ kind: 'charge', cost: 0 });
  });
});
