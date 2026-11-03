// All listeners, wired once. Containers that re-render use delegation.
import { HUBS, KIT_ORDER } from './catalog.js';
import { repairDrive } from './build.js';
import { PRESETS, SENSORS, newRule } from './brain.js';
import { PROJECTS } from './projects.js';
import { state, build, save, TABS } from './state.js';
import { renderTabs, renderBuild, renderProjects, renderExport } from './render.js';
import { renderModels } from './models-panel.js';
import { renderSimControls, renderRules, renderReadout } from './simpanel.js';
import { createSimView } from './simview.js';
import { createLinkPanel } from './linkpanel.js';
import { $, debounce, showToast, copyText, downloadText } from './utils.js';

let sim = null;
let linkPanel = null;

function persist(s) {
  if (!save(s) && !persist.warned) { persist.warned = true; showToast('This browser is not saving: changes last for this visit only.'); }
}

export function reloadSim(s) {
  sim.pause();
  sim.load({ build: build(s), arenaId: s.arena, brain: s.brain });
}

function showTab(s, tab) {
  if (!TABS.includes(tab)) tab = 'build';
  if (s.tab === 'sim' && tab !== 'sim') sim.pause();
  s.tab = tab;
  renderTabs(s);
  if (tab === 'sim') { sim.resize(); renderRules(s); }
  if (tab === 'projects') renderProjects(s);
  if (tab === 'models') renderModels(s);
  if (tab === 'export') renderExport(s);
  if (tab === 'link') linkPanel.render();
}

/** Anything that changes the build reaches every view that reads it. */
function buildChanged(s, refocusId) {
  repairDrive(build(s));
  renderBuild(s);
  reloadSim(s);
  persist(s);
  if (refocusId) $(refocusId)?.focus();
}

function bindBuild(s) {
  $('kits').addEventListener('change', (e) => {
    const kit = e.target.dataset.kit;
    if (!kit) return;
    const next = e.target.checked ? [...new Set([...s.owned, kit])] : s.owned.filter((k) => k !== kit);
    if (!next.length) { e.target.checked = true; showToast('Keep at least one kit: the planner needs a hub.'); return; }
    s.owned = KIT_ORDER.filter((k) => next.includes(k));
    if (!s.owned.includes(HUBS[s.hub].kit)) s.hub = Object.values(HUBS).find((h) => s.owned.includes(h.kit)).id;
    buildChanged(s);
    document.querySelector(`#kits [data-kit="${kit}"]`)?.focus();
  });
  $('hub-pick').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-hub]');
    if (!btn || btn.disabled || s.hub === btn.dataset.hub) return;
    s.hub = btn.dataset.hub;
    buildChanged(s);
    document.querySelector(`#hub-pick [data-hub="${s.hub}"]`)?.focus();
  });
  $('ports').addEventListener('change', (e) => {
    const port = e.target.dataset.port;
    if (!port) return;
    build(s).ports[port] = e.target.value || null;
    buildChanged(s, `port-${port}`);
  });
  $('drive').addEventListener('change', (e) => {
    const b = build(s);
    if (e.target.dataset.drive) b[e.target.dataset.drive] = e.target.value;
    if (e.target.dataset.geo) {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v > 0) b[e.target.dataset.geo] = v;
    }
    buildChanged(s, e.target.id);
  });
}

