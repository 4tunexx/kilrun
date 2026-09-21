import { describe, expect, it } from 'vitest';
import {
  WARN_1D_MS,
  WARN_3D_MS,
  computeVipExpiryPlan,
  vipNotificationKey,
  vipSnapshotFieldsToClear,
} from './vip-expiry';

const NOW = new Date('2030-06-15T12:00:00.000Z').getTime();
const H = 3_600_000;
const D = 24 * H;
const u = (id: string, over: Partial<Parameters<typeof computeVipExpiryPlan>[0][number]> = {}) => ({
  id,
  role: 'vip' as string | null,
  isVip: true,
  vipExpiresAt: null as Date | string | null,
  ...over,
});

describe('computeVipExpiryPlan', () => {
  it('expires lapsed VIPs and demotes the plain vip role', () => {
    const plan = computeVipExpiryPlan([u('a', { vipExpiresAt: new Date(NOW - D) })], NOW);
    expect(plan.expire).toEqual([{ id: 'a', expiredAt: new Date(NOW - D), demoteRole: true }]);
  });

  it('expires at exactly the expiry instant', () => {
    const plan = computeVipExpiryPlan([u('a', { vipExpiresAt: new Date(NOW) })], NOW);
    expect(plan.expire.map((e) => e.id)).toEqual(['a']);
  });

  it('NEVER demotes admin or moderator, but still clears their expired VIP flag', () => {
    const plan = computeVipExpiryPlan(
      [
        u('adm', { role: 'admin', vipExpiresAt: new Date(NOW - H) }),
        u('mod', { role: 'moderator', vipExpiresAt: new Date(NOW - H) }),
        u('ply', { role: 'player', vipExpiresAt: new Date(NOW - H) }),
      ],
      NOW
    );
    expect(plan.expire.map((e) => [e.id, e.demoteRole])).toEqual([
      ['adm', false],
      ['mod', false],
      ['ply', false],
    ]);
  });

  it('never touches permanent VIP (null expiry)', () => {
    const plan = computeVipExpiryPlan([u('p', { vipExpiresAt: null }), u('q', { vipExpiresAt: '' })], NOW);
    expect(plan.expire).toEqual([]);
    expect(plan.skipped).toEqual([
      { id: 'p', reason: 'permanent' },
      { id: 'q', reason: 'permanent' },
    ]);
  });

  it('does not demote on corrupt expiry data (fails safe)', () => {
    const plan = computeVipExpiryPlan([u('x', { vipExpiresAt: 'garbage' })], NOW);
    expect(plan.expire).toEqual([]);
    expect(plan.skipped).toEqual([{ id: 'x', reason: 'unparseable_expiry' }]);
  });

  it('ignores users who are not VIP', () => {
    const plan = computeVipExpiryPlan([u('n', { isVip: false, vipExpiresAt: new Date(NOW - D) })], NOW);
    expect(plan.expire).toEqual([]);
    expect(plan.skipped).toEqual([{ id: 'n', reason: 'not_vip' }]);
  });

  it('warns at 3 days and 1 day, not before', () => {
    const plan = computeVipExpiryPlan(
      [
        u('far', { vipExpiresAt: new Date(NOW + 10 * D) }),
        u('t3', { vipExpiresAt: new Date(NOW + 2 * D) }),
        u('t3edge', { vipExpiresAt: new Date(NOW + WARN_3D_MS) }),
        u('t1', { vipExpiresAt: new Date(NOW + 12 * H) }),
        u('t1edge', { vipExpiresAt: new Date(NOW + WARN_1D_MS) }),
      ],
      NOW
    );
    expect(plan.warn3.map((w) => w.id)).toEqual(['t3', 't3edge']);
    expect(plan.warn1.map((w) => w.id)).toEqual(['t1', 't1edge']);
    expect(plan.skipped).toEqual([{ id: 'far', reason: 'not_due' }]);
  });

  it('is idempotent: planning the same users twice gives the same result', () => {
    const users = [
      u('a', { vipExpiresAt: new Date(NOW - D) }),
      u('b', { vipExpiresAt: new Date(NOW + 2 * D) }),
    ];
    expect(computeVipExpiryPlan(users, NOW)).toEqual(computeVipExpiryPlan(users, NOW));
  });

  it('accepts ISO string expiries', () => {
    const plan = computeVipExpiryPlan([u('s', { vipExpiresAt: new Date(NOW - H).toISOString() })], NOW);
    expect(plan.expire.map((e) => e.id)).toEqual(['s']);
  });
});

describe('vipNotificationKey', () => {
  it('is unique per user, stage and expiry instant', () => {
    const d1 = new Date(NOW);
    const d2 = new Date(NOW + D);
    expect(vipNotificationKey('warn3', 'u1', d1)).not.toBe(vipNotificationKey('warn1', 'u1', d1));
    expect(vipNotificationKey('warn3', 'u1', d1)).not.toBe(vipNotificationKey('warn3', 'u2', d1));
    // A renewal moves the expiry, so the next cycle gets fresh warnings:
    expect(vipNotificationKey('warn3', 'u1', d1)).not.toBe(vipNotificationKey('warn3', 'u1', d2));
    expect(vipNotificationKey('warn3', 'u1', d1)).toBe(vipNotificationKey('warn3', 'u1', new Date(NOW)));
    expect(vipNotificationKey('grandfather', 'u1')).toBe('vip:grandfather:u1');
  });
});

describe('vipSnapshotFieldsToClear', () => {
  it('clears only snapshots that still name a VIP item', () => {
    expect(
      vipSnapshotFieldsToClear({
        equippedFrameItemName: 'VIP Crown Frame',
        equippedBannerItemName: 'Neon Banner',
        equippedNicknameItemName: 'VIP Nickname',
      })
    ).toEqual({ frame: true, banner: false, nickname: true });
    expect(vipSnapshotFieldsToClear({})).toEqual({ frame: false, banner: false, nickname: false });
  });
});
