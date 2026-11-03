// Panels other than the simulator. Each renderer rewrites one container's
// contents; controls that live in index.html are only updated, never replaced.
import { HUBS, DEVICES, KITS, KIT_ORDER, FIRMWARE, EXTRAS } from './catalog.js';
import { devicesForPort, motorPorts, capabilities, validate, combinationMatrix, inventory, meets } from './build.js';
import { LEVELS, PROJECTS } from './projects.js';
import { rulesProgram, modesProgram, bridgeScript } from './export.js';
import { build, TABS } from './state.js';
import { escHtml, $ } from './utils.js';

export function renderTabs(s) {
  for (const t of TABS) {
    $(`panel-${t}`).hidden = s.tab !== t;
    const link = document.querySelector(`.rail-link[data-tab="${t}"]`);
    if (s.tab === t) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
}

function renderKits(s) {
  $('kits').innerHTML = KIT_ORDER.map((id) => KITS[id]).map((k) => {
    const parts = Object.entries(k.devices).map(([d, n]) => `${n} x ${escHtml(DEVICES[d].name)}`).concat(k.accessories.map(escHtml));
    return `<label class="kit${s.owned.includes(k.id) ? ' is-on' : ''}">
      <input type="checkbox" data-kit="${k.id}" ${s.owned.includes(k.id) ? 'checked' : ''}>
      <span class="kit__head"><strong>${k.id} ${escHtml(k.name)}</strong><span class="muted">${k.year}, ${k.pieces} pieces</span></span>
      <span class="kit__body">${escHtml(HUBS[k.hub].name)}; ${parts.join(', ')}</span>
      <span class="kit__models muted">Box models: ${k.models.map(escHtml).join(', ')}</span>
    </label>`;
  }).join('');
}

function renderHubPick(s) {
  $('hub-pick').innerHTML = Object.values(HUBS).map((h) => {
    const owned = s.owned.includes(h.kit);
    return `<button type="button" class="seg__btn" role="radio" data-hub="${h.id}" aria-checked="${s.hub === h.id}" ${owned ? '' : 'disabled'}>${escHtml(h.name)}</button>`;
  }).join('');
  const h = HUBS[s.hub];
  $('hub-note').textContent = `${h.family} connectors. Built in: ${h.builtIn.join(', ')}.`;
}

function renderPorts(s) {
  const b = build(s);
  const hub = HUBS[s.hub];
  $('ports').innerHTML = hub.ports.map((p) => {
    const kind = hub.portKind[p];
    const opts = devicesForPort(s.hub, p).map((d) => `<option value="${d}" ${b.ports[p] === d ? 'selected' : ''}>${escHtml(DEVICES[d].name)}</option>`).join('');
    const dev = b.ports[p] ? DEVICES[b.ports[p]] : null;
    const label = p.startsWith('S') ? `Port ${p.slice(1)}` : `Port ${p}`;
    return `<div class="port${dev ? ' is-used' : ''}">
      <label class="port__label" for="port-${p}">${label} <span class="muted">${kind === 'any' ? 'motor or sensor' : kind}</span></label>
      <select id="port-${p}" class="select" data-port="${p}"><option value="">Empty</option>${opts}</select>
      <p class="port__note muted">${dev ? escHtml(dev.note) : ''}</p>
    </div>`;
  }).join('');
}

function renderDrive(s) {
  const b = build(s);
  const motors = motorPorts(b);
  const sel = (id, val) => `<select id="${id}" class="select" data-drive="${id === 'drive-left' ? 'left' : 'right'}">${motors.map((p) => `<option ${p === val ? 'selected' : ''}>${p}</option>`).join('') || '<option value="">No motors</option>'}</select>`;
  $('drive').innerHTML = `
    <div class="field"><label for="drive-left">Left wheel motor</label>${sel('drive-left', b.left)}</div>
    <div class="field"><label for="drive-right">Right wheel motor</label>${sel('drive-right', b.right)}</div>
    <div class="field"><label for="wheel">Wheel diameter (mm)</label><input id="wheel" class="input" type="number" inputmode="decimal" min="10" max="200" value="${b.wheelMm}" data-geo="wheelMm"></div>
    <div class="field"><label for="axle">Axle track (mm)</label><input id="axle" class="input" type="number" inputmode="decimal" min="40" max="400" value="${b.axleMm}" data-geo="axleMm"></div>`;
}

function renderIssues(s) {
  const issues = validate(build(s), s.owned);
  $('issues').innerHTML = issues.length
    ? `<ul class="issue-list">${issues.map((i) => `<li class="issue issue--${i.level}">${escHtml(i.text)}</li>`).join('')}</ul>`
    : '<p class="issue issue--ok">Every port checks out against your kits.</p>';
}

function renderCaps(s) {
  const b = build(s);
  const caps = capabilities(b);
  const inv = inventory(s.owned);
  const used = {};
  for (const d of Object.values(b.ports)) if (d) used[d] = (used[d] || 0) + 1;
  const chips = [
    `${caps.motor} motor${caps.motor === 1 ? '' : 's'}`,
    caps.color ? 'sees the floor' : null,
    caps.distance ? 'sees ahead' : null,
    caps.touch ? 'feels bumps' : null,
    s.hub === 'inventor' ? 'knows its heading (IMU)' : null,
  ].filter(Boolean).map((c) => `<span class="chip">${c}</span>`);
  const spare = Object.entries(inv).filter(([d]) => DEVICES[d].family === HUBS[s.hub].family)
    .map(([d, n]) => [d, n - (used[d] || 0)]).filter(([, n]) => n > 0)
    .map(([d, n]) => `${n} x ${DEVICES[d].name}`);
  $('caps').innerHTML = chips.join('') + `<p class="field__hint caps__spare">${spare.length ? `Still in the box: ${escHtml(spare.join(', '))}.` : 'Every compatible part is in use.'}</p>`;
}

function renderMatrix(s) {
  const rows = combinationMatrix(s.owned);
  const hubs = Object.values(HUBS).filter((h) => s.owned.includes(h.kit));
  const caps = capabilities(build(s));
  $('matrix').innerHTML = `<thead><tr><th scope="col">Chassis</th>${hubs.map((h) => `<th scope="col">${escHtml(h.name)}</th>`).join('')}<th scope="col">Current build</th></tr></thead>
    <tbody>${rows.map(({ archetype: a, cells }) => `<tr>
      <th scope="row"><span class="matrix__name">${escHtml(a.name)}</span><span class="muted matrix__desc">${escHtml(a.desc)}</span></th>
      ${cells.map((c) => `<td class="${c.ok ? 'ok' : 'no'}">${c.ok ? `Builds <span class="muted">${c.layouts.toLocaleString()} layouts</span>` : `Short ${escHtml(c.missing.join(', '))}`}</td>`).join('')}
      <td class="${meets(a.needs, caps) ? 'ok' : 'no'}">${meets(a.needs, caps) ? (a.sims ? 'Yes, simulates' : 'Yes') : 'Not wired'}</td>
    </tr>`).join('')}</tbody>`;
  $('cross-note').textContent = s.owned.length > 1
    ? 'With both kits: the connectors do not mix, so a part from one box never plugs into the other hub. Two robots coordinated by one laptop is the way to use both at once (project "Two robots, one laptop").'
    : 'Add the other kit to see what both boxes can do together.';
}

export function renderBuild(s) {
  renderKits(s); renderHubPick(s); renderPorts(s); renderDrive(s); renderIssues(s); renderCaps(s); renderMatrix(s);
}

/** How well a project fits the kits owned and the current build. */
function fit(p, s) {
  const hubs = p.hub === 'either' ? ['inventor', 'ev3'] : p.hub === 'both' ? ['inventor', 'ev3'] : [p.hub];
  const ownedHubs = hubs.filter((h) => s.owned.includes(HUBS[h].kit));
  if (p.hub === 'both' && ownedHubs.length < 2) return { level: 'no', text: 'Needs both kits' };
  if (!ownedHubs.length) return { level: 'no', text: `Needs ${HUBS[hubs[0]].kit}` };
  if (p.hub !== 'both' && !ownedHubs.includes(s.hub)) return { level: 'warn', text: `Switch to the ${HUBS[ownedHubs[0]].name}` };
  if (p.hub === 'both' || meets(p.needs, capabilities(build(s)))) return { level: 'ok', text: 'Ready with this build' };
  return { level: 'warn', text: 'Kit has it; rewire the ports' };
}

export function renderProjects(s) {
  $('projects').innerHTML = LEVELS.map((l) => `<div class="level">
    <h3 class="level__title"><span class="level__n">Level ${l.n}</span> ${escHtml(l.name)}</h3>
    <p class="field__hint">${escHtml(l.lead)}</p>
    <div class="project-grid">${PROJECTS.filter((p) => p.level === l.n).map((p) => {
      const f = fit(p, s);
      const hubLabel = p.hub === 'either' ? '51515 or 31313' : p.hub === 'both' ? '51515 + 31313' : HUBS[p.hub].kit;
      return `<article class="project card card--actions">
        <div class="project__top"><h4>${escHtml(p.title)}</h4><span class="badge badge--${f.level}">${escHtml(f.text)}</span></div>
        <p class="muted project__meta">${hubLabel}</p>
        <p>${escHtml(p.teaches)}</p>
        <ol class="project__steps">${p.steps.map((x) => `<li>${escHtml(x)}</li>`).join('')}</ol>
        <div class="toolbar">${p.sim ? `<button type="button" class="btn btn--secondary btn--sm" data-rehearse="${p.id}">Rehearse in the simulator</button>` : '<span class="muted project__nosim">Real hardware only</span>'}</div>
      </article>`;
    }).join('')}</div>
  </div>`).join('');
}

export function renderPaths() {
  const fw = (hub) => FIRMWARE.filter((f) => f.hub === hub).map((f) => `<li class="path-item">
    <div class="path-item__head"><strong>${escHtml(f.name)}</strong><span class="badge badge--${f.maintained ? 'ok' : 'warn'}">${f.maintained ? 'Maintained' : 'Legacy'}</span></div>
    <p>${escHtml(f.how)}</p><a href="${f.url}" target="_blank" rel="noopener">${escHtml(new URL(f.url).host)}</a></li>`).join('');
  $('paths').innerHTML = `
    <div class="path-cols">
      <div class="group"><h3 class="group__title">Program the Robot Inventor Hub</h3><ul class="path-list">${fw('inventor')}</ul></div>
      <div class="group"><h3 class="group__title">Program the EV3 brick</h3><ul class="path-list">${fw('ev3')}</ul></div>
    </div>
    <div class="group">
      <h3 class="group__title">Hardware by path</h3>
      <div class="extra-grid">${EXTRAS.map((e) => `<div class="card extra"><h4>${escHtml(e.path)}</h4><ul>${e.items.map((i) => `<li><strong>${escHtml(i.name)}</strong> <span class="badge">${escHtml(i.cost)}</span><br><span class="muted">${escHtml(i.why)}</span></li>`).join('')}</ul></div>`).join('')}</div>
    </div>
    <div class="group">
      <h3 class="group__title">Where Jev fits</h3>
      <ol class="flow" aria-label="Decision loop">
        <li><strong>Hub</strong><span>Runs the motors and the fast loops: line following, avoiding, 100 times a second.</span></li>
        <li><strong>Facts</strong><span>Twice a second it prints plain facts: front blocked, floor dark line, bumper pressed.</span></li>
        <li><strong>Bridge</strong><span>A laptop script with your API key reads them over Bluetooth LE.</span></li>
        <li><strong>Jev</strong><span>One Choice question: which mode fits the goal? Answer, probabilities, confidence.</span></li>
        <li><strong>Gate</strong><span>Code switches mode only above the confidence gate, and sends one byte back.</span></li>
      </ol>
      <div class="two-col">
        <div><h4>Good uses</h4><ul class="plain">
          <li>Picking a behaviour from a goal written in plain words.</li>
          <li>Turning a typed or spoken command into one of a fixed set of actions, with "unclear" as an option.</li>
          <li>Judging whether a goal is reached when that is a matter of meaning, not a threshold.</li>
        </ul></div>
        <div><h4>Keep it out of</h4><ul class="plain">
          <li>Motor control and anything that must react within milliseconds; a network round trip is far too slow for that.</li>
          <li>Comparing numbers or counting. Code turns readings into categories first; that is on Jev's own documented weak-spot list.</li>
          <li>The browser and the hub. The key lives on the bridge machine only, and billing is per input token with no free tier.</li>
        </ul></div>
      </div>
      <p class="field__hint">Vendor facts as read on 2026-10-05 from docs.typesafe.ai: endpoint POST /v1/systemone, model jev-latest, question types noul, choice and score.</p>
    </div>`;
}

export function renderExport(s) {
  const b = build(s);
  const issues = validate(b, s.owned).filter((i) => i.level === 'error');
  const files = [];
  if (s.brain.kind === 'rules') files.push({ name: `botbench_${s.hub}_rules.py`, title: 'Hub program (rule table)', code: rulesProgram(b, s.brain.rules) });
  else {
    files.push({ name: `botbench_${s.hub}_modes.py`, title: 'Hub program (modes)', code: modesProgram(b) });
    if (s.hub === 'inventor') files.push({ name: 'bridge.py', title: 'Laptop bridge (Jev)', code: bridgeScript(s.brain.goal, s.brain.gateMin) });
  }
  $('export').innerHTML = `${issues.length ? `<p class="issue issue--error">The build has ${issues.length} port problem${issues.length > 1 ? 's' : ''}; fix them on Kit and build before flashing this.</p>` : ''}
    <p class="field__hint">Brain: ${s.brain.kind === 'rules' ? 'rule table' : 'modes and decider'} on the ${escHtml(HUBS[s.hub].name)}. Switch either on the Simulate tab. Paste the hub program into <a href="https://code.pybricks.com/" target="_blank" rel="noopener">Pybricks Code</a> to load it; ${s.brain.kind === 'modes' && s.hub === 'inventor' ? 'the modes program then answers the <a href="#link">Link</a> tab and bridge.py' : 'the modes brain adds a program the <a href="#link">Link</a> tab can drive'}.</p>
    ${files.map((f, i) => `<div class="code-block">
      <div class="code-block__bar"><strong>${escHtml(f.title)}</strong><span class="muted">${escHtml(f.name)}</span>
        <span class="toolbar-gap"></span>
        <button type="button" class="btn btn--secondary btn--sm" data-copy="${i}">Copy</button>
        <button type="button" class="btn btn--secondary btn--sm" data-download="${i}">Download</button></div>
      <pre><code>${escHtml(f.code)}</code></pre></div>`).join('')}`;
  s.exportFiles = files;
}
