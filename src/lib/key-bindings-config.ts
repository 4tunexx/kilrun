'use server';

/**
 * Global rebindable controls (movement, core actions, 7 power keys) — one
 * scheme for the whole platform, applies to every map, live match, and Play
 * Test alike. Stored on the SiteSettings singleton (keyBindingsConfigJson),
 * same JSON-blob-on-a-singleton convention as powerTreeConfigJson /
 * premiumConfigJson etc. Edited from the Map Editor's global "Controls"
 * panel; hydrated once per session by kilrun-engine.tsx / map-play-preview.tsx.
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import {
  DEFAULT_KEY_BINDINGS,
  normalizeBindings,
  type KeyBindAction,
} from '@shared/key-bindings';

export type KeyBindings = Record<KeyBindAction, string>;

function parseConfig(json: string | null | undefined): KeyBindings {
  if (!json) return { ...DEFAULT_KEY_BINDINGS };
  try {
    return normalizeBindings(JSON.parse(json) as Partial<Record<string, unknown>>);
  } catch {
    return { ...DEFAULT_KEY_BINDINGS };
  }
}

export async function getKeyBindings(): Promise<KeyBindings> {
  const settings = await prisma.siteSettings.findUnique({ where: { singletonKey: 'default' } });
  return parseConfig((settings as { keyBindingsConfigJson?: string } | null)?.keyBindingsConfigJson);
}

async function requireAdmin() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) throw new Error('Forbidden');
  return user;
}

export async function updateKeyBindings(input: Partial<Record<string, string>>): Promise<KeyBindings> {
  await requireAdmin();
  const current = await getKeyBindings();
  const next = normalizeBindings({ ...current, ...input });

  await prisma.siteSettings.upsert({
    where: { singletonKey: 'default' },
    create: { singletonKey: 'default', keyBindingsConfigJson: JSON.stringify(next) },
    update: { keyBindingsConfigJson: JSON.stringify(next) },
  });

  return next;
}
