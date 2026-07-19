import type { Metadata } from 'next';
import EmbedProfileClient from '@/components/embed-profile-client';

export const metadata: Metadata = {
  title: 'Kilrun Profile Embed',
  description: 'Live Kilrun mini profile card for embedding on forums and streams.',
  robots: { index: false, follow: false },
};

export default async function EmbedProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return (
    <main className="m-0 flex min-h-screen items-start justify-center bg-transparent p-0">
      <EmbedProfileClient userId={userId} />
    </main>
  );
}
