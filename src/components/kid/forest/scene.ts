import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ForestEvent, Season, TimeOfDay } from "@/lib/forest";

/**
 * The 3D island of "우리 숲" (approved prototype: https://claude.ai/artifact/RHfnpLLzemBGoiJXrex4Fj).
 * The church stands in the middle; trees, flowers, water, animals and the sky's friends appear one by one
 * as `count` goes from 1 to 64, in the order of FOREST_ITEMS. Everything is built from simple shapes,
 * so nothing has to be downloaded. Loaded only on the forest screen (the library is large).
 */

export interface SceneState {
  count: number;
  /** The last `fresh` things are this week's: they sparkle. */
  fresh: number;
  season: Season;
  time: TimeOfDay;
  rain: boolean;
  event: ForestEvent | null;
}

export interface ForestScene {
  update(state: SceneState): void;
  /** A few sparkles over this week's new things. */
  sparkleFresh(): void;
  dispose(): void;
}

type Anim = (t: number, dt: number) => void;
type Vec = number[];

export function createForestScene(canvas: HTMLCanvasElement, view: HTMLElement, initial: SceneState, opts: { reducedMotion: boolean; onInteract?: () => void }): ForestScene {
  const REDUCED = opts.reducedMotion;

  /* ---------------- seeded randomness, so the forest is the same every time ---------------- */
  let seed = 20261123;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const between = (a: number, b: number) => a + (b - a) * rnd();
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];

  /* ---------------- the island's shape ---------------- */
  const ISLAND_R = 5;
  const PLAZA_Y = 0.05;
  const YARD = { x0: -1.44, x1: 1.0, z0: -0.92, z1: 1.36 }; // the flat ground round the church
  const yardDist = (x: number, z: number) => Math.hypot(Math.max(YARD.x0 - x, 0, x - YARD.x1), Math.max(YARD.z0 - z, 0, z - YARD.z1));
  const POND = { x: 2.75, z: 1.25, r: 0.8 };
  const SPRING = { x: 3.0, z: -2.3 };
  const INFLOW: Vec[] = [[3.0, -2.3], [3.15, -1.6], [3.05, -0.9], [2.85, -0.2], [2.75, 0.45]];
  const OUTFLOW: Vec[] = [[3.25, 1.85], [3.5, 2.3], [3.72, 2.7], [3.95, 3.05]];
  const PATH: Vec[] = [[0.1, 4.9], [0.2, 4.0], [0.12, 3.0], [0.02, 2.0], [0.0, 1.5]];
  const PATH2: Vec[] = [[0.12, 3.0], [-0.7, 2.75], [-1.5, 2.45], [-2.2, 2.15]];
  const PAVILION = { x: -2.8, z: 1.95 };
  const HILLTREE = { x: -2.0, z: -1.65 };
  // Places kept clear of trees: [x, z, radius]
  const KEEP: Vec[] = [[PAVILION.x, PAVILION.z, 0.75], [HILLTREE.x, HILLTREE.z, 1.0], [-1.25, 3.1, 0.35], [-3.4, -0.3, 0.4], [0.15, 4.05, 0.5], [-1.0, 3.95, 0.35], [-2.2, 3.1, 0.5], [0.85, 4.35, 0.3], [-3.3, -1.55, 0.35], [1.9, -1.75, 0.35], [1.0, 1.2, 0.55], [-0.8, 1.72, 0.2], [0.85, 1.68, 0.2]];

  const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  function H(x: number, z: number) {
    const r = Math.hypot(x, z);
    const rim = r > 4.3 ? -(r - 4.3) * 0.22 : 0;
    const hill = 0.55 * Math.exp(-((x - HILLTREE.x) ** 2 + (z - HILLTREE.z) ** 2) / 3.0);
    const roll = 0.07 * Math.sin(x * 1.3 + 0.4) * Math.cos(z * 1.1);
    const pond = -0.12 * Math.exp(-((x - POND.x) ** 2 + (z - POND.z) ** 2) / 0.7);
    const k = smooth(0, 0.8, yardDist(x, z));
    return PLAZA_Y * (1 - k) + (hill + roll + pond + rim) * k;
  }
  function distToLine(px: number, pz: number, pts: Vec[]) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(px - (ax + t * dx), pz - (az + t * dz)));
    }
    return best;
  }
  function freeSpot(x: number, z: number, pad = 0) {
    const r = Math.hypot(x, z);
    if (r > 4.35 - pad || yardDist(x, z) < 0.25 + pad) return false;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.35 + pad) return false;
    if (distToLine(x, z, INFLOW) < 0.42 + pad || distToLine(x, z, OUTFLOW) < 0.42 + pad) return false;
    if (distToLine(x, z, PATH) < 0.45 + pad || distToLine(x, z, PATH2) < 0.4 + pad) return false;
    if (KEEP.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr + pad)) return false;
    return true;
  }

  /* ---------------- renderer, camera, light ---------------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  const HOME = { pos: new THREE.Vector3(10.5, 12.5, 12.5), target: new THREE.Vector3(0, -0.4, 0), dist: 0 };
  HOME.dist = HOME.pos.length();
  camera.position.copy(HOME.pos);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 4.5;
  controls.maxDistance = 26;
  controls.minPolarAngle = 0.45;
  controls.maxPolarAngle = 1.28;
  controls.autoRotate = !REDUCED;
  controls.autoRotateSpeed = 0.55;
  if (opts.onInteract) controls.addEventListener("start", opts.onInteract);

  const hemi = new THREE.HemisphereLight("#ffffff", "#b7d39c", 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff4e2", 2.4);
  sun.position.set(7, 13, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const island = new THREE.Group();
  scene.add(island);

  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0, ...extra });
  const shared = (color: string, extra?: THREE.MeshStandardMaterialParameters) => {
    const k = color + JSON.stringify(extra || {});
    let m = matCache.get(k);
    if (!m) { m = mat(color, extra); matCache.set(k, m); }
    return m;
  };
  const G = {
    ball: new THREE.IcosahedronGeometry(1, 2),
    ballLo: new THREE.IcosahedronGeometry(1, 1),
    trunk: new THREE.CylinderGeometry(0.07, 0.1, 0.6, 8),
    cone: new THREE.ConeGeometry(1, 1, 12),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
    box: new THREE.BoxGeometry(1, 1, 1),
    torus: new THREE.TorusGeometry(0.1, 0.022, 8, 24),
    disc: new THREE.CircleGeometry(1, 28),
  };
  function part(geo: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], s: number | Vec, pos?: Vec) {
    const m = new THREE.Mesh(geo, material);
    if (Array.isArray(s)) m.scale.set(s[0], s[1], s[2]); else m.scale.setScalar(s);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function placeAt<T extends THREE.Object3D>(obj: T, x: number, z: number, lift = 0): T { obj.position.set(x, H(x, z) + lift, z); return obj; }
  function draw2d(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const x = cv.getContext("2d");
    if (x) draw(x);
    return cv;
  }
  /** A texture drawn on a canvas, drawn again once the web font is in (for the words on it). */
  function canvasTexture(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
    const cv = draw2d(w, h, draw);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    document.fonts?.ready.then(() => { const x = cv.getContext("2d"); if (!x) return; x.clearRect(0, 0, w, h); draw(x); t.needsUpdate = true; });
    return t;
  }
  const FONT = "Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";

  /* ---------- ground (painted with vertex colours) ---------- */
  const RINGS = 44, SEGS = 160;
  const groundGeo = new THREE.BufferGeometry();
  {
    const pos: number[] = [], idx: number[] = [];
    pos.push(0, H(0, 0), 0);
    for (let i = 1; i <= RINGS; i++) {
      const r = (i / RINGS) * ISLAND_R;
      for (let j = 0; j < SEGS; j++) {
        const a = (j / SEGS) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        pos.push(x, H(x, z), z);
      }
    }
    for (let j = 0; j < SEGS; j++) idx.push(0, 1 + ((j + 1) % SEGS), 1 + j);
    for (let i = 1; i < RINGS; i++) {
      const a0 = 1 + (i - 1) * SEGS, a1 = 1 + i * SEGS;
      for (let j = 0; j < SEGS; j++) {
        const j1 = (j + 1) % SEGS;
        idx.push(a0 + j, a0 + j1, a1 + j, a0 + j1, a1 + j1, a1 + j);
      }
    }
    groundGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Array(pos.length).fill(1), 3));
    groundGeo.setIndex(idx);
    groundGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true;
  island.add(ground);

  /* ---------- the clay sides of the island ---------- */
  {
    const geo = new THREE.CylinderGeometry(ISLAND_R, 0.7, 3.4, 96, 10, true);
    const p = geo.attributes.position;
    const colors: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = (1.7 - y) / 3.4; // 0 at the top, 1 at the bottom
      const a = Math.atan2(z, x);
      if (t > 0.02) {
        const wob = 1 + 0.07 * Math.sin(a * 5 + y * 2) + 0.05 * Math.sin(a * 11 - y * 3);
        p.setX(i, x * wob); p.setZ(i, z * wob);
      }
      const band = Math.sin(t * 22 + a * 2) * 0.04;
      c.set(t < 0.1 ? "#a4774f" : t < 0.45 ? "#b68a5f" : "#9a7a62").offsetHSL(0, 0, band);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const side = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    side.position.y = -1.7 + H(ISLAND_R, 0) - 0.02;
    side.castShadow = true;
    island.add(side);
    for (let i = 0; i < 7; i++) {
      const a = between(0, Math.PI * 2), r = between(0.4, 1.8);
      island.add(part(G.ballLo, shared("#a08a76"), [between(0.25, 0.5), between(0.2, 0.4), between(0.25, 0.5)], [Math.cos(a) * r, between(-3.6, -2.4), Math.sin(a) * r]));
    }
  }

  /* ---------- trees ---------- */
  const LEAF: Record<Season, Record<string, string[]>> = {
    spring: { round: ["#a7d78e", "#94cd7e", "#b9e1a1"], blossom: ["#f7c4d7", "#fad5e3", "#f3b3ca"], cone: ["#5f9f6e", "#6aa877"], birch: ["#c8e49c", "#b6dc8b"], fruit: ["#a0d48a", "#8ecb7a"] },
    summer: { round: ["#6db760", "#5fab56", "#80c26c"], blossom: ["#79bc67", "#6db45e"], cone: ["#3f8859", "#4a9262"], birch: ["#a0d17b", "#90c76e"], fruit: ["#67b15b", "#5ba752"] },
    autumn: { round: ["#f0a150", "#e68050", "#f5c753", "#da6a42"], blossom: ["#ea9459", "#f1b150"], cone: ["#4c8a5f", "#57946a"], birch: ["#f4d165", "#efc34f"], fruit: ["#eaa24e", "#f2ba56"] },
    winter: { round: ["#eef3f7", "#d3e3d8", "#e2ebef"], blossom: ["#f1f4f7", "#dbe7de"], cone: ["#3d6e54", "#47795f"], birch: ["#eef2f5", "#d8e5dc"], fruit: ["#eaf0f4", "#d3e2d7"] },
  };
  const RIBBON = ["#ef8a7a", "#f4a84a", "#e8c12e", "#5fbf86", "#5b9be0", "#a88be0"];

  function makeTree(kind: string, big = 1) {
    const g = new THREE.Group();
    const canopy: THREE.Mesh[] = [];
    const fruit: THREE.Mesh[] = [];
    g.userData = { kind, canopy, fruit, tone: Math.floor(rnd() * 4), big };
    if (kind === "cone") {
      g.add(part(G.trunk, shared("#8d5f3d"), [1, 0.75, 1], [0, 0.22, 0]));
      [[0.5, 0.6, 0.48], [0.38, 0.55, 0.82], [0.26, 0.5, 1.12]].forEach(([r, h, y]) => {
        const m = part(G.cone, mat("#4f8f62"), [r, h, r], [0, y, 0]);
        g.add(m); canopy.push(m);
      });
    } else {
      const birch = kind === "birch";
      g.add(part(G.trunk, shared(birch ? "#efe9de" : "#9b6a43"), birch ? [0.75, 1.3, 0.75] : [1, 1, 1], [0, birch ? 0.4 : 0.3, 0]));
      if (birch) [0.25, 0.42, 0.58].forEach((y) => g.add(part(G.cyl, shared("#4a4038"), [0.056, 0.02, 0.056], [0, y, 0])));
      const n = birch ? 3 : 4 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.7;
        const r = birch ? between(0.2, 0.26) : between(0.3, 0.42);
        const off = i === 0 ? 0 : between(0.17, 0.26);
        const y = (birch ? 0.88 : 0.8) + (i === 0 ? 0.12 : between(-0.05, 0.1));
        const m = part(G.ball, mat("#7cbf6a"), [r, r * 0.9, r], [Math.cos(a) * off, y, Math.sin(a) * off]);
        g.add(m); canopy.push(m);
      }
      if (kind === "fruit") {
        for (let i = 0; i < 7; i++) {
          const a = rnd() * Math.PI * 2;
          const f = part(G.ballLo, shared("#f08a3c", { roughness: 0.6 }), 0.055, [Math.cos(a) * 0.38, between(0.62, 1.0), Math.sin(a) * 0.38]);
          g.add(f); fruit.push(f);
        }
      }
    }
    g.scale.setScalar(0.001);
    return g;
  }

  /* Groves rather than rows: trees gather around a few centres with open meadows between them,
     and a loose ring of trees stands round the church yard. */
  const GROVES: Vec[] = [[-2.9, -1.0, 1.1], [-0.6, -3.0, 1.1], [1.5, -2.9, 1.0], [-3.4, 0.7, 0.8], [-1.7, 3.4, 0.8], [1.9, 3.6, 0.7], [3.7, -2.3, 0.6], [1.9, -1.4, 0.6]];
  const spots: { x: number; z: number }[] = [];
  function addSpot(x: number, z: number, minGap: number) {
    if (!freeSpot(x, z)) return;
    for (const s of spots) if (Math.hypot(s.x - x, s.z - z) < minGap) return;
    spots.push({ x, z });
  }
  for (let tries = 0; tries < 4000 && spots.length < 82; tries++) {
    const roll = rnd();
    if (roll < 0.3) {
      const a = rnd() * Math.PI * 2, d = between(1.75, 2.6);
      addSpot(Math.cos(a) * d, Math.sin(a) * d, 0.48);
    } else if (roll < 0.88) {
      const [cx, cz, spread] = pick(GROVES);
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * spread * 1.35;
      addSpot(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 0.5);
    } else {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 4.3;
      addSpot(Math.cos(a) * d, Math.sin(a) * d, 0.75);
    }
  }
  // The first 24 trees are planted round the church from the first week and grow all year;
  // the rest of the forest spreads outward over the year.
  const byDistance = spots.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const firstSpots = byDistance.slice(0, 24);
  const wildSpots = spots.filter((s) => !firstSpots.includes(s));

  const trees: THREE.Group[] = [];
  firstSpots.forEach((s) => {
    const t = makeTree(pick(["round", "round", "round", "cone", "birch", "blossom"]));
    placeAt(t, s.x, s.z);
    t.rotation.y = rnd() * Math.PI * 2;
    Object.assign(t.userData, { first: true, at: 0, var: between(0.85, 1.1) });
    island.add(t);
    trees.push(t);
  });
  // Wild trees: when each one appears (the thing's number), and what kind it is.
  const WILD_STEPS = [1, 2, 4, 6, 8, 3, 10, 11, 13, 15, 15, 15, 15, 16, 18, 20, 22, 24, 26, 28, 30, 31, 33, 34, 36, 38, 40, 41, 43, 45, 47, 48, 50, 52, 54, 56, 57, 57, 58, 59, 60, 61, 62, 63, 63, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64];
  wildSpots.slice(0, WILD_STEPS.length).forEach((s, i) => {
    const at = WILD_STEPS[i];
    const kind = at === 15 ? "blossom" : at >= 57 ? pick(["fruit", "fruit", "round", "blossom"]) : pick(["round", "round", "cone", "cone", "birch"]);
    const t = makeTree(kind);
    placeAt(t, s.x, s.z);
    t.rotation.y = rnd() * Math.PI * 2;
    Object.assign(t.userData, { at, var: between(0.75, 1.15) });
    t.visible = false;
    island.add(t);
    trees.push(t);
  });

  /* ---------- the 64 things, built from shapes ---------- */
  const things: THREE.Object3D[][] = Array.from({ length: 64 }, () => []); // index = number - 1
  const anim: Anim[] = []; // per-frame updates
  function addThing(step: number, obj: THREE.Object3D) {
    // A single shape keeps its own size inside a wrapper, so growing to full size never blows it up.
    let o = obj;
    if ((obj as THREE.Mesh).isMesh) { o = new THREE.Group(); o.position.copy(obj.position); obj.position.set(0, 0, 0); o.add(obj); }
    o.visible = false; o.userData.step = step; o.scale.setScalar(0.001);
    island.add(o); things[step - 1].push(o);
    return o;
  }
  function spotsNear(cx: number, cz: number, n: number, spread: number, gap = 0.18, pad = 0) {
    const out: Vec[] = [];
    for (let tries = 0; tries < 600 && out.length < n; tries++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * spread;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!freeSpot(x, z, pad)) continue;
      if (out.some((o) => Math.hypot(o[0] - x, o[1] - z) < gap)) continue;
      if (trees.some((t) => Math.hypot(t.position.x - x, t.position.z - z) < 0.3)) continue;
      out.push([x, z]);
    }
    return out;
  }
  const meadow = () => { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 4.1; return [Math.cos(a) * d, Math.sin(a) * d]; };

  // Grass tufts and flowers are instanced: each step shows more of the same list.
  const grassPts: Vec[] = [];
  for (let tries = 0; tries < 5000 && grassPts.length < 420; tries++) { const [x, z] = meadow(); if (freeSpot(x, z, -0.25)) grassPts.push([x, z]); }
  const GRASS_STEPS = grassPts.map((_, i) => (i < 150 ? 2 : i < 290 ? 6 : 16));
  const grassMat = new THREE.MeshStandardMaterial({ color: "#7cb86a", roughness: 0.9 });
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.045, 0.2, 4), grassMat, grassPts.length);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    grassPts.forEach(([x, z], i) => {
      e.set(between(-0.25, 0.25), rnd() * 6, between(-0.25, 0.25)); q.setFromEuler(e);
      const s = between(0.7, 1.3);
      m.compose(new THREE.Vector3(x, H(x, z) + 0.08 * s, z), q, new THREE.Vector3(s, s, s));
      grass.setMatrixAt(i, m);
    });
    grass.count = 0;
    grass.receiveShadow = true;
    island.add(grass);
  }
  const FLOWER_SETS: [number, string, number][] = [[4, "#fbfaf4", 20], [7, "#ffd23f", 20], [9, "#f49ac1", 24], [14, "#b48be8", 22], [16, "mix", 130]];
  const MIX = ["#f49ac1", "#ffd23f", "#fbfaf4", "#b48be8", "#ef7b7b", "#9fc9f5"];
  const flowerList: { x: number; z: number; step: number; color: string }[] = [];
  FLOWER_SETS.forEach(([step, color, n]) => {
    let made = 0;
    for (let tries = 0; tries < 3000 && made < n; tries++) {
      const [x, z] = meadow();
      if (!freeSpot(x, z, -0.15)) continue;
      flowerList.push({ x, z, step, color: color === "mix" ? pick(MIX) : color });
      made++;
    }
  });
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.055, 1), new THREE.MeshStandardMaterial({ roughness: 0.7 }), flowerList.length);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.01, 0.012, 0.16, 5), new THREE.MeshStandardMaterial({ color: "#6aa35c" }), flowerList.length);
  {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    flowerList.forEach((f, i) => {
      const y = H(f.x, f.z);
      m.makeTranslation(f.x, y + 0.08, f.z); stems.setMatrixAt(i, m);
      m.makeTranslation(f.x, y + 0.17, f.z); heads.setMatrixAt(i, m);
      heads.setColorAt(i, c.set(f.color));
    });
    heads.count = stems.count = 0;
    island.add(stems, heads);
  }

  // 3 small stones
  spotsNear(0.5, 3.2, 4, 1.4).concat(spotsNear(-2.2, -0.4, 3, 1.2)).forEach(([x, z]) => {
    addThing(3, placeAt(part(G.ballLo, shared("#bdb8b0"), [between(0.08, 0.14), between(0.05, 0.08), between(0.08, 0.13)]), x, z, 0.02));
  });
  // 5 mushrooms near the groves
  spotsNear(-2.3, -1.3, 3, 1.2).concat(spotsNear(1.4, -2.0, 3, 1.1)).forEach(([x, z]) => {
    const g = new THREE.Group();
    g.add(part(G.cyl, shared("#f4e6cf"), [0.025, 0.07, 0.025], [0, 0.035, 0]));
    g.add(part(G.ball, shared("#e86a5a"), [0.07, 0.045, 0.07], [0, 0.075, 0]));
    [[0.03, 0.1, 0.02], [-0.025, 0.105, -0.02], [0.0, 0.112, 0.035]].forEach((p) => g.add(part(G.ballLo, shared("#ffffff"), 0.012, p)));
    addThing(5, placeAt(g, x, z));
  });
  // 8 mossy rocks
  [[-3.3, -1.55], [1.9, -1.75]].forEach(([x, z]) => {
    const g = new THREE.Group();
    g.add(part(G.ballLo, shared("#b1aca3"), [0.32, 0.2, 0.26], [0, 0.08, 0]));
    g.add(part(G.ball, shared("#8fc27e"), [0.25, 0.08, 0.2], [0, 0.22, 0]));
    addThing(8, placeAt(g, x, z));
  });
  // bushes: first bushes (8), hydrangea (11), flowering bushes (13)
  function bush(dots: string | null) {
    const g = new THREE.Group();
    const shade = pick(["#86bd76", "#7fb76f", "#92c582"]);
    [[0, 0.16, 0, 0.2], [0.16, 0.12, 0.04, 0.15], [-0.14, 0.11, -0.03, 0.14]].forEach(([x, y, z, r]) => g.add(part(G.ball, shared(shade), r, [x, y, z])));
    if (dots) for (let i = 0; i < 9; i++) { const a = rnd() * Math.PI * 2; g.add(part(G.ballLo, shared(dots), 0.04, [Math.cos(a) * 0.17, between(0.1, 0.32), Math.sin(a) * 0.17])); }
    return g;
  }
  spotsNear(0, 0, 5, 4, 0.5, 0.05).forEach(([x, z]) => addThing(8, placeAt(bush(null), x, z)));
  spotsNear(-1.2, -0.2, 3, 2.2, 0.5, 0.05).forEach(([x, z]) => addThing(11, placeAt(bush("#9bb8f0"), x, z)));
  spotsNear(1.0, 2.6, 4, 1.8, 0.5, 0.05).forEach(([x, z]) => addThing(13, placeAt(bush("#f7a8c4"), x, z)));
  // 10 tulips
  spotsNear(-0.8, 3.7, 14, 1.0, 0.12).forEach(([x, z]) => {
    const g = new THREE.Group();
    g.add(part(G.cyl, shared("#6aa35c"), [0.01, 0.16, 0.01], [0, 0.08, 0]));
    g.add(part(G.ball, shared(pick(["#ef6b6b", "#f49ac1", "#ffd23f"])), [0.045, 0.06, 0.045], [0, 0.18, 0]));
    addThing(10, placeAt(g, x, z));
  });
  // 12 sunflowers
  spotsNear(1.55, 2.55, 4, 0.55, 0.2).forEach(([x, z]) => {
    const g = new THREE.Group();
    g.add(part(G.cyl, shared("#5f9a52"), [0.015, 0.42, 0.015], [0, 0.21, 0]));
    const head = new THREE.Group();
    head.add(part(G.cyl, shared("#ffcf3f"), [0.11, 0.015, 0.11]));
    head.add(part(G.cyl, shared("#8a5a32"), [0.05, 0.025, 0.05], [0, 0.01, 0]));
    head.position.set(0, 0.44, 0.02); head.rotation.x = 1.25;
    g.add(head);
    addThing(12, placeAt(g, x, z));
  });

  /* ---------- water ---------- */
  const waterMat = new THREE.MeshStandardMaterial({ color: "#8fd0ee", roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.92 });
  const shimmer = new THREE.CanvasTexture(draw2d(128, 32, (x) => {
    x.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(10 + i * 21, 8 + (i % 3) * 7, 7, 1.6, 0, 0, Math.PI * 2); x.fill(); }
  }));
  shimmer.wrapS = shimmer.wrapT = THREE.RepeatWrapping;
  function ribbon(points: Vec[], width: number, lift: number) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const N = 60, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const p = curve.getPoint(i / N), tan = curve.getTangent(i / N);
      const nx = -tan.z, nz = tan.x;
      for (const s of [-1, 1]) {
        const x = p.x + nx * width * 0.5 * s, z = p.z + nz * width * 0.5 * s;
        pos.push(x, H(x, z) + lift, z); uv.push((i / N) * 6, s < 0 ? 0 : 1);
      }
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  const shimmerMat = new THREE.MeshBasicMaterial({ map: shimmer, transparent: true, depthWrite: false });
  {
    // 17 the spring
    const springWater = new THREE.Mesh(G.disc, waterMat);
    springWater.rotation.x = -Math.PI / 2; springWater.scale.setScalar(0.32);
    springWater.position.set(SPRING.x, H(SPRING.x, SPRING.z) + 0.04, SPRING.z);
    const springGroup = new THREE.Group(); springGroup.add(springWater);
    [0, 1.6, 3.2, 4.6].forEach((a) => springGroup.add(part(G.ballLo, shared("#c9c4bb"), [0.09, 0.06, 0.08], [SPRING.x + Math.cos(a) * 0.36, H(SPRING.x, SPRING.z) + 0.03, SPRING.z + Math.sin(a) * 0.36])));
    addThing(17, springGroup);
    // 18 the stream, in and out of the pond
    const streamGroup = new THREE.Group();
    [INFLOW, OUTFLOW].forEach((pts) => {
      const w = new THREE.Mesh(ribbon(pts, 0.32, 0.035), waterMat); w.receiveShadow = true; streamGroup.add(w);
      streamGroup.add(new THREE.Mesh(ribbon(pts, 0.22, 0.045), shimmerMat));
    });
    addThing(18, streamGroup);
    // 19 stepping stones across the inflow
    const steps = new THREE.Group();
    [[2.8, -0.95], [3.05, -0.9], [3.3, -0.85]].forEach(([x, z]) => steps.add(placeAt(part(G.cyl, shared("#d2cdc5"), [0.09, 0.035, 0.08]), x, z, 0.05)));
    addThing(19, steps);
    // 20 the pond
    let pondY = -Infinity;
    for (let a = 0; a < 6.3; a += 0.3) for (let r = 0; r <= POND.r; r += 0.2) pondY = Math.max(pondY, H(POND.x + Math.cos(a) * r, POND.z + Math.sin(a) * r));
    const pond = new THREE.Group();
    const pw = new THREE.Mesh(G.disc, waterMat); pw.rotation.x = -Math.PI / 2; pw.scale.setScalar(POND.r); pw.position.set(POND.x, pondY + 0.03, POND.z); pw.receiveShadow = true;
    const ps = new THREE.Mesh(G.disc, shimmerMat); ps.rotation.x = -Math.PI / 2; ps.scale.setScalar(POND.r * 0.8); ps.position.set(POND.x, pondY + 0.04, POND.z);
    pond.add(pw, ps);
    for (let a = 0; a < Math.PI * 2; a += 0.42) pond.add(part(G.ballLo, shared("#cfc9bf"), [0.1, 0.06, 0.09], [POND.x + Math.cos(a) * (POND.r + 0.04), pondY + 0.02, POND.z + Math.sin(a) * (POND.r + 0.04)]));
    addThing(20, pond);
    // 21 lily pads
    const lilies = new THREE.Group();
    [[0.35, -0.25], [-0.4, 0.2], [0.1, 0.45]].forEach(([dx, dz]) => {
      lilies.add(part(G.cyl, shared("#7cc06c"), [0.13, 0.01, 0.13], [POND.x + dx, pondY + 0.05, POND.z + dz]), part(G.ballLo, shared("#f7a8c4"), 0.03, [POND.x + dx + 0.04, pondY + 0.08, POND.z + dz]));
    });
    addThing(21, lilies);
    // 22 a frog on a lily pad
    const frog = new THREE.Group();
    frog.add(part(G.ball, shared("#79bf69"), [0.07, 0.05, 0.08], [0, 0.04, 0]));
    [-0.035, 0.035].forEach((dx) => { frog.add(part(G.ball, shared("#79bf69"), 0.025, [dx, 0.085, 0.04])); frog.add(part(G.ballLo, shared("#26331f"), 0.012, [dx, 0.095, 0.06])); });
    frog.position.set(POND.x + 0.35, pondY + 0.05, POND.z - 0.25);
    addThing(22, frog);
    // 23 a fish that jumps now and then
    const fish = new THREE.Group();
    fish.add(part(G.ball, shared("#f4a04e"), [0.09, 0.045, 0.04]));
    const tail = part(G.cone, shared("#ee8a3a"), [0.035, 0.06, 0.02], [-0.1, 0, 0]); tail.rotation.z = Math.PI / 2; fish.add(tail);
    addThing(23, fish);
    anim.push((t) => {
      if (!fish.visible) return;
      const k = (t * 0.45) % 1;
      const jump = k < 0.25 ? Math.sin((k / 0.25) * Math.PI) : -1;
      fish.position.set(POND.x - 0.2 + k * 0.6, pondY + 0.03 + Math.max(0, jump) * 0.45 - (jump < 0 ? 0.3 : 0), POND.z + 0.1);
      fish.rotation.z = k < 0.25 ? Math.cos((k / 0.25) * Math.PI) * 0.9 : 0;
    });
    // 24 a wooden bridge over the outflow
    const bridge = new THREE.Group();
    const mid = OUTFLOW[1];
    for (let i = 0; i < 6; i++) {
      const u = i / 5 - 0.5;
      bridge.add(part(G.box, shared("#c99462"), [0.1, 0.03, 0.42], [u * 0.55, 0.06 + Math.cos(u * Math.PI) * 0.1, 0]));
    }
    [-0.2, 0.2].forEach((z) => bridge.add(part(G.box, shared("#a87346"), [0.62, 0.025, 0.025], [0, 0.26, z])));
    placeAt(bridge, mid[0], mid[1], 0.02);
    bridge.rotation.y = -Math.atan2(OUTFLOW[2][1] - OUTFLOW[0][1], OUTFLOW[2][0] - OUTFLOW[0][0]);
    addThing(24, bridge);
    // 60 the waterfall off the edge of the island
    const fallTex = new THREE.CanvasTexture(draw2d(64, 256, (x) => {
      const grad = x.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "rgba(176,224,246,0.95)"); grad.addColorStop(0.75, "rgba(205,236,250,0.8)"); grad.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = grad; x.fillRect(0, 0, 64, 256);
      x.fillStyle = "rgba(255,255,255,0.6)";
      for (let i = 0; i < 14; i++) x.fillRect(4 + ((i * 9) % 56), (i * 37) % 256, 3, 26);
    }));
    fallTex.wrapT = THREE.RepeatWrapping;
    const fall = new THREE.Group();
    const end = OUTFLOW[OUTFLOW.length - 1];
    const edgeY = H(end[0], end[1]);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 2.4), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const out = new THREE.Vector2(end[0], end[1]).normalize();
    sheet.position.set(end[0] + out.x * 0.12, edgeY - 1.2, end[1] + out.y * 0.12);
    sheet.lookAt(sheet.position.x + out.x, sheet.position.y, sheet.position.z + out.y);
    fall.add(sheet);
    for (let i = 0; i < 5; i++) fall.add(part(G.ballLo, new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.7 }), between(0.08, 0.14), [end[0] + out.x * 0.15 + between(-0.12, 0.12), edgeY - 2.35 + between(-0.05, 0.08), end[1] + out.y * 0.15 + between(-0.12, 0.12)]));
    addThing(60, fall);
    anim.push((t, dt) => { if (fall.visible) fallTex.offset.y -= dt * 0.9; shimmer.offset.x -= dt * 0.12; });
  }

  /* ---------- friends of the forest ---------- */
  function bird(color: string) {
    const g = new THREE.Group();
    g.add(part(G.ball, shared(color), [0.12, 0.1, 0.09]));
    g.add(part(G.ball, shared(color), 0.065, [0.1, 0.06, 0]));
    const beak = part(G.cone, shared("#f2a93b"), [0.02, 0.05, 0.02], [0.17, 0.06, 0]); beak.rotation.z = -Math.PI / 2; g.add(beak);
    const wl = part(G.ball, shared(color), [0.09, 0.015, 0.12], [0, 0.03, 0.08]);
    const wr = part(G.ball, shared(color), [0.09, 0.015, 0.12], [0, 0.03, -0.08]);
    g.add(wl, wr); g.userData.wings = [wl, wr];
    return g;
  }
  function circler(obj: THREE.Object3D, r: number, h: number, speed: number, phase: number) {
    anim.push((t) => {
      if (!obj.visible) return;
      const a = t * speed + phase;
      obj.position.set(Math.cos(a) * r, h + Math.sin(t * 1.3 + phase) * 0.15, Math.sin(a) * r);
      obj.rotation.y = -a - (Math.PI / 2) * Math.sign(speed);
      const wings = obj.userData.wings as THREE.Mesh[] | undefined;
      if (wings) { const f = Math.sin(t * 14 + phase) * 0.6; wings[0].rotation.x = f; wings[1].rotation.x = -f; }
    });
  }
  {
    const blue = bird("#8cc3ee"); addThing(25, blue); circler(blue, 3.4, 2.6, 0.45, 0);
    // 26 a birdhouse on a tree
    const host = trees.find((t) => t.userData.kind === "round" && !t.userData.first) ?? trees[1];
    const house = new THREE.Group();
    house.add(part(G.box, shared("#dba06a"), [0.12, 0.12, 0.1], [0, 0, 0]));
    const roof = part(G.cone, shared("#c46b4f"), [0.11, 0.08, 0.11], [0, 0.1, 0]); roof.rotation.y = Math.PI / 4; house.add(roof);
    const hole = part(G.cyl, shared("#5b3b22"), [0.025, 0.01, 0.025], [0, 0.01, 0.055]); hole.rotation.x = Math.PI / 2; house.add(hole);
    house.position.set(host.position.x + 0.1, host.position.y + 0.42, host.position.z + 0.1);
    addThing(26, house);
    // butterflies (27 white-pink, 32 yellow), a dragonfly (28) and bees (29) wander over the meadows
    const wing = (color: string) => part(G.disc, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6 }), [0.07, 0.05, 1]);
    const flutterer = (color: string, step: number, cx: number, cz: number, h: number, speed: number, phase: number) => {
      const g = new THREE.Group();
      const l = wing(color), r = wing(color);
      l.position.x = -0.05; r.position.x = 0.05;
      g.add(l, r, part(G.ball, shared("#3b2f28"), [0.012, 0.012, 0.05]));
      addThing(step, g);
      anim.push((t) => {
        if (!g.visible) return;
        const a = t * speed + phase;
        g.position.set(cx + Math.cos(a) * 0.7 + Math.sin(a * 2.3) * 0.2, h + H(cx, cz) + Math.sin(a * 3) * 0.12, cz + Math.sin(a) * 0.55);
        g.rotation.y = -a;
        const f = Math.sin(t * 16 + phase) * 1.1; l.rotation.y = f; r.rotation.y = -f;
      });
    };
    flutterer("#fde2ec", 27, 0.9, 2.6, 0.55, 0.6, 0); flutterer("#ffffff", 27, -1.2, 3.4, 0.5, 0.5, 2);
    flutterer("#ffd84a", 32, 2.6, 0.2, 0.5, 0.55, 1); flutterer("#ffe27a", 32, -0.6, -1.0, 0.6, 0.65, 3);
    flutterer("#9fd6ef", 28, POND.x, POND.z, 0.35, 0.8, 0.5);
    [0, 1, 2].forEach((i) => {
      const bee = new THREE.Group();
      bee.add(part(G.ball, shared("#ffd23f"), [0.04, 0.03, 0.03]), part(G.ball, shared("#3b2f28"), [0.015, 0.031, 0.031], [0.01, 0, 0]));
      addThing(29, bee);
      anim.push((t) => { if (!bee.visible) return; const a = t * 2.2 + i * 2; bee.position.set(-0.9 + Math.cos(a) * 0.4, H(-0.9, 3.4) + 0.3 + Math.sin(a * 3) * 0.08, 3.4 + Math.sin(a * 1.3) * 0.4); });
    });
    // 30 a squirrel that hops
    const sq = new THREE.Group();
    sq.add(part(G.ball, shared("#d49a5e"), [0.07, 0.075, 0.06], [0, 0.07, 0]), part(G.ball, shared("#d49a5e"), 0.045, [0.05, 0.14, 0]));
    const tl = part(G.torus, shared("#c4874f"), [1.2, 1.2, 2.2], [-0.07, 0.15, 0]); tl.rotation.y = Math.PI / 2; sq.add(tl);
    placeAt(sq, -2.0, -2.4); addThing(30, sq);
    anim.push((t) => { if (!sq.visible) return; const k = (t * 0.6) % 1; const x = -2.0 + Math.sin(t * 0.3) * 0.5, z = -2.4 + Math.cos(t * 0.3) * 0.3; sq.position.set(x, H(x, z) + Math.abs(Math.sin(k * Math.PI * 4)) * 0.06, z); });
    // 31 a snail
    const sn = new THREE.Group();
    sn.add(part(G.ball, shared("#e6c8a0"), [0.07, 0.02, 0.025], [0, 0.015, 0]), part(G.torus, shared("#cf9560"), [0.45, 0.45, 0.8], [-0.01, 0.05, 0]));
    addThing(31, placeAt(sn, 1.0, 3.9));
    // 41 rabbit, 42 hedgehog, 43 baby deer, 46 turtle, 48 lamb
    const rabbit = new THREE.Group();
    rabbit.add(part(G.ball, shared("#fbf9f5"), [0.1, 0.085, 0.08], [0, 0.08, 0]), part(G.ball, shared("#fbf9f5"), 0.06, [0.08, 0.15, 0]));
    [-0.025, 0.025].forEach((z) => rabbit.add(part(G.ball, shared("#fbf9f5"), [0.015, 0.06, 0.02], [0.07, 0.24, z])));
    addThing(41, rabbit);
    anim.push((t) => { if (!rabbit.visible) return; const a = t * 0.35; const x = 1.3 + Math.cos(a) * 0.5, z = 3.0 + Math.sin(a) * 0.35; rabbit.position.set(x, H(x, z) + Math.abs(Math.sin(t * 5)) * 0.07, z); rabbit.rotation.y = -a; });
    const hog = new THREE.Group();
    hog.add(part(G.ball, shared("#a8774f"), [0.1, 0.06, 0.08], [0, 0.04, 0]), part(G.ball, shared("#ead2b0"), [0.04, 0.035, 0.04], [0.09, 0.035, 0]));
    addThing(42, placeAt(hog, -3.0, 2.6));
    const deer = new THREE.Group();
    deer.add(part(G.ball, shared("#cd9159"), [0.18, 0.11, 0.09], [0, 0.26, 0]));
    [[0.1, 0.05], [0.1, -0.05], [-0.1, 0.05], [-0.1, -0.05]].forEach(([x, z]) => deer.add(part(G.cyl, shared("#a9713f"), [0.018, 0.2, 0.018], [x, 0.1, z])));
    deer.add(part(G.cyl, shared("#cd9159"), [0.035, 0.18, 0.035], [0.15, 0.38, 0]), part(G.ball, shared("#d59a61"), [0.07, 0.06, 0.055], [0.18, 0.48, 0]));
    [[0.05, 0.27, 0.06], [-0.04, 0.29, -0.06], [0.0, 0.33, 0.02]].forEach((p) => deer.add(part(G.ballLo, shared("#fff4e4"), 0.018, p)));
    deer.rotation.y = 0.8;
    addThing(43, placeAt(deer, -1.0, -3.4));
    const turtle = new THREE.Group();
    turtle.add(part(G.ball, shared("#6fae6a"), [0.1, 0.05, 0.08], [0, 0.03, 0]), part(G.ball, shared("#a6cf8d"), 0.035, [0.1, 0.03, 0]));
    addThing(46, placeAt(turtle, POND.x - 0.75, POND.z + 0.6));
    const lamb = new THREE.Group();
    [[0, 0.14, 0, 0.1], [0.08, 0.15, 0.03, 0.08], [-0.08, 0.14, -0.02, 0.08], [0, 0.18, 0.05, 0.08]].forEach(([x, y, z, r]) => lamb.add(part(G.ball, shared("#fbfaf6"), r, [x, y, z])));
    lamb.add(part(G.ball, shared("#4e4a46"), [0.05, 0.055, 0.045], [0.15, 0.17, 0]));
    [[0.06, 0.04], [-0.06, 0.04], [0.06, -0.04], [-0.06, -0.04]].forEach(([x, z]) => lamb.add(part(G.cyl, shared("#4e4a46"), [0.014, 0.08, 0.014], [x, 0.04, z])));
    addThing(48, placeAt(lamb, 2.3, -2.6));
    // 44 an owl on a pine
    const pine = trees.find((t) => t.userData.kind === "cone") ?? trees[0];
    const owl = new THREE.Group();
    owl.add(part(G.ball, shared("#a67a51"), [0.075, 0.095, 0.07]), part(G.ball, shared("#e5cba4"), [0.05, 0.07, 0.03], [0, -0.01, 0.05]));
    [-0.03, 0.03].forEach((x) => { owl.add(part(G.ball, shared("#ffffff"), 0.026, [x, 0.03, 0.06])); owl.add(part(G.ballLo, shared("#2b2118"), 0.012, [x, 0.03, 0.083])); });
    owl.position.set(pine.position.x + 0.28, pine.position.y + 0.62, pine.position.z + 0.18);
    addThing(44, owl);
    // 45 a duck family swims round the pond
    [0, 1, 2].forEach((i) => {
      const d = new THREE.Group();
      const col = i === 0 ? "#fbfaf6" : "#ffe27a", s = i === 0 ? 1 : 0.65;
      d.add(part(G.ball, shared(col), [0.08 * s, 0.05 * s, 0.06 * s]), part(G.ball, shared(col), 0.04 * s, [0.06 * s, 0.06 * s, 0]));
      const b = part(G.cone, shared("#f2a93b"), [0.015 * s, 0.035 * s, 0.015 * s], [0.1 * s, 0.06 * s, 0]); b.rotation.z = -Math.PI / 2; d.add(b);
      addThing(45, d);
      anim.push((t) => { if (!d.visible) return; const a = t * 0.3 - i * 0.45; d.position.set(POND.x + Math.cos(a) * 0.55, H(POND.x, POND.z) + 0.1, POND.z + Math.sin(a) * 0.45); d.rotation.y = -a - Math.PI / 2; });
    });
    // 47 a flock of sparrows
    [0, 1, 2].forEach((i) => { const b = bird("#b9a58f"); b.scale.setScalar(0.7); addThing(47, b); circler(b, 4.6 + i * 0.25, 3.6 + i * 0.15, -0.35, i * 0.35); });
  }

  /* ---------- the path and what stands along it ---------- */
  {
    // 34 a bench, 37 a sign, 38 a well, 39 a flower arch, 40 a log seat
    const bench = new THREE.Group();
    bench.add(part(G.box, shared("#c58e5c"), [0.42, 0.04, 0.14], [0, 0.14, 0]), part(G.box, shared("#c58e5c"), [0.42, 0.12, 0.03], [0, 0.24, -0.06]));
    [-0.17, 0.17].forEach((x) => bench.add(part(G.box, shared("#9a6a44"), [0.04, 0.14, 0.12], [x, 0.07, 0])));
    bench.rotation.y = 0.6;
    addThing(34, placeAt(bench, -1.25, 3.1));
    const signTex = canvasTexture(256, 128, (x) => {
      x.fillStyle = "#dcae7a"; x.fillRect(0, 0, 256, 128);
      x.fillStyle = "#6b4428"; x.font = `800 60px ${FONT}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("꿈의숲", 128, 68);
    });
    const sign = new THREE.Group();
    sign.add(part(G.box, shared("#9a6a44"), [0.04, 0.4, 0.04], [0, 0.2, 0]));
    const wood = shared("#c99462");
    const board = new THREE.Mesh(G.box, [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: signTex }), wood]);
    board.scale.set(0.42, 0.2, 0.03); board.position.set(0, 0.42, 0); board.castShadow = true; sign.add(board);
    sign.rotation.y = 0.35;
    addThing(37, placeAt(sign, 0.85, 4.35));
    const well = new THREE.Group();
    well.add(part(G.cyl, shared("#c8c3ba"), [0.2, 0.18, 0.2], [0, 0.09, 0]), part(G.cyl, shared("#7fb7d8"), [0.16, 0.02, 0.16], [0, 0.18, 0]));
    [-0.17, 0.17].forEach((x) => well.add(part(G.box, shared("#9a6a44"), [0.03, 0.42, 0.03], [x, 0.3, 0])));
    const wroof = part(G.cone, shared("#cf7258"), [0.3, 0.16, 0.3], [0, 0.55, 0]); wroof.rotation.y = Math.PI / 4; well.add(wroof);
    addThing(38, placeAt(well, -3.4, -0.3));
    const arch = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 28, Math.PI), shared("#79b268")); ring.castShadow = true; arch.add(ring);
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; arch.add(part(G.ballLo, shared(pick(["#f49ac1", "#ffd25a", "#fbfaf4", "#b48be8"])), 0.05, [Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0])); }
    arch.position.set(0.15, H(0.15, 4.05), 4.05); arch.rotation.y = 0.05;
    addThing(39, arch);
    const log = part(G.cyl, shared("#bd8556"), [0.09, 0.42, 0.09]); log.rotation.z = Math.PI / 2; log.rotation.y = 0.9;
    addThing(40, placeAt(log, -1.0, 3.95, 0.09));
    // 35 class flags on a string by the path
    const flags = new THREE.Group();
    const fa = [-0.55, 3.3], fb = [0.85, 3.2];
    [fa, fb].forEach(([x, z]) => flags.add(placeAt(part(G.cyl, shared("#9a6a44"), [0.02, 0.55, 0.02]), x, z, 0.27)));
    for (let i = 0; i < 6; i++) {
      const u = (i + 0.5) / 6;
      const x = fa[0] + (fb[0] - fa[0]) * u, z = fa[1] + (fb[1] - fa[1]) * u;
      const y = H(x, z) + 0.5 - Math.sin(u * Math.PI) * 0.08;
      const flag = part(G.cone, mat(RIBBON[i], { side: THREE.DoubleSide }), [0.05, 0.09, 0.01], [x, y, z]); flag.rotation.z = Math.PI; flag.rotation.y = Math.atan2(fb[1] - fa[1], fb[0] - fa[0]); flags.add(flag);
    }
    addThing(35, flags);
  }

  /* ---------- lights that glow in the evening ---------- */
  function glowTexture(inner: string, outer: string) {
    return new THREE.CanvasTexture(draw2d(64, 64, (x) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, inner); g.addColorStop(0.35, outer); g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    }));
  }
  const warmGlow = glowTexture("rgba(255,246,200,1)", "rgba(255,206,110,0.55)");
  const glows: THREE.Sprite[] = [];
  function glowSprite(size: number, tex: THREE.Texture = warmGlow) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(size); glows.push(s); return s;
  }
  {
    // 36 lanterns along the path
    [[0.5, 3.55], [-0.35, 2.4], [0.45, 2.1], [-1.15, 2.15]].forEach(([x, z]) => {
      const l = new THREE.Group();
      l.add(part(G.cyl, shared("#8a6a4e"), [0.016, 0.42, 0.016], [0, 0.21, 0]));
      l.add(part(G.box, mat("#ffe08a", { emissive: "#ffcf5a", emissiveIntensity: 0.6 }), [0.08, 0.1, 0.08], [0, 0.46, 0]));
      const gs = glowSprite(0.55); gs.position.set(0, 0.46, 0); l.add(gs);
      addThing(36, placeAt(l, x, z));
    });
    // 63 string lights on posts round the back of the church yard
    const lights = new THREE.Group();
    const posts = [160, 205, 250, 300, 350].map((deg) => { const a = THREE.MathUtils.degToRad(deg); return [Math.cos(a) * 1.9, Math.sin(a) * 1.9]; });
    posts.forEach(([x, z]) => lights.add(placeAt(part(G.cyl, shared("#9a6a44"), [0.02, 0.8, 0.02]), x, z, 0.4)));
    for (let k = 0; k < posts.length - 1; k++) {
      const [ax, az] = posts[k], [bx, bz] = posts[k + 1];
      for (let i = 1; i < 6; i++) {
        const u = i / 6, x = ax + (bx - ax) * u, z = az + (bz - az) * u;
        const y = H(x, z) + 0.78 - Math.sin(u * Math.PI) * 0.16;
        const col = RIBBON[(k * 5 + i) % 6];
        lights.add(part(G.ballLo, mat(col, { emissive: col, emissiveIntensity: 0.8 }), 0.03, [x, y, z]));
        const gs = glowSprite(0.28, glowTexture("rgba(255,255,255,1)", col + "aa")); gs.position.set(x, y, z); lights.add(gs);
      }
    }
    addThing(63, lights);
  }

  /* ---------- the church in the middle: there from the first week ---------- */
  // A stone box. Its roof folds along the diagonal from the front-left to the back-right corner:
  // that ridge is high, and the roof slopes down to the front-right and the back-left corners.
  const churchGlass: THREE.MeshStandardMaterial[] = []; // windows and the cross, which glow in the evening
  const winterOnly: THREE.Object3D[] = []; // snow on the roof
  const churchBld = new THREE.Group();
  churchBld.position.y = PLAZA_Y;
  island.add(churchBld);
  const roofEdge: THREE.Vector3[] = []; // points along the top of the walls, for Christmas lights
  let porchFrame = new THREE.Group();
  {
    const bld = churchBld;
    // paving: a narrow strip round the walls, an apron at the door and a patch by the tower; grass everywhere else
    const paveTex = canvasTexture(128, 128, (x) => {
      x.fillStyle = "#cdbcab"; x.fillRect(0, 0, 128, 128);
      const cols = ["#e6d6c6", "#dccab9", "#ebdecf", "#e0cfbf"];
      for (let r = 0; r < 8; r++) for (let c = -1; c < 4; c++) {
        x.fillStyle = cols[Math.abs(r * 3 + c * 5) % 4];
        x.fillRect(c * 32 + (r % 2) * 16 + 1, r * 16 + 1, 30, 14);
      }
    });
    paveTex.repeat.set(2.5, 2.5);
    const paveMat = new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.95 });
    const paving = (x0: number, x1: number, z0: number, z1: number, r: number, y: number) => {
      const s = new THREE.Shape(); // drawn in (x, -z) so that turning it flat makes it face up
      const a = -z1, b = -z0;
      s.moveTo(x0 + r, a); s.lineTo(x1 - r, a); s.quadraticCurveTo(x1, a, x1, a + r); s.lineTo(x1, b - r); s.quadraticCurveTo(x1, b, x1 - r, b);
      s.lineTo(x0 + r, b); s.quadraticCurveTo(x0, b, x0, b - r); s.lineTo(x0, a + r); s.quadraticCurveTo(x0, a, x0 + r, a);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 6), paveMat);
      m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true;
      bld.add(m);
    };
    paving(-1.34, 0.92, -0.82, 0.82, 0.18, 0.012);
    paving(-0.62, 0.98, 0.6, 1.34, 0.3, 0.014);
    paving(-1.44, -0.7, 0.48, 1.24, 0.25, 0.013);

    // stone walls
    const stoneTex = canvasTexture(128, 128, (x) => {
      x.fillStyle = "#c9c1b4"; x.fillRect(0, 0, 128, 128);
      for (let r = 0; r < 4; r++) for (let c = -1; c < 3; c++) {
        x.fillStyle = `hsl(38, 18%, ${85 + (Math.abs(r * 7 + c * 13) % 5) - 2}%)`;
        x.fillRect(c * 64 + (r % 2) * 32 + 2, r * 32 + 2, 60, 28);
      }
    });
    const stone = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9 });
    const boxStone = (rx: number, ry: number) => { const m = stone.clone(); const t = stoneTex.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; m.map = t; return m; };
    const stoneLight = shared("#e4ddd1");
    const W = 0.8, D = 0.7;
    const BL = [-W, -D, 1.0], FL = [-W, D, 1.42], FR = [W, D, 0.98], BR = [W, -D, 1.38]; // x, z, height of the wall top
    const C = [BL, FL, FR, BR];
    type V = { p: THREE.Vector3; u: number; v: number };
    const pos: number[] = [], uv: number[] = [];
    const tri = (a: V, b: V, c: V, out: THREE.Vector3) => {
      const n = new THREE.Vector3().subVectors(b.p, a.p).cross(new THREE.Vector3().subVectors(c.p, a.p));
      const order = n.dot(out) < 0 ? [a, c, b] : [a, b, c];
      for (const v of order) { pos.push(v.p.x, v.p.y, v.p.z); uv.push(v.u, v.v); }
    };
    for (let i = 0; i < 4; i++) {
      const [ax, az, ah] = C[i], [bx, bz, bh] = C[(i + 1) % 4];
      const len = Math.hypot(bx - ax, bz - az), TW = 0.44, TH = 0.32;
      const out = new THREE.Vector3((ax + bx) / 2, 0, (az + bz) / 2);
      const A0 = { p: new THREE.Vector3(ax, 0, az), u: 0, v: 0 }, B0 = { p: new THREE.Vector3(bx, 0, bz), u: len / TW, v: 0 };
      const B1 = { p: new THREE.Vector3(bx, bh, bz), u: len / TW, v: bh / TH }, A1 = { p: new THREE.Vector3(ax, ah, az), u: 0, v: ah / TH };
      tri(A0, B0, B1, out); tri(A0, B1, A1, out);
      const steps = Math.round(len / 0.12);
      for (let k = 0; k < steps; k++) { const s = k / steps; roofEdge.push(new THREE.Vector3(ax + (bx - ax) * s, ah + (bh - ah) * s, az + (bz - az) * s)); }
    }
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    wallGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    wallGeo.computeVertexNormals();
    const walls = new THREE.Mesh(wallGeo, stone); walls.castShadow = walls.receiveShadow = true;
    bld.add(walls);

    // the roof: two triangles meeting along the high front-left / back-right ridge, in soft brick red with a green rim
    const T = C.map(([x, z, h]) => new THREE.Vector3(x, h, z));
    const ROOF = [[0, 1, 3], [1, 2, 3]];
    const heightAt = (x: number, z: number) => {
      for (const [a, b, c] of ROOF) {
        const A = T[a], B = T[b], Cc = T[c];
        const det = (B.z - Cc.z) * (A.x - Cc.x) + (Cc.x - B.x) * (A.z - Cc.z);
        const wa = ((B.z - Cc.z) * (x - Cc.x) + (Cc.x - B.x) * (z - Cc.z)) / det;
        const wb = ((Cc.z - A.z) * (x - Cc.x) + (A.x - Cc.x) * (z - Cc.z)) / det;
        const wc = 1 - wa - wb;
        if (wa >= -1e-6 && wb >= -1e-6 && wc >= -1e-6) return wa * A.y + wb * B.y + wc * Cc.y;
      }
      return (T[1].y + T[3].y) / 2;
    };
    const roofGeo = (shrink: number, lift: number) => {
      const verts: THREE.Vector3[] = [];
      for (const tr of ROOF) for (const i of tr) { const x = T[i].x * (1 - shrink), z = T[i].z * (1 - shrink); verts.push(new THREE.Vector3(x, heightAt(x, z) + lift, z)); }
      const g = new THREE.BufferGeometry().setFromPoints(verts);
      g.setAttribute("uv", new THREE.Float32BufferAttribute(verts.flatMap((v) => [(v.x - v.z) / 0.5, (v.x + v.z) / 0.5]), 2));
      g.computeVertexNormals();
      return g;
    };
    const roofTex = canvasTexture(64, 16, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "#b8665a" : "#c87264"; x.fillRect(i * 8, 0, 8, 16); } });
    const rim = new THREE.Mesh(roofGeo(0, 0.004), new THREE.MeshStandardMaterial({ color: "#6e9c72", roughness: 0.8, side: THREE.DoubleSide }));
    const roof = new THREE.Mesh(roofGeo(0.06, 0.02), new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.7, side: THREE.DoubleSide }));
    const snowRoof = new THREE.Mesh(roofGeo(0.11, 0.036), new THREE.MeshStandardMaterial({ color: "#f6f9fc", roughness: 1, side: THREE.DoubleSide }));
    rim.castShadow = roof.castShadow = true;
    snowRoof.visible = false; winterOnly.push(snowRoof);
    bld.add(rim, roof, snowRoof);

    // a frame standing on a wall, s of the way from corner a to corner b; local +z points out of the wall
    const onWall = (a: Vec, b: Vec, s: number, lift = 0.004) => {
      const px = a[0] + (b[0] - a[0]) * s, pz = a[1] + (b[1] - a[1]) * s;
      let nx = b[1] - a[1], nz = -(b[0] - a[0]);
      const l = Math.hypot(nx, nz); nx /= l; nz /= l;
      if (px * nx + pz * nz < 0) { nx = -nx; nz = -nz; }
      const g = new THREE.Group();
      g.position.set(px + nx * lift, 0, pz + nz * lift);
      g.rotation.y = Math.atan2(nx, nz);
      bld.add(g);
      return g;
    };
    const glowMat = (map: THREE.Texture | null, color = "#ffffff") => { const m = new THREE.MeshStandardMaterial({ map, color, roughness: 0.35, metalness: 0.1, emissive: "#ffd27a", emissiveIntensity: 0 }); churchGlass.push(m); return m; };
    const darkGlass = glowMat(null, "#3a4650");
    const smallWindow = (frame: THREE.Group, x: number, y: number, w = 0.07, h = 0.09) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), darkGlass); m.position.set(x, y, 0.002); frame.add(m); };
    const stripeTex = canvasTexture(64, 64, (x) => { x.fillStyle = "#3a3f46"; x.fillRect(0, 0, 64, 64); x.fillStyle = "#5b636d"; for (let i = 0; i < 64; i += 8) x.fillRect(i, 0, 2, 64); x.fillRect(0, 30, 64, 2); });
    stripeTex.repeat.set(3, 2);
    const stripeGlass = glowMat(stripeTex);
    const slantWindow = (frame: THREE.Group, pts: Vec[]) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath(); frame.add(new THREE.Mesh(new THREE.ShapeGeometry(sh), stripeGlass)); };

    // front: the porch, a box with a low pointed hood, the doors and the church's name in gold
    const front = onWall(FL, FR, 0.55, 0);
    porchFrame = front;
    front.add(part(G.box, boxStone(1.5, 1.4), [0.9, 0.64, 0.28], [0, 0.32, 0.14]));
    const hood = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), stoneLight); cone.rotation.y = Math.PI / 4; cone.castShadow = true;
    hood.add(cone); hood.scale.set(0.95, 0.21, 0.4); hood.position.set(0, 0.745, 0.13);
    front.add(hood);
    const doors = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), darkGlass); doors.position.set(0, 0.09, 0.282); front.add(doors);
    front.add(part(G.box, stoneLight, [0.58, 0.025, 0.06], [0, 0.19, 0.3]));
    const nameTex = canvasTexture(256, 48, (x) => { x.fillStyle = "#c39a45"; x.font = `800 36px ${FONT}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("꿈의숲교회", 128, 26); });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.079), new THREE.MeshStandardMaterial({ map: nameTex, transparent: true, roughness: 0.5 }));
    plate.position.set(0, 0.28, 0.282); front.add(plate);
    [[-0.58, 0.1], [0.58, 0.1]].forEach(([x, z]) => {
      front.add(part(G.cyl, shared("#8f8a82"), [0.06, 0.07, 0.06], [x, 0.035, z]));
      front.add(part(G.ball, shared("#6fb35f"), 0.07, [x, 0.11, z]));
    });

    // right side: a slim stair tower with a slanted top, and small windows
    const stair = onWall(FR, BR, 0.7, 0);
    stair.add(part(G.box, boxStone(0.7, 3), [0.28, 1.0, 0.15], [0, 0.5, 0.075]));
    const stairCap = part(G.box, stoneLight, [0.3, 0.04, 0.21], [0, 1.02, 0.08]); stairCap.rotation.x = 0.45; stair.add(stairCap);
    [0.2, 0.3, 0.4].forEach((s) => smallWindow(onWall(FR, BR, s), 0, 0.15));

    // back: the big striped slanting window, small windows and a side door with a blue awning
    slantWindow(onWall(BR, BL, 0.4), [[-0.38, 0.45], [0.34, 0.5], [0.34, 0.95], [-0.38, 1.08]]);
    const side = onWall(BR, BL, 0.78);
    const sideDoor = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.24), darkGlass); sideDoor.position.set(0, 0.12, 0.002); side.add(sideDoor);
    side.add(part(G.box, shared("#4a6fbf"), [0.21, 0.02, 0.07], [0, 0.27, 0.035]));
    [0.12, 0.16, 0.2].forEach((s) => smallWindow(onWall(BR, BL, s), 0, 0.32, 0.045, 0.12));

    // left side: the low glass hall, with a small striped window above it
    const glassTex = canvasTexture(128, 64, (x) => {
      x.fillStyle = "#cfe3de"; x.fillRect(0, 0, 128, 64);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 2; r++) {
        const g = x.createLinearGradient(0, r * 32, 0, r * 32 + 32); g.addColorStop(0, "#3f8a83"); g.addColorStop(1, "#285f5b");
        x.fillStyle = g; x.fillRect(c * 32 + 3, r * 32 + 3, 26, 26);
      }
    });
    const glass = glowMat(glassTex);
    const cream = new THREE.MeshStandardMaterial({ color: "#e9e1d4", roughness: 0.9 });
    const annex = onWall(BL, FL, 0.3, 0);
    const hall = new THREE.Mesh(G.box, [glass, glass, cream, stone, glass, stone]);
    hall.scale.set(0.75, 0.55, 0.4); hall.position.set(0, 0.275, 0.2); hall.castShadow = hall.receiveShadow = true;
    annex.add(hall, part(G.box, cream, [0.79, 0.05, 0.44], [0, 0.55, 0.2]));
    slantWindow(onWall(BL, FL, 0.3), [[-0.18, 0.7], [0.16, 0.74], [0.16, 0.96], [-0.18, 0.92]]);

    // low bushes along the right and back walls, so the building sits in the green
    const bushShades = ["#7fb76f", "#8cc27b", "#74ad66"];
    [-0.62, -0.05, 0.15, 0.35, 0.55].forEach((z, i) => bld.add(part(G.ball, shared(bushShades[i % 3]), [0.11, 0.09, 0.1], [0.99, 0.06, z])));
    [-0.7, -0.15, 0.05, 0.25, 0.45, 0.65].forEach((x, i) => bld.add(part(G.ball, shared(bushShades[(i + 1) % 3]), [0.1, 0.09, 0.11], [x, 0.06, -0.92])));

    // the tall white tower with the church's name, and a cross on top
    const tower = new THREE.Group();
    tower.position.set(-1.12, 0, 0.92);
    const towerTex = canvasTexture(256, 1024, (x) => {
      x.fillStyle = "#f7f6f2"; x.fillRect(0, 0, 256, 1024);
      x.fillStyle = "#e1dfd8"; for (let i = 0; i < 256; i += 16) x.fillRect(i, 0, 3, 1024);
      for (const px of [0, 128, 256]) {
        x.fillStyle = "#2f9a4a"; x.beginPath(); x.ellipse(px - 6, 96, 12, 22, -0.5, 0, Math.PI * 2); x.fill();
        x.fillStyle = "#e0402f"; x.fillRect(px - 5, 70, 10, 54); x.fillRect(px - 18, 85, 36, 9);
        x.fillStyle = "#2448b8"; x.font = `800 50px ${FONT}`; x.textAlign = "center"; x.textBaseline = "middle";
        ["꿈", "의", "숲", "교", "회"].forEach((ch, i) => x.fillText(ch, px, 182 + i * 62));
      }
    });
    const white = shared("#f2f1ec");
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.28, 32), white); base.position.y = 0.14; tower.add(base);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.135, 2.4, 40), new THREE.MeshStandardMaterial({ map: towerTex, roughness: 0.7 }));
    shaft.position.y = 1.48; shaft.castShadow = true;
    tower.add(shaft);
    tower.add(part(G.cyl, shared("#4a72c9"), [0.15, 0.08, 0.15], [0, 2.72, 0]));
    tower.add(part(G.cyl, white, [0.162, 0.05, 0.162], [0, 2.79, 0]));
    tower.add(part(G.cyl, shared("#dcdcd8"), [0.021, 0.28, 0.021], [0, 2.95, 0]));
    const crossMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4, emissive: "#fff1c2", emissiveIntensity: 0 });
    churchGlass.push(crossMat);
    tower.add(part(G.box, crossMat, [0.034, 0.34, 0.034], [0, 3.24, 0]), part(G.box, crossMat, [0.2, 0.034, 0.034], [0, 3.31, 0]));
    const crossGlow = glowSprite(0.72); crossGlow.position.set(0, 3.27, 0); tower.add(crossGlow);
    tower.rotation.y = 0.7 - Math.PI; // the name faces the camera at first
    bld.add(tower);
  }

  /* ---------- special days: the forest dresses up for a while ---------- */
  const EVENT_ITEMS: Record<ForestEvent, THREE.Object3D[]> = { seollal: [], easter: [], vbs: [], thanks: [], christmas: [] };
  const eventGroup = (key: ForestEvent, parent: THREE.Object3D = island) => { const g = new THREE.Group(); g.visible = false; parent.add(g); EVENT_ITEMS[key].push(g); return g; };
  const OBANG = ["#d94040", "#2f62c4", "#f2c230", "#f4f1ea", "#3f9a55", "#e86fa0"];
  const POLE_A = [-0.8, 1.72], POLE_B = [0.85, 1.68]; // two poles across the front of the yard
  const YARD_SPOT = [1.0, 1.2]; // the open corner in front of the church, right of the porch
  const poles = (group: THREE.Group, color: string, height: number) => {
    [POLE_A, POLE_B].forEach(([x, z]) => {
      group.add(placeAt(part(G.cyl, shared(color), [0.022, height, 0.022]), x, z, height / 2));
      group.add(placeAt(part(G.ballLo, shared("#e8b931"), 0.035), x, z, height + 0.02));
    });
  };
  const alongPoles = (u: number, height: number, sag: number) => {
    const x = POLE_A[0] + (POLE_B[0] - POLE_A[0]) * u, z = POLE_A[1] + (POLE_B[1] - POLE_A[1]) * u;
    return new THREE.Vector3(x, H(x, z) + height - Math.sin(u * Math.PI) * sag, z);
  };
  {
    // ---- 성탄절: a Christmas tree, presents, lights along the roof, a wreath and a snowman ----
    const xmas = eventGroup("christmas");
    const tree = new THREE.Group();
    tree.add(part(G.cyl, shared("#8d5f3d"), [0.06, 0.2, 0.06], [0, 0.1, 0]));
    [[0.46, 0.5, 0.42], [0.36, 0.45, 0.72], [0.24, 0.4, 0.98]].forEach(([r, h, y]) => tree.add(part(G.cone, shared("#2f6b47"), [r, h, r], [0, y, 0])));
    const bulbMats = ["#ff6b6b", "#ffd34d", "#6ab0ff", "#ffffff", "#7be07b"].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, roughness: 0.4 }));
    for (let i = 0; i < 34; i++) {
      const k = i / 34, y = 0.24 + k * 0.95, r = 0.47 * (1 - k * 0.8) + 0.01, a = k * Math.PI * 7;
      tree.add(part(G.ballLo, bulbMats[i % 5], 0.026, [Math.cos(a) * r, y, Math.sin(a) * r]));
    }
    for (let i = 0; i < 12; i++) {
      const k = rnd() * 0.8, a = rnd() * Math.PI * 2, r = 0.44 * (1 - k * 0.85);
      tree.add(part(G.ball, shared(pick(["#d94848", "#e8b931", "#4a7fd6"]), { roughness: 0.3, metalness: 0.3 }), 0.042, [Math.cos(a) * r, 0.28 + k * 0.9, Math.sin(a) * r]));
    }
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.05 : 0.12; if (i) starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape, { depth: 0.03, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: "#ffd34d", emissive: "#ffc21a", emissiveIntensity: 0.8, roughness: 0.4 }));
    star.geometry.translate(0, 0, -0.015); star.position.set(0, 1.28, 0);
    tree.add(star);
    const starGlow = glowSprite(0.7); starGlow.position.set(0, 1.28, 0); tree.add(starGlow);
    xmas.add(placeAt(tree, YARD_SPOT[0], YARD_SPOT[1]));
    ([[-0.38, 0.2, "#d94848", "#ffd34d"], [0.32, 0.28, "#4a7fd6", "#ffffff"], [0.05, 0.44, "#7cc06c", "#d94848"], [-0.22, -0.34, "#f4a84a", "#4a7fd6"]] as [number, number, string, string][]).forEach(([dx, dz, c, rb]) => {
      const g = new THREE.Group(), s = between(0.12, 0.17);
      g.add(part(G.box, shared(c), [s, s * 0.8, s], [0, s * 0.4, 0]));
      g.add(part(G.box, shared(rb), [s * 1.03, s * 0.83, 0.025], [0, s * 0.4, 0]), part(G.box, shared(rb), [0.025, s * 0.83, s * 1.03], [0, s * 0.4, 0]));
      g.rotation.y = rnd();
      xmas.add(placeAt(g, YARD_SPOT[0] + dx, YARD_SPOT[1] + dz));
    });
    const roofLights = eventGroup("christmas", churchBld);
    roofEdge.forEach((p, i) => {
      roofLights.add(part(G.ballLo, bulbMats[i % 5], 0.024, [p.x, p.y + 0.03, p.z]));
      if (i % 2 === 0) { const g = glowSprite(0.2); g.position.set(p.x, p.y + 0.03, p.z); roofLights.add(g); }
    });
    const wreath = eventGroup("christmas", porchFrame);
    wreath.add(part(G.torus, shared("#2f7a4b"), [0.75, 0.75, 1.8], [0, 0.5, 0.31]));
    [[-0.025, 0.43], [0.025, 0.43]].forEach(([x, y]) => wreath.add(part(G.ballLo, shared("#d94848"), 0.02, [x, y, 0.33])));
    const [sx, sz] = spotsNear(1.6, 2.9, 1, 0.8, 0.2, 0.05)[0] ?? [1.6, 2.9];
    const snowman = new THREE.Group();
    snowman.add(part(G.ball, shared("#fbfdff"), 0.16, [0, 0.14, 0]), part(G.ball, shared("#fbfdff"), 0.11, [0, 0.36, 0]));
    snowman.add(part(G.cyl, shared("#2b2f36"), [0.07, 0.1, 0.07], [0, 0.52, 0]), part(G.cyl, shared("#2b2f36"), [0.1, 0.012, 0.1], [0, 0.47, 0]));
    const nose = part(G.cone, shared("#f08a3c"), [0.018, 0.07, 0.018], [0, 0.37, 0.12]); nose.rotation.x = Math.PI / 2; snowman.add(nose);
    [-0.035, 0.035].forEach((x) => snowman.add(part(G.ballLo, shared("#2b2f36"), 0.012, [x, 0.4, 0.1])));
    const scarf = part(G.torus, shared("#d94848"), [0.75, 0.75, 1.2], [0, 0.29, 0]); scarf.rotation.x = Math.PI / 2; snowman.add(scarf);
    snowman.rotation.y = 0.5;
    xmas.add(placeAt(snowman, sx, sz));
    anim.push((t) => {
      if (!xmas.visible) return;
      star.rotation.y = t * 0.8;
      bulbMats.forEach((m, i) => (m.emissiveIntensity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.6 + i * 1.7))));
    });

    // ---- 설날: lucky pouches across the yard, a shield kite, pinwheels by the path, yut sticks on a mat ----
    const ny = eventGroup("seollal");
    poles(ny, "#b5432f", 0.75);
    ny.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 13 }, (_, i) => alongPoles(i / 12, 0.7, 0.1))), new THREE.LineBasicMaterial({ color: "#8a6a4e" })));
    for (let i = 0; i < 7; i++) {
      const p = alongPoles((i + 0.5) / 7, 0.7, 0.1), col = OBANG[i % 6];
      const pouch = new THREE.Group();
      pouch.add(part(G.ball, shared(col), [0.055, 0.06, 0.05], [0, -0.08, 0]));
      pouch.add(part(G.cone, shared(col), [0.028, 0.05, 0.028], [0, -0.02, 0]));
      const tie = part(G.torus, shared("#e8b931"), [0.3, 0.3, 0.6], [0, -0.035, 0]); tie.rotation.x = Math.PI / 2; pouch.add(tie);
      pouch.position.copy(p); ny.add(pouch);
    }
    const kiteTex = canvasTexture(128, 160, (x) => {
      x.fillStyle = "#fbfaf4"; x.fillRect(0, 0, 128, 160);
      x.fillStyle = "#d94040"; x.beginPath(); x.arc(64, 28, 17, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#f2c230"; x.fillRect(0, 116, 128, 12);
      x.fillStyle = "#2f62c4"; x.fillRect(0, 128, 128, 32);
      x.globalCompositeOperation = "destination-out"; x.beginPath(); x.arc(64, 78, 22, 0, Math.PI * 2); x.fill(); x.globalCompositeOperation = "source-over";
      x.strokeStyle = "#8a6a4e"; x.lineWidth = 4; x.strokeRect(2, 2, 124, 156);
    });
    const shieldKite = new THREE.Group();
    shieldKite.add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.62), new THREE.MeshStandardMaterial({ map: kiteTex, transparent: true, side: THREE.DoubleSide, roughness: 0.8 })));
    ([[-0.16, "#2f62c4"], [0.16, "#d94040"]] as [number, string][]).forEach(([x, c]) => { const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.55), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide })); tail.position.set(x, -0.58, 0); shieldKite.add(tail); });
    ny.add(shieldKite);
    const kiteLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: "#8a7a6a" }));
    ny.add(kiteLine);
    const pinwheels: THREE.Group[] = [];
    [[-0.42, 2.65], [0.45, 2.75], [-0.35, 3.6], [0.5, 3.25], [-1.0, 2.3]].forEach(([x, z], i) => {
      const pw = new THREE.Group();
      pw.add(part(G.cyl, shared("#c9a27a"), [0.012, 0.42, 0.012], [0, 0.21, 0]));
      const blades = new THREE.Group(); blades.position.set(0, 0.42, 0.02);
      for (let b = 0; b < 4; b++) {
        const bl = new THREE.Mesh(new THREE.CircleGeometry(0.075, 3), new THREE.MeshStandardMaterial({ color: OBANG[(i + b) % 6], side: THREE.DoubleSide }));
        bl.rotation.z = (b * Math.PI) / 2; bl.position.set(Math.cos((b * Math.PI) / 2) * 0.035, Math.sin((b * Math.PI) / 2) * 0.035, 0);
        blades.add(bl);
      }
      pw.add(blades); pw.rotation.y = between(-0.3, 0.3);
      ny.add(placeAt(pw, x, z)); pinwheels.push(blades);
    });
    const yut = new THREE.Group();
    const yutBase = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), shared("#e8b931")); yutBase.rotation.x = -Math.PI / 2; yutBase.position.y = 0.014;
    const yutCloth = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.48), shared("#c94a3a")); yutCloth.rotation.x = -Math.PI / 2; yutCloth.position.y = 0.017;
    yut.add(yutBase, yutCloth);
    ([[-0.1, -0.06, 0.3, "#e8cfa0"], [0.06, -0.1, -0.4, "#e8cfa0"], [0.1, 0.08, 1.2, "#b98a55"], [-0.06, 0.12, 0.9, "#e8cfa0"]] as [number, number, number, string][]).forEach(([x, z, r, c]) => {
      const st = part(G.box, shared(c), [0.045, 0.022, 0.2], [x, 0.03, z]); st.rotation.y = r; yut.add(st);
    });
    yut.rotation.y = 0.4;
    ny.add(placeAt(yut, YARD_SPOT[0], YARD_SPOT[1]));
    anim.push((t, dt) => {
      if (!ny.visible) return;
      shieldKite.position.set(-1.7 + Math.sin(t * 0.6) * 0.2, 4.0 + Math.sin(t * 0.9) * 0.15, 1.3);
      shieldKite.lookAt(camera.position.x, shieldKite.position.y, camera.position.z);
      shieldKite.rotateZ(Math.sin(t * 0.8) * 0.15);
      const lp = kiteLine.geometry.attributes.position as THREE.BufferAttribute;
      lp.setXYZ(0, shieldKite.position.x, shieldKite.position.y - 0.3, shieldKite.position.z);
      lp.setXYZ(1, -0.75, PLAZA_Y + 0.05, 1.35); lp.needsUpdate = true;
      pinwheels.forEach((b) => (b.rotation.z -= dt * 3));
    });

    // ---- 부활절: painted eggs hidden in the grass, a basket of eggs, white lilies along the church ----
    const ea = eventGroup("easter");
    const eggMats = [["#f7a8c4", "#e86fa0"], ["#9fd0f5", "#4a90d9"], ["#ffe27a", "#f2a93b"], ["#b9e3a0", "#5fae5a"], ["#d3b8f3", "#9a6fd6"]].map(([bg, dots]) => new THREE.MeshStandardMaterial({
      roughness: 0.6,
      map: canvasTexture(64, 64, (x) => {
        x.fillStyle = bg; x.fillRect(0, 0, 64, 64);
        x.fillStyle = "#ffffff"; x.fillRect(0, 17, 64, 7); x.fillRect(0, 40, 64, 7);
        x.fillStyle = dots; for (let k = 0; k < 6; k++) { x.beginPath(); x.arc(k * 11 + 5, 32, 3.5, 0, Math.PI * 2); x.fill(); }
      }),
    }));
    const egg = (m: THREE.Material) => part(G.ball, m, [0.05, 0.068, 0.05]);
    for (let tries = 0, n = 0; tries < 3000 && n < 22; tries++) {
      const [x, z] = meadow();
      if (!freeSpot(x, z, -0.1)) continue;
      const e = egg(eggMats[n % 5]); e.rotation.set(between(-0.4, 0.4), rnd() * 6, between(-0.4, 0.4));
      ea.add(placeAt(e, x, z, 0.05)); n++;
    }
    const eggBasket = new THREE.Group();
    eggBasket.add(part(G.cyl, shared("#c98e55"), [0.17, 0.12, 0.17], [0, 0.06, 0]));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.014, 8, 24, Math.PI), shared("#b07a45")); handle.position.y = 0.12; eggBasket.add(handle);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, e = egg(eggMats[i % 5]); e.position.set(Math.cos(a) * 0.09, 0.15, Math.sin(a) * 0.09); e.rotation.z = Math.cos(a) * 0.5; eggBasket.add(e); }
    ea.add(placeAt(eggBasket, YARD_SPOT[0], YARD_SPOT[1]));
    [-0.78, -0.68, -0.58, 0.6, 0.7].forEach((x, i) => {
      const lily = new THREE.Group();
      lily.add(part(G.cyl, shared("#5f9a52"), [0.008, 0.26, 0.008], [0, 0.13, 0]));
      lily.add(part(G.ball, shared("#6aa35c"), [0.05, 0.015, 0.02], [0.03, 0.1, 0]));
      const bloom = part(G.cone, shared("#ffffff"), [0.04, 0.08, 0.04], [0, 0.28, 0]); bloom.rotation.x = Math.PI; lily.add(bloom);
      lily.add(part(G.ballLo, shared("#f2c230"), 0.012, [0, 0.3, 0]));
      lily.position.set(x, PLAZA_Y, 0.79 + (i % 2) * 0.05);
      ea.add(lily);
    });

    // ---- 여름성경학교: a banner across the yard, a striped tent and bunches of balloons ----
    const vb = eventGroup("vbs");
    poles(vb, "#5b8fd6", 0.85);
    const bannerTex = canvasTexture(512, 112, (x) => {
      x.fillStyle = "#ffffff"; x.fillRect(0, 0, 512, 112);
      const cols = ["#ef6b6b", "#f4a84a", "#ffd23f", "#6cc18a", "#5b9be0", "#a88be0"];
      for (let i = 0; i < 32; i++) { x.fillStyle = cols[i % 6]; x.fillRect(i * 16, 0, 16, 10); x.fillRect(i * 16, 102, 16, 10); }
      x.fillStyle = "#1f4fb3"; x.font = `800 58px ${FONT}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("여름성경학교", 256, 58);
    });
    const bw = Math.hypot(POLE_B[0] - POLE_A[0], POLE_B[1] - POLE_A[1]) - 0.06;
    const bMid = alongPoles(0.5, 0.62, 0);
    [0, Math.PI].forEach((flip) => {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw / 4.57), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.8 }));
      b.position.copy(bMid); b.rotation.y = -Math.atan2(POLE_B[1] - POLE_A[1], POLE_B[0] - POLE_A[0]) + flip;
      vb.add(b);
    });
    const tentTex = canvasTexture(64, 64, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "#ffffff" : "#5b9be0"; x.fillRect(i * 8, 0, 8, 64); } });
    const tentMat = new THREE.MeshStandardMaterial({ map: tentTex, roughness: 0.8 });
    const tent = new THREE.Group();
    [[-1, -0.62], [1, 0.62]].forEach(([sgn, rz]) => { const slab = part(G.box, tentMat, [0.02, 0.52, 0.62], [sgn * 0.15, 0.21, 0]); slab.rotation.z = rz; tent.add(slab); });
    const triangle = new THREE.Shape(); triangle.moveTo(-0.3, 0); triangle.lineTo(0.3, 0); triangle.lineTo(0, 0.42); triangle.closePath();
    const back = new THREE.Mesh(new THREE.ShapeGeometry(triangle), shared("#4a86cf")); back.position.z = -0.3; tent.add(back);
    const inside = new THREE.Mesh(new THREE.ShapeGeometry(triangle), shared("#2c3e5a")); inside.position.z = -0.28; inside.scale.setScalar(0.9); tent.add(inside);
    const flag = new THREE.Mesh(new THREE.CircleGeometry(0.06, 3), new THREE.MeshStandardMaterial({ color: "#ef6b6b", side: THREE.DoubleSide })); flag.position.set(0.05, 0.53, 0.3);
    tent.add(flag, part(G.cyl, shared("#8a6a4e"), [0.008, 0.16, 0.008], [0, 0.48, 0.3]));
    tent.rotation.y = -0.5;
    vb.add(placeAt(tent, YARD_SPOT[0], YARD_SPOT[1]));
    const bunches: [THREE.Group, number][] = [];
    ([[POLE_A, 0.85], [POLE_B, 0.85], [[YARD_SPOT[0] + 0.3, YARD_SPOT[1] + 0.3], 0.02]] as [number[], number][]).forEach(([[x, z], h], j) => {
      const bunch = new THREE.Group();
      [[0, 0.32, 0], [0.09, 0.27, 0.03], [-0.08, 0.28, -0.03]].forEach(([bx, by, bz], i) => {
        bunch.add(part(G.ball, shared(["#ef6b6b", "#ffd23f", "#5b9be0", "#6cc18a", "#a88be0"][(i + j * 2) % 5], { roughness: 0.35 }), [0.07, 0.085, 0.07], [bx, by, bz]));
        bunch.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(bx, by - 0.08, bz), new THREE.Vector3(0, 0, 0)]), new THREE.LineBasicMaterial({ color: "#8a7a6a" })));
      });
      vb.add(placeAt(bunch, x, z, h)); bunches.push([bunch, bunch.position.y]);
    });
    anim.push((t) => { if (vb.visible) bunches.forEach(([b, y], i) => { b.position.y = y + Math.sin(t * 1.6 + i) * 0.03; b.rotation.z = Math.sin(t * 1.1 + i) * 0.06; }); });

    // ---- 추수감사절: pumpkins, baskets of fruit, sheaves of rice straw and a scarecrow ----
    const th = eventGroup("thanks");
    const pumpkin = (s: number) => {
      const g = new THREE.Group(), m = shared(pick(["#e8893a", "#f0a04b", "#dd7a2f"]));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const lobe = part(G.ball, m, [0.055 * s, 0.07 * s, 0.036 * s], [Math.cos(a) * 0.045 * s, 0.066 * s, Math.sin(a) * 0.045 * s]); lobe.rotation.y = -a; g.add(lobe);
      }
      g.add(part(G.cyl, shared("#6b8a3a"), [0.012 * s, 0.05 * s, 0.012 * s], [0, 0.14 * s, 0]));
      return g;
    };
    [[0.62, 1.05, 1.4], [0.8, 1.12, 1.0], [-0.56, 1.06, 1.3], [-0.7, 1.16, 0.9], [0.3, 2.3, 1.1], [-0.3, 2.95, 1.0], [0.38, 3.4, 1.2], [-1.2, 2.55, 1.0]].forEach(([x, z, s]) => {
      const p = pumpkin(s); p.rotation.y = rnd() * 6; th.add(placeAt(p, x, z));
    });
    [[YARD_SPOT[0], YARD_SPOT[1]], [1.45, 0.9]].forEach(([x, z], j) => {
      const b = new THREE.Group();
      b.add(part(G.cyl, shared("#c98e55"), [0.15, 0.1, 0.15], [0, 0.05, 0]));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.add(part(G.ball, shared(j ? "#7a4fa0" : "#d9443a", { roughness: 0.5 }), 0.045, [Math.cos(a) * 0.07, 0.12, Math.sin(a) * 0.07])); }
      b.add(part(G.ball, shared(j ? "#8a5cb0" : "#e8b931", { roughness: 0.5 }), 0.05, [0, 0.16, 0]));
      th.add(placeAt(b, x, z));
    });
    [[1.2, 0.62], [-1.5, 0.15], [1.25, -0.75]].forEach(([x, z]) => {
      const sheaf = new THREE.Group();
      sheaf.add(part(G.cyl, shared("#e3c26a"), [0.07, 0.3, 0.07], [0, 0.15, 0]));
      const head = part(G.cone, shared("#d8b45a"), [0.11, 0.16, 0.11], [0, 0.36, 0]); head.rotation.x = Math.PI; sheaf.add(head);
      const band = part(G.torus, shared("#8a6a3e"), [0.75, 0.75, 1.2], [0, 0.2, 0]); band.rotation.x = Math.PI / 2; sheaf.add(band);
      th.add(placeAt(sheaf, x, z));
    });
    const [kx, kz] = spotsNear(2.2, 2.9, 1, 0.7, 0.2, 0.05)[0] ?? [2.2, 2.9];
    const crow = new THREE.Group();
    crow.add(part(G.cyl, shared("#9a6a44"), [0.018, 0.62, 0.018], [0, 0.31, 0]));
    crow.add(part(G.box, shared("#9a6a44"), [0.4, 0.025, 0.025], [0, 0.44, 0]));
    crow.add(part(G.box, shared("#5b8fd6"), [0.18, 0.2, 0.08], [0, 0.4, 0]));
    crow.add(part(G.ball, shared("#f2d7a6"), 0.07, [0, 0.58, 0]));
    crow.add(part(G.cyl, shared("#d9b45a"), [0.13, 0.012, 0.13], [0, 0.63, 0]), part(G.cone, shared("#d9b45a"), [0.07, 0.08, 0.07], [0, 0.67, 0]));
    crow.rotation.y = -0.6;
    th.add(placeAt(crow, kx, kz));
  }

  /* ---------- the sky above the island ---------- */
  const cloud = (scale: number) => {
    const g = new THREE.Group();
    [[0, 0, 0, 0.5], [0.45, -0.08, 0.1, 0.38], [-0.45, -0.1, -0.05, 0.36], [0.15, 0.22, 0, 0.36], [-0.2, 0.15, 0.15, 0.32]].forEach(([x, y, z, r]) => {
      const m = part(G.ball, shared("#ffffff", { roughness: 1 }), r, [x, y, z]); m.castShadow = false; g.add(m);
    });
    g.scale.setScalar(scale); return g;
  };
  {
    const c1 = addThing(49, cloud(1.15));
    anim.push((t) => { if (!c1.visible) return; const a = t * 0.05; c1.position.set(Math.cos(a) * 9.4, 6.8, Math.sin(a) * 9.4); });
    [0, 1].forEach((i) => { const c = addThing(50, cloud(0.7)); anim.push((t) => { if (!c.visible) return; const a = -t * 0.07 + i * 3; c.position.set(Math.cos(a) * 8.8, 6.0 + i * 0.7, Math.sin(a) * 8.8); }); });
    // 53 a kite above the meadow
    const kite = new THREE.Group();
    const kshape = new THREE.Shape(); kshape.moveTo(0, 0.22); kshape.lineTo(0.15, 0); kshape.lineTo(0, -0.26); kshape.lineTo(-0.15, 0); kshape.closePath();
    kite.add(new THREE.Mesh(new THREE.ShapeGeometry(kshape), new THREE.MeshStandardMaterial({ color: "#f28b82", side: THREE.DoubleSide })));
    kite.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.26, 0), new THREE.Vector3(-0.6, -1.4, 0.3), new THREE.Vector3(-1.1, -2.8, 0.5)]), new THREE.LineBasicMaterial({ color: "#8a7a6a" })));
    addThing(53, kite);
    anim.push((t) => { if (!kite.visible) return; kite.position.set(2.2 + Math.sin(t * 0.7) * 0.25, 3.6 + Math.sin(t * 1.1) * 0.15, 2.2); kite.lookAt(camera.position.x, kite.position.y, camera.position.z); kite.rotateZ(Math.sin(t * 0.9) * 0.25); });
    // 56 a hot-air balloon drifts round
    const bal = new THREE.Group();
    bal.add(part(G.ball, mat("#f4a84a"), [0.42, 0.5, 0.42], [0, 0.5, 0]));
    for (let i = 0; i < 4; i++) { const st = part(G.ball, mat("#fff4e0"), [0.08, 0.5, 0.43], [0, 0.5, 0]); st.rotation.y = (i * Math.PI) / 4; bal.add(st); }
    bal.add(part(G.box, shared("#b98256"), [0.18, 0.14, 0.18], [0, -0.12, 0]));
    addThing(56, bal);
    anim.push((t) => { if (!bal.visible) return; const a = t * 0.06 + 2; bal.position.set(Math.cos(a) * 9.8, 5.6 + Math.sin(t * 0.5) * 0.2, Math.sin(a) * 9.8); });
  }

  /* ---------- the fruit forest ---------- */
  {
    // 57 a swing on a big tree
    const host = trees.find((t) => t.userData.first && t.userData.kind === "round") ?? trees[0];
    const swing = new THREE.Group();
    [-0.08, 0.08].forEach((x) => swing.add(part(G.cyl, shared("#a88560"), [0.006, 0.42, 0.006], [x, 0.36, 0])));
    swing.add(part(G.box, shared("#c58e5c"), [0.22, 0.025, 0.08], [0, 0.15, 0]));
    swing.position.set(host.position.x + 0.32, host.position.y, host.position.z + 0.05);
    addThing(57, swing);
    anim.push((t) => { if (swing.visible) swing.rotation.x = Math.sin(t * 1.6) * 0.18; });
    // 61 a picnic mat and 58 a basket of persimmons on it
    const matTex = new THREE.CanvasTexture(draw2d(64, 64, (x) => {
      x.fillStyle = "#ffffff"; x.fillRect(0, 0, 64, 64);
      x.fillStyle = "#f5aea2"; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) x.fillRect(i * 16, j * 16, 16, 16);
    }));
    const picnic = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.55), new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.9 }));
    picnic.rotation.x = -Math.PI / 2; picnic.receiveShadow = true;
    const mx = -2.2, mz = 3.1;
    picnic.position.set(mx, H(mx, mz) + 0.03, mz);
    addThing(61, picnic);
    const basket = new THREE.Group();
    basket.add(part(G.cyl, shared("#c98e55"), [0.11, 0.08, 0.11], [0, 0.04, 0]));
    [[0.04, 0.1, 0.02], [-0.04, 0.1, -0.02], [0, 0.11, -0.04], [0.02, 0.15, 0]].forEach((p) => basket.add(part(G.ballLo, shared("#f2994a", { roughness: 0.6 }), 0.05, p)));
    addThing(58, placeAt(basket, mx + 0.15, mz - 0.05, 0.03));
    // 59 a little pavilion
    const pav = new THREE.Group();
    pav.add(part(G.cyl, shared("#e3cfae"), [0.48, 0.05, 0.48], [0, 0.025, 0]));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; pav.add(part(G.cyl, shared("#b8845a"), [0.025, 0.5, 0.025], [Math.cos(a) * 0.4, 0.28, Math.sin(a) * 0.4])); }
    const proof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.38, 6), shared("#cf7258")); proof.position.y = 0.72; proof.castShadow = true; pav.add(proof);
    pav.add(part(G.ballLo, shared("#ffd25a"), 0.04, [0, 0.93, 0]));
    addThing(59, placeAt(pav, PAVILION.x, PAVILION.z));
    // 62 a treehouse in a big tree
    const tall = trees.find((t) => !t.userData.first && t.userData.kind === "round" && t.userData.at < 30) ?? trees[2];
    const house = new THREE.Group();
    house.add(part(G.box, shared("#c58e5c"), [0.36, 0.03, 0.36], [0, 0, 0]), part(G.box, shared("#eab57d"), [0.22, 0.16, 0.2], [0, 0.1, 0]));
    const throof = part(G.cone, shared("#cf7258"), [0.2, 0.13, 0.2], [0, 0.24, 0]); throof.rotation.y = Math.PI / 4; house.add(throof);
    house.add(part(G.box, mat("#fff1c6", { emissive: "#ffd27a", emissiveIntensity: 0.4 }), [0.06, 0.06, 0.01], [0, 0.11, 0.101]));
    house.position.set(tall.position.x, tall.position.y + 0.62, tall.position.z);
    addThing(62, house);
    // 64 the great tree on the hill behind the church
    const great = makeTree("fruit", 2.1);
    great.userData.great = true;
    placeAt(great, HILLTREE.x, HILLTREE.z);
    const halo = glowSprite(2.3, glowTexture("rgba(255,244,190,0.6)", "rgba(255,226,140,0.22)")); halo.position.set(0, 1.4, 0); great.add(halo);
    great.userData.at = 64;
    addThing(64, great);
  }

  /* ---------- fireflies (55) ---------- */
  const flyCount = 70;
  const flyGeo = new THREE.BufferGeometry();
  const flyPos = new Float32Array(flyCount * 3);
  const flyBase: Vec[] = [];
  for (let i = 0; i < flyCount; i++) {
    const [cx, cz, sp] = pick(GROVES);
    const a = rnd() * Math.PI * 2, d = rnd() * sp * 1.5;
    flyBase.push([cx + Math.cos(a) * d, between(0.35, 1.5), cz + Math.sin(a) * d, rnd() * 6]);
  }
  flyGeo.setAttribute("position", new THREE.BufferAttribute(flyPos, 3));
  const flies = new THREE.Points(flyGeo, new THREE.PointsMaterial({ map: glowTexture("rgba(255,255,220,1)", "rgba(240,255,140,0.6)"), size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4 }));
  flies.visible = false;
  island.add(flies);

  /* ---------- falling things: petals, leaves, snow, and the rain of busy weeks ---------- */
  const flakeTexture = (kind: "petal" | "leaf" | "snow") => new THREE.CanvasTexture(draw2d(32, 32, (x) => {
    if (kind === "snow") { const g = x.createRadialGradient(16, 16, 0, 16, 16, 14); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 32, 32); }
    else { x.fillStyle = kind === "petal" ? "#f8c3d3" : "#e9964a"; x.beginPath(); x.ellipse(16, 16, kind === "petal" ? 9 : 11, kind === "petal" ? 6 : 7, 0.6, 0, Math.PI * 2); x.fill(); }
  }));
  const FLAKES: Partial<Record<Season, THREE.Texture>> = { spring: flakeTexture("petal"), autumn: flakeTexture("leaf"), winter: flakeTexture("snow") };
  const FALL_N = 140;
  const fallGeo = new THREE.BufferGeometry();
  const fallPos = new Float32Array(FALL_N * 3);
  for (let i = 0; i < FALL_N; i++) { fallPos[i * 3] = between(-6, 6); fallPos[i * 3 + 1] = between(0, 8); fallPos[i * 3 + 2] = between(-6, 6); }
  fallGeo.setAttribute("position", new THREE.BufferAttribute(fallPos, 3));
  const fallPts = new THREE.Points(fallGeo, new THREE.PointsMaterial({ size: 0.16, transparent: true, depthWrite: false }));
  scene.add(fallPts);
  const RAIN_N = 220;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_N * 6);
  for (let i = 0; i < RAIN_N; i++) { const x = between(-5, 5), y = between(0, 8), z = between(-5, 5); rainPos.set([x, y, z, x, y - 0.25, z], i * 6); }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: "#8fcaf2", transparent: true, opacity: 0.45 }));
  rain.visible = false;
  scene.add(rain);

  /* ---------- sparkles over what is new this week ---------- */
  const sparkTex = new THREE.CanvasTexture(draw2d(64, 64, (x) => {
    x.fillStyle = "#ffe27a"; x.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 9 : 30; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    x.closePath(); x.fill();
  }));
  const sparkles: THREE.Sprite[] = [];
  function sparkleAt(obj: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const big = Math.max(size.x, size.z) > 2;
    for (let i = 0; i < (big ? 6 : 3); i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false }));
      const spread = big ? 1.4 : Math.max(0.25, size.length() * 0.6);
      s.position.set(c.x + between(-spread, spread), c.y + between(0.1, 0.5) + (big ? 0.3 : size.y * 0.5), c.z + between(-spread, spread));
      s.userData = { life: 1, delay: i * 0.25, base: big ? 0.35 : 0.28 };
      scene.add(s); sparkles.push(s);
    }
  }

  /* ---------------- applying the state ---------------- */
  const GROUND: Record<Season, string[][]> = {
    spring: [["#cfdc9f", "#c3d290"], ["#bbd98f", "#abcf80"], ["#a8d386", "#99c978"], ["#9acd7c", "#8cc26e"]],
    summer: [["#c4d68f", "#b8cb82"], ["#a3cf7c", "#93c46e"], ["#90c76f", "#81bc62"], ["#83c065", "#75b558"]],
    autumn: [["#d6cf94", "#cbc386"], ["#cfc888", "#c3ba78"], ["#c7c07a", "#bab26b"], ["#bfb870", "#b1a962"]],
    winter: [["#eef2f6", "#e3e9ef"], ["#eef2f6", "#e3e9ef"], ["#eff3f7", "#e4eaf0"], ["#f0f4f8", "#e5ebf1"]],
  };
  let lastPaint = "";
  function paintGround(season: Season, count: number) {
    const stage = count < 8 ? 0 : count < 24 ? 1 : count < 40 ? 2 : 3;
    const key = `${season}:${stage}:${count >= 33}`;
    if (key === lastPaint) return;
    lastPaint = key;
    const [a, b] = GROUND[season][stage];
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    const path = new THREE.Color(season === "winter" ? "#f8f5ee" : "#ead9ae");
    const p = groundGeo.attributes.position, col = groundGeo.attributes.color, c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const n = 0.5 + 0.25 * (Math.sin(x * 2.1 + z * 1.3) + Math.sin(x * 0.7 - z * 2.4));
      c.copy(ca).lerp(cb, n);
      if (count >= 33) {
        const d = Math.min(distToLine(x, z, PATH), distToLine(x, z, PATH2) + 0.05);
        if (d < 0.42) c.lerp(path, d < 0.3 ? 1 : (0.42 - d) / 0.12);
      }
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  function paintTrees(season: Season) {
    trees.concat(things[63] as THREE.Group[]).forEach((t) => {
      const u = t.userData;
      const pal = LEAF[season][u.kind] ?? LEAF[season].round;
      (u.canopy as THREE.Mesh[]).forEach((m, i) => {
        let color = pal[(u.tone + i) % pal.length];
        if (u.kind === "cone" && season === "winter" && i === 2) color = "#f4f7fa";
        if (u.great && season !== "winter") color = LEAF[season === "autumn" ? "autumn" : "summer"].round[(i + 1) % 3];
        (m.material as THREE.MeshStandardMaterial).color.set(color);
      });
      (u.fruit as THREE.Mesh[]).forEach((f) => (f.visible = season === "autumn" || !!u.great || (u.kind === "fruit" && season === "summer")));
    });
    grassMat.color.set({ spring: "#86c06f", summer: "#6fb35f", autumn: "#bdb465", winter: "#dfe6ec" }[season]);
    heads.visible = stems.visible = season !== "winter";
    winterOnly.forEach((o) => (o.visible = season === "winter"));
    const flake = FLAKES[season];
    fallPts.visible = !!flake && !REDUCED;
    if (flake) { fallPts.material.map = flake; fallPts.material.size = season === "winter" ? 0.13 : 0.17; fallPts.material.needsUpdate = true; }
  }

  function paintTime(time: TimeOfDay) {
    const night = time === "night", evening = time === "evening";
    hemi.color.set(night ? "#7f8fc8" : evening ? "#ffd9c2" : "#ffffff");
    hemi.groundColor.set(night ? "#2c3a4a" : evening ? "#9a8a7a" : "#b7d39c");
    hemi.intensity = night ? 0.45 : evening ? 1.0 : 1.5;
    sun.color.set(night ? "#a9b8ff" : evening ? "#ffad73" : "#fff4e2");
    sun.intensity = night ? 0.55 : evening ? 1.5 : 2.4;
    sun.position.set(evening ? 11 : 7, evening ? 5 : 13, evening ? 2 : 6);
    const glowOn = night ? 1 : evening ? 0.8 : 0;
    glows.forEach((g) => (g.material.opacity = glowOn));
    churchGlass.forEach((m) => (m.emissiveIntensity = night ? 0.85 : evening ? 0.5 : 0));
    flies.material.opacity = night ? 1 : evening ? 0.85 : 0.35;
  }

  function treeScale(t: THREE.Object3D, count: number) {
    const u = t.userData;
    if (u.first) return (0.45 + 0.6 * Math.min(1, count / 44)) * u.var;
    if (count < u.at) return 0;
    return Math.min(1, 0.4 + (count - u.at) * 0.08) * u.var;
  }

  let current = initial;
  function apply(s: SceneState) {
    current = s;
    const count = Math.max(0, Math.min(64, s.count));
    const show = (o: THREE.Object3D, target: number) => {
      if (target > 0 && !o.visible) { o.visible = true; o.scale.setScalar(REDUCED ? target : 0.001); }
      if (target === 0) { o.visible = false; o.scale.setScalar(0.001); }
      o.userData.target = target;
    };
    things.forEach((list, i) => list.forEach((o) => show(o, i < count ? (o.userData.great ? o.userData.big : 1) : 0)));
    trees.forEach((t) => show(t, treeScale(t, count)));
    grass.count = GRASS_STEPS.filter((n) => n <= count).length;
    heads.count = stems.count = flowerList.filter((f) => f.step <= count).length;
    flies.visible = count >= 55;
    rain.visible = s.rain && count < 64 && !REDUCED;
    (Object.keys(EVENT_ITEMS) as ForestEvent[]).forEach((key) => EVENT_ITEMS[key].forEach((o) => (o.visible = key === s.event)));
    paintGround(s.season, count);
    paintTrees(s.season);
    paintTime(s.time);
  }

  function sparkleFresh() {
    const count = Math.min(64, current.count), from = count - current.fresh;
    for (let i = from; i < count; i++) things[i].forEach(sparkleAt);
    trees.filter((t) => !t.userData.first && t.userData.at > from && t.userData.at <= count).forEach(sparkleAt);
  }

  /* ---------------- size and camera ---------------- */
  let fitted = false;
  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Step back far enough that the whole island fits across a narrow phone.
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
    HOME.dist = Math.max(19, 5.7 / Math.tan(half));
    controls.maxDistance = HOME.dist + 6;
    if (!fitted) { camera.position.sub(controls.target).setLength(HOME.dist).add(controls.target); fitted = true; }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(view);
  resize();
  apply(initial);

  /* ---------------- the loop ---------------- */
  const clock = new THREE.Clock();
  let raf = 0;
  const grow = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const target = o.userData.target ?? 0;
    if (REDUCED) { o.scale.setScalar(Math.max(0.001, target)); return; }
    const s = o.scale.x;
    const v = (o.userData.v ?? 0) * 0.78 + (target - s) * 0.16;
    o.userData.v = v;
    o.scale.setScalar(Math.max(0.001, s + v));
  };
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    island.position.y = REDUCED ? 0 : Math.sin(t * 0.6) * 0.07;
    trees.forEach(grow);
    things.forEach((list) => list.forEach(grow));
    if (!REDUCED) {
      trees.forEach((tr, i) => { if (tr.visible) tr.rotation.z = Math.sin(t * 0.8 + i) * 0.012; });
      anim.forEach((fn) => fn(t, dt));
    } else {
      anim.forEach((fn) => fn(0, 0));
    }
    if (flies.visible) {
      for (let i = 0; i < flyCount; i++) {
        const [x, y, z, ph] = flyBase[i];
        const k = REDUCED ? 0 : t;
        flyPos[i * 3] = x + Math.sin(k * 0.7 + ph) * 0.25; flyPos[i * 3 + 1] = y + Math.sin(k * 1.1 + ph * 2) * 0.15; flyPos[i * 3 + 2] = z + Math.cos(k * 0.6 + ph) * 0.25;
      }
      flyGeo.attributes.position.needsUpdate = true;
    }
    if (fallPts.visible) {
      const speed = fallPts.material.map === FLAKES.winter ? 0.55 : 0.75;
      for (let i = 0; i < FALL_N; i++) {
        let y = fallPos[i * 3 + 1] - dt * speed;
        fallPos[i * 3] += Math.sin(t + i) * dt * 0.25;
        if (y < -1) { y = 8; fallPos[i * 3] = between(-6, 6); fallPos[i * 3 + 2] = between(-6, 6); }
        fallPos[i * 3 + 1] = y;
      }
      fallGeo.attributes.position.needsUpdate = true;
    }
    if (rain.visible) {
      for (let i = 0; i < RAIN_N; i++) {
        let y = rainPos[i * 6 + 1] - dt * 6;
        if (y < -0.5) y = 8;
        rainPos[i * 6 + 1] = y; rainPos[i * 6 + 4] = y - 0.25;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i], u = s.userData;
      if (u.delay > 0) { u.delay -= dt; s.material.opacity = 0; continue; }
      u.life -= dt / 3.2;
      const pulse = Math.sin((1 - u.life) * Math.PI * 4) * 0.35 + 0.65;
      s.material.opacity = Math.max(0, Math.min(1, u.life * 1.6)) * pulse;
      s.scale.setScalar(u.base * (0.7 + pulse * 0.6));
      s.position.y += dt * 0.12;
      if (u.life <= 0) { scene.remove(s); s.material.dispose(); sparkles.splice(i, 1); }
    }
    controls.update();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    update: apply,
    sparkleFresh: () => { if (!REDUCED) sparkleFresh(); },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      const seen = new Set<object>();
      const free = (o: { dispose(): void } | null | undefined) => { if (o && !seen.has(o)) { seen.add(o); o.dispose(); } };
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        free(m.geometry);
        for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
          if (!material) continue;
          free((material as THREE.MeshStandardMaterial).map);
          free(material);
        }
      });
      Object.values(FLAKES).forEach(free);
      renderer.dispose();
      // Give the drawing context back now: a browser keeps only a few, and children go back and forth.
      renderer.forceContextLoss();
    },
  };
}
