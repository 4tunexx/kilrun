/**
 * Pixel-perfect Kilrun verification email (table-based for Gmail / Outlook).
 * Used when Clerk "Delivered by Clerk" is OFF and we send via Resend.
 */
export function buildKilrunVerificationEmailHtml(opts: {
  code: string;
  toEmail: string;
  logoUrl?: string;
}): { subject: string; html: string; text: string } {
  const code = opts.code.replace(/\D/g, '').slice(0, 8) || '------';
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kilrun.vercel.app').replace(
    /\/$/,
    ''
  );
  const logo = opts.logoUrl?.trim() || `${site}/K2.png`;
  const year = new Date().getFullYear();

  const subject = `${code} is your Kilrun verification code`;

  const text = [
    'Kilrun — Email verification',
    '',
    `Your verification code is: ${code}`,
    '',
    'Enter this code in Kilrun to confirm your email and unlock +100 VP.',
    'Do not share this code with anyone.',
    '',
    `Sent to ${opts.toEmail}`,
    `© ${year} Kilrun`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kilrun verification</title>
</head>
<body style="margin:0;padding:0;background:#020617;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#020617;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#0b1220;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 8px 32px;text-align:center;background:linear-gradient(180deg,#111827 0%,#0b1220 100%);">
              <img src="${escapeHtml(logo)}" width="56" height="56" alt="Kilrun" style="display:block;margin:0 auto 12px auto;border-radius:12px;border:1px solid #334155;background:#020617;object-fit:contain;" />
              <div style="font-size:28px;font-weight:800;color:#f8fafc;letter-spacing:-0.02em;">Kilrun</div>
              <div style="margin-top:6px;font-size:11px;font-weight:700;letter-spacing:0.18em;color:#64748b;">DEATHRUN HUB · EMAIL VERIFICATION</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px 32px;text-align:center;">
              <p style="margin:0;font-size:15px;line-height:24px;color:#e2e8f0;">
                Enter this code in Kilrun to confirm your email and unlock
                <span style="color:#f87171;font-weight:700;">+100 VP</span>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#111827;border:1px solid #334155;border-radius:14px;">
                <tr>
                  <td style="padding:22px 16px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;letter-spacing:0.16em;color:#94a3b8;margin-bottom:8px;">VERIFICATION CODE</div>
                    <div style="font-size:40px;font-weight:800;letter-spacing:0.35em;color:#f8fafc;font-family:Consolas,Monaco,monospace;">${escapeHtml(code)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px 32px;text-align:center;">
              <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#f87171;">Do not share this code with anyone.</p>
              <p style="margin:0;font-size:12px;line-height:18px;color:#64748b;">
                If you didn’t request this, ignore this email. Your Kilrun account stays safe.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px 32px;border-top:1px solid #1e293b;text-align:center;background:#020617;">
              <div style="font-size:11px;color:#475569;">© ${year} Kilrun · Deathrun hub</div>
              <div style="font-size:11px;color:#334155;margin-top:4px;">Sent to ${escapeHtml(opts.toEmail)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
