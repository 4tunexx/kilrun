import { Resend } from 'resend';
import { getSiteSecretValue } from '@/lib/site-secrets';

export async function sendWithResend(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = await getSiteSecretValue('RESEND_API_KEY');
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not set. Add it in .env / Vercel (or the admin Secrets vault) to send Kilrun emails.'
    );
  }

  const from =
    (await getSiteSecretValue('RESEND_FROM_EMAIL'))?.trim() ||
    'Kilrun <onboarding@resend.dev>';

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (result.error) {
    throw new Error(result.error.message || 'Resend send failed');
  }

  return result.data;
}
