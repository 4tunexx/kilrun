/**
 * AES-256-GCM encryption for admin-managed runtime secrets (SiteSecret rows).
 * Keyed by SITE_SECRETS_ENCRYPTION_KEY — the one bootstrap secret that must
 * still be set the normal way (Vercel dashboard), since it's the root of
 * trust for everything stored through the vault. Fails closed: a missing or
 * malformed key throws rather than ever falling back to storing plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

/** Derive a 32-byte key from SITE_SECRETS_ENCRYPTION_KEY (any length input). */
function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = (process.env.SITE_SECRETS_ENCRYPTION_KEY || '').trim();
  if (!raw) {
    throw new Error(
      'SITE_SECRETS_ENCRYPTION_KEY is not set. Add a long random value in Vercel (this is the one ' +
        'bootstrap secret the Env vault itself needs) before storing secrets through the admin panel.'
    );
  }
  // scrypt derivation means any reasonably long/random input string works —
  // hex, base64, or a passphrase — without the operator needing an exact
  // byte-length value.
  cachedKey = scryptSync(raw, 'kilrun-site-secrets', 32);
  return cachedKey;
}

/** Encrypt a plaintext string into base64(iv[12] + authTag[16] + ciphertext). */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Decrypt a blob produced by encryptSecret(). Throws on tampering/wrong key. */
export function decryptSecret(blob: string): string {
  const key = loadKey();
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error('Malformed secret ciphertext');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const authTag = buf.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Whether the vault can actually be used (bootstrap key present). */
export function siteSecretsEncryptionConfigured(): boolean {
  return Boolean((process.env.SITE_SECRETS_ENCRYPTION_KEY || '').trim());
}
