'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { uploadModelGlb } from '@/lib/model-asset-upload';
import { persistSiteImage } from '@/lib/site-asset-upload';

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
  return prisma.mapPrefabModel.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
}

/** Distinct category names in use, for the "existing category" picker. */
export async function getPrefabLibraryCategories(): Promise<string[]> {
  const rows = await prisma.mapPrefabModel.findMany({
    select: { category: true },
    distinct: ['category'],
  });
  return rows.map((r) => r.category).sort();
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
  const name = input.name.trim().slice(0, 80);
  const category = input.category.trim().slice(0, 40) || 'uncategorized';
  if (!name) throw new Error('Name is required');
  if (!input.modelDataUrl.startsWith('data:')) throw new Error('No model file provided');

  const modelUrl = await uploadModelGlb(input.modelDataUrl, input.originalFilename);
  const previewUrl = input.previewDataUrl
    ? await persistSiteImage(input.previewDataUrl, 'misc')
    : null;

  const created = await prisma.mapPrefabModel.create({
    data: { name, category, modelUrl, previewUrl, createdById: staff.id },
  });
  // The catalog row is already committed at this point — audit logging is
  // best-effort bookkeeping, not part of the upload's success contract. Left
  // unguarded, a transient failure here (e.g. the session expiring in the
  // same request) would surface as "upload failed" to the caller even though
  // the row was created, inviting a retry that creates a duplicate entry.
  try {
    const { writeAuditLog } = await import('@/lib/audit');
    await writeAuditLog({
      actorId: staff.id,
      actorUsername: staff.username,
      action: 'upload_prefab_model',
      detail: `${created.name} (${created.category})`,
    });
  } catch (err) {
    console.error('[prefab-library] audit log failed (upload)', err);
  }
  return created;
}

export async function adminDeletePrefabModel(id: string) {
  const staff = await requireStaff();
  const existing = await prisma.mapPrefabModel.findUnique({ where: { id } });
  if (!existing) throw new Error('Prefab not found');
  await prisma.mapPrefabModel.delete({ where: { id } });
  // Same best-effort reasoning as adminUploadPrefabModel — the row is
  // already gone; don't let an audit-log hiccup make a successful delete
  // read as "delete failed" and prompt a retry that then throws
  // "Prefab not found" for a row that's already deleted.
  try {
    const { writeAuditLog } = await import('@/lib/audit');
    await writeAuditLog({
      actorId: staff.id,
      actorUsername: staff.username,
      action: 'delete_prefab_model',
      detail: existing.name,
    });
  } catch (err) {
    console.error('[prefab-library] audit log failed (delete)', err);
  }
  return { ok: true as const };
}
