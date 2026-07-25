'use client';

/**
 * Pack animation UNTANGLE studio — dial in Unity→three conversion,
 * scrub clips, offset bones, copy working settings.
 * Dev-only helper at /anim-test (not linked from the hub).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { loadFbxModel, cloneFbxScene } from '@/components/game/renderer/asset-loader-fbx';
import {
  applySkinAttachments,
  clearSkinAttachments,
} from '@/components/game/editor/skin-attachments';
import {
  loadCharacterAssetManifest,
  type AssetRegistryEntry,
} from '@/lib/asset-registry';
import { skinSlotFromCosmetic } from '@/lib/player-skins';
import {
  loadPackAnimsFile,
  buildPackClip,
  makeBoneResolver,
  snapshotBoneLocals,
  CONV_MODES,
  DEFAULT_CUSTOM_CONV,
  type ConvMode,
  type CustomConv,
  type PackAnimsFile,
  type RebasePair,
} from '@/lib/unity-anim';

const MODEL_URL = '/game/skins/bodies/Body_Blue_001.fbx';
const VIEWS = ['front', 'side', 'back', '3q'] as const;

type RootOffsets = {
  rotX: number;
  rotY: number;
  rotZ: number;
  posX: number;
  posY: number;
  posZ: number;
  scale: number;
};

type BoneOffset = { rx: number; ry: number; rz: number };

const ZERO_ROOT: RootOffsets = {
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  posX: 0,
  posY: 0,
  posZ: 0,
  scale: 1,
};

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <label style={row}>
      <span style={lbl}>
        {label}{' '}
        <b>
          {value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}
          {unit}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ ...row, flexDirection: 'row', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export default function AnimUntangleStudioPage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui', color: '#e2e8f0', background: '#0f172a', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 18 }}>Anim Untangle Studio</h1>
        <p style={{ opacity: 0.7 }}>Dev-only. Run <code>npm run dev</code> and open <code>/anim-test</code>.</p>
        <p style={{ opacity: 0.7, marginTop: 12 }}>
          Docs: <code>docs/ANIMATIONS_MIXAMO_AND_COMBAT.md</code>
        </p>
      </main>
    );
  }
  return <AnimUntangleStudio />;
}

function AnimUntangleStudio() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const st = useRef<{
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    renderer?: THREE.WebGLRenderer;
    mixer?: THREE.AnimationMixer;
    action?: THREE.AnimationAction;
    root?: THREE.Object3D;
    wrap?: THREE.Group;
    center?: THREE.Vector3;
    radius?: number;
    clock: THREE.Clock;
    packFile?: PackAnimsFile;
    resolveBone?: (n: string) => string | null;
    markers: THREE.Object3D[];
    skeletonHelper?: THREE.SkeletonHelper;
    boneAxes: THREE.Object3D[];
    selMarker?: THREE.Mesh;
    bindPose: Map<string, { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 }>;
    boneByName: Map<string, THREE.Object3D>;
    playing: boolean;
    unitScale: number;
  }>({
    clock: new THREE.Clock(),
    markers: [],
    boneAxes: [],
    bindPose: new Map(),
    boneByName: new Map(),
    playing: true,
    unitScale: 1,
  });

  // --- UI state ---
  const [mode, setMode] = useState<ConvMode>('flipX');
  const [custom, setCustom] = useState<CustomConv>({ ...DEFAULT_CUSTOM_CONV });
  const [clipIdx, setClipIdx] = useState(0);
  const [view, setView] = useState<(typeof VIEWS)[number]>('3q');
  const [swapLR, setSwapLR] = useState(false);
  const [posScale, setPosScale] = useState(1);
  const [skipPos, setSkipPos] = useState(true); // Unity pos tracks often twist the bind pose
  const [skipScale, setSkipScale] = useState(true);
  const [skipRot, setSkipRot] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showBoneAxes, setShowBoneAxes] = useState(false);
  const [showMesh, setShowMesh] = useState(true);
  // Off, matching production: the rig/root ±90°X tracks cancel each other.
  const [skipRootBones, setSkipRootBones] = useState(false);
  // Rebase is the WRONG math for this pack (component flip ≠ quat multiply).
  // Kept as a debug toggle; production uses flipX.
  const [rebaseBind, setRebaseBind] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [scrub, setScrub] = useState(0);
  const [rootOff, setRootOff] = useState<RootOffsets>({ ...ZERO_ROOT });
  const [boneNames, setBoneNames] = useState<string[]>([]);
  const [clipNames, setClipNames] = useState<string[]>([]);
  const [selectedBone, setSelectedBone] = useState('');
  const [boneOff, setBoneOff] = useState<Record<string, BoneOffset>>({});
  const [boneFilter, setBoneFilter] = useState('');
  const [status, setStatus] = useState('loading…');
  const [copied, setCopied] = useState('');
  const [ready, setReady] = useState(false);
  const [skinAssets, setSkinAssets] = useState<AssetRegistryEntry[]>([]);
  const [skinAssetId, setSkinAssetId] = useState('');

  const currentClipName = clipNames[clipIdx] ?? '—';

  useEffect(() => {
    void loadCharacterAssetManifest().then((manifest) => {
      setSkinAssets(
        (manifest?.assets ?? []).filter(
          (asset) => asset.enabled && !asset.hidden && asset.category !== 'body'
        )
      );
    });
  }, []);

  useEffect(() => {
    const root = st.current.root;
    if (!root || !ready) return;
    const asset = skinAssets.find((entry) => entry.id === skinAssetId);
    if (!asset) {
      clearSkinAttachments(root);
      return;
    }
    const slot = skinSlotFromCosmetic(asset.equipSlot);
    if (!slot) return;
    void applySkinAttachments(root, [
      {
        id: asset.id,
        slot,
        customModelUrl: asset.modelPath,
        textureUrl: asset.texturePath,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ]);
  }, [ready, skinAssetId, skinAssets]);

  const settingsKey = useMemo(
    () =>
      JSON.stringify({
        mode,
        custom,
        swapLR,
        posScale,
        skipPos,
        skipScale,
        skipRot,
        boneFilter,
        clipIdx,
        skipRootBones,
        rebaseBind,
      }),
    [
      mode,
      custom,
      swapLR,
      posScale,
      skipPos,
      skipScale,
      skipRot,
      boneFilter,
      clipIdx,
      skipRootBones,
      rebaseBind,
    ]
  );

  // ---- scene boot ----
  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12151c);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 8000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    Object.assign(st.current, { scene, camera, renderer });

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(4, 12, 6);
    scene.add(dir);
    scene.add(new THREE.GridHelper(500, 50, 0x334155, 0x1e293b));
    scene.add(new THREE.AxesHelper(60));

    let raf = 0;
    let disposed = false;

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    // orbit drag
    let dragging = false;
    let lx = 0;
    let ly = 0;
    let theta = 0.6;
    let phi = 0.35;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      mount.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      theta -= (e.clientX - lx) * 0.005;
      phi = Math.max(0.05, Math.min(Math.PI - 0.05, phi + (e.clientY - ly) * 0.005));
      lx = e.clientX;
      ly = e.clientY;
      placeCamOrbit();
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = st.current.radius ?? 100;
      st.current.radius = Math.max(20, Math.min(2000, r * (e.deltaY > 0 ? 1.08 : 0.92)));
      placeCamOrbit();
    };
    const placeCamOrbit = () => {
      const c = st.current.center;
      const r = st.current.radius;
      if (!c || !r || !camera) return;
      camera.position.set(
        c.x + r * Math.sin(phi) * Math.sin(theta),
        c.y + r * Math.cos(phi),
        c.z + r * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(c);
    };
    st.current; // keep
    (st.current as { placeCamOrbit?: () => void }).placeCamOrbit = placeCamOrbit;

    mount.addEventListener('pointerdown', onDown);
    mount.addEventListener('pointermove', onMove);
    mount.addEventListener('pointerup', onUp);
    mount.addEventListener('wheel', onWheel, { passive: false });

    (async () => {
      try {
        const [fbx, packFile] = await Promise.all([loadFbxModel(MODEL_URL), loadPackAnimsFile()]);
        if (disposed) return;
        const root = cloneFbxScene(fbx.scene);
        // Normalize height so camera framing is consistent across pack sizes.
        const preBox = new THREE.Box3().setFromObject(root);
        const preSize = preBox.getSize(new THREE.Vector3());
        const targetH = 160;
        if (preSize.y > 1e-3) {
          const s = targetH / preSize.y;
          root.scale.multiplyScalar(s);
        }
        const wrap = new THREE.Group();
        wrap.name = 'untangle-wrap';
        wrap.add(root);
        scene.add(wrap);

        // bind pose snapshot
        const bind = new Map<string, { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 }>();
        root.traverse((o) => {
          if ((o as THREE.Bone).isBone || o.type === 'Bone') {
            bind.set(o.name, {
              pos: o.position.clone(),
              quat: o.quaternion.clone(),
              scale: o.scale.clone(),
            });
          }
        });

        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        // FBX pack meshes are often huge (cm). Keep the camera far enough to see the whole body.
        const radius = Math.max(size.x, size.y, size.z, 1) * 2.4;

        // markers
        // Bone children inherit the bone's WORLD scale (root normalization,
        // FBX unit conversion...), so compute geometry in world units and
        // divide by that scale, otherwise spheres dwarf the character.
        root.updateWorldMatrix(true, true);
        const worldScaleOf = (o: THREE.Object3D) => {
          const ws = new THREE.Vector3();
          o.getWorldScale(ws);
          return Math.max((ws.x + ws.y + ws.z) / 3, 1e-6);
        };
        const markerWorldSize = size.y * 0.03;
        const markers: THREE.Object3D[] = [];
        const attach = (name: string, color: number) => {
          let bone: THREE.Object3D | undefined;
          root.traverse((o) => {
            if (o.name === name) bone = o;
          });
          if (!bone) return;
          const m = new THREE.Mesh(
            new THREE.SphereGeometry(markerWorldSize / worldScaleOf(bone), 10, 10),
            new THREE.MeshBasicMaterial({ color, depthTest: false })
          );
          m.renderOrder = 10;
          bone.add(m);
          markers.push(m);
        };
        attach('DEF-handL', 0xff2222);
        attach('DEF-handR', 0x22ff22);
        attach('DEF-footL', 0xff8800);
        attach('DEF-footR', 0x00ccff);

        const bones: string[] = [];
        const boneByName = new Map<string, THREE.Object3D>();
        root.traverse((o) => {
          if ((o as THREE.Bone).isBone || o.type === 'Bone') {
            bones.push(o.name);
            boneByName.set(o.name, o);
          }
        });

        // Per-bone local axes (red=X, green=Y, blue=Z) — twists are obvious here.
        const boneAxes: THREE.Object3D[] = [];
        const axisWorldLen = size.y * 0.06;
        for (const bone of boneByName.values()) {
          const ax = new THREE.AxesHelper(axisWorldLen / worldScaleOf(bone));
          (ax.material as THREE.Material).depthTest = false;
          ax.renderOrder = 9;
          ax.visible = false;
          bone.add(ax);
          boneAxes.push(ax);
        }

        // Highlight sphere that follows the selected bone
        const selMarker = new THREE.Mesh(
          new THREE.SphereGeometry(size.y * 0.025, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, depthTest: false })
        );
        selMarker.renderOrder = 12;
        selMarker.visible = false;
        scene.add(selMarker);

        const mixer = new THREE.AnimationMixer(root);
        Object.assign(st.current, {
          root,
          wrap,
          mixer,
          center,
          radius,
          packFile,
          resolveBone: makeBoneResolver(root),
          markers,
          bindPose: bind,
          boneByName,
          boneAxes,
          selMarker,
        });
        // Debug handle: lets us diff bind rotations against the Unity keys.
        (window as unknown as { __animStudio?: unknown }).__animStudio = st.current;
        setBoneNames(bones.sort());
        setClipNames(packFile.clips.map((c) => c.name));
        setSelectedBone(bones.find((b) => b.includes('spine')) || bones[0] || '');
        setStatus(`ready · ${packFile.clips.length} clips · ${bones.length} bones`);
        setReady(true);
        placeCamOrbit();
      } catch (err) {
        console.error(err);
        setStatus(`load failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = st.current;
      const dt = s.clock.getDelta();
      if (s.playing && s.mixer) {
        s.mixer.update(dt);
        if (s.action) {
          const d = s.action.getClip().duration || 1;
          setScrub(s.action.time % d);
        }
      }
      // apply bone euler offsets on top of mixer each frame
      for (const [name, off] of Object.entries(boneOffRef.current)) {
        if (!off.rx && !off.ry && !off.rz) continue;
        const bone = s.boneByName.get(name);
        if (!bone) continue;
        const e = new THREE.Euler(
          THREE.MathUtils.degToRad(off.rx),
          THREE.MathUtils.degToRad(off.ry),
          THREE.MathUtils.degToRad(off.rz),
          'XYZ'
        );
        bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(e));
      }
      // keep the yellow highlight glued to the selected bone
      if (s.selMarker && s.selMarker.visible) {
        const bone = s.boneByName.get(selectedBoneRef.current);
        if (bone) bone.getWorldPosition(s.selMarker.position);
      }
      s.renderer?.render(s.scene!, s.camera!);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      mount.removeEventListener('pointerdown', onDown);
      mount.removeEventListener('pointermove', onMove);
      mount.removeEventListener('pointerup', onUp);
      mount.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boneOffRef = useRef(boneOff);
  boneOffRef.current = boneOff;
  const selectedBoneRef = useRef(selectedBone);
  selectedBoneRef.current = selectedBone;

  // view presets
  useEffect(() => {
    const s = st.current;
    if (!s.center || !s.radius || !s.camera) return;
    const c = s.center;
    const d = s.radius;
    if (view === 'front') s.camera.position.set(c.x, c.y, c.z + d);
    else if (view === 'back') s.camera.position.set(c.x, c.y, c.z - d);
    else if (view === 'side') s.camera.position.set(c.x + d, c.y, c.z);
    else s.camera.position.set(c.x + d * 0.7, c.y + d * 0.25, c.z + d * 0.7);
    s.camera.lookAt(c);
  }, [view, ready]);

  // root offsets
  useEffect(() => {
    const wrap = st.current.wrap;
    if (!wrap) return;
    wrap.rotation.set(
      THREE.MathUtils.degToRad(rootOff.rotX),
      THREE.MathUtils.degToRad(rootOff.rotY),
      THREE.MathUtils.degToRad(rootOff.rotZ)
    );
    wrap.position.set(rootOff.posX, rootOff.posY, rootOff.posZ);
    wrap.scale.setScalar(rootOff.scale);
  }, [rootOff, ready]);

  // markers / skeleton visibility
  useEffect(() => {
    for (const m of st.current.markers) m.visible = showMarkers;
  }, [showMarkers, ready]);

  useEffect(() => {
    const s = st.current;
    if (!s.scene || !s.root) return;
    if (s.skeletonHelper) {
      s.scene.remove(s.skeletonHelper);
      s.skeletonHelper = undefined;
    }
    if (showSkeleton) {
      const h = new THREE.SkeletonHelper(s.root);
      const mat = h.material as THREE.LineBasicMaterial;
      mat.depthTest = false;
      mat.linewidth = 2;
      h.renderOrder = 8;
      s.scene.add(h);
      s.skeletonHelper = h;
    }
  }, [showSkeleton, ready]);

  // per-bone axes
  useEffect(() => {
    for (const ax of st.current.boneAxes) ax.visible = showBoneAxes;
  }, [showBoneAxes, ready]);

  // hide skin so the skeleton is readable
  useEffect(() => {
    st.current.root?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.visible = showMesh;
    });
    // markers are meshes parented to bones — keep them following showMarkers
    for (const m of st.current.markers) m.visible = showMarkers;
  }, [showMesh, showMarkers, ready]);

  // selected bone highlight
  useEffect(() => {
    const s = st.current;
    if (s.selMarker) s.selMarker.visible = Boolean(selectedBone) && s.boneByName.has(selectedBone);
  }, [selectedBone, ready]);

  // rebuild + play clip when settings change
  useEffect(() => {
    const s = st.current;
    if (!s.mixer || !s.packFile || !s.resolveBone || !ready) return;
    const data = s.packFile.clips[clipIdx];
    if (!data) return;

    const resolve = swapLR
      ? (n: string) => {
          let name = n;
          if (/\.L$/.test(n)) name = n.replace(/\.L$/, '.R');
          else if (/\.R$/.test(n)) name = n.replace(/\.R$/, '.L');
          return s.resolveBone!(name);
        }
      : s.resolveBone;

    // Rebase: express each Unity key as a delta from the reference clip's first
    // frame (A_Poses ≈ rest) and re-apply on the FBX bind rotation.
    let rebaseFn: ((packBone: string) => RebasePair | null) | undefined;
    if (rebaseBind) {
      const refClip =
        s.packFile.clips.find((c) => /^A_Poses$/i.test(c.name)) ?? s.packFile.clips[0];
      rebaseFn = (packBone: string) => {
        const boneName = s.resolveBone!(packBone);
        if (!boneName) return null;
        const bindEntry = s.bindPose.get(boneName);
        const refKeys = refClip?.rotation[packBone];
        if (!bindEntry || !refKeys?.length) return null;
        const k = refKeys[0]!;
        return {
          bind: bindEntry.quat.clone(),
          ref: new THREE.Quaternion(k[1]!, k[2]!, k[3]!, k[4]!),
        };
      };
    }

    const clip = buildPackClip(data, {
      mode,
      custom,
      resolveBone: resolve,
      posScale,
      skipPosition: skipPos,
      skipScale,
      skipRotation: skipRot,
      skipRootBones,
      rebase: rebaseFn,
      boneFilter: boneFilter || undefined,
    });

    // Keep the playhead across rebuilds so toggling a setting is a true A/B
    // comparison instead of snapping back to the bind pose.
    const prevTime = s.action?.time ?? 0;
    s.mixer.stopAllAction();
    const action = s.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.timeScale = speed;
    action.play();
    action.time = Math.min(prevTime, clip.duration);
    action.paused = !playing;
    s.action = action;
    s.playing = playing;
    s.mixer.update(0);
    setStatus(
      `${mode}${swapLR ? '+swapLR' : ''} · "${clip.name}" · ${clip.tracks.length} tracks · dur ${clip.duration.toFixed(2)}s`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey, ready]);

  // play / pause / speed — do not rebuild the clip
  useEffect(() => {
    const s = st.current;
    s.playing = playing;
    if (s.action) s.action.paused = !playing;
  }, [playing]);

  useEffect(() => {
    if (st.current.action) st.current.action.timeScale = speed;
  }, [speed]);

  const onScrub = (t: number) => {
    setScrub(t);
    const a = st.current.action;
    if (!a) return;
    a.time = t;
    a.paused = true;
    setPlaying(false);
    st.current.mixer?.update(0);
  };

  const randomClip = () => {
    if (!clipNames.length) return;
    let next = clipIdx;
    while (clipNames.length > 1 && next === clipIdx) {
      next = Math.floor(Math.random() * clipNames.length);
    }
    setClipIdx(next);
  };

  const resetRoot = () => setRootOff({ ...ZERO_ROOT });
  const resetBoneOff = () => setBoneOff({});
  const resetCustom = () => setCustom({ ...DEFAULT_CUSTOM_CONV });

  const setBoneOffField = (field: keyof BoneOffset, v: number) => {
    if (!selectedBone) return;
    setBoneOff((prev) => {
      const current = prev[selectedBone] ?? { rx: 0, ry: 0, rz: 0 };
      return { ...prev, [selectedBone]: { ...current, [field]: v } };
    });
  };

  const flash = (msg: string) => {
    setCopied(msg);
    setTimeout(() => setCopied(''), 1800);
  };

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(`copied ${label}`);
    } catch {
      flash('clipboard failed');
    }
  }, []);

  const copySettings = () => {
    const payload = {
      mode,
      custom,
      swapLR,
      posScale,
      skipPos,
      skipScale,
      skipRot,
      rootOff,
      boneOff,
      clip: currentClipName,
    };
    void copyText(JSON.stringify(payload, null, 2), 'settings JSON');
  };

  const copyBones = () => {
    const root = st.current.root;
    if (!root) return;
    const snap = snapshotBoneLocals(root);
    void copyText(JSON.stringify(snap, null, 2), `${Object.keys(snap).length} bone locals`);
  };

  const copySelectedBone = () => {
    const root = st.current.root;
    if (!root || !selectedBone) return;
    let bone: THREE.Object3D | undefined;
    root.traverse((o) => {
      if (o.name === selectedBone) bone = o;
    });
    if (!bone) return;
    const payload = {
      name: selectedBone,
      pos: [bone.position.x, bone.position.y, bone.position.z],
      quat: [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w],
      eulerDeg: {
        x: THREE.MathUtils.radToDeg(bone.rotation.x),
        y: THREE.MathUtils.radToDeg(bone.rotation.y),
        z: THREE.MathUtils.radToDeg(bone.rotation.z),
      },
      offset: boneOff[selectedBone] ?? { rx: 0, ry: 0, rz: 0 },
    };
    void copyText(JSON.stringify(payload, null, 2), selectedBone);
  };

  const fitCamera = () => {
    const s = st.current;
    if (!s.root || !s.camera) return;
    const box = new THREE.Box3().setFromObject(s.root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1) * 2.4;
    s.center = center;
    s.radius = radius;
    const c = center;
    const d = radius;
    if (view === 'front') s.camera.position.set(c.x, c.y, c.z + d);
    else if (view === 'back') s.camera.position.set(c.x, c.y, c.z - d);
    else if (view === 'side') s.camera.position.set(c.x + d, c.y, c.z);
    else s.camera.position.set(c.x + d * 0.75, c.y + d * 0.2, c.z + d * 0.75);
    s.camera.lookAt(c);
    flash('camera fitted');
  };

  const goBindPose = () => {
    const s = st.current;
    s.mixer?.stopAllAction();
    s.action = undefined;
    setPlaying(false);
    for (const [name, bind] of s.bindPose) {
      let bone: THREE.Object3D | undefined;
      s.root?.traverse((o) => {
        if (o.name === name) bone = o;
      });
      if (!bone) continue;
      bone.position.copy(bind.pos);
      bone.quaternion.copy(bind.quat);
      bone.scale.copy(bind.scale);
    }
    setStatus('bind pose (animation stopped)');
  };

  const duration = st.current.action?.getClip().duration ?? 1;
  const selOff = boneOff[selectedBone] ?? { rx: 0, ry: 0, rz: 0 };

  const setC = <K extends keyof CustomConv>(k: K, v: CustomConv[K]) => {
    setMode('custom');
    setCustom((c) => ({ ...c, [k]: v }));
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', background: '#0b0e14', color: '#e2e8f0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>
      {/* viewport */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={topBar}>
          <button type="button" style={btn} onClick={fitCamera}>
            ⊡ fit
          </button>
          <button type="button" style={btn} onClick={() => setPlaying((p) => !p)}>
            {playing ? '⏸ pause' : '▶ play'}
          </button>
          <button type="button" style={btn} onClick={randomClip}>
            🎲 random clip
          </button>
          <button type="button" style={btn} onClick={() => setClipIdx((i) => (i - 1 + clipNames.length) % Math.max(clipNames.length, 1))}>
            ◀
          </button>
          <select
            aria-label="clip"
            value={clipIdx}
            onChange={(e) => setClipIdx(Number(e.target.value))}
            style={sel}
          >
            {clipNames.map((n, i) => (
              <option key={n + i} value={i}>
                {n}
              </option>
            ))}
          </select>
          <button type="button" style={btn} onClick={() => setClipIdx((i) => (i + 1) % Math.max(clipNames.length, 1))}>
            ▶
          </button>
          <select aria-label="view" value={view} onChange={(e) => setView(e.target.value as (typeof VIEWS)[number])} style={sel}>
            {VIEWS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="skin test"
            value={skinAssetId}
            onChange={(e) => setSkinAssetId(e.target.value)}
            style={{ ...sel, maxWidth: 210 }}
          >
            <option value="">No skin / clothing</option>
            {skinAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.category}: {asset.displayName}
              </option>
            ))}
          </select>
          <span style={{ opacity: 0.75, flex: 1, minWidth: 120 }}>{status}</span>
          {copied && <span style={{ color: '#4ade80' }}>{copied}</span>}
        </div>
        <div style={{ padding: '4px 10px', display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid #1e293b' }}>
          <span style={{ opacity: 0.6 }}>scrub</span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={scrub}
            onChange={(e) => onScrub(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: 70, textAlign: 'right' }}>
            {scrub.toFixed(2)}/{duration.toFixed(2)}s
          </span>
          <span style={{ opacity: 0.6 }}>speed</span>
          <input
            type="range"
            min={0.1}
            max={2}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{ width: 100 }}
          />
          <span>{speed.toFixed(2)}×</span>
        </div>
        <div
          ref={mountRef}
          style={{ flex: 1, minHeight: 0, cursor: 'grab' }}
          title="Drag to orbit · wheel to zoom"
        />
        <div style={{ padding: 8, borderTop: '1px solid #1e293b', opacity: 0.65, fontSize: 11 }}>
          Legend: <span style={{ color: '#ff4444' }}>● L hand</span> · <span style={{ color: '#44ff44' }}>● R hand</span> ·{' '}
          <span style={{ color: '#ff8800' }}>● L foot</span> · <span style={{ color: '#00ccff' }}>● R foot</span>
          {' · '}drag orbit · when legs look untangled + correct hand attacks, hit <b>Copy settings</b>
        </div>
      </div>

      {/* side panel */}
      <aside style={panel}>
        <h2 style={h2}>Untangle studio</h2>

        <section style={sec}>
          <h3 style={h3}>Conversion preset</h3>
          <select aria-label="mode" value={mode} onChange={(e) => setMode(e.target.value as ConvMode)} style={{ ...sel, width: '100%' }}>
            {CONV_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <Toggle label="Swap L ↔ R bone mapping" checked={swapLR} onChange={setSwapLR} />
          <Toggle
            label="Skip rig / root tracks"
            checked={skipRootBones}
            onChange={setSkipRootBones}
          />
          <Toggle
            label="Rebase onto FBX bind pose (debug — usually WRONG)"
            checked={rebaseBind}
            onChange={setRebaseBind}
          />
          <p style={hint}>
            Production default is <b>flipX</b> + skip pos/scale. Arms need flipX (Y/Z quat
            negate); rebase is the wrong math for this pack.
          </p>
        </section>

        <section style={sec}>
          <h3 style={h3}>
            Custom flips <button type="button" style={miniBtn} onClick={resetCustom}>reset</button>
          </h3>
          <p style={hint}>Switching any toggle forces mode = custom</p>
          <div style={grid2}>
            <Toggle label="pos −X" checked={custom.posNegX} onChange={(v) => setC('posNegX', v)} />
            <Toggle label="pos −Y" checked={custom.posNegY} onChange={(v) => setC('posNegY', v)} />
            <Toggle label="pos −Z" checked={custom.posNegZ} onChange={(v) => setC('posNegZ', v)} />
            <Toggle label="quat −X" checked={custom.quatNegX} onChange={(v) => setC('quatNegX', v)} />
            <Toggle label="quat −Y" checked={custom.quatNegY} onChange={(v) => setC('quatNegY', v)} />
            <Toggle label="quat −Z" checked={custom.quatNegZ} onChange={(v) => setC('quatNegZ', v)} />
            <Toggle label="quat −W" checked={custom.quatNegW} onChange={(v) => setC('quatNegW', v)} />
            <Toggle label="quat swap Y↔Z" checked={custom.quatSwapYZ} onChange={(v) => setC('quatSwapYZ', v)} />
            <Toggle label="quat conjugate" checked={custom.quatConjugate} onChange={(v) => setC('quatConjugate', v)} />
          </div>
        </section>

        <section style={sec}>
          <h3 style={h3}>Tracks</h3>
          <Toggle label="Skip position tracks (often fixes twist)" checked={skipPos} onChange={setSkipPos} />
          <Toggle label="Skip scale tracks" checked={skipScale} onChange={setSkipScale} />
          <Toggle label="Skip rotation tracks" checked={skipRot} onChange={setSkipRot} />
          <Slider label="Position scale" value={posScale} min={0.01} max={100} step={0.01} onChange={setPosScale} />
          <label style={row}>
            <span style={lbl}>Bone name filter</span>
            <input
              value={boneFilter}
              onChange={(e) => setBoneFilter(e.target.value)}
              placeholder="e.g. thigh / hand / spine"
              style={inp}
            />
          </label>
        </section>

        <section style={sec}>
          <h3 style={h3}>
            Root / wrap offset <button type="button" style={miniBtn} onClick={resetRoot}>reset</button>
          </h3>
          <Slider label="Rot X" value={rootOff.rotX} min={-180} max={180} step={1} unit="°" onChange={(v) => setRootOff((o) => ({ ...o, rotX: v }))} />
          <Slider label="Rot Y" value={rootOff.rotY} min={-180} max={180} step={1} unit="°" onChange={(v) => setRootOff((o) => ({ ...o, rotY: v }))} />
          <Slider label="Rot Z" value={rootOff.rotZ} min={-180} max={180} step={1} unit="°" onChange={(v) => setRootOff((o) => ({ ...o, rotZ: v }))} />
          <Slider label="Pos X" value={rootOff.posX} min={-200} max={200} step={1} onChange={(v) => setRootOff((o) => ({ ...o, posX: v }))} />
          <Slider label="Pos Y" value={rootOff.posY} min={-200} max={200} step={1} onChange={(v) => setRootOff((o) => ({ ...o, posY: v }))} />
          <Slider label="Pos Z" value={rootOff.posZ} min={-200} max={200} step={1} onChange={(v) => setRootOff((o) => ({ ...o, posZ: v }))} />
          <Slider label="Scale" value={rootOff.scale} min={0.1} max={5} step={0.05} onChange={(v) => setRootOff((o) => ({ ...o, scale: v }))} />
        </section>

        <section style={sec}>
          <h3 style={h3}>
            Bone offset <button type="button" style={miniBtn} onClick={resetBoneOff}>clear all</button>
          </h3>
          <select
            aria-label="bone"
            value={selectedBone}
            onChange={(e) => setSelectedBone(e.target.value)}
            style={{ ...sel, width: '100%' }}
          >
            {boneNames.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <Slider label="Bone rot X" value={selOff.rx} min={-180} max={180} step={1} unit="°" onChange={(v) => setBoneOffField('rx', v)} />
          <Slider label="Bone rot Y" value={selOff.ry} min={-180} max={180} step={1} unit="°" onChange={(v) => setBoneOffField('ry', v)} />
          <Slider label="Bone rot Z" value={selOff.rz} min={-180} max={180} step={1} unit="°" onChange={(v) => setBoneOffField('rz', v)} />
          <button type="button" style={{ ...btn, width: '100%' }} onClick={copySelectedBone}>
            Copy selected bone TRS
          </button>
        </section>

        <section style={sec}>
          <h3 style={h3}>Bone preview / display</h3>
          <Toggle label="Skeleton bones (lines)" checked={showSkeleton} onChange={setShowSkeleton} />
          <Toggle label="Per-bone axes (X/Y/Z)" checked={showBoneAxes} onChange={setShowBoneAxes} />
          <Toggle label="Show skin mesh" checked={showMesh} onChange={setShowMesh} />
          <Toggle label="L/R hand+foot markers" checked={showMarkers} onChange={setShowMarkers} />
          <p style={hint}>
            Turn OFF skin mesh + turn ON bone axes to see exactly which joint is twisting. The
            selected bone gets a yellow wireframe ball.
          </p>
          <button type="button" style={{ ...btn, width: '100%', marginTop: 4 }} onClick={goBindPose}>
            Show bind pose (stop anim)
          </button>
        </section>

        <section style={sec}>
          <h3 style={h3}>Copy / export</h3>
          <button type="button" style={{ ...btn, width: '100%', background: '#166534' }} onClick={copySettings}>
            Copy settings JSON
          </button>
          <button type="button" style={{ ...btn, width: '100%', marginTop: 6 }} onClick={copyBones}>
            Copy all bone locals (current pose)
          </button>
          <p style={hint}>
            When Run / Attack look correct (no crossed legs, green = right hand punches on right-hand clips),
            copy settings and paste them back in chat so we can lock them into production.
          </p>
        </section>

        <section style={{ ...sec, opacity: 0.7 }}>
          <h3 style={h3}>Quick try order</h3>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
            <li>
              Default is already <b>flipX</b> — check Run + Attack_heavy
            </li>
            <li>Green hand must punch on right-hand clips</li>
            <li>Legs must not cross; arms must not pinch through torso</li>
            <li>If still wrong, try raw vs flipX only (don&apos;t enable rebase)</li>
            <li>
              <b>Copy settings JSON</b> → paste in chat
            </li>
          </ol>
        </section>
      </aside>
    </div>
  );
}

const topBar: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  padding: '8px 10px',
  borderBottom: '1px solid #1e293b',
  flexWrap: 'wrap',
  background: '#0f131a',
};
const panel: CSSProperties = {
  width: 340,
  maxWidth: '42vw',
  overflowY: 'auto',
  borderLeft: '1px solid #1e293b',
  padding: 12,
  background: '#0f131a',
};
const sec: CSSProperties = {
  marginBottom: 14,
  paddingBottom: 12,
  borderBottom: '1px solid #1e293b',
};
const h2: CSSProperties = { margin: '0 0 12px', fontSize: 14, letterSpacing: 1, textTransform: 'uppercase' };
const h3: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 11,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  color: '#94a3b8',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};
const row: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 };
const lbl: CSSProperties = { display: 'flex', justifyContent: 'space-between', opacity: 0.9 };
const hint: CSSProperties = { margin: '4px 0 8px', opacity: 0.55, fontSize: 11, lineHeight: 1.4 };
const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 };
const sel: CSSProperties = {
  background: '#1e293b',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '4px 8px',
};
const inp: CSSProperties = { ...sel, width: '100%' };
const btn: CSSProperties = {
  background: '#1e293b',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '6px 10px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
};
const miniBtn: CSSProperties = {
  ...btn,
  padding: '2px 8px',
  fontSize: 10,
  textTransform: 'none',
  letterSpacing: 0,
};
