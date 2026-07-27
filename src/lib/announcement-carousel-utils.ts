export const ANNOUNCEMENT_ACTIVITY_LOOKBACK_DAYS = 90;

export function getAnnouncementActivityCutoff(
  now: Date,
  lookbackDays = ANNOUNCEMENT_ACTIVITY_LOOKBACK_DAYS
): Date {
  return new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
}
