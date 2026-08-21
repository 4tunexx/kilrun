'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { persistModelFromDataUrl } from '@/lib/model-asset-core';

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

/**
 * Upload a GLB/GLTF model file (supplied as a base64 data URL) to durable
 * storage and return a public URL. Staff-gated for website callers; Engine
 * staff writes go through persistModelFromDataUrl after token auth.
 */
export async function uploadModelGlb(
  dataUrl: string,
  originalFilename?: string
): Promise<string> {
  await requireStaff();
  return persistModelFromDataUrl(dataUrl, originalFilename);
}
