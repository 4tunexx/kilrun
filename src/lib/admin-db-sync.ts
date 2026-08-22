'use server';

/**
 * Admin-triggered database schema sync from the website.
 * Tries `prisma db push`, then verifies app fields (e.g. equippedSkins) work on Mongo.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import { writeAuditLog } from '@/lib/audit';
import { STATIC_FALLBACK_POWERS } from '../../shared/power-definitions';
import { STATIC_FALLBACK_WEAPONS } from '@/lib/weapon-catalog';
import { seedMissingSoundDefinitions } from '@/lib/sound-pack-seed';
import { invalidateSoundDefinitionsCache } from '@/lib/sound-definitions';

const execFileAsync = promisify(execFile);

/** Schema readiness version — bump when new fields need a push. */
const DB_SCHEMA_SYNC_VERSION = '2026-08-22-match-reward-claim-idempotency';

async function requireAdmin() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || user.role !== 'admin') {
    throw new Error('Admin only');
  }
  return user;
}

function resolvePrismaBin(): string | null {
  const candidates = [
    path.join(process.cwd(), 'node_modules', '.bin', 'prisma'),
    path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export type AdminDbSyncResult = {
  ok: boolean;
  version: string;
  syncedAt: string;
  cliPush: 'ok' | 'skipped' | 'failed';
  cliDetail?: string;
  steps: string[];
};

/**
 * Push Prisma schema to Mongo and verify all gameplay fields are writable.
 * Call from Admin → Dashboard → Sync database schema (once after this deploy).
 *
 * Each `steps.push(...)` block below is its own smoke test for one feature
 * area — see the `steps` array for the full current list. When a schema
 * change adds a genuinely new field/collection, add a matching verify block
 * here and bump DB_SCHEMA_SYNC_VERSION so admins know a re-sync covers it;
 * `prisma db push` above already applies every model's fields/indexes
 * regardless, these checks just surface which ones were confirmed reachable.
 */
export async function adminSyncDatabaseSchema(): Promise<AdminDbSyncResult> {
  const staff = await requireAdmin();
  const steps: string[] = [];
  const syncedAt = new Date().toISOString();

  try {
    await prisma.$runCommandRaw({ ping: 1 });
    steps.push('MongoDB ping OK');
  } catch (e) {
    throw new Error(
      e instanceof Error ? `MongoDB unreachable: ${e.message}` : 'MongoDB unreachable'
    );
  }

  let cliPush: AdminDbSyncResult['cliPush'] = 'skipped';
  let cliDetail: string | undefined;

  const bin = resolvePrismaBin();
  if (!bin) {
    steps.push('Prisma CLI not found in node_modules — using runtime field verify only');
    cliPush = 'skipped';
    cliDetail = 'CLI binary missing (common on some serverless builds)';
  } else if (!process.env.DATABASE_URL) {
    steps.push('DATABASE_URL missing — cannot run prisma db push');
    cliPush = 'failed';
    cliDetail = 'DATABASE_URL not set';
  } else {
    try {
      const args =
        bin.endsWith('index.js')
          ? [bin, 'db', 'push', '--skip-generate', '--accept-data-loss']
          : ['db', 'push', '--skip-generate', '--accept-data-loss'];
      const cmd = bin.endsWith('index.js') ? process.execPath : bin;
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        cwd: process.cwd(),
        env: { ...process.env },
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const out = `${stdout || ''}\n${stderr || ''}`.trim();
      cliPush = 'ok';
      cliDetail = out.slice(0, 1200) || 'prisma db push finished';
      steps.push('prisma db push completed');
    } catch (e: unknown) {
      const err = e as { message?: string; stdout?: string; stderr?: string };
      cliPush = 'failed';
      cliDetail = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n').slice(0, 1200);
      steps.push(
        'prisma db push failed or timed out — continuing with runtime field verify (Mongo is flexible)'
      );
    }
  }

  // Runtime verify: body skins field used by Model Editor → shop → equip
  try {
    const current = await prisma.user.findUnique({
      where: { id: staff.id },
      select: { equippedSkins: true },
    });
    const map =
      current?.equippedSkins && typeof current.equippedSkins === 'object'
        ? (current.equippedSkins as Record<string, unknown>)
        : {};
    await prisma.user.update({
      where: { id: staff.id },
      data: { equippedSkins: map as Prisma.InputJsonValue },
    });
    steps.push('equippedSkins field verified (read/write OK)');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`equippedSkins verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — equippedSkins not writable. Redeploy with latest Prisma schema, then retry. (${msg})`
    );
  }

  // Runtime verify: dashboardPanelPrefs (user home-dashboard panel toggles)
  try {
    const current = await prisma.user.findUnique({
      where: { id: staff.id },
      select: { dashboardPanelPrefs: true },
    });
    const map =
      current?.dashboardPanelPrefs && typeof current.dashboardPanelPrefs === 'object'
        ? (current.dashboardPanelPrefs as Record<string, unknown>)
        : {};
    await prisma.user.update({
      where: { id: staff.id },
      data: { dashboardPanelPrefs: map as Prisma.InputJsonValue },
    });
    steps.push('dashboardPanelPrefs field verified (read/write OK)');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`dashboardPanelPrefs verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — dashboardPanelPrefs not writable. Redeploy with latest Prisma schema, then retry. (${msg})`
    );
  }

  // Runtime verify: Killrun Points (KP) + rank for Competitive ladder
  try {
    const current = await prisma.user.findUnique({
      where: { id: staff.id },
      select: { kp: true, currentRank: true },
    });
    const kp = typeof current?.kp === 'number' ? current.kp : 1000;
    await prisma.user.update({
      where: { id: staff.id },
      data: { kp },
    });
    steps.push(`kp field verified (read/write OK, value=${kp})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`kp verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — User.kp not writable. Run Sync again after deploy. (${msg})`
    );
  }

  // Runtime verify: MatchResult.kpDelta / stats for Competitive + Horde
  try {
    const probe = await prisma.matchResult.create({
      data: {
        userId: staff.id,
        mode: 'schema_probe',
        outcome: 'probe',
        xpEarned: 0,
        vpEarned: 0,
        kpDelta: 0,
        stats: { probe: true },
      },
    });
    await prisma.matchResult.delete({ where: { id: probe.id } });
    steps.push('MatchResult.kpDelta + stats verified');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`MatchResult verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — MatchResult.kpDelta/stats not writable. (${msg})`
    );
  }

  // Runtime verify: MatchRewardClaim (userId, matchId) unique index — this is
  // what actually stops two concurrent match-result POSTs from double-
  // granting VP/XP/KP for the same match. Probe: create a claim, confirm a
  // second create with the same (userId, matchId) is rejected, clean up.
  try {
    const probeMatchId = `schema_probe_${Date.now()}`;
    const probeResult = await prisma.matchResult.create({
      data: {
        userId: staff.id,
        mode: 'schema_probe',
        outcome: 'probe',
        xpEarned: 0,
        vpEarned: 0,
        stats: { probe: true },
      },
    });
    const claim = await prisma.matchRewardClaim.create({
      data: { userId: staff.id, matchId: probeMatchId, matchResultId: probeResult.id },
    });
    let rejectedDuplicate = false;
    try {
      await prisma.matchRewardClaim.create({
        data: { userId: staff.id, matchId: probeMatchId, matchResultId: probeResult.id },
      });
    } catch {
      rejectedDuplicate = true;
    }
    await prisma.matchRewardClaim.delete({ where: { id: claim.id } });
    await prisma.matchResult.delete({ where: { id: probeResult.id } });
    if (!rejectedDuplicate) {
      throw new Error('unique (userId, matchId) index not enforced — duplicate claim was accepted');
    }
    steps.push('MatchRewardClaim unique index verified (duplicate correctly rejected)');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`MatchRewardClaim verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — MatchRewardClaim unique index not active yet (match rewards can double-grant until this syncs). (${msg})`
    );
  }

  // Runtime verify: Premium membership expiry (Ranked Competitive gate)
  try {
    const current = await prisma.user.findUnique({
      where: { id: staff.id },
      select: { premiumExpiresAt: true },
    });
    const existing = current?.premiumExpiresAt ?? null;
    await prisma.user.update({
      where: { id: staff.id },
      data: { premiumExpiresAt: existing },
    });
    steps.push(
      `premiumExpiresAt field verified (read/write OK, value=${existing ? existing.toISOString() : 'null'})`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`premiumExpiresAt verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — User.premiumExpiresAt not writable. Run Sync again after deploy. (${msg})`
    );
  }

  // Runtime verify: peak KP / peak rank (kept after Premium expires)
  try {
    const current = await prisma.user.findUnique({
      where: { id: staff.id },
      select: { kp: true, peakKp: true, peakRank: true },
    });
    const kp = typeof current?.kp === 'number' ? current.kp : 1000;
    const peakKp = Math.max(
      typeof current?.peakKp === 'number' ? current.peakKp : kp,
      kp
    );
    const peakRank = current?.peakRank || 'Unranked';
    await prisma.user.update({
      where: { id: staff.id },
      data: { peakKp, peakRank },
    });
    steps.push(
      `peakKp/peakRank verified (read/write OK, peakKp=${peakKp}, peakRank=${peakRank})`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`peakKp/peakRank verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — User.peakKp/peakRank not writable. Run Sync again after deploy. (${msg})`
    );
  }

  // Runtime verify: SiteSettings.premiumConfigJson (admin Premium editor)
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { singletonKey: 'default' },
    });
    const raw =
      (settings as { premiumConfigJson?: string } | null)?.premiumConfigJson ?? '{}';
    if (settings) {
      await prisma.siteSettings.update({
        where: { singletonKey: 'default' },
        data: { premiumConfigJson: raw },
      });
    } else {
      await prisma.siteSettings.create({
        data: { singletonKey: 'default', premiumConfigJson: '{}' },
      });
    }
    steps.push('premiumConfigJson field verified (read/write OK)');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`premiumConfigJson verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — SiteSettings.premiumConfigJson not writable. (${msg})`
    );
  }

  // Runtime verify: SiteSettings.rankConfigJson (admin Ranks editor)
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { singletonKey: 'default' },
    });
    const raw =
      (settings as { rankConfigJson?: string } | null)?.rankConfigJson ?? '{}';
    if (settings) {
      await prisma.siteSettings.update({
        where: { singletonKey: 'default' },
        data: { rankConfigJson: raw },
      });
    } else {
      await prisma.siteSettings.create({
        data: { singletonKey: 'default', rankConfigJson: '{}' },
      });
    }
    steps.push('rankConfigJson field verified (read/write OK)');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`rankConfigJson verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — SiteSettings.rankConfigJson not writable. (${msg})`
    );
  }

  // Runtime verify: Party collection (squad invite queue)
  try {
    await prisma.party.count();
    steps.push('Party collection verified (count OK)');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`Party verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — Party model not available. Run db push. (${msg})`
    );
  }

  // Runtime verify: SiteSecret + AdminVault (admin Secrets vault)
  try {
    await prisma.siteSecret.count();
    steps.push('SiteSecret collection verified (count OK)');
    await prisma.adminVault.count();
    steps.push('AdminVault collection verified (count OK)');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`Secrets vault verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — SiteSecret/AdminVault not available. Run db push. (${msg})`
    );
  }

  // Runtime verify: GameMap / GamePrefab (Active maps + prefab library)
  try {
    const mapCount = await prisma.gameMap.count();
    const prefabCount = await prisma.gamePrefab.count();
    steps.push(`GameMap collection verified (count=${mapCount})`);
    steps.push(`GamePrefab collection verified (count=${prefabCount})`);
    // Touch thumbnailUrl fields via a no-op probe create/delete when empty is fine;
    // just ensuring findFirst with thumbnailUrl select works.
    await prisma.gameMap.findFirst({
      select: { id: true, thumbnailUrl: true, isActive: true, mode: true },
    });
    await prisma.gamePrefab.findFirst({
      select: { id: true, thumbnailUrl: true, mode: true },
    });
    steps.push('GameMap/GamePrefab thumbnailUrl fields readable');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`GameMap/GamePrefab verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — GameMap/GamePrefab not available. Run db push. (${msg})`
    );
  }

  // Runtime verify + seed: PowerDefinition (skill-tree Powers editor)
  try {
    const before = await prisma.powerDefinition.count();
    steps.push(`PowerDefinition collection verified (count=${before})`);

    // Idempotent: only CREATES the 12 core powers if missing (e.g. first sync
    // after this deploy, or a fresh Mongo). Never overwrites an admin's
    // already-tuned numbers — matches prisma/seed.ts's upsert behavior.
    let created = 0;
    for (const power of STATIC_FALLBACK_POWERS) {
      const existing = await prisma.powerDefinition.findUnique({ where: { key: power.key } });
      if (existing) continue;
      await prisma.powerDefinition.create({
        data: {
          key: power.key,
          name: power.name,
          description: power.description,
          icon: power.icon,
          maxLevel: power.maxLevel,
          unlockLevel: power.unlockLevel,
          prerequisitesJson: JSON.stringify(power.prerequisites),
          costJson: JSON.stringify(power.cost),
          effectType: power.effectType,
          effectParamsJson: JSON.stringify(power.effectParams),
          isCore: true,
          sortOrder: power.sortOrder,
        },
      });
      created += 1;
    }
    steps.push(
      created > 0
        ? `Seeded ${created} core Power(s) that were missing`
        : 'All core Powers already present (no seeding needed)'
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`PowerDefinition verify/seed failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — PowerDefinition not available. Run db push. (${msg})`
    );
  }

  // Runtime verify + seed: WeaponDefinition (global weapon catalog admin panel)
  try {
    const before = await prisma.weaponDefinition.count();
    steps.push(`WeaponDefinition collection verified (count=${before})`);

    // Idempotent: only CREATES the 8 core catalog weapons if missing (e.g.
    // first sync after this deploy, or a fresh Mongo). Never overwrites an
    // admin's already-tuned stats — matches PowerDefinition's seed behavior.
    let created = 0;
    for (const weapon of STATIC_FALLBACK_WEAPONS) {
      const existing = await prisma.weaponDefinition.findUnique({ where: { key: weapon.id } });
      if (existing) continue;
      await prisma.weaponDefinition.create({
        data: {
          key: weapon.id,
          label: weapon.label,
          modelUrl: weapon.modelUrl,
          kind: weapon.kind,
          combatJson: JSON.stringify(weapon.combat),
          modesJson: JSON.stringify(weapon.modes),
          gripHint: weapon.gripHint,
          unlockMetric: weapon.unlockMetric ?? null,
          unlockAmount:
            typeof weapon.unlockAmount === 'number' ? weapon.unlockAmount : null,
          isCore: true,
          sortOrder: weapon.sortOrder ?? 0,
        },
      });
      created += 1;
    }
    steps.push(
      created > 0
        ? `Seeded ${created} core Weapon(s) that were missing`
        : 'All core Weapons already present (no seeding needed)'
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`WeaponDefinition verify/seed failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — WeaponDefinition not available. Run db push. (${msg})`
    );
  }

  // Runtime verify + seed: SoundDefinition (Sound Board). Pack defaults
  // fill missing event keys only — never overwrite volume/EQ/replaced clips.
  try {
    const before = await prisma.soundDefinition.count();
    steps.push(`SoundDefinition collection verified (count=${before})`);
    const created = await seedMissingSoundDefinitions(prisma);
    if (created > 0) invalidateSoundDefinitionsCache();
    steps.push(
      created > 0
        ? `Seeded ${created} Sound Board clip(s) that were missing`
        : 'All pack Sound Board bindings already present (no seeding needed)'
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`SoundDefinition verify/seed failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — SoundDefinition not available. Run db push. (${msg})`
    );
  }

  // Runtime verify: SiteSettings.matchRewardsConfigJson (admin Game Balance editor)
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { singletonKey: 'default' },
    });
    const raw =
      (settings as { matchRewardsConfigJson?: string } | null)?.matchRewardsConfigJson ?? '{}';
    if (settings) {
      await prisma.siteSettings.update({
        where: { singletonKey: 'default' },
        data: { matchRewardsConfigJson: raw },
      });
    } else {
      await prisma.siteSettings.create({
        data: { singletonKey: 'default', matchRewardsConfigJson: '{}' },
      });
    }
    steps.push('matchRewardsConfigJson field verified (read/write OK)');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`matchRewardsConfigJson verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — SiteSettings.matchRewardsConfigJson not writable. (${msg})`
    );
  }

  // Runtime verify: SiteSettings.defaultTpsViewJson (admin global TPS camera default)
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { singletonKey: 'default' },
    });
    const raw =
      (settings as { defaultTpsViewJson?: string } | null)?.defaultTpsViewJson ?? '{}';
    if (settings) {
      await prisma.siteSettings.update({
        where: { singletonKey: 'default' },
        data: { defaultTpsViewJson: raw },
      });
    } else {
      await prisma.siteSettings.create({
        data: { singletonKey: 'default', defaultTpsViewJson: '{}' },
      });
    }
    steps.push('defaultTpsViewJson field verified (read/write OK)');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`defaultTpsViewJson verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — SiteSettings.defaultTpsViewJson not writable. (${msg})`
    );
  }

  // Runtime verify: Clan / ClanMember / ClanJoinRequest (Clans feature)
  try {
    const clanCount = await prisma.clan.count();
    const memberCount = await prisma.clanMember.count();
    const requestCount = await prisma.clanJoinRequest.count();
    steps.push(
      `Clan collections verified (clans=${clanCount}, members=${memberCount}, joinRequests=${requestCount})`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`Clan verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — Clan/ClanMember/ClanJoinRequest not available. Run db push. (${msg})`
    );
  }

  // Runtime verify: crate fields (InventoryItem.caseDefId/crateSource,
  // Mission/Achievement rewardCaseId) added for admin/shop/mission crate awards.
  try {
    await prisma.inventoryItem.findFirst({
      select: { id: true, caseDefId: true, crateSource: true, itemCategory: true },
    });
    steps.push('InventoryItem.caseDefId/crateSource fields readable');
    await prisma.missionTemplate.findFirst({ select: { id: true, rewardCaseId: true } });
    await prisma.achievementDefinition.findFirst({ select: { id: true, rewardCaseId: true } });
    steps.push('Mission/Achievement rewardCaseId fields readable');
    const caseCount = await prisma.caseDefinition.count();
    steps.push(`CaseDefinition collection verified (count=${caseCount})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`Crate fields verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — crate fields not available. Run db push. (${msg})`
    );
  }

  // Runtime verify: MapGhostRun (map editor ghost / world-record replays)
  try {
    const ghostRunCount = await prisma.mapGhostRun.count();
    steps.push(`MapGhostRun collection verified (count=${ghostRunCount})`);
    await prisma.mapGhostRun.findFirst({
      select: { id: true, mapId: true, finishMs: true, samplesJson: true },
    });
    steps.push('MapGhostRun.samplesJson/finishMs fields readable');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`MapGhostRun verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — MapGhostRun not available. Run db push. (${msg})`
    );
  }

  // Runtime verify: Clan Wars (ClanLobby queue + challenge/result history)
  try {
    const lobbyCount = await prisma.clanLobby.count();
    const challengeCount = await prisma.clanWarChallenge.count();
    const resultCount = await prisma.clanWarResult.count();
    steps.push(
      `Clan Wars collections verified (lobbies=${lobbyCount}, challenges=${challengeCount}, results=${resultCount})`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`Clan Wars verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — ClanLobby/ClanWarChallenge/ClanWarResult not available. Run db push. (${msg})`
    );
  }

  // Runtime verify: Asset registry (3D cosmetic models used by crates + admin editor)
  try {
    const assetCount = await prisma.asset.count();
    steps.push(`Asset collection verified (count=${assetCount})`);
    await prisma.asset.findFirst({ select: { id: true, assetId: true, equipSlot: true } });
    steps.push('Asset.equipSlot field readable');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`Asset verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — Asset registry not available. Run db push. (${msg})`
    );
  }

  // Runtime verify: StoreItem.caseOnly (crate-exclusive shop items) +
  // CaseItem's cosmetic snapshot fields (live banner/frame/nickname preview
  // in crate contents and the unbox reveal).
  try {
    await prisma.storeItem.findFirst({ select: { id: true, caseOnly: true } });
    steps.push('StoreItem.caseOnly field readable');
    await prisma.caseItem.findFirst({
      select: { id: true, cosmeticSlot: true, bannerConfig: true, cosmeticConfig: true },
    });
    steps.push('CaseItem.cosmeticSlot/bannerConfig/cosmeticConfig fields readable');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    steps.push(`StoreItem/CaseItem cosmetic fields verify failed: ${msg}`);
    throw new Error(
      `Schema sync incomplete — StoreItem.caseOnly / CaseItem cosmetic fields not available. Run db push. (${msg})`
    );
  }

  // Persist sync stamp on SiteSettings chrome JSON (no extra schema field needed)
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { singletonKey: 'default' },
    });
    let chrome: Record<string, unknown> = {};
    try {
      chrome = settings?.hubChromeJson ? JSON.parse(settings.hubChromeJson) : {};
    } catch {
      chrome = {};
    }
    chrome.schemaSync = {
      version: DB_SCHEMA_SYNC_VERSION,
      at: syncedAt,
      cliPush,
      by: staff.username,
    };
    if (settings) {
      await prisma.siteSettings.update({
        where: { singletonKey: 'default' },
        data: { hubChromeJson: JSON.stringify(chrome) },
      });
    } else {
      await prisma.siteSettings.create({
        data: {
          singletonKey: 'default',
          hubChromeJson: JSON.stringify(chrome),
        },
      });
    }
    steps.push('Sync status saved to site settings');
  } catch {
    steps.push('Could not persist sync stamp (non-fatal)');
  }

  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'db_schema_sync',
    detail: `v=${DB_SCHEMA_SYNC_VERSION} cli=${cliPush}`,
  });

  return {
    ok: true,
    version: DB_SCHEMA_SYNC_VERSION,
    syncedAt,
    cliPush,
    cliDetail,
    steps,
  };
}

/** Read last sync stamp for the dashboard (admin/moderator). */
export async function adminGetSchemaSyncStatus(): Promise<{
  version: string | null;
  at: string | null;
  cliPush: string | null;
  expectedVersion: string;
  upToDate: boolean;
} | null> {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) return null;
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || (user.role !== 'admin' && user.role !== 'moderator')) {
    return null;
  }

  const settings = await prisma.siteSettings.findUnique({
    where: { singletonKey: 'default' },
  });
  let stamp: { version?: string; at?: string; cliPush?: string } | null = null;
  try {
    const chrome = settings?.hubChromeJson ? JSON.parse(settings.hubChromeJson) : {};
    stamp = chrome?.schemaSync ?? null;
  } catch {
    stamp = null;
  }

  return {
    version: stamp?.version ?? null,
    at: stamp?.at ?? null,
    cliPush: stamp?.cliPush ?? null,
    expectedVersion: DB_SCHEMA_SYNC_VERSION,
    upToDate: stamp?.version === DB_SCHEMA_SYNC_VERSION,
  };
}
