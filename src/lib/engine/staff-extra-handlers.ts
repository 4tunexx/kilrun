import { NextRequest } from 'next/server';
import { engineJson, requireEngineStaff } from '@/lib/engine/engine-api';
import type { EditorEntity } from '@/components/game/editor/map-document';
import { loadSoundDefinitions } from '@/lib/sound-definitions';
import {
  deleteSoundDefinition,
  patchSoundDefinition,
  uploadSoundDefinition,
} from '@/lib/sound-definitions-write';
import { getCustomMoveSoundEvents } from '@/lib/custom-move-sound-events-core';
import { loadPowerDefinitions } from '@/lib/power-definitions';
import { STATIC_FALLBACK_POWERS } from '@shared/power-definitions';
import {
  createPowerDefinition,
  deletePowerDefinition,
  updatePowerDefinition,
} from '@/lib/power-definitions-write';
import {
  deleteCloudPrefabForStaff,
  getCloudPrefabEntitiesForStaff,
  listCloudPrefabsForStaff,
  publishCloudPrefabAsStaff,
} from '@/lib/game-prefab-core';
import { upsertStoreItemAsStaff, type UpsertStoreItemInput } from '@/lib/store-item-core';
import { prisma } from '@/lib/prisma';
import { mintGameJoinToken } from '@/lib/game-join-token';
import { canAccessAdmin } from '@/lib/roles';
import { isPremiumActive, canAccessRankedCompetitive } from '@/lib/premium';
import { parsePremiumConfig } from '@/lib/premium-config';
import { getSiteSettings } from '@/lib/progression-actions';
import { KP_DEFAULT } from '@/lib/kp';

import { parseStaffEngineResource, type StaffEngineResource } from '@/lib/engine/staff-resource';

export type { StaffEngineResource };

export function staffEngineResource(req: NextRequest): StaffEngineResource | null {
  return parseStaffEngineResource(req.nextUrl.searchParams.get('engineResource'));
}

function staffStatus(message: string) {
  if (/staff only|not authenticated|session expired/i.test(message)) return 401;
  if (/not found|no sound bound/i.test(message)) return 404;
  if (/already exists|prerequisite/i.test(message)) return 409;
  return 400;
}

export async function handleStaffEngineResource(
  req: NextRequest,
  resource: StaffEngineResource,
  method: string
) {
  if (resource === 'sounds') return handleSounds(req, method);
  if (resource === 'powers') return handlePowers(req, method);
  if (resource === 'prefabs') return handlePrefabs(req, method);
  if (resource === 'shop') return handleShop(req, method);
  return handleJoinToken(req, method);
}

