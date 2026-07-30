import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_KEY = process.env.SITE_SECRETS_ENCRYPTION_KEY;

describe('secrets-crypto', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SITE_SECRETS_ENCRYPTION_KEY = 'test-only-key-do-not-use-in-prod';
  });

  afterEach(() => {
    process.env.SITE_SECRETS_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it('round-trips a plaintext value', async () => {
    const { encryptSecret, decryptSecret } = await import('./secrets-crypto');
    const blob = encryptSecret('super-secret-value');
    expect(blob).not.toContain('super-secret-value');
    expect(decryptSecret(blob)).toBe('super-secret-value');
  });

  it('produces a different ciphertext each time (random IV)', async () => {
    const { encryptSecret } = await import('./secrets-crypto');
    const a = encryptSecret('same-value');
    const b = encryptSecret('same-value');
    expect(a).not.toBe(b);
  });

  it('rejects tampered ciphertext', async () => {
    const { encryptSecret, decryptSecret } = await import('./secrets-crypto');
    const blob = encryptSecret('secret');
    const buf = Buffer.from(blob, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip a bit in the ciphertext
    const tampered = buf.toString('base64');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('throws instead of silently using plaintext when no key is configured', async () => {
    delete process.env.SITE_SECRETS_ENCRYPTION_KEY;
    const { encryptSecret, siteSecretsEncryptionConfigured } = await import('./secrets-crypto');
    expect(siteSecretsEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret('x')).toThrow(/SITE_SECRETS_ENCRYPTION_KEY/);
  });
});
