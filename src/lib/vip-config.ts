/**
 * Admin-editable platform VIP config (SiteSettings.vipConfigJson).
 * VIP is a monthly membership (crown, orange name, VIP cosmetics). Separate from Kilrun Premium.
 * Defaults keep the historical 2,500 VP price, now for 30 days of VIP.
 */

export type VipOffer = {
  id: string;
  label: string;
  /** VP cost of this offer. */
  vpCost: number;
  durationDays: number;
  enabled: boolean;
};

export type VipConfig = {
  vpCost: number;
  durationDays: number;
  offers: VipOffer[];
};

export const DEFAULT_VIP_OFFER_ID = 'vip_month_vp';

export const DEFAULT_VIP_CONFIG: VipConfig = {
  vpCost: 2500,
  durationDays: 30,
  offers: [
    {
      id: DEFAULT_VIP_OFFER_ID,
      label: '1 Month VIP (VP)',
      vpCost: 2500,
      durationDays: 30,
      enabled: true,
    },
  ],
};

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseOffer(raw: unknown, index: number): VipOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `offer_${index}`;
  const label =
    typeof o.label === 'string' && o.label.trim() ? o.label.trim() : `Offer ${index + 1}`;
  return {
    id,
    label,
    vpCost: Math.max(0, Math.floor(num(o.vpCost, 0))),
    durationDays: Math.max(1, Math.floor(num(o.durationDays, 30))),
    enabled: o.enabled !== false,
  };
}

function cloneDefaults(): VipConfig {
  return {
    ...DEFAULT_VIP_CONFIG,
    offers: DEFAULT_VIP_CONFIG.offers.map((o) => ({ ...o })),
  };
}

export function parseVipConfig(raw: unknown): VipConfig {
  let obj: Record<string, unknown> = {};
  try {
    if (typeof raw === 'string') {
      const parsed: unknown = JSON.parse(raw || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
      }
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      obj = raw as Record<string, unknown>;
    }
  } catch {
    return cloneDefaults();
  }

  const base = DEFAULT_VIP_CONFIG;
  const offersRaw = Array.isArray(obj.offers) ? obj.offers : null;
  const offers = offersRaw
    ? (offersRaw.map(parseOffer).filter(Boolean) as VipOffer[])
    : base.offers.map((o) => ({ ...o }));

  return {
    vpCost: Math.max(0, Math.floor(num(obj.vpCost, base.vpCost))),
    durationDays: Math.max(1, Math.floor(num(obj.durationDays, base.durationDays))),
    offers: offers.length > 0 ? offers : base.offers.map((o) => ({ ...o })),
  };
}

export function serializeVipConfig(cfg: VipConfig): string {
  return JSON.stringify(parseVipConfig(cfg));
}

/**
 * Resolve which offer a purchase refers to. Falls back to the first enabled offer, then to a
 * synthetic offer built from the top-level vpCost/durationDays. Returns null only if the caller
 * asked for a specific id that does not exist or is disabled.
 */
export function resolveVipOffer(cfg: VipConfig, offerId?: string | null): VipOffer | null {
  if (offerId) {
    const found = cfg.offers.find((o) => o.id === offerId);
    return found && found.enabled ? found : null;
  }
  const firstEnabled = cfg.offers.find((o) => o.enabled);
  if (firstEnabled) return firstEnabled;
  return {
    id: DEFAULT_VIP_OFFER_ID,
    label: 'VIP',
    vpCost: cfg.vpCost,
    durationDays: cfg.durationDays,
    enabled: true,
  };
}
