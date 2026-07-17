import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { prisma } from '@/lib/prisma';

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkUserCreatedData {
  id: string;
  email_addresses: ClerkEmailAddress[];
  primary_email_address_id: string | null;
  unsafe_metadata?: Record<string, unknown>;
  public_metadata?: Record<string, unknown>;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserCreatedData;
}

/**
 * Syncs Clerk's `user.created` event (fired once a player successfully types
 * in their 6-digit "Arcade Verification Key") back to the player's existing
 * Steam-created MongoDB profile. Steam remains the sole login mechanism --
 * this route only ever attaches/updates the email side of an existing
 * account, it never creates a brand-new player on its own.
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

  // Attach email on first verify (user.created) and on later email changes
  // (Clerk may emit user.updated when a new address is verified).
  if (event.type !== 'user.created' && event.type !== 'user.updated') {
    return NextResponse.json({ received: true, skipped: event.type });
  }

  const { data } = event;

  const steamId =
    (data.unsafe_metadata?.steamId as string | undefined) ??
    (data.public_metadata?.steamId as string | undefined);

  const primaryEmail =
    data.email_addresses.find((e) => e.id === data.primary_email_address_id)?.email_address ??
    data.email_addresses[0]?.email_address;

  if (!steamId) {
    console.warn('Clerk user.created without a linked steamId, ignoring:', data.id);
    return NextResponse.json({ received: true, skipped: 'no steamId metadata' });
  }

  if (!primaryEmail) {
    console.warn('Clerk user.created without an email address, ignoring:', data.id);
    return NextResponse.json({ received: true, skipped: 'no email address' });
  }

  const existing = await prisma.user.findUnique({ where: { steamId } });
  if (!existing) {
    console.warn('Clerk user.created linked to an unknown steamId, ignoring:', steamId);
    return NextResponse.json({ received: true, skipped: 'unknown steamId' });
  }

  // Idempotent: only grant the 100 VP Welcome Bonus the first time this
  // player's email gets verified, even if the webhook is ever redelivered.
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

  return NextResponse.json({ received: true });
}
