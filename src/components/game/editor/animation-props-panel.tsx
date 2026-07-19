'use client';

import React from 'react';
import type { EditorEntity, EntityAnimation, PlayerAnimBindings } from './map-document';
import { PLAYER_ANIM_SLOTS, ensureAnimation } from './map-document';
import { AnimationDirector } from './animation-director';

export function AnimationPropsPanel({
  entity,
  allEntities,
  onChange,
  onPreview,
  onWireTrap,
}: {
  entity: EditorEntity;
  allEntities: EditorEntity[];
  onChange: (patch: Partial<EditorEntity>) => void;
  onPreview?: (which: 'default' | 'active') => void;
  /** When a button picks a trap, wire trap.listenTo → button */
  onWireTrap?: (trapId: string, buttonId: string) => void;
}) {
  const anim = ensureAnimation(entity);
  const clips = anim.availableClips;
  const hasClips = clips.length > 0;

  const setAnim = (partial: Partial<EntityAnimation>) => {
    onChange({ animation: { ...anim, ...partial } });
  };

  return (
    <div className="space-y-2 border-t border-white/10 pt-2 mt-2">
      <p className="text-[10px] tracking-widest text-white/50 uppercase">Animation</p>

      {!entity.model && !entity.customModelUrl ? (
        <p className="text-[11px] text-amber-200/80">Assign a model to scan for clips.</p>
      ) : !hasClips ? (
        <p className="text-[11px] text-white/45">
          No clips in this GLB (static mesh). Upload/select an animated model to see options.
        </p>
      ) : (
        <p className="text-[11px] text-emerald-300/90">{clips.length} clips found</p>
      )}

      {entity.kind === 'player' ? (
        <PlayerBindingsEditor
          clips={clips}
          bindings={entity.playerAnims ?? {}}
          onChange={(playerAnims) => onChange({ playerAnims })}
        />
      ) : (
        <>
          <label className="block text-xs text-white/60">
            Trigger
            <select
              className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
              value={anim.trigger}
              onChange={(e) => setAnim({ trigger: e.target.value as EntityAnimation['trigger'] })}
            >
              <option value="none">None (static / default only)</option>
              <option value="always">Always loop default</option>
              <option value="proximity">Proximity (walk near)</option>
              <option value="interact">Interact (press E nearby)</option>
              <option value="collide">Collide / touch</option>
              <option value="signal">Signal from button</option>
            </select>
          </label>

          <label className="block text-xs text-white/60">
            Default clip (idle / closed)
            <select
              className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
              value={anim.defaultClip ?? ''}
              onChange={(e) => setAnim({ defaultClip: e.target.value || undefined })}
              disabled={!hasClips}
            >
              <option value="">—</option>
              {clips.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-white/60">
            Active clip (open / play)
            <select
              className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
              value={anim.activeClip ?? ''}
              onChange={(e) => setAnim({ activeClip: e.target.value || undefined })}
              disabled={!hasClips}
            >
              <option value="">—</option>
              {clips.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {(anim.trigger === 'proximity' ||
            anim.trigger === 'interact' ||
            anim.trigger === 'collide') && (
            <label className="block text-xs text-white/60">
              Radius ({anim.radius.toFixed(1)})
              <input
                type="range"
                min={0.5}
                max={12}
                step={0.25}
                className="w-full"
                value={anim.radius}
                onChange={(e) => setAnim({ radius: Number(e.target.value) })}
              />
            </label>
          )}

          {anim.trigger === 'signal' && (
            <label className="block text-xs text-white/60">
              Listen to button
              <select
                className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                value={anim.listenToEntityId ?? ''}
                onChange={(e) => setAnim({ listenToEntityId: e.target.value || undefined })}
              >
                <option value="">—</option>
                {allEntities
                  .filter((e) => e.kind === 'button' || e.id !== entity.id)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.kind})
                    </option>
                  ))}
              </select>
            </label>
          )}

          {entity.kind === 'button' && (
            <>
              <label className="block text-xs text-white/60">
                Activates trap / door
                <select
                  className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                  value={anim.activatesEntityIds?.[0] ?? ''}
                  onChange={(e) => {
                    const targetId = e.target.value || undefined;
                    const activatesEntityIds = targetId ? [targetId] : [];
                    setAnim({ activatesEntityIds });
                    if (targetId) onWireTrap?.(targetId, entity.id);
                  }}
                >
                  <option value="">— none —</option>
                  {allEntities
                    .filter(
                      (e) =>
                        e.id !== entity.id &&
                        (e.kind === 'trap' ||
                          e.kind === 'hazard' ||
                          e.kind === 'prop' ||
                          e.kind === 'checkpoint')
                    )
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.kind})
                      </option>
                    ))}
                </select>
              </label>
              <p className="text-[10px] text-white/40 leading-snug">
                Place a Trap, then pick it here. Player presses E on this button → that trap plays its
                Active clip.
              </p>
              <label className="block text-xs text-white/60">
                Signal channel (optional)
                <input
                  className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                  value={anim.signalChannel ?? ''}
                  placeholder="e.g. door_1"
                  onChange={(e) => setAnim({ signalChannel: e.target.value || undefined })}
                />
              </label>
            </>
          )}

          <div className="flex gap-2 text-[11px]">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={anim.loopDefault}
                onChange={(e) => setAnim({ loopDefault: e.target.checked })}
              />
              Loop default
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={anim.loopActive}
                onChange={(e) => setAnim({ loopActive: e.target.checked })}
              />
              Loop active
            </label>
          </div>

          {hasClips && (
            <div className="flex gap-1">
              <button
                type="button"
                className="flex-1 text-xs py-1 rounded bg-white/10 hover:bg-white/20"
                onClick={() => {
                  const sug = AnimationDirector.suggestClips(clips);
                  setAnim(sug);
                }}
              >
                Auto-pick clips
              </button>
              <button
                type="button"
                className="flex-1 text-xs py-1 rounded bg-cyan-600/40 hover:bg-cyan-500/50"
                onClick={() => onPreview?.('active')}
              >
                Preview open
              </button>
            </div>
          )}

          <p className="text-[10px] text-white/35 leading-snug">
            Example door: trigger = Interact or Signal, default = closed, active = open. Wire a Button
            entity with Interact, set door Listen to that button.
          </p>
        </>
      )}
    </div>
  );
}

