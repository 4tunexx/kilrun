import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIP_CONFIG,
  DEFAULT_VIP_OFFER_ID,
  parseVipConfig,
  resolveVipOffer,
  serializeVipConfig,
} from './vip-config';

describe('parseVipConfig', () => {
  it('returns defaults for empty / garbage / non-object input', () => {
    for (const raw of ['{}', '', 'not json', '[]', '"str"', 'null', null, undefined, 42]) {
      const cfg = parseVipConfig(raw);
      expect(cfg.vpCost).toBe(2500);
      expect(cfg.durationDays).toBe(30);
      expect(cfg.offers).toHaveLength(1);
      expect(cfg.offers[0].id).toBe(DEFAULT_VIP_OFFER_ID);
    }
  });

  it('never returns the shared default object (no accidental mutation)', () => {
    const a = parseVipConfig('{}');
    a.offers[0].vpCost = 1;
    a.offers.push({ id: 'x', label: 'x', vpCost: 1, durationDays: 1, enabled: true });
    const b = parseVipConfig('{}');
    expect(b.offers[0].vpCost).toBe(2500);
    expect(b.offers).toHaveLength(1);
    expect(DEFAULT_VIP_CONFIG.offers).toHaveLength(1);
    expect(DEFAULT_VIP_CONFIG.offers[0].vpCost).toBe(2500);
  });

  it('parses valid config and offers', () => {
    const cfg = parseVipConfig(
      JSON.stringify({
        vpCost: 3000,
        durationDays: 14,
        offers: [
          { id: 'a', label: 'Two weeks', vpCost: 1500, durationDays: 14, enabled: true },
          { id: 'b', label: 'Disabled', vpCost: 1, durationDays: 1, enabled: false },
        ],
      })
    );
    expect(cfg.vpCost).toBe(3000);
    expect(cfg.durationDays).toBe(14);
    expect(cfg.offers.map((o) => o.id)).toEqual(['a', 'b']);
    expect(cfg.offers[1].enabled).toBe(false);
  });

  it('clamps negatives, floors fractions and enforces min 1 day', () => {
    const cfg = parseVipConfig({
      vpCost: -50,
      durationDays: 0,
      offers: [{ id: 'a', vpCost: -1, durationDays: -3 }, { id: 'b', vpCost: 99.9, durationDays: 2.7 }],
    });
    expect(cfg.vpCost).toBe(0);
    expect(cfg.durationDays).toBe(1);
    expect(cfg.offers[0].vpCost).toBe(0);
    expect(cfg.offers[0].durationDays).toBe(1);
    expect(cfg.offers[1].vpCost).toBe(99);
    expect(cfg.offers[1].durationDays).toBe(2);
  });

  it('accepts numeric strings and rejects NaN/Infinity', () => {
    const cfg = parseVipConfig({ vpCost: '1234', durationDays: 'abc' });
    expect(cfg.vpCost).toBe(1234);
    expect(cfg.durationDays).toBe(30);
    expect(parseVipConfig({ vpCost: Infinity }).vpCost).toBe(2500);
  });

  it('drops non-object offers and falls back to defaults when none survive', () => {
    const cfg = parseVipConfig({ offers: [null, 'x', 5] });
    expect(cfg.offers).toHaveLength(1);
    expect(cfg.offers[0].id).toBe(DEFAULT_VIP_OFFER_ID);
  });

  it('generates ids/labels for offers missing them', () => {
    const cfg = parseVipConfig({ offers: [{ vpCost: 10, durationDays: 5 }] });
    expect(cfg.offers[0].id).toBe('offer_0');
    expect(cfg.offers[0].label).toBe('Offer 1');
  });

  it('round-trips through serialize', () => {
    const cfg = parseVipConfig({ vpCost: 999, durationDays: 7 });
    expect(parseVipConfig(serializeVipConfig(cfg))).toEqual(cfg);
  });
});

describe('resolveVipOffer', () => {
  const cfg = parseVipConfig({
    offers: [
      { id: 'off', vpCost: 1, durationDays: 1, enabled: false },
      { id: 'on', vpCost: 2000, durationDays: 30, enabled: true },
    ],
  });

  it('returns the requested enabled offer', () => {
    expect(resolveVipOffer(cfg, 'on')?.vpCost).toBe(2000);
  });

  it('returns null for an unknown or disabled requested offer', () => {
    expect(resolveVipOffer(cfg, 'nope')).toBeNull();
    expect(resolveVipOffer(cfg, 'off')).toBeNull();
  });

  it('defaults to the first enabled offer', () => {
    expect(resolveVipOffer(cfg)?.id).toBe('on');
  });

  it('falls back to the top-level price when every offer is disabled', () => {
    const allOff = parseVipConfig({
      vpCost: 777,
      durationDays: 9,
      offers: [{ id: 'x', vpCost: 1, durationDays: 1, enabled: false }],
    });
    const o = resolveVipOffer(allOff);
    expect(o?.vpCost).toBe(777);
    expect(o?.durationDays).toBe(9);
  });
});
