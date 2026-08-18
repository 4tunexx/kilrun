'use client';

import { useState } from 'react';
import { AlignCenterHorizontal, FlipHorizontal2, Grid3x3, Shuffle } from 'lucide-react';
import {
  alignSelection,
  distributeSelection,
  linearArray,
  mirrorSelection,
  radialArray,
  randomizeSelection,
  selectionBounds,
  touchingStepOffset,
} from './bulk-ops';
import type { AlignEdge, Axis } from './bulk-ops';
import type { EditorEntity } from './map-document';

const AXES: Axis[] = ['x', 'y', 'z'];
const EDGES: { edge: AlignEdge; label: string }[] = [
  { edge: 'min', label: 'Min' },
  { edge: 'center', label: 'Center' },
  { edge: 'max', label: 'Max' },
];

export type ModifyPanelProps = {
  /** The entities the ops act on — already expanded to include group members. */
  selection: EditorEntity[];
  /** Append new entities to the map, select them, and anchor one undo step. */
  onAdd: (entities: EditorEntity[], label: string) => void;
  /** Replace existing entities in place (matched by id). */
  onUpdate: (entities: EditorEntity[], label: string) => void;
};

const SECTION = 'rounded-lg border border-white/10 bg-white/[0.03] p-2 space-y-1.5';
const HEADING = 'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide';
const FIELD =
  'w-full bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[11px] text-white';
const CHIP =
  'flex-1 rounded border border-white/15 bg-white/5 px-1.5 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-35';
const CHIP_ON = 'flex-1 rounded border border-cyan-400/50 bg-cyan-500/20 px-1.5 py-1 text-[11px] text-cyan-100';

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <label className="block text-[10px] text-white/50">
      {label}
      <input
        type="number"
        className={FIELD}
        value={value}
        step={step}
        min={min}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

/**
 * Bulk geometry operations for the current selection: array, mirror, align,
 * distribute, randomize. All the maths lives in `bulk-ops.ts`; this is only the
 * form around it.
 */
