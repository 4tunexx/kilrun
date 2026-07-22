import { getSiteSettings } from '@/lib/progression-actions';
import LandingPageClient from './landing-page-client';

export default async function LandingPage() {
  let initialSettings: Awaited<ReturnType<typeof getSiteSettings>> | null =
    null;
  try {
    initialSettings = await getSiteSettings();
  } catch (error) {
    console.error('[landing] failed to load site settings', error);
  }

  return (
    <LandingPageClient
      initialSettings={{
        headerTitle: initialSettings?.headerTitle ?? null,
        headerSubtitle: initialSettings?.headerSubtitle ?? null,
        backgroundUrl: initialSettings?.backgroundUrl ?? null,
        landingHeroImage: initialSettings?.landingHeroImage ?? null,
        landingHeroSlides:
          (initialSettings as { landingHeroSlides?: string | null } | null)
            ?.landingHeroSlides ?? null,
        logoUrl: initialSettings?.logoUrl ?? null,
        headerLogoUrl:
          (initialSettings as { headerLogoUrl?: string | null } | null)
            ?.headerLogoUrl ?? null,
        headerLogoStyle:
          (initialSettings as { headerLogoStyle?: string | null } | null)
            ?.headerLogoStyle ?? null,
        hubChromeJson:
          (initialSettings as { hubChromeJson?: string | null } | null)
            ?.hubChromeJson ?? null,
      }}
    />
  );
}
