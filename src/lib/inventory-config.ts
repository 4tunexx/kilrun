/**
 * Admin-editable inventory drawer config (SiteSettings.inventoryConfigJson).
 * Controls resell rate, tabs, copy, and panel chrome for the player inventory.
 */

export type InventoryConfig = {
  /** Fraction of original VP refunded on resell (0–1). */
  resellRate: number;
  /** Header title shown in the drawer. */
  title: string;
  /** Small subtitle under the title (empty = show "{n} items"). */
  subtitle: string;
  /** Show the Cosmetics page tab. */
  showCosmeticsTab: boolean;
  /** Show the Powers page tab. */
  showPowersTab: boolean;
  /** Allow drag-and-drop equip on desktop. */
  enableDragDrop: boolean;
  /** Default page tab when opening the drawer. */
  defaultPageTab: 'skins' | 'cosmetics' | 'powers';
  /** Max sheet width in px (clamped 640–1280). */
  sheetMaxWidth: number;
  /** Show the 3D / profile preview column. */
  showPreviewColumn: boolean;
  /**
   * Optional GLB/FBX/pack URL for the Skins-tab 3D turntable.
   * Empty = default pack player body (all players share this).
   */
  previewModelUrl: string;
  /**
   * Exact animation clip name to play in the inventory preview.
   * Empty = auto-pick idle/stand/breath.
   */
  previewClipName: string;
  /** Turntable spin speed in rad/s (0 = frozen). */
  previewSpinSpeed: number;
};

export const DEFAULT_INVENTORY_CONFIG: InventoryConfig = {
  resellRate: 0.5,
  title: 'INVENTORY',
  subtitle: '',
  showCosmeticsTab: true,
  showPowersTab: true,
  enableDragDrop: true,
  defaultPageTab: 'skins',
  sheetMaxWidth: 1100,
  showPreviewColumn: true,
  previewModelUrl: '',
  previewClipName: '',
  previewSpinSpeed: 0.4,
};

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function parseInventoryConfig(raw: unknown): InventoryConfig {
  let obj: Record<string, unknown> = {};
  try {
    if (typeof raw === 'string') {
      obj = JSON.parse(raw || '{}') as Record<string, unknown>;
    } else if (raw && typeof raw === 'object') {
      obj = raw as Record<string, unknown>;
    }
  } catch {
    obj = {};
  }

  const defaultTab = obj.defaultPageTab;
  const pageTab: InventoryConfig['defaultPageTab'] =
    defaultTab === 'cosmetics' || defaultTab === 'powers' || defaultTab === 'skins'
      ? defaultTab
      : 'skins';

  return {
    resellRate: Math.max(0, Math.min(1, num(obj.resellRate, DEFAULT_INVENTORY_CONFIG.resellRate))),
    title:
      typeof obj.title === 'string' && obj.title.trim()
        ? obj.title.trim().slice(0, 32)
        : DEFAULT_INVENTORY_CONFIG.title,
    subtitle:
      typeof obj.subtitle === 'string' ? obj.subtitle.trim().slice(0, 64) : '',
    showCosmeticsTab: obj.showCosmeticsTab !== false,
    showPowersTab: obj.showPowersTab !== false,
    enableDragDrop: obj.enableDragDrop !== false,
    defaultPageTab: pageTab,
    sheetMaxWidth: Math.max(
      640,
      Math.min(1280, Math.round(num(obj.sheetMaxWidth, DEFAULT_INVENTORY_CONFIG.sheetMaxWidth)))
    ),
    showPreviewColumn: obj.showPreviewColumn !== false,
    previewModelUrl:
      typeof obj.previewModelUrl === 'string'
        ? obj.previewModelUrl.trim().slice(0, 512)
        : '',
    previewClipName:
      typeof obj.previewClipName === 'string'
        ? obj.previewClipName.trim().slice(0, 96)
        : '',
    previewSpinSpeed: Math.max(
      0,
      Math.min(2.5, num(obj.previewSpinSpeed, DEFAULT_INVENTORY_CONFIG.previewSpinSpeed))
    ),
  };
}

export function serializeInventoryConfig(cfg: InventoryConfig): string {
  return JSON.stringify(parseInventoryConfig(cfg));
}
