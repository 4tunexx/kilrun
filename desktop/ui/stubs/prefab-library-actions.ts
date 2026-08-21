import {
  deleteEnginePrefabModel,
  listEnginePrefabModelCategories,
  listEnginePrefabModels,
  uploadEnginePrefabModel,
} from '@/lib/engine/platform-client';

export async function getPrefabLibrary() {
  return listEnginePrefabModels();
}

export async function getPrefabLibraryCategories(): Promise<string[]> {
  return listEnginePrefabModelCategories();
}

export async function adminUploadPrefabModel(input: {
  name: string;
  category: string;
  modelDataUrl: string;
  originalFilename?: string;
  previewDataUrl?: string;
}) {
  return uploadEnginePrefabModel(input);
}

export async function adminDeletePrefabModel(id: string) {
  return deleteEnginePrefabModel(id);
}