export function ModifyPanel({ selection, onAdd, onUpdate }: ModifyPanelProps) {
  const [arrayMode, setArrayMode] = useState<'linear' | 'radial'>('linear');
  const [count, setCount] = useState(4);
  const [axis, setAxis] = useState<Axis>('x');
  const [step, setStep] = useState(4);
  const [rotStep, setRotStep] = useState(0);
  const [scaleStep, setScaleStep] = useState(1);
  const [radius, setRadius] = useState(8);
  const [arcDeg, setArcDeg] = useState(360);
  const [mirrorCopy, setMirrorCopy] = useState(true);
  const [randRot, setRandRot] = useState(15);
  const [randScale, setRandScale] = useState(10);
  const [randPos, setRandPos] = useState(0);

  const empty = selection.length === 0;
  const pivot = selectionBounds(selection).center;

  const runArray = () => {
    if (empty) return;
    if (arrayMode === 'linear') {
      const offset: [number, number, number] = [
        axis === 'x' ? step : 0,
        axis === 'y' ? step : 0,
        axis === 'z' ? step : 0,
      ];
      const copies = linearArray(selection, {
        count,
        offset,
        rotationStep: rotStep ? [0, rotStep, 0] : undefined,
        scaleStep: scaleStep !== 1 ? [scaleStep, scaleStep, scaleStep] : undefined,
      });
      onAdd(copies, `Linear array ×${copies.length}`);
      return;
    }
    const copies = radialArray(selection, {
      count,
      axis,
      center: pivot,
      radius,
      arcDeg,
    });
    onAdd(copies, `Radial array ×${copies.length}`);
  };

  return (
    <div className="space-y-2">
      <div className={SECTION}>
        <p className={`${HEADING} text-cyan-200`}>
          <Grid3x3 className="w-3 h-3" />
          Array
        </p>
        <div className="flex gap-1">
          {(['linear', 'radial'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={arrayMode === mode ? CHIP_ON : CHIP}
              onClick={() => setArrayMode(mode)}
            >
              {mode === 'linear' ? 'Linear' : 'Radial'}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {AXES.map((a) => (
            <button
              key={a}
              type="button"
              className={axis === a ? CHIP_ON : CHIP}
              onClick={() => setAxis(a)}
              title={arrayMode === 'linear' ? `Step along ${a.toUpperCase()}` : `Spin about ${a.toUpperCase()}`}
            >
              {a.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <NumberField
            label={arrayMode === 'linear' ? 'Copies' : 'Pieces (incl. original)'}
            value={count}
            min={1}
            onChange={setCount}
          />
          {arrayMode === 'linear' ? (
            <NumberField label="Step" value={step} step={0.5} onChange={setStep} />
          ) : (
            <NumberField label="Radius" value={radius} step={0.5} min={0} onChange={setRadius} />
          )}
          {arrayMode === 'linear' ? (
            <>
              <NumberField label="Yaw / step (°)" value={rotStep} step={5} onChange={setRotStep} />
              <NumberField
                label="Scale / step (×)"
                value={scaleStep}
                step={0.05}
                min={0.05}
                onChange={setScaleStep}
              />
            </>
          ) : (
            <NumberField label="Arc (°)" value={arcDeg} step={15} onChange={setArcDeg} />
          )}
        </div>
        {arrayMode === 'linear' && (
          <button
            type="button"
            className={CHIP}
            disabled={empty}
            onClick={() => setStep(touchingStepOffset(selection, axis)[AXES.indexOf(axis)])}
            title="Set the step to the selection's own size so copies sit flush"
          >
            Step = selection size
          </button>
        )}
        <button
          type="button"
          className="w-full rounded border border-cyan-400/40 bg-cyan-500/15 px-2 py-1.5 text-[11px] text-cyan-100 disabled:opacity-35"
          disabled={empty}
          onClick={runArray}
        >
          Create array
        </button>
      </div>

      <div className={SECTION}>
        <p className={`${HEADING} text-fuchsia-200`}>
          <FlipHorizontal2 className="w-3 h-3" />
          Mirror
        </p>
        <label className="flex items-center justify-between gap-2 text-[11px] text-white/60 cursor-pointer select-none">
          <span>Leave a copy behind</span>
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-fuchsia-400"
            checked={mirrorCopy}
            onChange={(e) => setMirrorCopy(e.target.checked)}
          />
        </label>
        <div className="flex gap-1">
          {AXES.map((a) => (
            <button
              key={a}
              type="button"
              className={CHIP}
              disabled={empty}
              onClick={() => {
                const { added, updated } = mirrorSelection(selection, a, pivot, {
                  copy: mirrorCopy,
                });
                if (added.length) onAdd(added, `Mirror ${a.toUpperCase()}`);
                else onUpdate(updated, `Mirror ${a.toUpperCase()}`);
              }}
              title={`Mirror across the plane facing ${a.toUpperCase()} through the selection center`}
            >
              {a.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-white/35 leading-snug">
          Reflects the pose, not the mesh — an asymmetric model comes out rotated to match rather
          than truly handed.
        </p>
      </div>

      <div className={SECTION}>
        <p className={`${HEADING} text-emerald-200`}>
          <AlignCenterHorizontal className="w-3 h-3" />
          Align &amp; distribute
        </p>
        {EDGES.map(({ edge, label }) => (
          <div key={edge} className="flex items-center gap-1">
            <span className="w-12 shrink-0 text-[10px] text-white/40">{label}</span>
            {AXES.map((a) => (
              <button
                key={a}
                type="button"
                className={CHIP}
                disabled={selection.length < 2}
                onClick={() => onUpdate(alignSelection(selection, a, edge), `Align ${edge} ${a}`)}
              >
                {a.toUpperCase()}
              </button>
            ))}
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span className="w-12 shrink-0 text-[10px] text-white/40">Spread</span>
          {AXES.map((a) => (
            <button
              key={a}
              type="button"
              className={CHIP}
              disabled={selection.length < 3}
              onClick={() => onUpdate(distributeSelection(selection, a), `Distribute ${a}`)}
              title="Space evenly between the two outermost objects"
            >
              {a.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className={SECTION}>
        <p className={`${HEADING} text-amber-200`}>
          <Shuffle className="w-3 h-3" />
          Randomize
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <NumberField label="Yaw ±°" value={randRot} step={5} min={0} onChange={setRandRot} />
          <NumberField label="Scale ±%" value={randScale} step={5} min={0} onChange={setRandScale} />
          <NumberField label="Move ±" value={randPos} step={0.25} min={0} onChange={setRandPos} />
        </div>
        <button
          type="button"
          className="w-full rounded border border-amber-400/40 bg-amber-500/15 px-2 py-1.5 text-[11px] text-amber-100 disabled:opacity-35"
          disabled={empty}
          onClick={() =>
            onUpdate(
              randomizeSelection(selection, {
                rotationDeg: randRot ? [0, randRot, 0] : undefined,
                scaleFraction: randScale ? Array(3).fill(randScale / 100) as [number, number, number] : undefined,
                positionJitter: randPos ? [randPos, 0, randPos] : undefined,
              }),
              'Randomize'
            )
          }
        >
          Scatter selection
        </button>
      </div>
    </div>
  );
}
