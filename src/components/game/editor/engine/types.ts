'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type {
  CombatSettings,
  CustomMoveDef,
  EditorEntity,
  EditorLayer,
  MapDocument,
  MapEnvironment,
  MapShopSettings,
  MapWeaponDef,
} from '../map-document';
import type { CustomTexture } from '../texture-library';
import type { EditTool, EditorPerfMode } from '../editor-viewport';
import type { TpsViewSettings } from '../../tps/tps-view-settings';
import type { SkinAttachment } from '@/lib/player-skins';
import type { EditorViewportApi } from '../editor-viewport';
import type { PrefabStamp } from '../prefab-storage';

/** Row shape of the staff-uploaded model library (Assets tab). */
export type LibraryPrefab = Awaited<
  ReturnType<typeof import('@/lib/prefab-library-actions').getPrefabLibrary>
>[number];

export interface CloudPrefabSummary {
  id: string;
  name: string;
  updatedAt: string;
  entityCount: number;
  thumbnailUrl?: string | null;
}

/** Live handle to the Three.js viewport. Plugins call it, they never own it. */
export type EditorViewportRef = { current: EditorViewportApi | null };

/**
 * Public API every sidebar/studio plugin talks to.
 * Brains (history, doc, viewport, play test) stay in map-editor.tsx —
 * plugins must not own undo or the Three.js viewport.
 */
export interface MapEditorBrains {
  doc: MapDocument;
  mapId: string;
  isMobile: boolean;
  tab: string;
  selectedId: string | null;
  selectedIds: string[];
  playerAvatar: EditorEntity | null;
  sortedLayers: EditorLayer[];
  activeLayerId: string;
  setActiveLayerId: (id: string) => void;
  closeStudioPanels: () => void;
  startPlay: (tpsOverride?: TpsViewSettings | null) => void | Promise<void>;
  saveTpsToMap: (settings: TpsViewSettings) => void;
  openPlayerStudio: () => void;
  openModelEditor: () => void;
  patchEntityById: (id: string, patch: Partial<EditorEntity>) => void;
  saveCustomMoves: (moves: CustomMoveDef[]) => void;
  applySkinsToPlayer: (attachments: SkinAttachment[]) => void;
  saveWeaponDef: (def: Partial<MapWeaponDef>) => void;
  saveCombatSettings: (settings: Partial<CombatSettings>) => void;
  saveShopSettings: (settings: MapShopSettings) => void;
  showAllLayers: () => void;
  addBuildLevel: () => void;
  setLayerFlag: (
    id: string,
    patch: Partial<{ visible: boolean; locked: boolean; name: string }>
  ) => void;
  soloLayer: (id: string) => void;
  deleteBuildLevel: (id: string) => void;
  moveSelectionToLayer: (layerId: string) => void;
  toast: (opts: {
    title?: ReactNode;
    description?: ReactNode;
    variant?: 'default' | 'destructive';
  }) => void;

  apiRef: EditorViewportRef;
  setSelectedId: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;
  setTutorialOpen: (open: boolean) => void;

  setSidebarOpen: (open: boolean) => void;
  setUiCollapsed: (collapsed: boolean) => void;

  prefabs: PrefabStamp[];
  setPrefabs: (prefabs: PrefabStamp[]) => void;
  cloudPrefabs: CloudPrefabSummary[];
  setCloudPrefabs: (prefabs: CloudPrefabSummary[]) => void;
  prefabName: string;
  setPrefabName: (name: string) => void;
  prefabSnapBtnRef: { current: HTMLButtonElement | null };
  snapFaceMenuOpen: boolean;
  setSnapFaceMenuOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  snapFaceAnchorRect: DOMRect | null;
  setSnapFaceAnchorRect: (rect: DOMRect | null) => void;

  selected: EditorEntity | null;
  env: MapEnvironment;
  patchSelected: (patch: Partial<EditorEntity>) => void;
  patchEnv: (partial: Partial<MapEnvironment>) => void;
  editTool: EditTool;
  setEditTool: (tool: EditTool | ((prev: EditTool) => EditTool)) => void;
  texFileRef: { current: HTMLInputElement | null };
  paintTextureUrl: string | null;
  setPaintTextureUrl: (url: string | null) => void;
  copiedTextureInfo: { textureUrl: string | null; sourceName?: string } | null;
  setCopiedTextureInfo: (info: { textureUrl: string | null; sourceName?: string } | null) => void;
  paintRepeat: [number, number];
  setPaintRepeat: (repeat: [number, number]) => void;
  paintWorldScale: number;
  setPaintWorldScale: (scale: number) => void;
  customTextures: CustomTexture[];
  setCustomTextures: (textures: CustomTexture[]) => void;

  /** Sanctioned mutation path — anchors undo history and pushes to the viewport. */
  mutateLiveDoc: (fn: (d: MapDocument) => MapDocument) => void;
  toolsOpen: boolean;
  setToolsOpen: (open: boolean) => void;

  skyFileRef: { current: HTMLInputElement | null };
  editorPerf: EditorPerfMode;
  setEditorPerf: (mode: EditorPerfMode) => void;

  query: string;
  setQuery: (query: string) => void;
  setUploadOpen: (open: boolean) => void;
  libraryCategories: string[];
  libraryCategory: string;
  setLibraryCategory: (category: string) => void;
  brush: string | null;
  setBrush: (model: string | null) => void;
  freeFly: boolean;
  pendingPlaceKind: EditorEntity['kind'] | null;
  setPendingPlaceKind: (kind: EditorEntity['kind'] | null) => void;
  filtered: string[];
  filteredLibraryPrefabs: LibraryPrefab[];
  reloadPrefabLibrary: () => void;

  setTab: (id: string) => void;
  /** Opens a studio panel with the same chrome setup the rail uses. */
  openStudioTab: (id: string, studio?: MapEditorStudioOptions) => void;
}

export type MapEditorPluginSlot = 'sidebar';

/**
 * Extra brains setup a studio panel needs before it opens. Declaring these as
 * data keeps the icon rail free of per-tab branches.
 */
export interface MapEditorStudioOptions {
  /** Create the platform player entity first (Player Model / Model Editor). */
  ensurePlayerEntity?: boolean;
  /** Drop the map selection so Properties doesn't fight the studio panel. */
  clearSelection?: boolean;
}

export interface MapEditorPlugin {
  id: string;
  slot: MapEditorPluginSlot;
  label: string;
  /** Icon shown in the left rail. */
  icon: LucideIcon;
  /** Ascending rail position. */
  order: number;
  /**
   * Present = this panel is a studio that replaces the map sidebar and is
   * dismissed by closeStudioPanels(). Absent = a normal library tab.
   */
  studio?: MapEditorStudioOptions;
  render: (brains: MapEditorBrains) => ReactNode;
  /** Overrides the rail's default click behavior when set. */
  onActivate?: (brains: MapEditorBrains) => void;
}
