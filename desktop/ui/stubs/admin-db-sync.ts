export type AdminDbSyncResult = {
  ok: boolean;
  syncedAt: string;
  steps: string[];
  cliPush: 'ok' | 'skipped' | 'failed';
  message?: string;
};

export async function adminSyncDatabaseSchema(): Promise<AdminDbSyncResult> {
  return {
    ok: false,
    syncedAt: new Date().toISOString(),
    steps: ['Database sync is a website-admin tool, not part of Kilrun Engine.'],
    cliPush: 'skipped',
    message: 'Use the Kilrun website Admin panel to sync the database.',
  };
}
