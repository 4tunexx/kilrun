export async function listCloudPrefabs() {
  return [];
}

export async function publishCloudPrefab(_input: unknown) {
  throw new Error('Cloud prefabs are published from the website. Local prefabs still save on this PC.');
}

export async function deleteCloudPrefab(_id: string) {
  return { ok: true };
}

