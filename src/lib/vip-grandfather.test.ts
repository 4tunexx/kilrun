import { describe, expect, it } from 'vitest';
import { DEFAULT_GRACE_DAYS, parseExcludeList, planGrandfather } from './vip-grandfather';

const NOW = new Date('2030-06-15T12:00:00.000Z').getTime();
const D = 86_400_000;
const u = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  username: `user_${id}`,
  role: 'vip' as string | null,
  isVip: true,
  vipExpiresAt: null as Date | string | null,
  ...over,
});

describe('planGrandfather', () => {
  it('gives legacy permanent VIPs the default 30-day grace period', () => {
    const plan = planGrandfather([u('a')], { now: NOW });
    expect(plan.apply).toHaveLength(1);
    expect(plan.apply[0].expiresAt.getTime()).toBe(NOW + DEFAULT_GRACE_DAYS * D);
    expect(plan.skipped).toEqual([]);
  });

  it('honours a custom grace period and clamps it to at least 1 day', () => {
    expect(planGrandfather([u('a')], { now: NOW, graceDays: 7 }).apply[0].expiresAt.getTime()).toBe(NOW + 7 * D);
    expect(planGrandfather([u('a')], { now: NOW, graceDays: 0 }).apply[0].expiresAt.getTime()).toBe(NOW + D);
  });

  it('NEVER touches admin or moderator', () => {
    const plan = planGrandfather(
      [u('adm', { role: 'admin' }), u('mod', { role: 'moderator' }), u('ok')],
      { now: NOW }
    );
    expect(plan.apply.map((x) => x.id)).toEqual(['ok']);
    expect(plan.skipped).toEqual([
      { id: 'adm', reason: 'staff' },
      { id: 'mod', reason: 'staff' },
    ]);
  });

  it('skips users who already have an expiry (idempotent re-run)', () => {
    const plan = planGrandfather([u('a', { vipExpiresAt: new Date(NOW + D) })], { now: NOW });
    expect(plan.apply).toEqual([]);
    expect(plan.skipped).toEqual([{ id: 'a', reason: 'already_has_expiry' }]);
    // Running twice never extends anyone:
    const first = planGrandfather([u('b')], { now: NOW });
    const applied = u('b', { vipExpiresAt: first.apply[0].expiresAt });
    expect(planGrandfather([applied], { now: NOW + 5 * D }).apply).toEqual([]);
  });

  it('skips excluded ids (giveaways, partners) and non-VIPs', () => {
    const plan = planGrandfather(
      [u('keep'), u('nope', { isVip: false, role: 'player' }), u('go')],
      { now: NOW, excludeIds: ['keep'] }
    );
    expect(plan.apply.map((x) => x.id)).toEqual(['go']);
    expect(plan.skipped).toEqual([
      { id: 'keep', reason: 'excluded' },
      { id: 'nope', reason: 'not_vip' },
    ]);
  });

  it('catches drift: role vip without the isVip boolean is still a candidate', () => {
    const plan = planGrandfather([u('d', { isVip: false, role: 'vip' })], { now: NOW });
    expect(plan.apply.map((x) => x.id)).toEqual(['d']);
  });
});

describe('parseExcludeList', () => {
  const id1 = 'a'.repeat(24);
  const id2 = 'B'.repeat(24);
  it('reads ids from CSV/newlines, ignoring headers, comments, blanks and junk', () => {
    const text = `userId,note\n# staff\n${id1},giveaway\n\n"${id2}",partner\nnot-an-id,x\n${id1}\n`;
    expect(parseExcludeList(text)).toEqual([id1, id2.toLowerCase()]);
  });
  it('returns [] for empty input', () => {
    expect(parseExcludeList('')).toEqual([]);
  });
});
