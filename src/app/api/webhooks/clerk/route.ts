import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { prisma } from '@/lib/prisma';
import { buildKilrunVerificationEmailHtml } from '@/lib/email/kilrun-verification-email';
import { sendWithResend } from '@/lib/email/send-resend';
import {
  resolveGameDisabled,
  resolveHeaderLogo,
  resolveMarkLogo,
} from '@/lib/branding';
import { getLandingPageData } from '@/lib/actions';

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkUserData {
  id: string;
  email_addresses: ClerkEmailAddress[];
  primary_email_address_id: string | null;
  unsafe_metadata?: Record<string, unknown>;
  public_metadata?: Record<string, unknown>;
}

interface ClerkEmailCreatedData {
  slug?: string;
  to_email_address?: string;
  subject?: string;
  body?: string;
  body_plain?: string;
  data?: {
    otp?: string;
    otp_code?: string;
    code?: string;
  };
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserData | ClerkEmailCreatedData;
}

/**
 * Clerk webhooks:
 * - user.created / user.updated → attach verified email to Steam profile (+100 VP)
 * - email.created → when "Delivered by Clerk" is OFF, send Kilrun HTML via Resend
 */
export async function POST(req: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('CLERK_WEBHOOK_SECRET is not configured.');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  const body = await req.text();

  let event: ClerkWebhookEvent;
  try {
    const webhook = new Webhook(webhookSecret);
    event = webhook.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error('Clerk webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'email.created') {
    return handleEmailCreated(event.data as ClerkEmailCreatedData);
  }

  if (event.type === 'user.created' || event.type === 'user.updated') {
    return handleUserEmailVerified(event.data as ClerkUserData);
  }

  return NextResponse.json({ received: true, skipped: event.type });
}

async function handleEmailCreated(data: ClerkEmailCreatedData) {
  const slug = data.slug || '';
  const to = data.to_email_address?.trim();
  const otp =
    data.data?.otp ||
    data.data?.otp_code ||
    data.data?.code ||
    extractOtpFromText(data.body_plain || data.body || '');

  // Only customize verification codes; ignore other Clerk emails for now.
  if (!slug.includes('verification') && !otp) {
    return NextResponse.json({ received: true, skipped: 'not verification' });
  }

  if (!to || !otp) {
    console.warn('[clerk email.created] missing to/otp', {
      slug,
      to,
      hasOtp: Boolean(otp),
    });
    return NextResponse.json({ received: true, skipped: 'missing to or otp' });
  }

  try {
    const site = (
      process.env.NEXT_PUBLIC_SITE_URL || 'https://kilrun.vercel.app'
    ).replace(/\/$/, '');

    const toAbsolute = (pathOrUrl: string, fallbackPath: string) => {
      const v = pathOrUrl?.trim() || fallbackPath;
      // Data URLs / blob paths are unreliable in email clients — use public asset.
      if (v.startsWith('data:') || v.startsWith('blob:')) {
        return `${site}${fallbackPath}`;
      }
      if (v.startsWith('http://') || v.startsWith('https://')) return v;
      return `${site}${v.startsWith('/') ? v : `/${v}`}`;
    };

    let wordmarkUrl = `${site}/kilrun.png`;
    let markUrl = `${site}/K2.png`;
    let stats: {
      registeredPlayers: number;
      matchesPlayed: number;
      matchesPlayedToday: number;
      vpEarned: number;
      gameOnline: boolean;
    } | null = null;

    try {
      const [settings, landing] = await Promise.all([
        prisma.siteSettings.findUnique({ where: { singletonKey: 'default' } }),
        getLandingPageData(),
      ]);
      wordmarkUrl = toAbsolute(
        resolveHeaderLogo(settings?.headerLogoUrl),
        '/kilrun.png'
      );
      markUrl = toAbsolute(resolveMarkLogo(settings?.logoUrl), '/K2.png');
      stats = {
        registeredPlayers: landing.stats.registeredPlayers,
        matchesPlayed: landing.stats.matchesPlayed,
        matchesPlayedToday: landing.stats.matchesPlayedToday,
        vpEarned: landing.stats.vpEarned,
        gameOnline: !resolveGameDisabled({
          gameDisabled: settings?.gameDisabled,
          gameDisabledUntil: settings?.gameDisabledUntil,
        }),
      };
    } catch {
      // branding/stats optional — email still sends with defaults
    }

    const mail = buildKilrunVerificationEmailHtml({
      code: otp,
      toEmail: to,
      wordmarkUrl,
      markUrl,
      stats,
    });
    await sendWithResend({ to, ...mail });
    console.info('[clerk email.created] Kilrun verification email sent to', to);
    return NextResponse.json({ received: true, sent: true });
  } catch (err) {
    console.error('[clerk email.created] send failed', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Send failed',
      },
      { status: 500 }
    );
  }
}

function extractOtpFromText(text: string): string | null {
  const m = text.match(/\b(\d{6})\b/);
  return m?.[1] ?? null;
}

async function handleUserEmailVerified(data: ClerkUserData) {
  // Only trust public_metadata — unsafe_metadata is client-writable.
  const steamId = data.public_metadata?.steamId as string | undefined;

  const primaryEmail =
    data.email_addresses.find((e) => e.id === data.primary_email_address_id)
      ?.email_address ?? data.email_addresses[0]?.email_address;

  if (!steamId) {
    console.warn('Clerk user event without steamId, ignoring:', data.id);
    return NextResponse.json({ received: true, skipped: 'no steamId metadata' });
  }

  if (!primaryEmail) {
    console.warn('Clerk user event without email, ignoring:', data.id);
    return NextResponse.json({ received: true, skipped: 'no email address' });
  }

  const existing = await prisma.user.findUnique({ where: { steamId } });
  if (!existing) {
    console.warn('Clerk user event linked to unknown steamId:', steamId);
    return NextResponse.json({ received: true, skipped: 'unknown steamId' });
  }

  const alreadyVerified = existing.emailVerified;

  await prisma.user.update({
    where: { steamId },
    data: {
      clerkId: data.id,
      email: primaryEmail,
      emailVerified: true,
      ...(alreadyVerified ? {} : { vpCurrency: { increment: 100 } }),
    },
  });

  if (!alreadyVerified) {
    try {
      const { processWebsiteAction } = await import('@/lib/progression-actions');
      const { runAsTrustedServer } = await import('@/lib/trusted-server');
      await runAsTrustedServer(async () => {
        await processWebsiteAction(existing.id, 'email');
      });
    } catch (err) {
      console.error('[clerk webhook] email progression failed', err);
    }
  }

  return NextResponse.json({ received: true });
}
