/**
 * Announcement carousel config stored on SiteSettings.announcementCarouselJson.
 * Controls which event types appear, scroll speed, direction, and thickness.
 */

export type AnnouncementType =
  | 'firesale'
  | 'user_earn_vp'
  | 'user_won_match'
  | 'user_registered'
  | 'user_is_premium'
  | 'user_got_vip'
  | 'user_got_badge'
  | 'user_earn_achievement'
  | 'news';

export type CarouselDirection = 'left' | 'right';

export type AnnouncementCarouselConfig = {
  enabled: boolean;
  /** Which event types to show in the carousel. */
  types: AnnouncementType[];
  /** Scroll speed in pixels per second. */
  speed: number;
  direction: CarouselDirection;
  /** Height of the carousel band in pixels. */
  thickness: number;
};

export const ALL_ANNOUNCEMENT_TYPES: { value: AnnouncementType; label: string; emoji: string }[] =
  [
    { value: 'firesale', label: 'Fire Sale', emoji: '🔥' },
    { value: 'user_earn_vp', label: 'User Earned VP', emoji: '💰' },
    { value: 'user_won_match', label: 'User Won Match', emoji: '🏆' },
    { value: 'user_registered', label: 'User Registered', emoji: '👋' },
    { value: 'user_is_premium', label: 'User Got Premium', emoji: '💎' },
    { value: 'user_got_vip', label: 'User Got VIP', emoji: '👑' },
    { value: 'user_got_badge', label: 'User Got Badge', emoji: '🎖️' },
    { value: 'user_earn_achievement', label: 'User Earned Achievement', emoji: '🎯' },
    { value: 'news', label: 'News', emoji: '📰' },
  ];

export function defaultAnnouncementCarouselConfig(): AnnouncementCarouselConfig {
  return {
    enabled: false,
    types: ['firesale', 'user_registered', 'user_won_match', 'news'],
    speed: 60,
    direction: 'left',
    thickness: 40,
  };
}

export function parseAnnouncementCarouselConfig(raw: unknown): AnnouncementCarouselConfig {
  const base = defaultAnnouncementCarouselConfig();
  let obj: Record<string, unknown> = {};
  try {
    obj =
      typeof raw === 'string'
        ? (JSON.parse(raw || '{}') as Record<string, unknown>)
        : ((raw as Record<string, unknown>) ?? {});
  } catch {
    return base;
  }
  if (typeof obj.enabled === 'boolean') base.enabled = obj.enabled;
  if (Array.isArray(obj.types)) {
    const validTypes = new Set(ALL_ANNOUNCEMENT_TYPES.map((t) => t.value));
    base.types = obj.types.filter(
      (t): t is AnnouncementType => typeof t === 'string' && validTypes.has(t as AnnouncementType)
    );
  }
  if (typeof obj.speed === 'number' && obj.speed > 0) {
    base.speed = Math.min(Math.max(Math.round(obj.speed), 10), 300);
  }
  if (obj.direction === 'left' || obj.direction === 'right') {
    base.direction = obj.direction;
  }
  if (typeof obj.thickness === 'number' && obj.thickness > 0) {
    base.thickness = Math.min(Math.max(Math.round(obj.thickness), 24), 120);
  }
  return base;
}

export function serializeAnnouncementCarouselConfig(cfg: AnnouncementCarouselConfig): string {
  return JSON.stringify(cfg);
}
