'use server';

/**
 * Admin "Secrets" vault: a step-up gated (Face ID / Windows Hello passkey,
 * or a dedicated vault password — separate from the Steam login, which has
 * no password to reuse) area to manage runtime secrets like
 * GAME_SERVER_ADMIN_SECRET without a Vercel dashboard trip. See
 * src/lib/site-secrets.ts for how values actually take effect, and
 * src/lib/secrets-crypto.ts for the at-rest encryption.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'crypto';
import { cookies } from 'next/headers';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifyRegistrationResponseOpts,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorDevice,
} from '@simplewebauthn/types';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isAdminRole } from '@/lib/roles';
import { writeAuditLog } from '@/lib/audit';
import {
  encryptSecret,
  decryptSecret,
  siteSecretsEncryptionConfigured,
} from '@/lib/secrets-crypto';
import { invalidateSiteSecretCache, listSiteSecretSummaries, type SiteSecretSummary } from '@/lib/site-secrets';
import { issueVaultSession, hasValidVaultSession, clearVaultSession } from '@/lib/vault-session';

const CHALLENGE_COOKIE = 'kilrun_vault_challenge';
const CHALLENGE_TTL_SEC = 5 * 60;

async function requireAdminActor() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !isAdminRole(user.role)) {
    throw new Error('Admin only');
  }
  return user;
}

async function requireUnlockedActor() {
  const actor = await requireAdminActor();
  if (!(await hasValidVaultSession(actor.id))) {
    throw new Error('Vault is locked — verify with your passkey or vault password first.');
  }
  return actor;
}

function rpIdAndOrigin() {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').trim();
  let rpID = 'localhost';
  let origin = site;
  try {
    const u = new URL(site);
    rpID = u.hostname;
    origin = u.origin;
  } catch {
    /* keep defaults */
  }
  return { rpID, origin };
}

function challengeSigningSecret(): string {
  const secret = process.env.SITE_SECRETS_ENCRYPTION_KEY || process.env.AUTH_SECRET || '';
  if (!secret) throw new Error('No signing secret available');
  return secret;
}

