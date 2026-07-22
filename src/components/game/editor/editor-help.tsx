'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, SkipForward, BookOpen } from 'lucide-react';

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  tip?: string;
  /** Suggested sidebar tab to open */
  tab?: 'assets' | 'layers' | 'outliner' | 'world' | 'textures' | 'prefabs' | 'help';
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to the Map Editor',
    body: 'Admin creator tool for Kilrun courses — floors by level, props, spawns, skins, prefabs. Play Test, then Set as MAIN so matches load your map.',
    tip: 'Tip: Save often (autosave runs too). Hide UI for a clear canvas; Level strip switches Floor → Props.',
  },
  {
    id: 'place',
    title: 'Place models',
    body: 'Open Assets, click a floor (e.g. floor-square) to arm the Brush, then click the ground to paint. Use the arrow Select tool (V) on the bottom bar to pick objects without placing. In Brush mode, clicking the same model on its cell selects it; Alt+click stacks another on top.',
    tip: 'Ctrl = Free Fly (WASD + mouse). Placement is off while flying. B toggles Brush.',
    tab: 'assets',
  },
  {
    id: 'transform',
    title: 'Move, rotate, scale',
    body: 'Use Select (V) then click an object. W (move), E (rotate), R (scale), or the bottom toolbar. Numbers in Properties are exact. G toggles grid snap; enable Y snap to also snap height.',
    tip: 'F focuses the camera on your selection. Delete removes it. Ctrl+Z undoes.',
  },
  {
    id: 'layers',
    title: 'Layers',
    body: 'Build by level: Floor (0) for platforms, Props (1) for decoration, Spawns (2) for starts. Use Build here to paint onto a level, the eye to hide it while you check the course, and Solo to inspect one level alone. Add Level for more floors stacked above.',
    tip: 'The Level strip under the viewport switches and hides levels without opening the sidebar.',
    tab: 'layers',
  },
  {
    id: 'spawns',
    title: 'Spawns, Player & Buttons',
    body: 'Green START flag = runner spawn marker (click once to place; Select/Esc cancels). Player Model (top bar) = platform-wide avatar look & animations — it does NOT place anything on the map. Red = Trapper spawn. Yellow button = Interact (E) / Use.',
    tip: 'Place floors with Solid on, then START on that floor, then open Player Model for the avatar. Hammer solids only need Material + size in Properties.',
  },
  {
    id: 'anim',
    title: 'Animated models',
    body: 'Select a prop and upload an animated GLB (or pick one with clips). Properties → Animation lists clips. Set Trigger: Proximity, Interact (E), Collide, or Signal from a Button. Default = closed/idle, Active = open/play.',
    tip: 'Use Auto-pick clips + Preview open to test without Play Test.',
  },
  {
    id: 'prefabs',
    title: 'Prefabs (stamps)',
    body: 'Multi-select pieces (Shift+click), then Save Prefab. Later pick the prefab and stamp it — great for repeating jump pads or arch sections.',
    tab: 'prefabs',
  },
  {
    id: 'traps',
    title: 'Buttons & traps',
    body: 'Place a Trap, then a Button. On the button, choose “Activates trap / door”. Players press E on the button to open/activate that trap. Death zones damage on touch (see Properties).',
  },
  {
    id: 'play',
    title: 'Play Test & publish',
    body: 'Play Test is 3rd-person TPS (like Fortnite): you see your body, crosshair at screen center is aim, left stick moves / WASD, right stick / mouse looks. Needs a Start spawn on a Solid floor.',
    tip: 'Finish with a clear end pad and test falling into the void. Open HELP anytime for the full guide.',
    tab: 'help',
  },
];

