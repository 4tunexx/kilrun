import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kilrun.vercel.app';
  return [
    {
      url: `${siteUrl}/landing`,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
