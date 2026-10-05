// ── Entry point ──────────────────────────────────────────────
// Import modules and initialize the app.
// Keep this file under 50 lines: it only wires things together.

import { state, loadSaved } from './state.js';
import { renderBuild, renderPaths } from './render.js';
import { renderSimControls, renderRules } from './simpanel.js';
import { bindEvents } from './events.js';

function init() {
  loadSaved(state);
  renderBuild(state);
  renderPaths();
  renderSimControls(state);
  renderRules(state);
  bindEvents(state);
}

init();