function bindSim(s) {
  const reset = () => { reloadSim(s); persist(s); };
  $('arena').addEventListener('change', (e) => { s.arena = e.target.value; renderSimControls(s); reset(); });
  $('brain-kind').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-kind]');
    if (!btn || s.brain.kind === btn.dataset.kind) return;
    s.brain.kind = btn.dataset.kind;
    renderSimControls(s); renderRules(s); reset();
  });
  $('preset').addEventListener('change', (e) => {
    s.brain.preset = e.target.value;
    if (PRESETS[e.target.value]) s.brain.rules = structuredClone(PRESETS[e.target.value].rules);
    renderRules(s); reset();
  });
  $('play').addEventListener('click', () => (sim.running ? sim.pause() : sim.play()));
  $('step').addEventListener('click', () => sim.stepOnce());
  $('reset').addEventListener('click', reset);
  $('speed').addEventListener('change', (e) => { s.speed = Number(e.target.value) || 1; sim.setSpeed(s.speed); });
  $('goal').addEventListener('input', debounce((e) => { s.brain.goal = e.target.value.slice(0, 400); persist(s); }, 250));
  $('gate').addEventListener('input', (e) => {
    s.brain.gateMin = Number(e.target.value);
    $('gate-out').textContent = s.brain.gateMin.toFixed(2);
    persist(s);
  });
  $('add-rule').addEventListener('click', () => {
    s.brain.rules = [...s.brain.rules, newRule()];
    s.brain.preset = 'custom';
    renderSimControls(s); renderRules(s); reset();
  });
  // Value edits mutate the live rule, so a running robot picks them up at
  // once. Structural edits (sensor, action, order) rebuild and restart.
  $('rules').addEventListener('change', (e) => {
    const i = Number(e.target.dataset.rule);
    const key = e.target.dataset.key;
    const rule = s.brain.rules[i];
    if (!rule || !key) return;
    s.brain.preset = 'custom';
    $('preset').value = 'custom';
    if (key === 'sensor') {
      rule.sensor = e.target.value;
      const sen = SENSORS[rule.sensor];
      rule.op = sen.ops[0] || '';
      rule.value = sen.values ? sen.values[0] : rule.sensor === 'reflection' ? 50 : 200;
    } else if (key === 'action' || key === 'op' || (key === 'value' && SENSORS[rule.sensor].values)) {
      rule[key] = e.target.value;
    } else {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) rule[key] = v;
      persist(s);
      return;
    }
    renderRules(s);
    document.querySelector(`#rules [data-rule="${i}"][data-key="${key}"]`)?.focus();
    reset();
  });
  $('rules').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    const move = e.target.closest('[data-move]');
    if (!del && !move) return;
    const rules = [...s.brain.rules];
    if (del) rules.splice(Number(del.dataset.del), 1);
    else {
      const i = Number(move.dataset.move);
      [rules[i - 1], rules[i]] = [rules[i], rules[i - 1]];
    }
    s.brain.rules = rules;
    s.brain.preset = 'custom';
    renderSimControls(s); renderRules(s); reset();
  });
}

function bindProjects(s) {
  $('projects').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rehearse]');
    if (!btn) return;
    const p = PROJECTS.find((x) => x.id === btn.dataset.rehearse);
    if (p.hub !== 'either' && p.hub !== 'both' && s.owned.includes(HUBS[p.hub].kit)) s.hub = p.hub;
    s.arena = p.sim.arena;
    if (p.sim.brain === 'modes') s.brain.kind = 'modes';
    else { s.brain.kind = 'rules'; s.brain.preset = p.sim.brain; s.brain.rules = structuredClone(PRESETS[p.sim.brain].rules); }
    renderBuild(s); renderSimControls(s);
    reloadSim(s); persist(s);
    location.hash = 'sim';
    showToast(`Loaded "${p.title}". Check the ports on Kit and build if the robot cannot see what it needs.`);
  });
}

function bindExport(s) {
  $('export').addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    const dl = e.target.closest('[data-download]');
    const f = s.exportFiles[Number((copy || dl)?.dataset.copy ?? (copy || dl)?.dataset.download)];
    if (!f) return;
    if (copy) showToast((await copyText(f.code)) ? `Copied ${f.name}` : 'Copy failed; select the code by hand.');
    else downloadText(f.code, f.name, 'text/x-python');
  });
}

export function bindEvents(s) {
  sim = createSimView($('sim-canvas'), { onUpdate: (u) => { state.sim = u; renderReadout(s, u); } });
  sim.setSpeed(s.speed);
  reloadSim(s);
  linkPanel = createLinkPanel(s, sim, () => persist(s));
  bindBuild(s); bindSim(s); bindProjects(s); bindExport(s);
  window.addEventListener('hashchange', () => showTab(s, location.hash.slice(1)));
  showTab(s, s.tab);
}
