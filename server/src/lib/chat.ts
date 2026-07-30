/**
 * In-match live chat: sanitization, @admin/@mod mention detection, and
 * best-effort reporting of flagged messages to the Next.js app so staff get
 * a Notification + bell alert. Mirrors match-report.ts's fetch pattern —
 * fire-and-forget, never blocks or crashes the room on a network hiccup.
 */

const MAX_CHAT_CHARS = 240;

/**
 * Trim, cap length, strip control/newline chars. Returns null if empty.
 * Builds the "strip control characters" pass from char codes rather than a
 * literal regex escape, since raw control bytes in source tend to get
 * mangled by editors/transport layers.
 */
export function sanitizeChatText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let noControlChars = '';
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    const isControl = code <= 31 || code === 127;
    noControlChars += isControl ? ' ' : raw[i];
  }
  const cleaned = noControlChars.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_CHAT_CHARS);
}

export type StaffMention = 'admin' | 'mod';

/** Detects a whole-word @admin or @mod mention anywhere in the message. */
export function detectStaffMention(text: string): StaffMention | null {
  if (/(^|\s)@admin\b/i.test(text)) return 'admin';
  if (/(^|\s)@mod\b/i.test(text)) return 'mod';
  return null;
}

function resolveWebAppUrl(): string | null {
  const raw = (process.env.WEB_APP_URL || process.env.CLIENT_ORIGIN || '').trim();
  if (!raw || raw === '*') return null;
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return null;
  return raw.replace(/\/$/, '');
}

export type ChatFlagPayload = {
  mode: string;
  roomId: string;
  username: string;
  userId: string;
  text: string;
  mention: StaffMention;
};

/** Best-effort — never throws, never blocks the caller for long. */
export async function reportChatFlag(payload: ChatFlagPayload): Promise<void> {
  const base = resolveWebAppUrl();
  const secret = (process.env.GAME_SERVER_ADMIN_SECRET || '').trim();
  if (!base || !secret) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${base}/api/game/chat-flag`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ ...payload, secret }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[chat-flag] ${res.status} reporting mention`);
    }
  } catch (err) {
    console.error('[chat-flag] failed:', err);
  } finally {
    clearTimeout(timer);
  }
}
