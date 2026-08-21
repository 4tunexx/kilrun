import { prisma } from '@/lib/prisma';
import {
  loadPowerDefinitions,
  recordToRowData,
  invalidatePowerDefinitionsCache,
} from '@/lib/power-definitions';
import { validatePowerRecord } from '@/lib/power-definitions-validate';

export { validatePowerRecord } from '@/lib/power-definitions-validate';

async function resolveIcon(icon: string): Promise<string> {
  if (!icon.startsWith('data:image/')) return icon;
  const { persistSiteImage } = await import('@/lib/site-asset-upload');
  return persistSiteImage(icon, 'misc');
}

export async function createPowerDefinition(body: unknown) {
  const validated = validatePowerRecord(body);
  if (!validated.ok) throw new Error(validated.error);
  const existing = await prisma.powerDefinition.findUnique({ where: { key: validated.record.key } });
  if (existing) throw new Error('A power with this key already exists');
  validated.record.icon = await resolveIcon(validated.record.icon);
  const count = await prisma.powerDefinition.count();
  const created = await prisma.powerDefinition.create({
    data: { ...recordToRowData(validated.record), sortOrder: validated.record.sortOrder || count },
  });
  invalidatePowerDefinitionsCache();
  await loadPowerDefinitions({ force: true });
  return created;
}

export async function updatePowerDefinition(body: unknown) {
  if (!body || typeof body !== 'object' || !('key' in body)) {
    throw new Error('key is required');
  }
  const key = String((body as Record<string, unknown>).key);
  const existing = await prisma.powerDefinition.findUnique({ where: { key } });
  if (!existing) throw new Error('Power not found');
  const validated = validatePowerRecord({ ...body, key });
  if (!validated.ok) throw new Error(validated.error);
  validated.record.icon = await resolveIcon(validated.record.icon);
  const data = recordToRowData(validated.record);
  const updateData = existing.isCore
    ? {
        name: data.name,
        description: data.description,
        icon: data.icon,
        maxLevel: data.maxLevel,
        unlockLevel: data.unlockLevel,
        prerequisitesJson: data.prerequisitesJson,
        costJson: data.costJson,
        effectParamsJson: data.effectParamsJson,
        sortOrder: data.sortOrder,
      }
    : { ...data, isCore: false };
  const updated = await prisma.powerDefinition.update({ where: { key }, data: updateData });
  invalidatePowerDefinitionsCache();
  await loadPowerDefinitions({ force: true });
  return updated;
}

export async function deletePowerDefinition(keyRaw: string) {
  const key = keyRaw.trim();
  if (!key) throw new Error('key is required');
  const existing = await prisma.powerDefinition.findUnique({ where: { key } });
  if (!existing) throw new Error('Power not found');
  if (existing.isCore) throw new Error('Core powers cannot be deleted, only tuned.');
  const all = await prisma.powerDefinition.findMany();
  const dependents = all.filter((p) => {
    try {
      const prereqs = JSON.parse(p.prerequisitesJson || '[]') as { key: string }[];
      return prereqs.some((pr) => pr.key === key);
    } catch {
      return false;
    }
  });
  if (dependents.length > 0) {
    throw new Error(
      `Cannot delete: ${dependents.map((d) => d.name).join(', ')} require this power as a prerequisite.`
    );
  }
  await prisma.powerDefinition.delete({ where: { key } });
  invalidatePowerDefinitionsCache();
  await loadPowerDefinitions({ force: true });
}
