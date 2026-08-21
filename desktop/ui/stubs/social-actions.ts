import { upsertEngineShopItem } from '@/lib/engine/platform-client';

export async function adminUpsertStoreItem(input: Record<string, unknown>) {
  const result = await upsertEngineShopItem(input);
  return result.item;
}