async function stashChallenge(userId: string, challenge: string, purpose: 'register' | 'authenticate') {
  const exp = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SEC;
  const payload = JSON.stringify({ userId, challenge, purpose, exp });
  const sig = createHmac('sha256', challengeSigningSecret()).update(payload).digest('base64url');
  const store = await cookies();
  store.set(CHALLENGE_COOKIE, `${Buffer.from(payload).toString('base64url')}.${sig}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CHALLENGE_TTL_SEC,
  });
}

async function readChallenge(
  userId: string,
  purpose: 'register' | 'authenticate'
): Promise<string> {
  const store = await cookies();
  const raw = store.get(CHALLENGE_COOKIE)?.value;
  if (!raw) throw new Error('No pending challenge — restart the registration/verification.');
  const [body, sig] = raw.split('.');
  const payload = Buffer.from(body, 'base64url').toString('utf8');
  const expectedSig = createHmac('sha256', challengeSigningSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Challenge signature invalid — restart the request.');
  }
  const parsed = JSON.parse(payload) as {
    userId: string;
    challenge: string;
    purpose: string;
    exp: number;
  };
  if (parsed.userId !== userId || parsed.purpose !== purpose) {
    throw new Error('Challenge does not match this request — restart it.');
  }
  if (parsed.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Challenge expired — restart the request.');
  }
  store.delete(CHALLENGE_COOKIE);
  return parsed.challenge;
}

type StoredPasskey = {
  credentialId: string; // base64url
  publicKey: string; // base64
  counter: number;
  transports: string[];
  label: string;
  createdAt: string;
};

async function getOrCreateVault(userId: string) {
  const existing = await prisma.adminVault.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.adminVault.create({ data: { userId } });
}

function storedPasskeys(vault: { passkeys: unknown }): StoredPasskey[] {
  return Array.isArray(vault.passkeys) ? (vault.passkeys as StoredPasskey[]) : [];
}

export interface VaultStatus {
  encryptionConfigured: boolean;
  hasPassword: boolean;
  passkeyCount: number;
  unlocked: boolean;
}

export async function getVaultStatus(): Promise<VaultStatus> {
  const actor = await requireAdminActor();
  const encryptionConfigured = siteSecretsEncryptionConfigured();
  const vault = await prisma.adminVault.findUnique({ where: { userId: actor.id } });
  return {
    encryptionConfigured,
    hasPassword: Boolean(vault?.passwordHash),
    passkeyCount: storedPasskeys(vault ?? { passkeys: null }).length,
    unlocked: await hasValidVaultSession(actor.id),
  };
}

function hashVaultPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyVaultPasswordHash(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * First-time setup has no prior credential to gate behind (bootstrap case).
 * Once ANY password or passkey exists, changing it requires an unlocked
 * vault session so a hijacked admin login alone can't silently swap it out.
 */
export async function setVaultPassword(
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminActor();
  if (newPassword.length < 8) {
    return { ok: false, error: 'Use at least 8 characters.' };
  }
  const vault = await getOrCreateVault(actor.id);
  const alreadyConfigured = Boolean(vault.passwordHash) || storedPasskeys(vault).length > 0;
  if (alreadyConfigured && !(await hasValidVaultSession(actor.id))) {
    return { ok: false, error: 'Unlock the vault before changing its password.' };
  }
  await prisma.adminVault.update({
    where: { userId: actor.id },
    data: { passwordHash: hashVaultPassword(newPassword) },
  });
  await writeAuditLog({
    actorId: actor.id,
    actorUsername: actor.username,
    action: 'vault_password_set',
    detail: alreadyConfigured ? 'changed' : 'first-time setup',
  });
  return { ok: true };
}

export async function verifyVaultPassword(
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminActor();
  const vault = await prisma.adminVault.findUnique({ where: { userId: actor.id } });
  if (!vault?.passwordHash) return { ok: false, error: 'No vault password set yet.' };
  if (!verifyVaultPasswordHash(password, vault.passwordHash)) {
    return { ok: false, error: 'Incorrect password.' };
  }
  await issueVaultSession(actor.id);
  return { ok: true };
}

export async function lockVault(): Promise<{ ok: true }> {
  await clearVaultSession();
  return { ok: true };
}

// ---- WebAuthn passkey registration (Face ID / Windows Hello / fingerprint) ----

export async function startPasskeyRegistration() {
  const actor = await requireAdminActor();
  const vault = await getOrCreateVault(actor.id);
  const alreadyConfigured = Boolean(vault.passwordHash) || storedPasskeys(vault).length > 0;
  if (alreadyConfigured && !(await hasValidVaultSession(actor.id))) {
    throw new Error('Unlock the vault before adding another passkey.');
  }
  const { rpID } = rpIdAndOrigin();
  const options = await generateRegistrationOptions({
    rpName: 'Kilrun Admin Vault',
    rpID,
    userID: actor.id,
    userName: actor.username,
    userDisplayName: actor.username,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
    excludeCredentials: storedPasskeys(vault).map((p) => ({
      id: Buffer.from(p.credentialId, 'base64url'),
      type: 'public-key' as const,
      transports: p.transports as AuthenticatorDevice['transports'],
    })),
  });
  await stashChallenge(actor.id, options.challenge, 'register');
  return options;
}

export async function finishPasskeyRegistration(
  response: RegistrationResponseJSON,
  label: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminActor();
  const { rpID, origin } = rpIdAndOrigin();
  let expectedChallenge: string;
  try {
    expectedChallenge = await readChallenge(actor.id, 'register');
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Challenge error' };
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    } satisfies VerifyRegistrationResponseOpts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Verification failed' };
  }
  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: 'Passkey could not be verified.' };
  }

  const { credentialID, credentialPublicKey, counter, credentialDeviceType } =
    verification.registrationInfo;
  const vault = await getOrCreateVault(actor.id);
  const passkeys = storedPasskeys(vault);
  passkeys.push({
    credentialId: Buffer.from(credentialID).toString('base64url'),
    publicKey: Buffer.from(credentialPublicKey).toString('base64'),
    counter,
    transports: (response.response.transports as string[] | undefined) ?? [],
    label: label.trim().slice(0, 60) || (credentialDeviceType === 'multiDevice' ? 'Passkey' : 'Device passkey'),
    createdAt: new Date().toISOString(),
  });
  await prisma.adminVault.update({ where: { userId: actor.id }, data: { passkeys } });
  // First passkey ever registered also unlocks this session — otherwise the
  // admin would register a Face ID passkey and immediately be locked out by
  // their own new gate.
  await issueVaultSession(actor.id);
  await writeAuditLog({
    actorId: actor.id,
    actorUsername: actor.username,
    action: 'vault_passkey_registered',
    detail: label,
  });
  return { ok: true };
}

export interface PasskeySummary {
  credentialId: string;
  label: string;
  createdAt: string;
}

export async function listPasskeys(): Promise<PasskeySummary[]> {
  const actor = await requireUnlockedActor();
  const vault = await getOrCreateVault(actor.id);
  return storedPasskeys(vault).map((p) => ({
    credentialId: p.credentialId,
    label: p.label,
    createdAt: p.createdAt,
  }));
}

export async function removePasskey(credentialId: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireUnlockedActor();
  const vault = await getOrCreateVault(actor.id);
  const passkeys = storedPasskeys(vault).filter((p) => p.credentialId !== credentialId);
  await prisma.adminVault.update({ where: { userId: actor.id }, data: { passkeys } });
  await writeAuditLog({
    actorId: actor.id,
    actorUsername: actor.username,
    action: 'vault_passkey_removed',
    detail: credentialId,
  });
  return { ok: true };
}

// ---- WebAuthn passkey authentication (unlock) ----

export async function startPasskeyLogin() {
  const actor = await requireAdminActor();
  const vault = await prisma.adminVault.findUnique({ where: { userId: actor.id } });
  const passkeys = storedPasskeys(vault ?? { passkeys: null });
  if (!passkeys.length) throw new Error('No passkeys registered for this account.');
  const { rpID } = rpIdAndOrigin();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: passkeys.map((p) => ({
      id: Buffer.from(p.credentialId, 'base64url'),
      type: 'public-key' as const,
      transports: p.transports as AuthenticatorDevice['transports'],
    })),
  });
  await stashChallenge(actor.id, options.challenge, 'authenticate');
  return options;
}

export async function finishPasskeyLogin(
  response: AuthenticationResponseJSON
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminActor();
  const { rpID, origin } = rpIdAndOrigin();
  let expectedChallenge: string;
  try {
    expectedChallenge = await readChallenge(actor.id, 'authenticate');
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Challenge error' };
  }

  const vault = await getOrCreateVault(actor.id);
  const passkeys = storedPasskeys(vault);
  const stored = passkeys.find((p) => p.credentialId === response.id);
  if (!stored) return { ok: false, error: 'Unknown passkey.' };

  const authenticator: AuthenticatorDevice = {
    credentialID: new Uint8Array(Buffer.from(stored.credentialId, 'base64url')),
    credentialPublicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64')),
    counter: stored.counter,
    transports: stored.transports as AuthenticatorDevice['transports'],
  };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Verification failed' };
  }
  if (!verification.verified) return { ok: false, error: 'Passkey verification failed.' };

  stored.counter = verification.authenticationInfo.newCounter;
  await prisma.adminVault.update({ where: { userId: actor.id }, data: { passkeys } });
  await issueVaultSession(actor.id);
  return { ok: true };
}

// ---- Secrets CRUD (all require an unlocked vault session) ----

export async function listSecrets(): Promise<SiteSecretSummary[]> {
  await requireUnlockedActor();
  return listSiteSecretSummaries();
}

export async function setSecret(
  rawKey: string,
  value: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireUnlockedActor();
  const key = rawKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (!key) return { ok: false, error: 'Key is required.' };
  if (!value) return { ok: false, error: 'Value is required.' };
  if (!siteSecretsEncryptionConfigured()) {
    return {
      ok: false,
      error: 'SITE_SECRETS_ENCRYPTION_KEY is not set on this deployment — cannot store secrets yet.',
    };
  }
  const valueEncrypted = encryptSecret(value);
  await prisma.siteSecret.upsert({
    where: { key },
    create: { key, valueEncrypted, updatedByUserId: actor.id, updatedByUsername: actor.username },
    update: { valueEncrypted, updatedByUserId: actor.id, updatedByUsername: actor.username },
  });
  invalidateSiteSecretCache(key);
  await writeAuditLog({
    actorId: actor.id,
    actorUsername: actor.username,
    action: 'site_secret_set',
    detail: key,
  });
  return { ok: true };
}

export async function deleteSecret(rawKey: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireUnlockedActor();
  const key = rawKey.trim().toUpperCase();
  try {
    await prisma.siteSecret.delete({ where: { key } });
  } catch {
    return { ok: false, error: 'Not found.' };
  }
  invalidateSiteSecretCache(key);
  await writeAuditLog({
    actorId: actor.id,
    actorUsername: actor.username,
    action: 'site_secret_deleted',
    detail: key,
  });
  return { ok: true };
}

export async function revealSecret(
  rawKey: string
): Promise<{ ok: boolean; value?: string; error?: string }> {
  const actor = await requireUnlockedActor();
  const key = rawKey.trim().toUpperCase();
  const row = await prisma.siteSecret.findUnique({ where: { key } });
  if (!row?.valueEncrypted) return { ok: false, error: 'Not set in the vault.' };
  try {
    const value = decryptSecret(row.valueEncrypted);
    await writeAuditLog({
      actorId: actor.id,
      actorUsername: actor.username,
      action: 'site_secret_revealed',
      detail: key,
    });
    return { ok: true, value };
  } catch {
    return { ok: false, error: 'Could not decrypt — the encryption key may have changed.' };
  }
}
