import { clerkMiddleware } from '@clerk/nextjs/server';

// Clerk is only used here as the secondary "Arcade Verification Key" email-OTP
// widget layered on top of an existing Steam login (see /verify-email).
// Steam + NextAuth remains the one true auth/session gate for the app (see
// src/app/page.tsx), so this middleware intentionally does NOT protect any
// routes -- it just attaches Clerk's request context so the Clerk hooks used
// on the verify-email page and its webhook route work correctly.
export default clerkMiddleware();

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
