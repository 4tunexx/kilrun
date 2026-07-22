/**
 * Pixel-perfect Kilrun verification email (table-based for Gmail / Outlook).
 * Used when Clerk "Delivered by Clerk" is OFF and we send via Resend.
 *
 * Note: Gmail's inbox sender avatar (next to "Kilrun <…>") is NOT controlled by
 * this HTML — it requires a verified sending domain + BIMI. Until then, use the
 * Kilrun wordmark inside the email body (below).
 */

import { getSiteUrl } from '@/lib/site-url';

export type EmailHubStats = {
  registeredPlayers: number;
  matchesPlayed: number;
  matchesPlayedToday: number;
  vpEarned: number;
  gameOnline?: boolean;
};

export function buildKilrunVerificationEmailHtml(opts: {
  code: string;
  toEmail: string;
  /** Full Kilrun wordmark (e.g. /kilrun.png) — primary brand in the email. */
  wordmarkUrl?: string;
  /** Small mark (K2) — used as a tiny badge next to the wordmark if needed. */
  markUrl?: string;
  stats?: EmailHubStats | null;
}): { subject: string; html: string; text: string } {
  const code = opts.code.replace(/\D/g, '').slice(0, 8) || '------';
  const site = getSiteUrl();
  const wordmark = opts.wordmarkUrl?.trim() || `${site}/kilrun.png`;
  const mark = opts.markUrl?.trim() || `${site}/K2.png`;
  const year = new Date().getFullYear();
  const stats = opts.stats;

  const subject = `${code} is your Kilrun verification code`;

  const textStats = stats
    ? [
        '',
        'Hub stats',
        `Players: ${stats.registeredPlayers.toLocaleString()}`,
        `Matches: ${stats.matchesPlayed.toLocaleString()}`,
        `Today: ${stats.matchesPlayedToday.toLocaleString()}`,
        `VP earned: ${stats.vpEarned.toLocaleString()}`,
        `Game: ${stats.gameOnline === false ? 'Maintenance' : 'Online'}`,
      ]
    : [];

  const text = [
    'Kilrun — Email verification',
    '',
    `Your verification code is: ${code}`,
    '',
    'Enter this code in Kilrun to confirm your email and unlock +100 VP.',
    'Do not share this code with anyone.',
    ...textStats,
    '',
    `Sent to ${opts.toEmail}`,
    `© ${year} Kilrun`,
    site,
  ].join('\n');

  const statsRow = stats
    ? `
          <tr>
            <td style="padding:8px 28px 24px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#020617;border:1px solid #1e293b;border-radius:12px;">
                <tr>
                  <td colspan="4" style="padding:14px 14px 6px 14px;text-align:center;">
                    <div style="font-size:10px;font-weight:800;letter-spacing:0.18em;color:#64748b;">LIVE HUB STATS</div>
                  </td>
                </tr>
                <tr>
                  ${statCell('Players', formatStat(stats.registeredPlayers))}
                  ${statCell('Matches', formatStat(stats.matchesPlayed))}
                  ${statCell('Today', formatStat(stats.matchesPlayedToday))}
                  ${statCell('VP earned', formatStat(stats.vpEarned))}
                </tr>
                <tr>
                  <td colspan="4" style="padding:4px 14px 14px 14px;text-align:center;">
                    <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;${
                      stats.gameOnline === false
                        ? 'background:#7f1d1d;color:#fecaca;'
                        : 'background:#14532d;color:#bbf7d0;'
                    }">${
                      stats.gameOnline === false
                        ? '● Game maintenance'
                        : '● Game servers online'
                    }</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kilrun verification</title>
</head>
<body style="margin:0;padding:0;background:#020617;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Your Kilrun code is ${escapeHtml(code)}. Confirm email for +100 VP.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#020617;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#0b1220;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:32px 28px 12px 28px;text-align:center;background:linear-gradient(180deg,#111827 0%,#0b1220 100%);">
              <!-- Full Kilrun wordmark (replaces old small K + text logo) -->
              <img src="${escapeHtml(wordmark)}" width="240" alt="Kilrun" style="display:block;margin:0 auto;max-width:240px;width:100%;height:auto;border:0;outline:none;" />
              <div style="margin-top:14px;font-size:11px;font-weight:700;letter-spacing:0.18em;color:#64748b;">DEATHRUN HUB · EMAIL VERIFICATION</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 8px 28px;text-align:center;">
              <p style="margin:0;font-size:15px;line-height:24px;color:#e2e8f0;">
                Enter this code in Kilrun to confirm your email and unlock
                <span style="color:#f87171;font-weight:700;">+100 VP</span>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 8px 28px;">
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
            <td style="padding:16px 28px 8px 28px;text-align:center;">
              <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#f87171;">Do not share this code with anyone.</p>
              <p style="margin:0;font-size:12px;line-height:18px;color:#64748b;">
                If you didn’t request this, ignore this email. Your Kilrun account stays safe.
              </p>
            </td>
          </tr>
          ${statsRow}
          <tr>
            <td style="padding:16px 28px 24px 28px;border-top:1px solid #1e293b;text-align:center;background:#020617;">
              <a href="${escapeHtml(site)}" style="text-decoration:none;">
                <img src="${escapeHtml(mark)}" width="28" height="28" alt="Kilrun" style="display:inline-block;border-radius:8px;border:1px solid #334155;background:#020617;object-fit:contain;vertical-align:middle;" />
              </a>
              <div style="font-size:11px;color:#475569;margin-top:10px;">© ${year} Kilrun · Deathrun hub</div>
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

function statCell(label: string, value: string) {
  return `<td width="25%" style="padding:8px 4px 10px 4px;text-align:center;vertical-align:top;">
    <div style="font-size:16px;font-weight:800;color:#f8fafc;line-height:1.2;">${escapeHtml(value)}</div>
    <div style="font-size:10px;font-weight:600;letter-spacing:0.06em;color:#64748b;margin-top:4px;text-transform:uppercase;">${escapeHtml(label)}</div>
  </td>`;
}

function formatStat(n: number) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString('en-US');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
