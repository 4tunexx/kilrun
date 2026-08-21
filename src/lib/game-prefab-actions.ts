'use server';

/**
 * Cloud prefab library — staff-shared stamps for the map editor.
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import type { EditorEntity } from '@/components/game/editor/map-document';
import {
  deleteCloudPrefabForStaff,
  getCloudPrefabEntitiesForStaff,
  listCloudPrefabsForStaff,
  publishCloudPrefabAsStaff,
  type CloudPrefabRow,
} from '@/lib/game-prefab-core';

export type { CloudPrefabRow };

async function requireStaff() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) {
    throw new Error('Staff only');
  }
  return user;
}

export async function listCloudPrefabs(mode?: string): Promise<CloudPrefabRow[]> {
  await requireStaff();
  return listCloudPrefabsForStaff(mode);
}

export async function getCloudPrefabEntities(prefabId: string): Promise<EditorEntity[]> {
  await requireStaff();
  return getCloudPrefabEntitiesForStaff(prefabId);
}

export async function publishCloudPrefab(input: {
  localId?: string;
  name: string;
  mode?: string;
  entities: EditorEntity[];
  thumbnailDataUrl?: string | null;
}): Promise<CloudPrefabRow> {
  const staff = await requireStaff();
  return publishCloudPrefabAsStaff(staff.id, input);
}

export async function deleteCloudPrefab(prefabId: string): Promise<{ ok: true }> {
  await requireStaff();
  return deleteCloudPrefabForStaff(prefabId);
}