async function handleSounds(req: NextRequest, method: string) {
  try {
    await requireEngineStaff(req);
    if (method === 'GET') {
      const rows = await loadSoundDefinitions({ force: true });
      const sounds: Record<string, (typeof rows)[number]> = {};
      for (const r of rows) sounds[r.eventKey] = r;
      const customMoveEvents = await getCustomMoveSoundEvents().catch(() => []);
      return engineJson(req, { ok: true, sounds, customMoveEvents });
    }
    if (method === 'POST') {
      const form = await req.formData();
      const eventKey = String(form.get('eventKey') ?? '').trim();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return engineJson(req, { ok: false, error: 'Missing file' }, 400);
      }
      const result = await uploadSoundDefinition({
        eventKey,
        file,
        volume: Number(form.get('volume')) || 1,
      });
      return engineJson(req, { ok: true, ...result });
    }
    if (method === 'PATCH') {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      await patchSoundDefinition(String(body?.eventKey ?? '').trim(), body ?? {});
      return engineJson(req, { ok: true });
    }
    if (method === 'DELETE') {
      await deleteSoundDefinition(req.nextUrl.searchParams.get('eventKey') ?? '');
      return engineJson(req, { ok: true });
    }
    return engineJson(req, { ok: false, error: 'Method not allowed' }, 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sound Board request failed';
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}

async function handlePowers(req: NextRequest, method: string) {
  try {
    await requireEngineStaff(req);
    if (method === 'GET') {
      const powers = await loadPowerDefinitions({ force: true });
      return engineJson(req, { ok: true, powers });
    }
    if (method === 'POST') {
      const power = await createPowerDefinition(await req.json().catch(() => null));
      return engineJson(req, { ok: true, power });
    }
    if (method === 'PATCH') {
      const power = await updatePowerDefinition(await req.json().catch(() => null));
      return engineJson(req, { ok: true, power });
    }
    if (method === 'DELETE') {
      await deletePowerDefinition(req.nextUrl.searchParams.get('key') ?? '');
      return engineJson(req, { ok: true });
    }
    return engineJson(req, { ok: false, error: 'Method not allowed' }, 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Powers request failed';
    if (method === 'GET' && !/staff only|not authenticated|session expired/i.test(message)) {
      return engineJson(req, { ok: true, powers: STATIC_FALLBACK_POWERS });
    }
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}

async function handlePrefabs(req: NextRequest, method: string) {
  try {
    if (method === 'GET') {
      await requireEngineStaff(req);
      const id = req.nextUrl.searchParams.get('id');
      if (id) {
        const entities = await getCloudPrefabEntitiesForStaff(id);
        return engineJson(req, { ok: true, entities });
      }
      const mode = req.nextUrl.searchParams.get('mode') || undefined;
      const prefabs = await listCloudPrefabsForStaff(mode);
      return engineJson(req, { ok: true, prefabs });
    }
    if (method === 'POST') {
      const staff = await requireEngineStaff(req);
      const body = (await req.json()) as {
        localId?: string;
        name?: string;
        mode?: string;
        entities?: EditorEntity[];
        thumbnailDataUrl?: string | null;
      };
      const prefab = await publishCloudPrefabAsStaff(staff.id, {
        localId: body.localId,
        name: body.name || 'Prefab',
        mode: body.mode,
        entities: body.entities ?? [],
        thumbnailDataUrl: body.thumbnailDataUrl,
      });
      return engineJson(req, { ok: true, prefab });
    }
    if (method === 'DELETE') {
      await requireEngineStaff(req);
      const id = req.nextUrl.searchParams.get('id') ?? '';
      if (!id) return engineJson(req, { ok: false, error: 'id is required' }, 400);
      await deleteCloudPrefabForStaff(id);
      return engineJson(req, { ok: true });
    }
    return engineJson(req, { ok: false, error: 'Method not allowed' }, 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Prefab request failed';
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}

async function handleShop(req: NextRequest, method: string) {
  if (method !== 'POST') return engineJson(req, { ok: false, error: 'Method not allowed' }, 405);
  try {
    await requireEngineStaff(req);
    const body = (await req.json()) as UpsertStoreItemInput;
    const item = await upsertStoreItemAsStaff(body);
    return engineJson(req, { ok: true, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    const status = /staff only|not authenticated|session expired/i.test(message) ? 401 : 400;
    return engineJson(req, { ok: false, error: message }, status);
  }
}

async function handleJoinToken(req: NextRequest, method: string) {
  if (method !== 'POST') return engineJson(req, { ok: false, error: 'Method not allowed' }, 405);
  try {
    const staff = await requireEngineStaff(req);
    const user = await prisma.user.findUnique({ where: { id: staff.id } });
    if (!user || user.isBanned) {
      return engineJson(req, { ok: false, error: 'Staff only' }, 403);
    }

    const settings = await getSiteSettings();
    const premiumCfg = parsePremiumConfig(
      (settings as { premiumConfigJson?: string }).premiumConfigJson ?? '{}'
    );
    const isPremium = isPremiumActive({
      isVip: user.isVip,
      premiumExpiresAt: (user as { premiumExpiresAt?: Date | null }).premiumExpiresAt,
    });
    const rankedAccess = canAccessRankedCompetitive({
      isPremium,
      config: premiumCfg,
    });
    const kp = typeof (user as { kp?: number }).kp === 'number' ? (user as { kp: number }).kp : KP_DEFAULT;

    let token: string | null = null;
    try {
      token = mintGameJoinToken({
        userId: user.id,
        steamId: user.steamId || '',
        username: user.username || 'Player',
        avatarUrl: user.avatarUrl || '',
        isAdmin: user.role === 'admin',
        isStaff: canAccessAdmin(user.role),
        isPremium,
        rankedAccess,
        kp,
      });
    } catch {
      token = null;
    }

    return engineJson(req, {
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username || 'Player',
        avatarUrl: user.avatarUrl || '',
        role: user.role,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Not authenticated';
    const status = message === 'Staff only' ? 403 : 401;
    return engineJson(req, { ok: false, error: message }, status);
  }
}
