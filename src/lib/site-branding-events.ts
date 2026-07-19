/** Browser event so hub/landing pick up admin logo changes without a full reload. */
export const SITE_SETTINGS_UPDATED = 'kilrun:site-settings-updated';

export type SiteBrandingDetail = {
  logoUrl?: string | null;
  headerLogoUrl?: string | null;
  headerLogoStyle?: string | null;
  backgroundUrl?: string | null;
  homeHeroImage?: string | null;
  landingHeroImage?: string | null;
  landingHeroSlides?: string | null;
  headerTitle?: string | null;
  headerSubtitle?: string | null;
  hubPagesJson?: string | null;
  hubNavJson?: string | null;
  hubChromeJson?: string | null;
};

export function broadcastSiteSettings(settings: SiteBrandingDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(SITE_SETTINGS_UPDATED, { detail: settings })
  );
}

export function onSiteSettingsUpdated(
  handler: (settings: SiteBrandingDetail) => void
) {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    handler((event as CustomEvent<SiteBrandingDetail>).detail ?? {});
  };
  window.addEventListener(SITE_SETTINGS_UPDATED, listener);
  return () => window.removeEventListener(SITE_SETTINGS_UPDATED, listener);
}
