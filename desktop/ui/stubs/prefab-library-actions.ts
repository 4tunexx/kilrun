export async function getPrefabLibrary() {
  return [];
}

export async function getPrefabLibraryCategories(): Promise<string[]> {
  return [];
}

export async function adminUploadPrefabModel(_input: unknown) {
  throw new Error('Cloud prefab upload lives on the website. Place local models from your project folder.');
}

export async function adminDeletePrefabModel(_id: string) {
  throw new Error('Cloud prefab delete lives on the website.');
}
