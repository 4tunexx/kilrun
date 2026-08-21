'use client';

import type { ReactNode } from 'react';
import {
  Eye,
  Keyboard,
  PersonStanding,
  Shirt,
  ShoppingCart,
  Sparkles,
  Sword,
  Swords,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CombatEditor } from '../combat-editor';
import { ControlsPanel } from '../controls-panel';
import { MapShopPanel } from '../map-shop-panel';
import { ModelSkinEditor } from '../model-skin-editor';
import { PlayerModelStudio } from '../player-model-studio';
import { PowerEditor } from '../power-editor';
import { SoundBoardEditor } from '../sound-board-editor';
import { TpsViewStudio } from '../tps-view-studio';
import { WeaponEditor } from '../weapon-editor';
import { sanitizeTpsView } from '../../tps/tps-view-settings';
import { adminUpsertStoreItem } from '@/lib/social-actions';
import { adminSyncDatabaseSchema } from '@/lib/admin-db-sync';
import type { MapEditorBrains, MapEditorPlugin } from '../engine/types';

function wrap(node: ReactNode) {
  return <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{node}</div>;
}

function renderTps(brains: MapEditorBrains) {
  const {
    isMobile,
    mapId,
    closeStudioPanels,
    startPlay,
    doc,
    saveTpsToMap,
    playerAvatar,
    openPlayerStudio,
    patchEntityById,
  } = brains;
  return wrap(
    <TpsViewStudio
      embedded
      isMobile={isMobile}
      mapId={mapId}
      onClose={closeStudioPanels}
      onPlayTest={(settings) => {
        closeStudioPanels();
        void startPlay(settings);
      }}
      mapDoc={doc}
      mapOverride={doc.tpsView ? sanitizeTpsView(doc.tpsView) : null}
      onSaveToMap={saveTpsToMap}
      playerEntity={playerAvatar}
      onChangePlayer={(patch) => {
        if (!playerAvatar) {
          openPlayerStudio();
          return;
        }
        patchEntityById(playerAvatar.id, patch);
      }}
      onOpenFullPlayerStudio={() => {
        openPlayerStudio();
      }}
    />
  );
}

function renderPlayer(brains: MapEditorBrains) {
  const { playerAvatar, isMobile, closeStudioPanels, patchEntityById, doc, saveCustomMoves, openPlayerStudio } =
    brains;
  return wrap(
    playerAvatar ? (
      <PlayerModelStudio
        embedded
        entity={playerAvatar}
        isMobile={isMobile}
        onClose={closeStudioPanels}
        onChange={(patch) => patchEntityById(playerAvatar.id, patch)}
        customMoves={doc.customMoves ?? []}
        onCustomMovesChange={saveCustomMoves}
      />
    ) : (
      <div className="p-4 space-y-3 text-sm text-white/70">
        <p>No player avatar on this map yet.</p>
        <Button size="sm" onClick={() => openPlayerStudio()}>
          Create Player Model
        </Button>
      </div>
    )
  );
}

function renderSkins(brains: MapEditorBrains) {
  const { playerAvatar, isMobile, closeStudioPanels, applySkinsToPlayer, toast, openModelEditor } = brains;
  return wrap(
    playerAvatar ? (
      <ModelSkinEditor
        embedded
        entity={playerAvatar}
        isMobile={isMobile}
        onClose={closeStudioPanels}
        onApplyToPlayer={applySkinsToPlayer}
        onPublishToShop={async (payload) => {
          try {
            await adminSyncDatabaseSchema().catch(() => null);
            await adminUpsertStoreItem({
              itemName: payload.itemName,
              itemCategory: payload.itemCategory,
              itemSku: payload.itemSku,
              vpPrice: payload.vpPrice,
              imageUrl: payload.imageUrl,
              cosmeticSlot: payload.cosmeticSlot,
              cosmeticConfig: payload.cosmeticConfig,
            });
            toast({
              title: 'Skin published to shop',
              description: `${payload.itemName} is now in Skins.`,
            });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Publish failed';
            toast({ title: msg, variant: 'destructive' });
          }
        }}
      />
    ) : (
      <div className="p-4 space-y-3 text-sm text-white/70">
        <p>Model Editor needs a player avatar first.</p>
        <Button size="sm" onClick={() => openModelEditor()}>
          Create avatar & open
        </Button>
      </div>
    )
  );
}

/** Studios that must not leave a map entity selected behind the panel. */
const CLEAR_SELECTION = { clearSelection: true } as const;
/** Studios that edit the platform player, so the entity has to exist first. */
const NEEDS_PLAYER = { ensurePlayerEntity: true, clearSelection: true } as const;

export const studioPlugins: MapEditorPlugin[] = [
  {
    id: 'tps',
    slot: 'sidebar',
    label: '3rd View',
    icon: Eye,
    order: 70,
    studio: CLEAR_SELECTION,
    render: renderTps,
  },
  {
    id: 'player',
    slot: 'sidebar',
    label: 'Player Model',
    icon: PersonStanding,
    order: 80,
    studio: NEEDS_PLAYER,
    render: renderPlayer,
  },
  {
    id: 'skins',
    slot: 'sidebar',
    label: 'Model Editor',
    icon: Shirt,
    order: 90,
    studio: NEEDS_PLAYER,
    render: renderSkins,
  },
  {
    id: 'weapon',
    slot: 'sidebar',
    label: 'Weapon Editor',
    icon: Sword,
    order: 100,
    studio: {},
    render: (brains) =>
      wrap(
        <WeaponEditor
          key={brains.mapId}
          embedded
          isMobile={brains.isMobile}
          mapDoc={brains.doc}
          onClose={brains.closeStudioPanels}
          onSaveToMap={brains.saveWeaponDef}
        />
      ),
  },
  {
    id: 'combat',
    slot: 'sidebar',
    label: 'Combat Editor',
    icon: Swords,
    order: 110,
    studio: {},
    render: (brains) =>
      wrap(
        <CombatEditor
          key={brains.mapId}
          embedded
          isMobile={brains.isMobile}
          mapDoc={brains.doc}
          onClose={brains.closeStudioPanels}
          onSaveToMap={brains.saveCombatSettings}
        />
      ),
  },
  {
    id: 'powers',
    slot: 'sidebar',
    label: 'Power Editor',
    icon: Sparkles,
    order: 120,
    studio: {},
    render: (brains) => wrap(<PowerEditor embedded onClose={brains.closeStudioPanels} />),
  },
  {
    id: 'sound',
    slot: 'sidebar',
    label: 'Sound Board',
    icon: Volume2,
    order: 130,
    studio: {},
    render: (brains) =>
      wrap(
        <SoundBoardEditor
          embedded
          onClose={brains.closeStudioPanels}
          customMoves={brains.doc.customMoves}
          mapName={brains.doc.name}
        />
      ),
  },
  {
    id: 'controls',
    slot: 'sidebar',
    label: 'Controls',
    icon: Keyboard,
    order: 150,
    studio: {},
    render: (brains) =>
      wrap(
        <ControlsPanel
          embedded
          onClose={brains.closeStudioPanels}
          customMoves={brains.doc.customMoves}
        />
      ),
  },
  {
    id: 'shop',
    slot: 'sidebar',
    label: 'Buy Menu',
    icon: ShoppingCart,
    order: 140,
    studio: {},
    render: (brains) =>
      wrap(
        <MapShopPanel
          key={brains.mapId}
          mapDoc={brains.doc}
          onClose={brains.closeStudioPanels}
          onSave={brains.saveShopSettings}
        />
      ),
  },
];
