'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import {
  deletePrefabModelAsStaff,
  listPrefabModelCategoriesForStaff,
  listPrefabModelsForStaff,
  uploadPrefabModelAsStaff,
} from '@/lib/prefab-library-core';

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

/** List every uploaded prefab model, grouped for the catalog panel. */
export async function getPrefabLibrary() {
  await requireStaff();
  return listPrefabModelsForStaff();
}

/** Distinct category names in use, for the "existing category" picker. */
export async function getPrefabLibraryCategories(): Promise<string[]> {
  await requireStaff();
  return listPrefabModelCategoriesForStaff();
}

export async function adminUploadPrefabModel(input: {
  name: string;
  category: string;
  /** data: URL of the model file (.glb/.gltf/.fbx/.obj). */
  modelDataUrl: string;
  originalFilename?: string;
  /** Optional data: URL PNG/JPG thumbnail. */
  previewDataUrl?: string;
}) {
  const staff = await requireStaff();
  return uploadPrefabModelAsStaff(staff.id, input);
}

export async function adminDeletePrefabModel(id: string) {
  const staff = await requireStaff();
  return deletePrefabModelAsStaff(id, staff.id);
}
