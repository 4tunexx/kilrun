'use client';

/**
 * Admin -> Secrets tab: runtime env-var-style secrets, gated behind a
 * step-up unlock (Face ID / Windows Hello passkey, or a dedicated vault
 * password — separate from Steam login, which has no password to reuse).
 * Values a "wired" key (see KNOWN_SECRET_KEYS) take effect immediately for
 * this app's own server-side code — no Vercel redeploy needed. A separate
 * game server host still needs its own matching value set the normal way.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Fingerprint,
  KeyRound,
  Lock,
  LockOpen,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { startAuthentication, startRegistration, platformAuthenticatorIsAvailable } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  getVaultStatus,
  verifyVaultPassword,
  setVaultPassword,
  lockVault,
  startPasskeyRegistration,
  finishPasskeyRegistration,
  startPasskeyLogin,
  finishPasskeyLogin,
  listPasskeys,
  removePasskey,
  listSecrets,
  setSecret,
  deleteSecret,
  revealSecret,
  type VaultStatus,
  type PasskeySummary,
} from '@/lib/site-secrets-actions';
import type { SiteSecretSummary } from '@/lib/site-secrets';

export function AdminSecretsVaultPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState('');

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getVaultStatus();
      setStatus(s);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Failed to load vault', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refreshStatus();
    platformAuthenticatorIsAvailable().then(setPasskeySupported).catch(() => setPasskeySupported(false));
  }, [refreshStatus]);

  const handlePasskeyUnlock = async () => {
    setBusy(true);
    try {
      const options = await startPasskeyLogin();
      const response = await startAuthentication(options);
      const result = await finishPasskeyLogin(response);
      if (!result.ok) {
        toast({ title: result.error || 'Passkey verification failed', variant: 'destructive' });
        return;
      }
      await refreshStatus();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Face ID / passkey unlock failed', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordUnlock = async () => {
    if (!passwordDraft) return;
    setBusy(true);
    try {
      const result = await verifyVaultPassword(passwordDraft);
      if (!result.ok) {
        toast({ title: result.error || 'Incorrect password', variant: 'destructive' });
        return;
      }
      setPasswordDraft('');
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const handleFirstTimeSetup = async () => {
    if (passwordDraft.length < 8) {
      toast({ title: 'Use at least 8 characters', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const result = await setVaultPassword(passwordDraft);
      if (!result.ok) {
        toast({ title: result.error || 'Could not set password', variant: 'destructive' });
        return;
      }
      const unlock = await verifyVaultPassword(passwordDraft);
      setPasswordDraft('');
      if (!unlock.ok) {
        toast({ title: unlock.error || 'Could not unlock', variant: 'destructive' });
      }
      await refreshStatus();
      toast({ title: 'Vault password set', description: 'You can also add a Face ID / Windows Hello passkey below.' });
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterPasskey = async () => {
    const label = window.prompt('Name this passkey (e.g. "iPhone Face ID", "Work PC")', '') ?? '';
    setBusy(true);
    try {
      const options = await startPasskeyRegistration();
      const response = await startRegistration(options);
      const result = await finishPasskeyRegistration(response, label);
      if (!result.ok) {
        toast({ title: result.error || 'Could not register passkey', variant: 'destructive' });
        return;
      }
      toast({ title: 'Passkey registered' });
      await refreshStatus();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Passkey registration failed', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center text-muted-foreground text-sm py-6">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading vault status...
      </div>
    );
  }

  if (!status) return null;

  if (!status.encryptionConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" /> Secrets vault not available yet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Set <code className="text-foreground">SITE_SECRETS_ENCRYPTION_KEY</code> in Vercel first — this is
            the one bootstrap secret the vault itself needs (it encrypts everything you store here). Use a
            long random value, e.g. generate one with{' '}
            <code className="text-foreground">openssl rand -base64 32</code>, then redeploy.
          </p>
          <p>Once that's set, come back here to set a vault password / Face ID passkey and start adding secrets.</p>
        </CardContent>
      </Card>
    );
  }

  if (!status.unlocked) {
    const neverConfigured = !status.hasPassword && status.passkeyCount === 0;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" />
            {neverConfigured ? 'Set up the Secrets vault' : 'Secrets vault is locked'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-sm">
          {neverConfigured ? (
            <>
              <p className="text-sm text-muted-foreground">
                This is separate from your Steam login — set a dedicated password for this vault, then
                optionally add Face ID / Windows Hello / fingerprint as a faster unlock.
              </p>
              <div className="space-y-2">
                <Label htmlFor="vault-pw-setup">Vault password</Label>
                <Input
                  id="vault-pw-setup"
                  type="password"
                  value={passwordDraft}
                  onChange={(e) => setPasswordDraft(e.target.value)}
                  placeholder="At least 8 characters"
                  onKeyDown={(e) => e.key === 'Enter' && handleFirstTimeSetup()}
                />
                <Button disabled={busy} onClick={handleFirstTimeSetup} className="w-full">
                  {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <KeyRound className="w-3.5 h-3.5 mr-1" />}
                  Set vault password
                </Button>
              </div>
            </>
          ) : (
            <>
              {status.passkeyCount > 0 && (
                <Button disabled={busy} onClick={handlePasskeyUnlock} className="w-full" variant="secondary">
                  {busy ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Fingerprint className="w-4 h-4 mr-2" />
                  )}
                  Use Face ID / Windows Hello
                </Button>
              )}
              {status.hasPassword && (
                <div className="space-y-2">
                  {status.passkeyCount > 0 && (
                    <p className="text-xs text-muted-foreground text-center">or use your vault password</p>
                  )}
                  <Input
                    type="password"
                    value={passwordDraft}
                    onChange={(e) => setPasswordDraft(e.target.value)}
                    placeholder="Vault password"
                    onKeyDown={(e) => e.key === 'Enter' && handlePasswordUnlock()}
                  />
                  <Button disabled={busy || !passwordDraft} onClick={handlePasswordUnlock} className="w-full">
                    <LockOpen className="w-3.5 h-3.5 mr-1" /> Unlock
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <UnlockedVault
      status={status}
      passkeySupported={passkeySupported}
      onRegisterPasskey={handleRegisterPasskey}
      onRefreshStatus={refreshStatus}
    />
  );
}

function UnlockedVault({
  status,
  passkeySupported,
  onRegisterPasskey,
  onRefreshStatus,
}: {
  status: VaultStatus;
  passkeySupported: boolean;
  onRegisterPasskey: () => Promise<void>;
  onRefreshStatus: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [secrets, setSecrets] = useState<SiteSecretSummary[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const [secretsList, passkeyList] = await Promise.all([listSecrets(), listPasskeys()]);
    setSecrets(secretsList);
    setPasskeys(passkeyList);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSave = async (key: string, value: string) => {
    if (!value) return;
    setBusyKey(key);
    try {
      const result = await setSecret(key, value);
      if (!result.ok) {
        toast({ title: result.error || 'Failed to save', variant: 'destructive' });
        return;
      }
      toast({ title: `${key} saved` });
      setNewKey('');
      setNewValue('');
      setEditDrafts((prev) => ({ ...prev, [key]: '' }));
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (key: string) => {
    if (!window.confirm(`Remove ${key} from the vault? The app will fall back to process.env if set.`)) return;
    setBusyKey(key);
    try {
      const result = await deleteSecret(key);
      if (!result.ok) {
        toast({ title: result.error || 'Failed to delete', variant: 'destructive' });
        return;
      }
      await refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const handleReveal = async (key: string) => {
    if (revealed[key] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setBusyKey(key);
    try {
      const result = await revealSecret(key);
      if (!result.ok) {
        toast({ title: result.error || 'Nothing to reveal', variant: 'destructive' });
        return;
      }
      setRevealed((prev) => ({ ...prev, [key]: result.value ?? '' }));
    } finally {
      setBusyKey(null);
    }
  };

  const handleLock = async () => {
    await lockVault();
    await onRefreshStatus();
  };

  const handleRemovePasskey = async (credentialId: string, label: string) => {
    if (!window.confirm(`Remove passkey "${label || 'Unnamed'}"?`)) return;
    const result = await removePasskey(credentialId);
    if (!result.ok) {
      toast({ title: result.error || 'Failed to remove', variant: 'destructive' });
      return;
    }
    await refresh();
    await onRefreshStatus();
  };

  if (loading) {
    return (
      <div className="flex items-center text-muted-foreground text-sm py-6">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading secrets...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Vault unlocked
            </span>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => void refresh()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
              </Button>
              <Button size="sm" variant="outline" onClick={handleLock}>
                <Lock className="w-3.5 h-3.5 mr-1" /> Lock now
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Re-locks automatically after 20 minutes. Passkeys let you unlock with Face ID / Windows Hello /
              fingerprint instead of typing the vault password every time.
            </p>
            {passkeySupported && (
              <Button size="sm" variant="secondary" onClick={() => void onRegisterPasskey()}>
                <Fingerprint className="w-3.5 h-3.5 mr-1" /> Add passkey
              </Button>
            )}
          </div>
          {passkeys.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {passkeys.map((p) => (
                <Badge
                  key={p.credentialId}
                  variant="outline"
                  className="text-xs gap-1.5 pr-1 cursor-pointer hover:bg-destructive/10 hover:border-destructive/40"
                  onClick={() => handleRemovePasskey(p.credentialId, p.label)}
                  title="Click to remove"
                >
                  <Fingerprint className="w-3 h-3" /> {p.label || 'Unnamed'}
                  <Trash2 className="w-3 h-3 opacity-50" />
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add / update a secret</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-2">
            <Input
              placeholder="KEY_NAME (e.g. GAME_SERVER_ADMIN_SECRET)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="font-mono text-xs"
            />
            <Input
              placeholder="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              type="password"
            />
            <Button
              disabled={!newKey.trim() || !newValue || busyKey === newKey.trim().toUpperCase()}
              onClick={() => handleSave(newKey, newValue)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Save
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Any key name works. Keys wired into the app (below) take effect immediately; anything else is
            stored securely for reference until a developer wires it up.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Secrets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {secrets.map((s) => {
            const isBusy = busyKey === s.key;
            const isRevealed = revealed[s.key] !== undefined;
            return (
              <div key={s.key} className="rounded-lg border border-border/60 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold">{s.key}</span>
                    {s.meta?.liveEffect && (
                      <Badge className="text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                        Live
                      </Badge>
                    )}
                    {s.meta?.crossHost && (
                      <Badge className="text-[10px] bg-amber-500/15 text-amber-300 border-amber-500/30">
                        Keep in sync with game server host
                      </Badge>
                    )}
                    {!s.meta && (
                      <Badge variant="outline" className="text-[10px]">
                        Custom — not wired up yet
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {s.hasVaultValue && (
                      <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => handleReveal(s.key)}>
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                    {s.hasVaultValue && (
                      <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => handleDelete(s.key)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                {s.meta?.description && (
                  <p className="text-[11px] text-muted-foreground">{s.meta.description}</p>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    value={isRevealed ? revealed[s.key] : editDrafts[s.key] ?? ''}
                    onChange={(e) => setEditDrafts((prev) => ({ ...prev, [s.key]: e.target.value }))}
                    placeholder={
                      s.hasVaultValue
                        ? s.hint
                        : s.hasEnvFallback
                          ? 'Using process.env value — set one here to override'
                          : s.meta?.placeholder || 'Not set'
                    }
                    type={isRevealed ? 'text' : 'password'}
                    className="font-mono text-xs h-8"
                  />
                  <Button
                    size="sm"
                    disabled={isBusy || !(editDrafts[s.key] ?? '').trim()}
                    onClick={() => handleSave(s.key, (editDrafts[s.key] ?? '').trim())}
                  >
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {s.hasVaultValue
                    ? `Vault value set${s.updatedByUsername ? ` by ${s.updatedByUsername}` : ''}${
                        s.updatedAt ? ` on ${new Date(s.updatedAt).toLocaleString()}` : ''
                      }.`
                    : s.hasEnvFallback
                      ? 'Not in the vault — currently using the process.env value.'
                      : 'Not set anywhere.'}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
