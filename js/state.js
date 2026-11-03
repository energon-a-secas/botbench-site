import { createStore } from './neorgon-persist.js';
import { HUBS, DEVICES, KITS } from './catalog.js';
import { DEFAULT_BUILDS, cloneBuild, repairDrive } from './build.js';
import { PRESETS, SENSORS } from './brain.js';
import { ARENAS } from './sim.js';

const store = createStore({ key: 'botbench-site:workbench', version: 1 });

export const TABS = ['build', 'sim', 'projects', 'models', 'paths', 'export', 'link'];

export const state = {
  tab: 'build',
  owned: ['51515', '31313'],
  hub: 'inventor',
  builds: { inventor: cloneBuild(DEFAULT_BUILDS.inventor), ev3: cloneBuild(DEFAULT_BUILDS.ev3) },
  arena: 'oval',
  brain: { kind: 'rules', preset: 'line-p', rules: structuredClone(PRESETS['line-p'].rules), goal: 'Follow the line and stop on the red patch. Get around any box in the way.', gateMin: 0.25 },
  speed: 1,
  linkSource: 'virtual',
  sim: null, // runtime: the last onUpdate snapshot, never saved
  exportFiles: [], // runtime: what the Export tab last rendered
};

export const build = (s) => s.builds[s.hub];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const numIn = (v, lo, hi, d) => (Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : d);

function cleanBuild(saved, hubId) {
  const base = cloneBuild(DEFAULT_BUILDS[hubId]);
  if (!isObj(saved) || !isObj(saved.ports)) return base;
  for (const p of HUBS[hubId].ports) {
    const d = saved.ports[p];
    base.ports[p] = d === null || DEVICES[d] ? d ?? null : base.ports[p];
  }
  base.wheelMm = numIn(saved.wheelMm, 5, 300, base.wheelMm);
  base.axleMm = numIn(saved.axleMm, 20, 600, base.axleMm);
  if (HUBS[hubId].ports.includes(saved.left)) base.left = saved.left;
  if (HUBS[hubId].ports.includes(saved.right)) base.right = saved.right;
  repairDrive(base);
  return base;
}

function cleanRule(r) {
  if (!isObj(r) || !SENSORS[r.sensor]) return null;
  const action = ['drive', 'line', 'stop'].includes(r.action) ? r.action : 'drive';
  return {
    sensor: r.sensor,
    op: SENSORS[r.sensor].ops.includes(r.op) ? r.op : SENSORS[r.sensor].ops[0],
    value: typeof r.value === 'string' || typeof r.value === 'number' ? r.value : 0,
    action,
    left: numIn(r.left, -100, 100, 0), right: numIn(r.right, -100, 100, 0),
    base: numIn(r.base, -100, 100, 40), kp: numIn(r.kp, 0, 10, 1), target: numIn(r.target, 0, 100, 50),
    holdMs: numIn(r.holdMs, 0, 10000, 0),
  };
}

export function loadSaved(s) {
  const saved = store.load(null);
  const hash = location.hash.slice(1);
  if (TABS.includes(hash)) s.tab = hash;
  if (!isObj(saved)) return;
  if (Array.isArray(saved.owned)) {
    const owned = saved.owned.filter((k) => KITS[k]);
    if (owned.length) s.owned = owned;
  }
  if (isObj(saved.builds)) for (const h of Object.keys(HUBS)) s.builds[h] = cleanBuild(saved.builds[h], h);
  if (HUBS[saved.hub] && s.owned.includes(HUBS[saved.hub].kit)) s.hub = saved.hub;
  else s.hub = Object.values(HUBS).find((h) => s.owned.includes(h.kit)).id;
  if (ARENAS[saved.arena]) s.arena = saved.arena;
  if (isObj(saved.brain)) {
    const b = saved.brain;
    if (['rules', 'modes'].includes(b.kind)) s.brain.kind = b.kind;
    if (Array.isArray(b.rules)) s.brain.rules = b.rules.map(cleanRule).filter(Boolean).slice(0, 12);
    if (typeof b.goal === 'string') s.brain.goal = b.goal.slice(0, 400);
    s.brain.gateMin = numIn(b.gateMin, 0, 1, s.brain.gateMin);
    s.brain.preset = PRESETS[b.preset] ? b.preset : 'custom';
  }
  if (['virtual', 'ble'].includes(saved.linkSource)) s.linkSource = saved.linkSource;
}

/** false means this session works, but the workbench could not be saved. */
export function save(s) {
  const { owned, hub, builds, arena, brain, linkSource } = s;
  return store.save({ owned, hub, builds, arena, brain, linkSource });
}