export const HELP_SECTIONS: { id: string; title: string; paragraphs: string[] }[] = [
  {
    id: 'overview',
    title: 'Overview',
    paragraphs: [
      'Admin map editor: build 3D courses with Kenney / custom GLBs, lighting, animation triggers, prefabs, and skins — then Play Test and Set as MAIN for a mode.',
      'Maps save in this browser (Save / Export JSON). Autosave runs every 30s while you have unsaved changes. Import JSON to move a map between admin machines.',
      'Build solid: use Levels (Floor 0 → Props 1), lock finished levels, validate before MAIN, keep embeds small, and Play Test before you ship.',
    ],
  },
  {
    id: 'camera',
    title: 'Camera & controls',
    paragraphs: [
      'Orbit: drag with left mouse (short click places in Brush mode; long drag orbits). Scroll to zoom.',
      'Tools: Select (V) picks objects without placing. Brush (B) paints the active model from Assets. In Brush, click the same model on its cell to select it; Alt+click stacks on top. Alt+drag = box select.',
      'Free Fly (Ctrl): WASD move, mouse look, Space up, C down. Placement disabled. Ctrl again to exit.',
      'W / E / R = translate / rotate / scale. G = grid snap. F = focus selection. Alt+drag = box select. Measure tool = click two ground points.',
      'Ctrl+D duplicate +X, Ctrl+Shift+D +Z. Ctrl+Z / Ctrl+Y undo/redo. Ctrl+S save. Red wire boxes = death zones; yellow lines = button→trap links.',
    ],
  },
  {
    id: 'building',
    title: 'Building a course',
    paragraphs: [
      '1) Lay floor-square / floor-small-square on Floor (level 0) and keep Solid checked. 2) Place green START on that floor (this is where Play Test puts you). 3) Open Player Model to pick your avatar — the Player entity is look/animations only, not spawn. 4) Add Finish, traps, Trapper spawn. 5) Play Test (3rd person). 6) Save and Set Active Match Map.',
      'If Play Test looks empty: you probably only placed a Player figurine with no Start, or floors are not Solid. Use Layers / Level strip; snap size 1 for modular floors.',
    ],
  },
  {
    id: 'animation',
    title: 'Animation & doors',
    paragraphs: [
      'Only GLBs with embedded AnimationClips show options. Many static kenney props have zero clips — that’s expected.',
      'Door pattern: door mesh → Trigger Interact or Signal; defaultClip=closed; activeClip=open; loopActive off so it stays open.',
      'Button pattern: kind=Button, Trigger Interact → door Listen To = that button.',
      'Player entity: map Idle/Walk/Run/Jump… to clip names, then Play Test to verify.',
    ],
  },
  {
    id: 'prefabs',
    title: 'Prefabs',
    paragraphs: [
      'Select multiple objects with Shift+click, open Prefabs tab, name and Save Prefab. Click a prefab then click ground to stamp copies.',
      'Prefabs store relative offsets so stamps keep the same layout.',
    ],
  },
  {
    id: 'traps',
    title: 'Buttons, traps & death zones',
    paragraphs: [
      'Trap workflow: place a Trap (toolbar bolt icon), size/rotate it, upload an animated GLB if needed, set Default + Active clips. Place a Button, open Properties → Activates trap / door, pick that trap. In Play Test press E near the button.',
      'Death zones: place a Death Zone (skull) or enable “Damages player on touch” on any prop. Set Instant kill or Damage + Interval. Play Test shows an HP bar.',
      'Match: buttons/traps animate on the client overlay. Instant-kill / damage to the live server sim is still evolutionary — floors always load as collision when you Set Active Match Map.',
    ],
  },
  {
    id: 'match',
    title: 'Playing in Deathrun',
    paragraphs: [
      'Green wire pads on solids are collision helpers (not multi-select). They only show on the selected object unless you turn on COL in Tools.',
      'Set as Active Match Map stores which JSON Deathrun should use. Floor pieces convert to collision platforms; runner spawn becomes start.',
      'Decorative props, traps, and buttons appear from your map overlay on the client. Restart / rejoin the match after publishing so the server reloads platforms.',
    ],
  },
];

const TUTORIAL_FLAG = 'kilrun.editorTutorialDone.v1';

export function hasCompletedTutorial(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(TUTORIAL_FLAG) === '1';
}

export function markTutorialDone() {
  localStorage.setItem(TUTORIAL_FLAG, '1');
}

export function resetTutorialFlag() {
  localStorage.removeItem(TUTORIAL_FLAG);
}

/** Full-screen step tour overlay. */
export function EditorTutorial({
  open,
  onClose,
  onStep,
}: {
  open: boolean;
  onClose: () => void;
  onStep?: (step: TutorialStep) => void;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (open) setI(0);
  }, [open]);
  useEffect(() => {
    if (open) onStep?.(TUTORIAL_STEPS[i]);
  }, [i, open, onStep]);

  if (!open) return null;
  const step = TUTORIAL_STEPS[i];
  const last = i >= TUTORIAL_STEPS.length - 1;

  return (
    <div className="absolute inset-0 z-[450] pointer-events-none">
      <div className="absolute inset-0 bg-black/55 pointer-events-auto" onClick={() => {}} />
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[min(520px,92vw)] pointer-events-auto rounded-2xl border border-cyan-400/30 bg-[#0f1724] p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] tracking-widest text-cyan-300/90 uppercase">
            Tutorial {i + 1} / {TUTORIAL_STEPS.length}
          </p>
          <button
            type="button"
            className="text-xs text-white/50 hover:text-white flex items-center gap-1"
            onClick={() => {
              markTutorialDone();
              onClose();
            }}
          >
            <SkipForward className="w-3.5 h-3.5" /> Skip
          </button>
        </div>
        <h3 className="text-lg font-black text-white mb-2">{step.title}</h3>
        <p className="text-sm text-white/75 leading-relaxed mb-2">{step.body}</p>
        {step.tip && <p className="text-xs text-amber-200/90 mb-4">{step.tip}</p>}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={i === 0}
            onClick={() => setI((v) => Math.max(0, v - 1))}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex-1" />
          {!last ? (
            <Button size="sm" onClick={() => setI((v) => v + 1)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500"
              onClick={() => {
                markTutorialDone();
                onClose();
              }}
            >
              Finish
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** HELP tab content: docs + restart tour. */
export function HelpTabPanel({
  onStartTutorial,
}: {
  onStartTutorial: () => void;
}) {
  const [section, setSection] = useState(HELP_SECTIONS[0].id);
  const current = HELP_SECTIONS.find((s) => s.id === section) ?? HELP_SECTIONS[0];

  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
      <div className="p-2 border-b border-white/10 space-y-2">
        <Button size="sm" className="w-full" onClick={onStartTutorial}>
          <BookOpen className="w-4 h-4 mr-1" /> Start interactive tutorial
        </Button>
        <div className="flex flex-wrap gap-1">
          {HELP_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`text-[10px] px-2 py-1 rounded border ${
                section === s.id
                  ? 'border-cyan-400 bg-cyan-500/15 text-cyan-100'
                  : 'border-white/10 text-white/55 hover:border-white/30'
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <h3 className="text-sm font-black text-white tracking-wide">{current.title}</h3>
        {current.paragraphs.map((p, idx) => (
          <p key={idx} className="text-xs text-white/70 leading-relaxed">
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}
