/**
 * Inventory slot cap — how many distinct inventory rows (cosmetics, crates,
 * powers, etc.) a player can hold at once. Stacked duplicates (see
 * InventoryItem.quantity) do not cost extra slots; only the row itself does.
 *
 * Base cap scales with account level (10 base, +5 every 5 levels), capping
 * at 30 slots from leveling alone. Players can raise the ceiling further by
 * buying "slot_pack" StoreItems from the shop (see purchaseSlotPack in
 * social-actions.ts), tracked in User.extraInventorySlots.
 */

export const BASE_INVENTORY_SLOTS = 10;
export const LEVEL_SLOTS_STEP = 5;
export const LEVEL_SLOTS_PER_STEP = 5;
/** Highest slot count leveling alone can reach (before purchased packs). */
export const MAX_LEVEL_INVENTORY_SLOTS = 30;

/** Slots granted purely from account level, before any purchased packs. */
export function getLevelInventorySlots(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  const steps = Math.floor(safeLevel / LEVEL_SLOTS_STEP);
  const fromLevel = BASE_INVENTORY_SLOTS + steps * LEVEL_SLOTS_PER_STEP;
  return Math.min(MAX_LEVEL_INVENTORY_SLOTS, fromLevel);
}

/** Total slot cap = level-derived base + purchased extra slots. */
export function getInventorySlotCap(level: number, extraSlots: number): number {
  return getLevelInventorySlots(level) + Math.max(0, Math.floor(extraSlots || 0));
}
