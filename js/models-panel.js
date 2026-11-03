// The Models and ideas tab: published builds with instructions, and ideas
// past the box, each marked against the kits the visitor owns. The data is
// js/models.js; nothing here knows a URL.
import { KITS } from './catalog.js';
import { MODEL_BUCKETS, IDEAS, SOURCES_CHECKED } from './models.js';
import { escHtml, $ } from './utils.js';

const DIFFICULTY = { 1: 'Starter', 2: 'Intermediate', 3: 'Advanced' };

function kitFit(item, owned) {
  const kits = item.kits || [];
  const have = kits.filter((k) => owned.includes(k));
  if (!kits.length) return { level: 'warn', text: 'Extra parts' };
  if (have.length === kits.length) return { level: 'ok', text: kits.length > 1 ? 'Both kits' : KITS[kits[0]]?.name || kits[0] };
  if (have.length) return { level: 'ok', text: have.map((k) => KITS[k]?.name || k).join(' or ') };
  return { level: 'no', text: `Needs ${kits.map((k) => k).join(' or ')}` };
}

const host = (url) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };
const link = (url, label) => (url ? `<a href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(label || host(url))}</a>` : '');

function modelCard(item, owned) {
  const fit = kitFit(item, owned);
  const links = [
    item.instructions ? link(item.instructions, 'Instructions') : '',
    item.code ? link(item.code, 'Code') : '',
    item.page ? link(item.page, host(item.page)) : '',
  ].filter(Boolean).join(' · ');
  const meta = [
    item.platform,
    item.difficulty ? DIFFICULTY[item.difficulty] : null,
    item.free === true ? 'free' : item.free === false ? 'paid' : item.free ? escHtml(item.free) : null,
  ].filter(Boolean).join(' · ');
  return `<article class="card model${fit.level === 'no' ? ' model--dim' : ''}">
    <div class="project__top"><h4>${escHtml(item.name)}</h4><span class="badge badge--${fit.level}">${escHtml(fit.text)}</span></div>
    <p class="muted project__meta">${escHtml(item.by || '')}${meta ? `${item.by ? ' · ' : ''}${meta}` : ''}</p>
    <p>${escHtml(item.what)}</p>
    ${item.extras ? `<p class="field__hint">Beyond the box: ${escHtml(item.extras)}</p>` : ''}
    ${item.note ? `<p class="field__hint">${escHtml(item.note)}</p>` : ''}
    ${links ? `<p class="model__links">${links}</p>` : ''}
  </article>`;
}

function ideaCard(idea, owned, i) {
  const fit = kitFit(idea, owned);
  return `<article class="card model idea">
    <div class="project__top"><h4><span class="level__n">${i + 1}</span> ${escHtml(idea.title)}</h4><span class="badge badge--${fit.level}">${escHtml(fit.text)}</span></div>
    <p>${escHtml(idea.what)}</p>
    <p class="muted">${escHtml(idea.why)}</p>
    <dl class="idea__split">
      <dt>Rehearse here</dt><dd>${escHtml(idea.sim)}</dd>
      <dt>Only for real</dt><dd>${escHtml(idea.real)}</dd>
      ${idea.extras ? `<dt>Beyond the box</dt><dd>${escHtml(idea.extras)}</dd>` : ''}
    </dl>
    ${idea.refs?.length ? `<p class="model__links">${idea.refs.map((r) => link(r.url, r.label)).join(' · ')}</p>` : ''}
  </article>`;
}

export function renderModels(s) {
  const owned = s.owned;
  const buckets = MODEL_BUCKETS.map((b) => `<div class="level">
    <h3 class="level__title">${escHtml(b.title)}</h3>
    <p class="field__hint">${escHtml(b.lead)}</p>
    <div class="project-grid">${b.items.map((it) => modelCard(it, owned)).join('')}</div>
  </div>`).join('');
  const ideas = `<div class="level">
    <h3 class="level__title">Bigger ideas</h3>
    <p class="field__hint">Each one says what the 2D arena can rehearse and what only the real robot can tell you. Most fit the shape this site already uses: the hub runs the fast loops, a laptop asks a typed question, a byte comes back.</p>
    <div class="project-grid project-grid--wide">${IDEAS.map((idea, i) => ideaCard(idea, owned, i)).join('')}</div>
  </div>`;
  const empty = !MODEL_BUCKETS.length && !IDEAS.length ? '<p class="field__hint">Nothing catalogued yet.</p>' : '';
  $('models').innerHTML = `${empty}${buckets}${IDEAS.length ? ideas : ''}
    <p class="field__hint">Sources were read on ${escHtml(SOURCES_CHECKED)}; links go to their owners and can move. LEGO, MINDSTORMS and Robot Inventor are LEGO Group trademarks; the box models are LEGO's.</p>`;
}
