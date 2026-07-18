import type { Metadata } from 'next';
import { Space_Grotesk as SpaceGrotesk } from 'next/font/google';
import { SessionProvider } from 'next-auth/react';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

const spaceGrotesk = SpaceGrotesk({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Kilrun',
  description: 'A deathrun game launcher and hub.',
  icons: {
    icon: [{ url: '/K2.png', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', type: 'image/png' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: 'hsl(356, 73%, 56%)',
          colorBackground: 'hsl(222, 47%, 11%)',
          colorTextOnPrimaryBackground: 'hsl(0, 0%, 98%)',
        },
      }}
    >
      <html lang="en" className="dark">
        <body
          suppressHydrationWarning
          className={cn(
            'min-h-screen bg-background font-sans antialiased',
            spaceGrotesk.variable
          )}
        >
          <SessionProvider>
            {children}
            <Toaster />
          </SessionProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
