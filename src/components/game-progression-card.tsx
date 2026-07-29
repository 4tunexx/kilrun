'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  ABILITY_KEYS,
  ABILITY_DEFINITIONS,
} from '@shared/ability-progression';
import { getGameProgression, type GameProgressionSnapshot } from '@/lib/game-progression-actions';
            <p className="text-[11px] font-bold tracking-widest text-orange-400/80 uppercase">
              In-Game Level
            </p>
            <p className="text-3xl font-black text-orange-300 leading-none mt-1">{snap.level}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold tracking-widest text-orange-400/80 uppercase">
              Skill Points
            </p>
            <p className="text-3xl font-black text-orange-300 leading-none mt-1">{snap.skillPoints}</p>
          </div>
        </div>

        <style>{`
          @keyframes shimmer {
            0% { background-position: -200% center; }
            100% { background-position: 200% center; }
          }
          .animate-shimmer {
            background-size: 200% 100%;
            animation: shimmer 2.5s infinite;
          }
        `}</style>

        <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden mb-1 relative">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500 animate-shimmer"
            style={{ width: `${Math.max(2, snap.percent)}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          {snap.xpIntoLevel} / {snap.xpForNextLevel} XP to level {snap.level + 1}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ABILITY_KEYS.map((key) => {
            const def = ABILITY_DEFINITIONS[key];
            const lvl = snap.abilities[key] ?? 0;
            const IconComponent = ABILITY_ICON_MAP[key];

            return (
              <Popover key={key}>
                <PopoverTrigger asChild>
                  <button className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-2.5 flex items-center gap-2 hover:border-orange-400/50 hover:bg-slate-900/60 transition-all cursor-help text-left w-full">
                    {IconComponent ? (
                      <IconComponent className="w-5 h-5 flex-shrink-0 text-orange-400" />
                    ) : (
                      <span className="text-lg leading-none">{def.icon}</span>
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white truncate">{def.name}</p>
                      <p className="text-[10px] font-bold text-slate-400">
                        Lv {lvl}/{def.maxLevel}
                      </p>
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 bg-slate-900 border-slate-700 p-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {IconComponent ? (
                        <IconComponent className="w-6 h-6 text-orange-400" />
                      ) : (
                        <span className="text-xl">{def.icon}</span>
                      )}
                      <div>
                        <p className="text-sm font-bold text-orange-300">{def.name}</p>
                        <p className="text-xs text-slate-400">Level {lvl}/{def.maxLevel}</p>
                      </div>
                    </div>
                    
                    <p className="text-xs text-slate-300 leading-relaxed">{def.description}</p>
                    
                    {lvl < def.maxLevel && (
                      <div className="pt-2 border-t border-slate-700">
                        <p className="text-xs text-slate-400">
                          Cost to upgrade: <span className="text-orange-300 font-bold">{def.costForLevel(lvl)} XP</span>
                        </p>
                      </div>
                    )}
                 </div>
               </PopoverContent>
             </Popover>
           );
         })}
       </div>
     </CardContent>
   </Card>
 );
}
