'use client';

import { Settings2 } from 'lucide-react';
import { getKilrunModeInfo, resolveModeBase } from '@/lib/game-modes';
import {
  ensureCompetitiveSettings,
  ensureDeathrunSettings,
  ensureHordeSettings,
  getMapGameMode,
} from '../map-document';
import type { MapEditorBrains, MapEditorPlugin } from '../engine/types';

function SettingsPanel({ brains }: { brains: MapEditorBrains }) {
  const { doc, toolsOpen, setToolsOpen, mutateLiveDoc } = brains;
  const gameMode = getMapGameMode(doc);
  const simMode = resolveModeBase(gameMode);
  const modeInfo = getKilrunModeInfo(gameMode);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <div>
        <p className="text-xs font-bold text-cyan-300 tracking-wide uppercase">
          Editor UI
        </p>
        <p className="text-[10px] text-white/45 mt-1 leading-snug">
          Toggle on-canvas tools that sit over the viewport.
        </p>
        <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-white/80">
          <span>
            Show tool bar
            <span className="block text-[10px] text-white/45 mt-0.5">
              Select / move / paint / place tools overlay
            </span>
          </span>
          <input
            type="checkbox"
            className="accent-cyan-400 h-4 w-4"
            checked={toolsOpen}
            onChange={(e) => setToolsOpen(e.target.checked)}
          />
        </label>
      </div>

      <div>
        <p className="text-xs font-bold text-cyan-300 tracking-wide uppercase">
          {modeInfo.shortTitle} settings
        </p>
        <p className="text-[10px] text-white/45 mt-1 leading-snug">
          Match timings for this map. Place mode entities from the bottom toolbar — they stay
          invisible in Play Test / game.
        </p>
      </div>

      {simMode === 'deathrun' && (
        <div className="space-y-3">
          {(() => {
            const s = ensureDeathrunSettings(doc);
            const patch = (partial: Partial<typeof s>) => {
              mutateLiveDoc((d) => ({
                ...d,
                modeSettings: {
                  ...d.modeSettings,
                  deathrun: { ...ensureDeathrunSettings(d), ...partial },
                },
              }));
            };
            return (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">Timing</p>
                <label className="block text-xs text-white/60">
                  Warmup ({s.warmupSec}s) — lobby countdown before run starts
                  <input type="range" min={0} max={60} className="w-full accent-sky-400" value={s.warmupSec}
                    onChange={(e) => patch({ warmupSec: Number(e.target.value) })} />
                </label>
                <label className="block text-xs text-white/60">
                  Round time ({s.roundTimeSec}s)
                  <input type="range" min={30} max={600} step={10} className="w-full accent-sky-400" value={s.roundTimeSec}
                    onChange={(e) => patch({ roundTimeSec: Number(e.target.value) })} />
                </label>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80 mt-1">Players</p>
                <label className="block text-xs text-white/60">
                  Max runners ({s.maxRunners}) — place that many Runner Spawns
                  <input type="range" min={1} max={8} className="w-full accent-sky-400" value={s.maxRunners}
                    onChange={(e) => patch({ maxRunners: Number(e.target.value) })} />
                </label>
                <label className="block text-xs text-white/60">
                  Lives per runner ({s.livesPerRunner === 0 ? '∞' : s.livesPerRunner})
                  <input type="range" min={0} max={10} className="w-full accent-sky-400" value={s.livesPerRunner}
                    onChange={(e) => patch({ livesPerRunner: Number(e.target.value) })} />
                </label>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80 mt-1">Trapper</p>
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" checked={s.trapperEnabled}
                    onChange={(e) => patch({ trapperEnabled: e.target.checked })} />
                  Trapper enabled
                </label>
                {s.trapperEnabled && (
                  <label className="block text-xs text-white/60">
                    Trap cooldown ({s.trapCooldownSec}s between activations)
                    <input type="range" min={1} max={30} className="w-full accent-sky-400" value={s.trapCooldownSec}
                      onChange={(e) => patch({ trapCooldownSec: Number(e.target.value) })} />
                  </label>
                )}
                <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80 mt-1">Respawn</p>
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" checked={s.checkpointRespawn}
                    onChange={(e) => patch({ checkpointRespawn: e.target.checked })} />
                  Checkpoint respawn (spawn at last checkpoint on death)
                </label>
                <p className="text-[10px] text-white/45 leading-snug rounded-lg border border-white/10 bg-black/30 p-2 mt-1">
                  Entities: Runner Spawn ×{s.maxRunners}{s.trapperEnabled ? ', Trapper Spawn' : ''}, Light, Button, Trap, Death Zone,
                  Door, Jump pad, Finish, Action, Checkpoint
                </p>
              </>
            );
          })()}
        </div>
      )}

      {simMode === 'horde' && (
        <div className="space-y-3">
          {(() => {
            const s = ensureHordeSettings(doc);
            const patch = (partial: Partial<typeof s>) => {
              mutateLiveDoc((d) => ({
                ...d,
                modeSettings: {
                  ...d.modeSettings,
                  horde: { ...ensureHordeSettings(d), ...partial },
                },
              }));
            };
            return (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/80">Timing</p>
                <label className="block text-xs text-white/60">
                  Warmup ({s.warmupSec}s) — countdown before wave 1
                  <input type="range" min={0} max={60} className="w-full accent-violet-400" value={s.warmupSec}
                    onChange={(e) => patch({ warmupSec: Number(e.target.value) })} />
                </label>
                <label className="block text-xs text-white/60">
                  Wave time limit ({s.waveTimeSec === 0 ? '∞ (kill all)' : s.waveTimeSec + 's'})
                  <input type="range" min={0} max={300} step={5} className="w-full accent-violet-400" value={s.waveTimeSec}
                    onChange={(e) => patch({ waveTimeSec: Number(e.target.value) })} />
                </label>
                <label className="block text-xs text-white/60">
                  Intermission / buy phase ({s.intermissionSec}s between waves)
                  <input type="range" min={5} max={90} className="w-full accent-violet-400" value={s.intermissionSec}
                    onChange={(e) => patch({ intermissionSec: Number(e.target.value) })} />
                </label>
                <label className="block text-xs text-white/60">
                  Weapon shop window ({Math.min(s.waveBuyTimeSec, s.intermissionSec)}s of intermission)
                  <input type="range" min={0} max={s.intermissionSec} className="w-full accent-violet-400"
                    value={Math.min(s.waveBuyTimeSec, s.intermissionSec)}
                    onChange={(e) => patch({ waveBuyTimeSec: Number(e.target.value) })} />
                  <span className="block text-[9px] text-white/40 mt-1">
                    Weapon list: left-nav Buy Menu. Also opens during match countdown.
                  </span>
                </label>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/80 mt-1">Waves</p>
                <label className="block text-xs text-white/60">
                  Total waves ({s.totalWaves === 0 ? '∞ endless' : s.totalWaves})
                  <input type="range" min={0} max={50} className="w-full accent-violet-400" value={s.totalWaves}
                    onChange={(e) => patch({ totalWaves: Number(e.target.value) })} />
                </label>
                <label className="block text-xs text-white/60">
                  Starting wave ({s.startingWave})
                  <input type="range" min={1} max={20} className="w-full accent-violet-400" value={s.startingWave}
                    onChange={(e) => patch({ startingWave: Number(e.target.value) })} />
                </label>
                <label className="block text-xs text-white/60">
                  Difficulty ramp ({s.difficultyScale.toFixed(1)}× per wave)
                  <input type="range" min={0.5} max={3.0} step={0.1} className="w-full accent-violet-400"
                    value={s.difficultyScale}
                    onChange={(e) => patch({ difficultyScale: Number(e.target.value) })} />
                </label>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/80 mt-1">Players</p>
                <label className="block text-xs text-white/60">
                  Max players ({s.maxPlayers})
                  <input type="range" min={1} max={8} className="w-full accent-violet-400" value={s.maxPlayers}
                    onChange={(e) => patch({ maxPlayers: Number(e.target.value) })} />
                </label>
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" checked={s.respawnOnWaveClear}
                    onChange={(e) => patch({ respawnOnWaveClear: e.target.checked })} />
                  Respawn downed players when a wave clears
                </label>
                <p className="text-[10px] text-white/45 leading-snug rounded-lg border border-white/10 bg-black/30 p-2 mt-1">
                  Entities: Player Spawn ×{s.maxPlayers}, Enemy Spawn, Red Zone, Health Floor, Revive Pad,
                  Wave Anchor, Death Zone, Light, Door
                </p>
              </>
            );
          })()}
        </div>
      )}

      {simMode === 'competitive' && (
        <div className="space-y-3">
          {(() => {
            const s = ensureCompetitiveSettings(doc);
            const patch = (partial: Partial<typeof s>) => {
              mutateLiveDoc((d) => ({
                ...d,
                modeSettings: {
                  ...d.modeSettings,
                  competitive: { ...ensureCompetitiveSettings(d), ...partial },
                },
              }));
            };
            return (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-300/80">Timing</p>
                <label className="block text-xs text-white/60">
                  Warmup ({s.warmupSec}s) — lobby countdown
                  <input type="range" min={0} max={60} className="w-full accent-orange-400" value={s.warmupSec}
                    onChange={(e) => patch({ warmupSec: Number(e.target.value) })} />
                </label>
                <label className="block text-xs text-white/60">
                  Buy / weapon shop time ({s.buyTimeSec}s per round start)
                  <input type="range" min={0} max={60} className="w-full accent-orange-400" value={s.buyTimeSec}
                    onChange={(e) => patch({ buyTimeSec: Number(e.target.value) })} />
                  <p className="text-[9px] text-white/40 mt-1">
                    Weapons listed in left-nav Buy Menu (Competitive flag). Applies every round.
                  </p>
                </label>
                <label className="block text-xs text-white/60">
                  Round time ({s.roundTimeSec}s)
                  <input type="range" min={30} max={300} step={5} className="w-full accent-orange-400" value={s.roundTimeSec}
                    onChange={(e) => patch({ roundTimeSec: Number(e.target.value) })} />
                </label>
                <label className="block text-xs text-white/60">
                  Overtime ({s.overtimeSec}s, 0 = sudden death)
                  <input type="range" min={0} max={120} step={5} className="w-full accent-orange-400" value={s.overtimeSec}
                    onChange={(e) => patch({ overtimeSec: Number(e.target.value) })} />
                </label>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-300/80 mt-1">Rounds &amp; Teams</p>
                <label className="block text-xs text-white/60">
                  Rounds to win ({s.roundCount})
                  <input type="range" min={1} max={12} className="w-full accent-orange-400" value={s.roundCount}
                    onChange={(e) => patch({ roundCount: Number(e.target.value) })} />
                </label>
                <label className="block text-xs text-white/60">
                  Max players per team ({s.maxPlayersPerTeam})
                  <input type="range" min={1} max={8} className="w-full accent-orange-400" value={s.maxPlayersPerTeam}
                    onChange={(e) => patch({ maxPlayersPerTeam: Number(e.target.value) })} />
                </label>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-300/80 mt-1">Rules</p>
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" checked={s.friendlyFire}
                    onChange={(e) => patch({ friendlyFire: e.target.checked })} />
                  Friendly fire
                </label>
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" checked={s.respawnInRound}
                    onChange={(e) => patch({ respawnInRound: e.target.checked })} />
                  Respawn mid-round (unchecked = elimination)
                </label>
                <p className="text-[10px] text-white/45 leading-snug rounded-lg border border-white/10 bg-black/30 p-2 mt-1">
                  Entities: Team A Spawn ×{s.maxPlayersPerTeam}, Team B Spawn ×{s.maxPlayersPerTeam},
                  Push Rail, Push Block, Light, Door, Death Zone
                </p>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export const settingsPlugin: MapEditorPlugin = {
  id: 'settings',
  slot: 'sidebar',
  label: 'Settings',
  icon: Settings2,
  order: 160,
  render: (brains) => <SettingsPanel brains={brains} />,
};
