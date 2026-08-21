import {
  deleteEnginePrefab,
  getEnginePrefabEntities,
  listEnginePrefabs,
  publishEnginePrefab,
} from '@/lib/engine/platform-client';

export async function listCloudPrefabs(mode?: string) {
  return listEnginePrefabs(mode);
}

export async function publishCloudPrefab(input: {
  localId?: string;
  name: string;
  mode?: string;
  entities: unknown[];
  thumbnailDataUrl?: string | null;
}) {
  return publishEnginePrefab(input);
}

export async function getCloudPrefabEntities(id: string) {
  return getEnginePrefabEntities(id);
}

export async function deleteCloudPrefab(id: string) {
  return deleteEnginePrefab(id);
}
