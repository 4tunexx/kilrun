'use server';

/**
 * Admin requirement catalog + custom metric counters.
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import {
  DEFAULT_UNLOCK_CHANNELS,
  builtinCatalogMetrics,
  parseRequirementCatalog,
  scanRequirementCoverage,
  serializeRequirementCatalog,
  slugifyRequirementValue,
  type CatalogMetric,
  type RequirementCatalog,
  type UnlockChannel,
  type RequirementCategory,
} from '@/lib/requirement-catalog';
import { REQUIREMENT_CATEGORY_LABELS } from '@/lib/requirement-types';

async function requireAdmin() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role) || user.role !== 'admin') {
    throw new Error('Admin only');
  }
  return user;
}

async function loadCatalogRaw(): Promise<string> {
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { singletonKey: 'default' },
    });
    return String(
      (settings as { requirementCatalogJson?: string } | null)?.requirementCatalogJson ?? '{}'
    );
  } catch {
    return '{}';
  }
}

async function saveCatalog(catalog: RequirementCatalog) {
  const json = serializeRequirementCatalog(catalog);
  try {
    await prisma.siteSettings.upsert({
      where: { singletonKey: 'default' },
      create: {
        singletonKey: 'default',
        requirementCatalogJson: json,
      } as never,
      update: {
        requirementCatalogJson: json,
      } as never,
    });
  } catch (err) {
    // Field may not exist until db push — fall back to raw merge via updateMany skip.
    console.warn('[requirement-catalog] save failed (run prisma db push?)', err);
    throw new Error(
      'Could not save requirement catalog. Run `npx prisma db push` then restart the app.'
    );
  }
}

export async function getRequirementCatalog(): Promise<RequirementCatalog> {
  return parseRequirementCatalog(await loadCatalogRaw());
}

export async function getRequirementCatalogAdmin(): Promise<{
  catalog: RequirementCatalog;
  scan: ReturnType<typeof scanRequirementCoverage>;
  categories: typeof REQUIREMENT_CATEGORY_LABELS;
}> {
  await requireAdmin();
  const catalog = await getRequirementCatalog();
  return {
    catalog,
    scan: scanRequirementCoverage(catalog),
    categories: REQUIREMENT_CATEGORY_LABELS,
  };
}

export async function adminSaveRequirementCatalog(
  catalog: RequirementCatalog
): Promise<RequirementCatalog> {
  await requireAdmin();
  const cleaned: RequirementCatalog = {
    metrics: catalog.metrics.map((m) => ({
      ...m,
      value: slugifyRequirementValue(m.value),
      label: m.label.trim().slice(0, 80) || m.value,
      description: (m.description || '').trim().slice(0, 240),
    })),
    unlockChannels: catalog.unlockChannels.map((u) => ({
      ...u,
      id: slugifyRequirementValue(u.id),
      label: u.label.trim().slice(0, 80) || u.id,
      hint: (u.hint || '').trim().slice(0, 160),
    })),
  };
  // Always keep purchase unlock channel.
  if (!cleaned.unlockChannels.some((u) => u.id === 'purchase')) {
    cleaned.unlockChannels.unshift({ ...DEFAULT_UNLOCK_CHANNELS[0]! });
  }
  await saveCatalog(cleaned);
  return parseRequirementCatalog(await loadCatalogRaw());
}

export async function adminUpsertRequirementMetric(input: {
  value: string;
  label: string;
  description?: string;
  category: RequirementCategory;
  enabled?: boolean;
}): Promise<RequirementCatalog> {
  await requireAdmin();
  const catalog = await getRequirementCatalog();
  const value = slugifyRequirementValue(input.value);
  if (!value) throw new Error('Metric id required');
  const builtins = new Set(builtinCatalogMetrics().map((m) => m.value));
  const idx = catalog.metrics.findIndex((m) => m.value === value);
  const next: CatalogMetric = {
    value,
    label: input.label.trim().slice(0, 80) || value,
    description: (input.description || '').trim().slice(0, 240),
    category: input.category,
    enabled: input.enabled !== false,
    builtIn: builtins.has(value),
    source: builtins.has(value) ? 'wired' : 'custom',
  };
  if (idx >= 0) catalog.metrics[idx] = { ...catalog.metrics[idx]!, ...next };
  else catalog.metrics.push(next);
  await saveCatalog(catalog);
  return parseRequirementCatalog(await loadCatalogRaw());
}

export async function adminDeleteRequirementMetric(value: string): Promise<RequirementCatalog> {
  await requireAdmin();
  const catalog = await getRequirementCatalog();
  const v = slugifyRequirementValue(value);
  const row = catalog.metrics.find((m) => m.value === v);
  if (!row) throw new Error('Not found');
  if (row.builtIn) {
    // Built-ins cannot be deleted — disable instead.
    row.enabled = false;
  } else {
    catalog.metrics = catalog.metrics.filter((m) => m.value !== v);
  }
  await saveCatalog(catalog);
  return parseRequirementCatalog(await loadCatalogRaw());
}

export async function adminUpsertUnlockChannel(input: {
  id: string;
  label: string;
  hint?: string;
  enabled?: boolean;
}): Promise<RequirementCatalog> {
  await requireAdmin();
  const catalog = await getRequirementCatalog();
  const id = slugifyRequirementValue(input.id);
  if (!id) throw new Error('Channel id required');
  const builtins = new Set(DEFAULT_UNLOCK_CHANNELS.map((u) => u.id));
  const idx = catalog.unlockChannels.findIndex((u) => u.id === id);
  const next: UnlockChannel = {
    id,
    label: input.label.trim().slice(0, 80) || id,
    hint: (input.hint || '').trim().slice(0, 160),
    enabled: input.enabled !== false,
    builtIn: builtins.has(id),
  };
  if (idx >= 0) catalog.unlockChannels[idx] = next;
  else catalog.unlockChannels.push(next);
  await saveCatalog(catalog);
  return parseRequirementCatalog(await loadCatalogRaw());
}

export async function adminDeleteUnlockChannel(id: string): Promise<RequirementCatalog> {
  await requireAdmin();
  const catalog = await getRequirementCatalog();
  const key = slugifyRequirementValue(id);
  if (key === 'purchase') throw new Error('Cannot remove the Purchase channel');
  const row = catalog.unlockChannels.find((u) => u.id === key);
  if (!row) throw new Error('Not found');
  if (row.builtIn) {
    row.enabled = false;
  } else {
    catalog.unlockChannels = catalog.unlockChannels.filter((u) => u.id !== key);
  }
  await saveCatalog(catalog);
  return parseRequirementCatalog(await loadCatalogRaw());
}

/** Read a player's custom metric counter (0 if missing). */
export async function getUserCustomMetric(userId: string, metric: string): Promise<number> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const raw = (user as { customMetrics?: unknown } | null)?.customMetrics;
    const map =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const n = map[metric];
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}

/** Increment (or set) a custom metric — used by events / admin grants. */
export async function adminBumpUserMetric(input: {
  steamIdOrUsername: string;
  metric: string;
  amount?: number;
  setTo?: number;
}): Promise<{ ok: true; value: number; userId: string }> {
  await requireAdmin();
  const metric = slugifyRequirementValue(input.metric);
  if (!metric) throw new Error('Metric required');
  const q = input.steamIdOrUsername.trim();
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ steamId: q }, { username: q }],
    },
  });
  if (!user) throw new Error('User not found');

  const prev = await getUserCustomMetric(user.id, metric);
  const next =
    typeof input.setTo === 'number' && Number.isFinite(input.setTo)
      ? Math.max(0, Math.floor(input.setTo))
      : prev + Math.max(1, Math.floor(input.amount ?? 1));

  const raw = (user as { customMetrics?: unknown }).customMetrics;
  const existing =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  existing[metric] = next;

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { customMetrics: existing } as never,
    });
  } catch (err) {
    console.warn('[requirement] customMetrics update failed', err);
    throw new Error(
      'Could not save custom metric. Run `npx prisma db push` then restart the app.'
    );
  }

  return { ok: true, value: next, userId: user.id };
}