function PlayerBindingsEditor({
  clips,
  bindings,
  onChange,
}: {
  clips: string[];
  bindings: PlayerAnimBindings;
  onChange: (b: PlayerAnimBindings) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-white/55">
        Map each player action to a clip from this model ({clips.length} available).
      </p>
      {PLAYER_ANIM_SLOTS.map(({ id, label }) => (
        <label key={id} className="block text-xs text-white/60">
          {label}
          <select
            className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
            value={bindings[id] ?? ''}
            onChange={(e) =>
              onChange({ ...bindings, [id]: e.target.value || undefined })
            }
            disabled={!clips.length}
          >
            <option value="">—</option>
            {clips.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      ))}
      {clips.length > 0 && (
        <button
          type="button"
          className="w-full text-xs py-1 rounded bg-white/10 hover:bg-white/20"
          onClick={() => {
            const lower = clips.map((c) => ({ c, l: c.toLowerCase() }));
            const find = (...keys: string[]) =>
              lower.find((x) => keys.some((k) => x.l.includes(k)))?.c;
            onChange({
              idle: find('idle', 'stand') ?? clips[0],
              walk: find('walk', 'run') ?? clips[1] ?? clips[0],
              run: find('run', 'sprint') ?? find('walk') ?? clips[0],
              jump: find('jump', 'hop') ?? clips[0],
              fall: find('fall', 'air') ?? find('jump') ?? clips[0],
              crouch: find('crouch', 'sneak') ?? clips[0],
              strafe_left: find('left', 'strafe') ?? find('walk') ?? clips[0],
              strafe_right: find('right', 'strafe') ?? find('walk') ?? clips[0],
              back: find('back', 'backward') ?? find('walk') ?? clips[0],
            });
          }}
        >
          Auto-bind by name
        </button>
      )}
    </div>
  );
}
