/**
 * Runtime resolution for admin-managed secrets: DB (vault) value first, then
 * process.env as fallback — so a value the admin sets via the Secrets tab
 * takes effect immediately, without a Vercel redeploy, for every call site
 * below that was refactored to call getSiteSecretValue() instead of reading
 * process.env directly.
 *
 * Short in-memory cache per warm serverless instance: fast enough not to add
 * a DB round trip to hot paths, short enough that a changed value shows up
 * within seconds across every instance.
 */
import { prisma } from '@/lib/prisma';
import { decryptSecret, siteSecretsEncryptionConfigured } from '@/lib/secrets-crypto';

const CACHE_TTL_MS = 20_000;

type CacheEntry = { value: string | undefined; at: number };
const cache = new Map<string, CacheEntry>();

export interface KnownSecretMeta {
  key: string;
  label: string;
  description: string;
  /** This app's own server-side code honors a vault override immediately. */
  liveEffect: boolean;
  /** Must be kept identical on a separately-deployed host (game server) — vault only controls this app's copy. */
  crossHost: boolean;
  placeholder?: string;
}

/** Catalog shown in the admin UI. Any other key can still be added freely — it's just stored until wired up. */
export const KNOWN_SECRET_KEYS: KnownSecretMeta[] = [
  {
    key: 'GAME_SERVER_ADMIN_SECRET',
    label: 'Game server admin secret',
    description:
      'Shared secret authorizing hub ↔ Colyseus admin calls (kick/ban, Live dashboard, match rewards).',
    liveEffect: true,
    crossHost: true,
  },
  {
    key: 'GAME_JOIN_TOKEN_SECRET',
    label: 'Game join token secret',
    description:
      'Signs short-lived match join tokens. Verified on the separate game server, which is hot-path code — ' +
      'stored here for reference, but this app still reads it from process.env, not the vault.',
    liveEffect: false,
    crossHost: true,
  },
  {
    key: 'NEXT_PUBLIC_GAME_SERVER_URL',
    label: 'Game server URL',
    description:
      'wss:// address of the deployed Colyseus server. Vault override fixes server-to-server admin calls ' +
      'immediately; the actual player connection is baked into the client bundle at build time and still ' +
      'needs the real Vercel env var + a redeploy to change.',
    liveEffect: true,
    crossHost: false,
    placeholder: 'wss://your-game-server.example.com',
  },
  {
    key: 'STEAM_API_KEY',
    label: 'Steam Web API key',
    description: 'Enriches player profiles after Steam OpenID login.',
    liveEffect: true,
    crossHost: false,
  },
  {
    key: 'RESEND_API_KEY',
    label: 'Resend API key',
    description: 'Sends verification / notification emails.',
    liveEffect: true,
    crossHost: false,
  },
  {
    key: 'RESEND_FROM_EMAIL',
    label: 'Resend "from" address',
    description: 'Sender shown on outgoing emails.',
    liveEffect: true,
    crossHost: false,
    placeholder: 'Kilrun <onboarding@resend.dev>',
  },
];

export function knownSecretMeta(key: string): KnownSecretMeta | undefined {
  return KNOWN_SECRET_KEYS.find((k) => k.key === key);
}

function readCache(key: string): { hit: boolean; value?: string } {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.at > CACHE_TTL_MS) return { hit: false };
  return { hit: true, value: entry.value };
}

/**
 * Resolve a secret: vault (DB) value if set, else process.env[key]. Safe to
 * call even when the vault has never been configured (falls through to env).
 */
export async function getSiteSecretValue(key: string): Promise<string | undefined> {
  const cached = readCache(key);
  if (cached.hit) return cached.value;

  let resolved: string | undefined = process.env[key] || undefined;
  if (siteSecretsEncryptionConfigured()) {
    try {
      const row = await prisma.siteSecret.findUnique({ where: { key } });
      if (row?.valueEncrypted) {
        resolved = decryptSecret(row.valueEncrypted);
      }
    } catch (err) {
      console.error(`[site-secrets] failed to read vault override for ${key}:`, err);
      // Fall through to the process.env value already resolved above.
    }
  }

  cache.set(key, { value: resolved, at: Date.now() });
  return resolved;
}

/** Invalidate the in-process cache for a key (call right after writing it). */
export function invalidateSiteSecretCache(key: string) {
  cache.delete(key);
}

export interface SiteSecretSummary {
  key: string;
  hasVaultValue: boolean;
  hint: string;
  updatedAt: string | null;
  updatedByUsername: string | null;
  hasEnvFallback: boolean;
  meta?: KnownSecretMeta;
}

/** Masked listing for the vault UI — never returns plaintext. */
export async function listSiteSecretSummaries(): Promise<SiteSecretSummary[]> {
  const rows = await prisma.siteSecret.findMany({ orderBy: { key: 'asc' } });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const allKeys = new Set<string>([...KNOWN_SECRET_KEYS.map((k) => k.key), ...byKey.keys()]);

  const summaries: SiteSecretSummary[] = [];
  for (const key of allKeys) {
    const row = byKey.get(key);
    let hint = '';
    if (row?.valueEncrypted) {
      try {
        const plain = decryptSecret(row.valueEncrypted);
        hint = plain.length <= 4 ? '••••' : `••••${plain.slice(-4)}`;
      } catch {
        hint = '(unreadable — re-enter)';
      }
    }
    summaries.push({
      key,
      hasVaultValue: Boolean(row?.valueEncrypted),
      hint,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
      updatedByUsername: row?.updatedByUsername ?? null,
      hasEnvFallback: Boolean(process.env[key]),
      meta: knownSecretMeta(key),
    });
  }
  return summaries.sort((a, b) => a.key.localeCompare(b.key));
}
