// The simulator's side of the page: controls, the readout, the decision
// panel and the rule editor. The canvas itself belongs to simview.js.
import { SENSORS, PRESETS, MODES } from './brain.js';
import { ARENAS } from './sim.js';
import { escHtml, $ } from './utils.js';

export function renderSimControls(s) {
  $('arena').innerHTML = Object.entries(ARENAS).map(([id, a]) => `<option value="${id}" ${s.arena === id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('');
  $('arena-note').textContent = ARENAS[s.arena].note;
  for (const btn of document.querySelectorAll('#brain-kind [data-kind]')) btn.setAttribute('aria-checked', String(btn.dataset.kind === s.brain.kind));
  const rules = s.brain.kind === 'rules';
  $('preset-wrap').hidden = !rules;
  $('rules-panel').hidden = !rules;
  $('modes-panel').hidden = rules;
  $('preset').innerHTML = Object.entries(PRESETS).map(([id, p]) => `<option value="${id}" ${s.brain.preset === id ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('')
    + `<option value="custom" ${s.brain.preset === 'custom' ? 'selected' : ''}>Custom</option>`;
  $('speed').value = String(s.speed);
  $('goal').value = s.brain.goal;
  $('gate').value = String(s.brain.gateMin);
  $('gate-out').textContent = s.brain.gateMin.toFixed(2);
}

const opt = (v, cur, label = v) => `<option value="${escHtml(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${escHtml(label)}</option>`;
const numIn = (i, key, val, min, max, label) => `<label class="mini-field"><span>${label}</span><input class="input input--num" type="number" data-rule="${i}" data-key="${key}" value="${escHtml(String(val))}" min="${min}" max="${max}"></label>`;

export function renderRules(s, activeIdx = -1) {
  const rows = s.brain.rules.map((r, i) => {
    const sen = SENSORS[r.sensor];
    const value = r.sensor === 'always' ? ''
      : sen.values ? `<select class="select" data-rule="${i}" data-key="value" aria-label="Value">${sen.values.map((v) => opt(v, r.value)).join('')}</select>`
        : `<input class="input input--num" type="number" data-rule="${i}" data-key="value" value="${escHtml(String(r.value))}" aria-label="Value">`;
    const params = r.action === 'drive' ? numIn(i, 'left', r.left, -100, 100, 'Left %') + numIn(i, 'right', r.right, -100, 100, 'Right %')
      : r.action === 'line' ? numIn(i, 'base', r.base, -100, 100, 'Base %') + numIn(i, 'kp', r.kp, 0, 10, 'Kp') + numIn(i, 'target', r.target, 0, 100, 'Target')
        : '';
    return `<li class="rule${i === activeIdx ? ' is-active' : ''}" data-index="${i}">
      <span class="rule__n">${i + 1}</span>
      <span class="rule__when">If
        <select class="select" data-rule="${i}" data-key="sensor" aria-label="Sensor">${Object.entries(SENSORS).map(([k, v]) => opt(k, r.sensor, v.label)).join('')}</select>
        ${sen.ops.length ? `<select class="select select--op" data-rule="${i}" data-key="op" aria-label="Comparison">${sen.ops.map((o) => opt(o, r.op, o === '==' ? 'is' : o)).join('')}</select>` : ''}
        ${value}</span>
      <span class="rule__then">then
        <select class="select" data-rule="${i}" data-key="action" aria-label="Action">${opt('drive', r.action, 'Drive')}${opt('line', r.action, 'Follow line (P)')}${opt('stop', r.action, 'Stop')}</select>
        ${params}${numIn(i, 'holdMs', r.holdMs, 0, 10000, 'Hold ms')}</span>
      <span class="rule__tools">
        <button type="button" class="btn btn--ghost btn--sm" data-move="${i}" data-dir="-1" aria-label="Move rule ${i + 1} up" ${i === 0 ? 'disabled' : ''}>Up</button>
        <button type="button" class="btn btn--ghost btn--sm" data-del="${i}" aria-label="Delete rule ${i + 1}">Delete</button>
      </span>
    </li>`;
  });
  $('rules').innerHTML = rows.length ? `<ol class="rule-list">${rows.join('')}</ol>` : '<p class="field__hint">No rules: the robot will sit still. Add one, or pick a preset.</p>';
}

/** Highlight the firing rule without rebuilding the editor under the cursor. */
export function markActiveRule(idx) {
  for (const li of document.querySelectorAll('#rules .rule')) li.classList.toggle('is-active', Number(li.dataset.index) === idx);
}

const fmt = (v, unit = '') => (v === null || v === undefined ? '<span class="muted">none</span>' : `${escHtml(String(v))}${unit}`);

export function renderReadout(s, u) {
  if (!u) return;
  const r = u.reading;
  $('play').textContent = u.running ? 'Pause' : 'Run';
  $('play').disabled = !u.canDrive;
  $('readout').innerHTML = `
    ${u.canDrive ? '' : '<p class="issue issue--warn">This build has no drive pair. Put two motors on the ports and pick left and right on Kit and build.</p>'}
    <dl class="readout">
      <dt>Time</dt><dd>${(u.tMs / 1000).toFixed(1)} s</dd>
      <dt>Travelled</dt><dd>${Math.round(u.odoMm)} mm</dd>
      <dt>Distance</dt><dd>${fmt(r.distance, r.distance != null ? ' mm' : '')}</dd>
      <dt>Reflection</dt><dd>${fmt(r.reflection)}</dd>
      <dt>Colour</dt><dd>${fmt(r.color)}</dd>
      <dt>Touch</dt><dd>${r.touch === null ? fmt(null) : r.touch ? 'pressed' : 'released'}</dd>
      <dt>Heading</dt><dd>${r.heading} deg</dd>
      <dt>Motors</dt><dd>L ${Math.round(u.cmd.left)} %, R ${Math.round(u.cmd.right)} %</dd>
    </dl>`;
  if (s.brain.kind === 'rules') {
    $('decision').innerHTML = `<p class="field__hint">${u.ruleIdx >= 0 ? `Rule ${u.ruleIdx + 1} is driving.` : 'No rule matches: motors off.'}</p>`;
    markActiveRule(u.ruleIdx);
    return;
  }
  const d = u.decision;
  if (!d) { $('decision').innerHTML = ''; return; }
  const wasOpen = $('decision').querySelector('details')?.open;
  const bars = Object.entries(d.answer.probabilities).sort((a, b) => b[1] - a[1]).map(([k, p]) => `<li class="bar${k === u.mode ? ' is-current' : ''}">
    <span class="bar__label">${escHtml(MODES[k].label)}</span>
    <span class="bar__track"><span class="bar__fill" style="width:${(p * 100).toFixed(1)}%"></span></span>
    <span class="bar__val">${p.toFixed(2)}</span></li>`).join('');
  $('decision').innerHTML = `<div class="decision">
    <p class="decision__mode">Mode: <strong>${escHtml(MODES[u.mode].label)}</strong></p>
    <p class="field__hint">Local stand-in answer, confidence ${d.answer.confidence.toFixed(2)}${d.gated ? ', under the gate, so the mode holds' : ''}.</p>
    <ul class="bars" aria-label="Mode probabilities">${bars}</ul>
    <dl class="readout readout--facts">${Object.entries(d.facts).map(([k, v]) => `<dt>${escHtml(k.replace(/_/g, ' '))}</dt><dd>${escHtml(v)}</dd>`).join('')}</dl>
    <details class="sheet"${wasOpen ? ' open' : ''}><summary>Request the bridge would send to Jev</summary><div class="sheet__inner"><pre><code>${escHtml(JSON.stringify(d.request, null, 2))}</code></pre></div></details>
  </div>`;
}
