import type { Metadata } from 'next';
import { Space_Grotesk as SpaceGrotesk } from 'next/font/google';
import { SessionProvider } from 'next-auth/react';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { SiteThemeProvider } from '@/components/site-theme-provider';
import { cn } from '@/lib/utils';

const spaceGrotesk = SpaceGrotesk({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Kilrun',
  description: 'A deathrun game launcher and hub.',
  icons: {
    icon: [{ url: '/api/site-favicon', type: 'image/png' }],
    apple: [{ url: '/api/site-favicon', type: 'image/png' }],
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
          colorPrimary: 'hsl(var(--primary))',
          colorBackground: 'hsl(var(--background))',
          colorTextOnPrimaryBackground: 'hsl(var(--primary-foreground))',
        },
      }}
    >
      <html lang="en" className="dark" style={{ colorScheme: 'dark' }}>
        <body
          suppressHydrationWarning
          className={cn(
            'min-h-screen bg-background font-sans antialiased',
            spaceGrotesk.variable
          )}
        >
          <SessionProvider>
            <SiteThemeProvider>
              {children}
              <Toaster />
            </SiteThemeProvider>
          </SessionProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
