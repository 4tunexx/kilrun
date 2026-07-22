'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';

async function requireAdmin() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || user.role !== 'admin') {
    throw new Error('Forbidden');
  }
  return user;
}

type SeedBundle = {
  missions?: Array<Record<string, unknown>>;
  achievements?: Array<Record<string, unknown>>;
  badges?: Array<Record<string, unknown>>;
  shopItems?: Array<Record<string, unknown>>;
};

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function asInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function asBool(v: unknown, fallback = true): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return fallback;
}

/** Very small SQL INSERT parser for dumps like:
 * INSERT INTO MissionTemplate (key, title, ...) VALUES ('a','b',...);
 * Also accepts JSON seed bundles.
 */
function parseSqlInserts(sql: string): SeedBundle {
  const bundle: SeedBundle = {
    missions: [],
    achievements: [],
    badges: [],
    shopItems: [],
  };

  const insertRe =
    /INSERT\s+INTO\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)\s*VALUES\s*/gi;
  let match: RegExpExecArray | null;
  while ((match = insertRe.exec(sql))) {
    const table = match[1];
    const cols = match[2].split(',').map((c) =>
      c.trim().replace(/^[`"']|[`"']$/g, '')
    );
    const valuesStart = insertRe.lastIndex;
    const rest = sql.slice(valuesStart);
    const rowMatch = rest.match(/^\s*\(([^;]+?)\)\s*;?/);
    if (!rowMatch) continue;
    const rawVals = splitSqlValues(rowMatch[1]);
    if (rawVals.length !== cols.length) continue;
    const row: Record<string, unknown> = {};
    cols.forEach((col, i) => {
      row[col] = unquoteSql(rawVals[i]);
    });

    const t = table.toLowerCase();
    if (t.includes('mission')) bundle.missions!.push(row);
    else if (t.includes('achievement')) bundle.achievements!.push(row);
    else if (t.includes('badge') && !t.includes('user')) bundle.badges!.push(row);
    else if (t.includes('store') || t.includes('shop')) bundle.shopItems!.push(row);

    insertRe.lastIndex = valuesStart + rowMatch[0].length;
  }
  return bundle;
}

function splitSqlValues(inner: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuote) {
      if (ch === inQuote && inner[i - 1] !== '\\') inQuote = null;
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQuote = ch;
      cur += ch;
      continue;
    }
    if (ch === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function unquoteSql(v: string): string | number | boolean | null {
  const t = v.trim();
  if (/^null$/i.test(t)) return null;
  if (/^(true|false)$/i.test(t)) return /^true$/i.test(t);
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('"') && t.endsWith('"'))
  ) {
    return t.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
  return t;
}

function parseSeedContent(content: string, filename: string): SeedBundle {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('File is empty');

  if (
    filename.toLowerCase().endsWith('.json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  ) {
    const parsed = JSON.parse(trimmed) as SeedBundle | SeedBundle[];
    if (Array.isArray(parsed)) {
      throw new Error(
        'JSON must be an object like { missions, achievements, badges, shopItems }'
      );
    }
    return parsed;
  }

  if (
    filename.toLowerCase().endsWith('.sql') ||
    /insert\s+into/i.test(trimmed)
  ) {
    return parseSqlInserts(trimmed);
  }

  throw new Error('Unsupported file. Upload .json or .sql seed dump.');
}

async function upsertBundle(bundle: SeedBundle) {
  let missions = 0;
  let achievements = 0;
  let badges = 0;
  let shopItems = 0;

  for (const raw of bundle.missions ?? []) {
    const key = asString(raw.key || raw.Key);
    if (!key) continue;
    const data = {
      key,
      title: asString(raw.title || raw.Title, key),
      description: asString(raw.description || raw.Description),
      rewardXp: asInt(raw.rewardXp ?? raw.reward_xp, 50),
      targetCount: asInt(raw.targetCount ?? raw.target_count, 1),
      metric: asString(raw.metric || raw.Metric, 'runs'),
      category: asString(raw.category || raw.Category, 'game'),
      isActive: asBool(raw.isActive ?? raw.is_active, true),
      ...(asString(raw.iconImageUrl || raw.icon_image_url)
        ? { iconImageUrl: asString(raw.iconImageUrl || raw.icon_image_url) }
        : {}),
    };
    await prisma.missionTemplate.upsert({
      where: { key },
      update: data,
      create: data,
    });
    missions++;
  }

  for (const raw of bundle.achievements ?? []) {
    const key = asString(raw.key || raw.Key);
    if (!key) continue;
    const data = {
      key,
      title: asString(raw.title || raw.Title, key),
      description: asString(raw.description || raw.Description),
      category: asString(raw.category || raw.Category, 'game'),
      metric: asString(raw.metric || raw.Metric, 'runs'),
      targetCount: asInt(raw.targetCount ?? raw.target_count, 1),
      xpReward: asInt(raw.xpReward ?? raw.xp_reward, 50),
      icon: asString(raw.icon || raw.Icon, 'trophy'),
      isActive: asBool(raw.isActive ?? raw.is_active, true),
      ...(asString(raw.iconImageUrl || raw.icon_image_url)
        ? { iconImageUrl: asString(raw.iconImageUrl || raw.icon_image_url) }
        : {}),
    };
    await prisma.achievementDefinition.upsert({
      where: { key },
      update: data,
      create: data,
    });
    achievements++;
  }

  for (const raw of bundle.badges ?? []) {
    const key = asString(raw.key || raw.Key);
    if (!key) continue;
    const data = {
      key,
      title: asString(raw.title || raw.Title, key),
      description: asString(raw.description || raw.Description),
      rarity: asString(raw.rarity || raw.Rarity, 'common'),
      icon: asString(raw.icon || raw.Icon, 'award'),
      metric: asString(raw.metric || raw.Metric, 'manual'),
      targetCount: asInt(raw.targetCount ?? raw.target_count, 1),
      isActive: asBool(raw.isActive ?? raw.is_active, true),
      ...(asString(raw.iconImageUrl || raw.icon_image_url)
        ? { iconImageUrl: asString(raw.iconImageUrl || raw.icon_image_url) }
        : {}),
    };
    await prisma.badgeDefinition.upsert({
      where: { key },
      update: data,
      create: data,
    });
    badges++;
  }

  for (const raw of bundle.shopItems ?? []) {
    const itemSku = asString(raw.itemSku || raw.item_sku || raw.sku);
    if (!itemSku) continue;
    const data = {
      itemName: asString(raw.itemName || raw.item_name || raw.name, itemSku),
      itemCategory: asString(
        raw.itemCategory || raw.item_category || raw.category,
        'Cosmetic'
      ),
      itemSku,
      vpPrice: asInt(raw.vpPrice ?? raw.vp_price ?? raw.price, 100),
      isAvailable: asBool(raw.isAvailable ?? raw.is_available, true),
      ...(asString(raw.imageUrl || raw.image_url)
        ? { imageUrl: asString(raw.imageUrl || raw.image_url) }
        : {}),
      ...(asString(raw.cosmeticSlot || raw.cosmetic_slot)
        ? { cosmeticSlot: asString(raw.cosmeticSlot || raw.cosmetic_slot) }
        : {}),
    };
    await prisma.storeItem.upsert({
      where: { itemSku },
      update: data,
      create: data,
    });
    shopItems++;
  }

  return { missions, achievements, badges, shopItems };
}

/** Import a JSON seed bundle or SQL INSERT dump into MongoDB. */
export async function adminImportSeedFile(content: string, filename: string) {
  const admin = await requireAdmin();
  if (content.length > 2_000_000) {
    throw new Error('File too large (max ~2MB)');
  }

  const bundle = parseSeedContent(content, filename);
  const counts = await upsertBundle(bundle);

  await writeAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    action: 'seed_import',
    detail: `${filename}: ${counts.missions}m / ${counts.achievements}a / ${counts.badges}b / ${counts.shopItems}s`,
  });

  return { ok: true as const, ...counts, filename };
}
