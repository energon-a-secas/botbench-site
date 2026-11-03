// The Link tab: connect to a hub (Bluetooth, or the simulator standing in),
// show what it reports, drive it by hand, pick its mode, or let the local
// stand-in decider pick. The page is the bridge here; Jev itself stays on
// bridge.py because a key never belongs in a browser.
import { MODES, localDecide, gate } from './brain.js';
import { createLink, bleTransport, virtualTransport, TELEOP, KEY_TO_TELEOP, MODE_CODES } from './link.js';
import { modesProgram } from './export.js';
import { build } from './state.js';
import { decisionBars } from './simpanel.js';
import { $, escHtml, showToast } from './utils.js';

const LOG_MAX = 200;
const bucket = (sec) => (sec < 2 ? 'just started' : sec < 8 ? 'a few seconds' : 'a long time');

export function createLinkPanel(s, sim, persist = () => {}) {
  let link = null, source = s.linkSource || 'virtual';
  let lastFacts = null, lastAt = 0, hubMode = 'explore', modeSince = 0, auto = false, decision = null;
  const log = [];
  let heldKey = null;

  function makeLink() {
    const transport = source === 'ble' ? bleTransport() : virtualTransport(sim);
    return createLink(transport, {
      state: () => { if (link?.state === 'idle') { lastFacts = null; decision = null; } renderStatus(); renderFacts(); },
      status: renderStatus,
      stdout: (text) => appendLog(text),
      facts: (f) => onFacts(f),
    });
  }

  function appendLog(text) {
    const lines = text.split('\n');
    if (log.length && !log[log.length - 1].endsWith('\n')) log[log.length - 1] += lines.shift();
    for (const l of lines) log.push(l + '\n');
    while (log.length > LOG_MAX) log.shift();
    const pre = $('link-log');
    pre.textContent = log.join('').replace(/\n$/, '');
    if ($('link-output').open) pre.scrollTop = pre.scrollHeight;
  }

  function onFacts(f) {
    lastFacts = f; lastAt = Date.now();
    if (f.mode && f.mode !== hubMode) { hubMode = f.mode; modeSince = Date.now(); }
    if (auto && hubMode !== 'teleop') {
      const fx = { front: f.front, floor: f.floor, bumper: f.bumper, current_mode: hubMode, time_in_mode: bucket((Date.now() - modeSince) / 1000) };
      const answer = localDecide(s.brain.goal, fx);
      const next = gate(answer, hubMode, s.brain.gateMin);
      decision = { answer, next, gated: next !== answer.choice };
      if (next !== hubMode && MODE_CODES[next]) link.sendMode(next).catch((e) => showToast(e.message));
    }
    renderFacts();
  }

  function renderStatus() {
    const st = link?.state || 'idle';
    const connected = st === 'connected';
    $('link-connect').textContent = st === 'connecting' ? 'Connecting' : connected ? 'Disconnect' : 'Connect';
    $('link-connect').disabled = st === 'connecting';
    for (const id of ['link-start', 'link-stop', 'link-run-btn']) $(id).disabled = !connected;
    for (const b of document.querySelectorAll('#link-modes button, #teleop button')) b.disabled = !connected;
    $('link-auto').disabled = !connected;
    for (const btn of document.querySelectorAll('#link-source [data-source]')) btn.setAttribute('aria-checked', String(btn.dataset.source === source));
    const ble = bleTransport();
    const req = $('link-requirements');
    if (source === 'ble' && !ble.available()) {
      req.hidden = false;
      req.textContent = globalThis.isSecureContext === false
        ? 'Web Bluetooth needs an https page (or localhost). Open this site over https.'
        : 'This browser has no Web Bluetooth. Chrome or Edge on a computer with Bluetooth LE can connect; Safari and Firefox cannot.';
    } else req.hidden = true;
    let text = source === 'ble'
      ? 'Not connected. Load the exported program with Pybricks Code first. If the hub is missing from the dialog, disconnect Pybricks Code: firmware before 4.0 holds one connection.'
      : 'Not connected. The virtual hub is the simulator running the exported program: same facts, same bytes.';
    if (connected) {
      const i = link.info || {};
      const parts = [`Connected to ${i.name || 'hub'}`];
      if (i.firmware) parts.push(`firmware ${i.firmware}`);
      if (i.profile && i.profile !== 'virtual') parts.push(`profile ${i.profile}`);
      if (link.caps?.maxCharSize) parts.push(`${link.caps.maxCharSize}-byte writes`);
      const stt = link.status;
      parts.push(stt ? (stt.running ? 'program running' : 'program stopped: press Start program') : 'waiting for a status report');
      if (stt?.warnings?.length) parts.push(`hub warns: ${stt.warnings.join(', ')}`);
      text = parts.join('. ') + '.';
    } else if (st === 'connecting') text = source === 'ble' ? 'Pick the hub in the browser dialog.' : 'Attaching the simulator.';
    $('link-status').textContent = text;
  }

  function renderFacts() {
    const box = $('link-facts');
    if (!lastFacts) { box.innerHTML = '<p class="field__hint">Nothing reported yet. Once the program runs, a line arrives twice a second.</p>'; $('link-decision').innerHTML = ''; return; }
    const rows = Object.entries(lastFacts).map(([k, v]) => `<dt>${escHtml(k.replace(/_/g, ' '))}</dt><dd>${escHtml(v)}</dd>`).join('');
    const age = Math.round((Date.now() - lastAt) / 1000);
    box.innerHTML = `<dl class="readout readout--facts">${rows}</dl><p class="field__hint">${age > 3 ? `Last line ${age} s ago; the program may have stopped.` : `Hub mode: ${escHtml(MODES[hubMode]?.label || hubMode)}.`}</p>`;
    for (const b of document.querySelectorAll('#link-modes [data-mode]')) b.classList.toggle('is-on', b.dataset.mode === hubMode);
    $('link-decision').innerHTML = auto && decision
      ? `<p class="field__hint">Stand-in picked ${escHtml(MODES[decision.answer.choice].label)}, confidence ${decision.answer.confidence.toFixed(2)}${decision.gated ? ', under the gate, so the hub keeps its mode' : ''}.</p><ul class="bars" aria-label="Mode probabilities">${decisionBars(decision.answer, hubMode)}</ul>`
      : '';
  }

  function renderPad() {
    const order = ['7', '8', '9', '4', '5', '6', '', '2', ''];
    $('teleop').innerHTML = order.map((d) => (d
      ? `<button type="button" class="btn btn--secondary pad__btn" data-tele="${d}" aria-label="${TELEOP[d].label}" disabled>${{ 7: '↖', 8: '↑', 9: '↗', 4: '↺', 5: '■', 6: '↻', 2: '↓' }[d]}</button>`
      : '<span></span>')).join('');
    $('link-modes').innerHTML = Object.entries(MODES).map(([k, m]) => `<button type="button" class="btn btn--secondary btn--sm" data-mode="${k}" disabled>${escHtml(m.label)}</button>`).join('');
  }

  async function connectToggle() {
    if (link && link.state !== 'idle') { link.disconnect(); link = null; renderStatus(); return; }
    link = makeLink();
    if (!link.available()) { renderStatus(); return; }
    try {
      await link.connect();
      if (source === 'virtual') showToast('Virtual hub attached: the Simulate tab now runs as the exported program.');
    } catch (err) {
      if (!/cancel/i.test(err?.message || '')) showToast(err?.message || 'Could not connect.');
      link = null;
      renderStatus();
    }
  }

  function send(fn) {
    if (!link || link.state !== 'connected') return;
    fn().catch((e) => showToast(e.message || 'The hub refused that.'));
  }

  function bind() {
    $('link-source').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-source]');
      if (!btn || btn.dataset.source === source) return;
      if (link && link.state !== 'idle') { link.disconnect(); link = null; }
      source = btn.dataset.source;
      s.linkSource = source;
      persist();
      renderStatus();
    });
    $('link-connect').addEventListener('click', connectToggle);
    $('link-start').addEventListener('click', () => send(() => link.startProgram()));
    $('link-stop').addEventListener('click', () => send(() => link.stopProgram()));
    $('link-modes').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mode]');
      if (!btn) return;
      auto = false; $('link-auto').checked = false;
      send(() => link.sendMode(btn.dataset.mode));
    });
    $('link-auto').addEventListener('change', (e) => { auto = e.target.checked; decision = null; renderFacts(); });
    const pad = $('teleop');
    pad.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tele]');
      if (!btn) return;
      auto = false; $('link-auto').checked = false;
      send(() => link.sendTeleop(btn.dataset.tele));
      pad.focus();
    });
    pad.addEventListener('keydown', (e) => {
      const d = KEY_TO_TELEOP[e.key];
      if (!d || e.repeat) return;
      e.preventDefault();
      heldKey = d === '5' ? null : e.key;
      auto = false; $('link-auto').checked = false;
      send(() => link.sendTeleop(d));
    });
    pad.addEventListener('keyup', (e) => {
      if (e.key !== heldKey) return;
      heldKey = null;
      send(() => link.sendTeleop('5'));
    });
    pad.addEventListener('blur', () => { if (heldKey) { heldKey = null; send(() => link.sendTeleop('5')); } });
    $('link-run-btn').addEventListener('click', async () => {
      if (!link || link.state !== 'connected') return;
      const code = modesProgram(build(s));
      $('link-run-btn').disabled = true;
      try {
        await link.runSource(code);
        showToast('Sent. Watch the hub output for errors.');
      } catch (err) {
        showToast(err.message || 'The REPL did not accept it.');
      } finally { $('link-run-btn').disabled = link?.state !== 'connected'; }
    });
    $('link-clear').addEventListener('click', () => { log.length = 0; $('link-log').textContent = ''; });
  }

  renderPad();
  bind();
  renderStatus();
  renderFacts();
  return { render() { renderStatus(); renderFacts(); } };
}
