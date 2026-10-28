// Shared DOM helpers: element builder, icons, move list, player bars, and a
// small "step through the moves" controller used by every view.
import { parseFen } from './board.js';
import { settings } from './store.js';
import { playMove } from './sound.js';
import { t } from './i18n.js';
import { localFamily } from './openings.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  name: '<path d="M4 6.5h16M4 12h10M4 17.5h7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M15.5 17.5l2 2 4-4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  play: '<path d="M12 3.2a3.1 3.1 0 0 0-2 5.5c-1 .6-1.7 1.6-1.7 2.8h1.9c-.3 2.6-1.5 4.6-3.3 6.1v1.1h10.2v-1.1c-1.8-1.5-3-3.5-3.3-6.1h1.9c0-1.2-.7-2.2-1.7-2.8a3.1 3.1 0 0 0-2-5.5z" fill="currentColor"/><rect x="5.6" y="19.6" width="12.8" height="1.9" rx=".95" fill="currentColor"/>',
  library: '<path d="M5 4.5h3.5v15H5zM10 4.5h3.5v15H10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M15 6l3.3-.9 3 14-3.3.9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  settings: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  soundOn: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  soundOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  first: '<path d="M7 6v12M18 6l-7 6 7 6z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  prev: '<path d="M15.5 5.5L9 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  next: '<path d="M8.5 5.5L15 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  last: '<path d="M17 6v12M6 6l7 6-7 6z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  flip: '<path d="M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  hint: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  retry: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4.5 4v4.5H9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  arrowRight: '<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  back: '<path d="M19 12H6M11 6.5L5.5 12l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  search: '<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15 15l5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  flame: '<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.3 2.4-5.4 3.6-8 .4 1.6 1.3 2.6 2.4 3.2C11.6 6.7 13 4.4 15.6 3c-.5 2.8.6 4.6 1.9 6.4 1 1.4 1.5 2.9 1.5 4.7C19 18.2 16.3 21 12 21z" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  cross: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>',
  half: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM12 14v3.5M8.5 20h7M7 6H4.5c0 2.5 1.2 4 3 4.2M17 6h2.5c0 2.5-1.2 4-3 4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  mate: '<path d="M12 2.6v3.6M10.2 4.3h3.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6.5 20.5h11l-.9-4.4c2-1.2 3.3-3.2 3.3-5.4 0-2-1.6-3.4-3.5-3.4-1.7 0-3 1-4.4 2.8-1.4-1.8-2.7-2.8-4.4-2.8C5.7 7.3 4.1 8.7 4.1 10.7c0 2.2 1.3 4.2 3.3 5.4z" fill="currentColor"/><path d="M9.4 12.4l5.2 5.2M14.6 12.4l-5.2 5.2" stroke="#262522" stroke-width="1.8" stroke-linecap="round"/>',
  globe: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  book: '<path d="M3.5 6c2.8-1.3 5.6-1.3 8.5.6 2.9-1.9 5.7-1.9 8.5-.6v12.5c-2.8-1.3-5.6-1.3-8.5.6-2.9-1.9-5.7-1.9-8.5-.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 6.6v12.5" stroke="currentColor" stroke-width="2"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

export function iconEl(name, cls = '') {
  const span = document.createElement('span');
  span.className = 'icon-wrap';
  span.innerHTML = icon(name, cls);
  return span.firstChild;
}

export function button(label, { kind = 'secondary', iconName, onclick, title, cls = '' } = {}) {
  const b = h('button', { class: `btn btn-${kind} ${cls}`, onclick, title, type: 'button' });
  if (iconName) b.insertAdjacentHTML('beforeend', icon(iconName));
  if (label) b.append(h('span', {}, label));
  return b;
}

// "Sicilian Defense: Najdorf Variation" with the family in bold.
export function nameEl(o, cls = '') {
  const [family, ...rest] = o.parts;
  return h('span', { class: `op-name ${cls}` },
    h('span', { class: 'op-family' }, family),
    rest.length ? h('span', { class: 'op-variation' }, `: ${rest.join(', ')}`) : null);
}

/** A small stat tile: icon, big value, label underneath. */
export function statEl(iconName, value, label, hot = false) {
  return h('div', { class: 'stat' + (hot ? ' hot' : ''), html: icon(iconName) }, h('b', {}, value), h('span', {}, label));
}

/** The opening's family in the interface language ("Obrona sycylijska"), if translated. */
export function localNameEl(o, cls = '') {
  const fam = localFamily(o);
  return fam ? h('div', { class: `op-local ${cls}` }, fam) : null;
}

// ---- moves in figurine notation ("♘f3" with a piece picture), readable in any language ----

const FIGURINE = /^([KQRBN])|=([QRBN])/g;

/** A SAN move ("Nf3", "exd8=Q+") with the piece letters drawn as small pieces. */
export function sanEl(san) {
  const el = h('span', { class: 'san', 'data-san': san, title: san });
  let last = 0;
  for (const m of san.matchAll(FIGURINE)) {
    const piece = m[1] || m[2];
    const at = m.index + (m[2] ? 1 : 0);
    if (at > last) el.append(san.slice(last, at));
    el.append(h('span', { class: 'fig', style: `background-image:url(pieces/${settings.pieceSet}/w${piece}.svg)`, 'aria-label': piece }));
    last = m.index + m[0].length;
  }
  if (last < san.length) el.append(san.slice(last));
  return el;
}

/** "1.e4 c5 2.♘f3 …" for a list of SAN moves. */
export function lineEl(sans, max = 8) {
  const el = h('span', { class: 'line' });
  sans.slice(0, max).forEach((san, i) => {
    if (i) el.append(' ');
    if (i % 2 === 0) el.append(`${i / 2 + 1}.`);
    el.append(sanEl(san));
  });
  if (sans.length > max) el.append(' …');
  return el;
}

// ---- move list -------------------------------------------------------------------

/**
 * @param {HTMLElement} box
 * @param {{san: string[], current: number, onPick?: (ply: number) => void, placeholder?: string, hidden?: boolean}} o
 *   `current` is the number of plies shown on the board (0 = start position).
 */
export function renderMoves(box, { san, current, onPick, placeholder, hidden }) {
  box.replaceChildren();
  if (!san.length) {
    box.append(h('div', { class: 'moves-empty' }, placeholder || t('common.noMoves')));
    return;
  }
  for (let i = 0; i < san.length; i += 2) {
    const row = h('div', { class: 'move-row' }, h('span', { class: 'move-no' }, `${i / 2 + 1}.`));
    for (const ply of [i, i + 1]) {
      if (ply >= san.length) {
        row.append(h('span', { class: 'move' }));
        continue;
      }
      const cell = h('span', {
        class: 'move' + (ply === current - 1 ? ' current' : '') + (onPick ? ' clickable' : ''),
        onclick: onPick ? () => onPick(ply + 1) : null,
      }, hidden ? '•••' : sanEl(san[ply]));
      row.append(cell);
    }
    box.append(row);
  }
  const cur = box.querySelector('.current');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
  else box.scrollTop = box.scrollHeight;
}

/**
 * Keeps a row of buttons on one line: if the labels don't fit (long words in some
 * languages, narrow windows), the icons are dropped first and only then does it wrap.
 */
export function fitButtonRows(root = document) {
  requestAnimationFrame(() => {
    for (const row of root.querySelectorAll('.btn-row')) {
      row.classList.remove('tight');
      if (row.scrollWidth > row.clientWidth + 1) row.classList.add('tight');
    }
  });
}

export function navBar(handlers) {
  const bar = h('div', { class: 'nav-bar' });
  for (const [key, title] of [['first', 'navbar.start'], ['prev', 'navbar.back'], ['next', 'navbar.forward'], ['last', 'navbar.end']]) {
    bar.append(button('', { iconName: key, onclick: handlers[key], title: t(title), kind: 'nav' }));
  }
  bar.append(button('', { iconName: 'flip', onclick: handlers.flip, title: t('navbar.flip'), kind: 'nav' }));
  return bar;
}

// ---- stepping through a fixed line ---------------------------------------------

/** Shows ply `n` of a replayed line on the board. */
export function showPly(board, line, n, { sound = false, animate = true } = {}) {
  const m = line.moves[n - 1];
  board.setPosition(line.fens[n], { lastMove: m ? { from: m.from, to: m.to } : null, check: line.checks[n], animate });
  if (sound && m) playMove(m, !!line.checks[n]);
}

// ---- player bars -----------------------------------------------------------------

const VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
const START = { P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1 };
const ORDER = ['P', 'N', 'B', 'R', 'Q'];

/** Pieces each side has captured, and the material balance (positive = white ahead). */
export function material(fen) {
  const count = { w: { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 }, b: { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 } };
  for (const code of parseFen(fen).values()) count[code[0]][code[1]]++;
  const lost = (c) => ORDER.flatMap((p) => Array(Math.max(0, START[p] - count[c][p])).fill(p));
  const score = (c) => ORDER.reduce((s, p) => s + VALUE[p] * count[c][p], 0);
  return { byWhite: lost('b'), byBlack: lost('w'), balance: score('w') - score('b') };
}

export function setPlayers(bars, { top, bottom, fen }) {
  const mat = fen ? material(fen) : null;
  for (const [el, p] of [[bars.top, top], [bars.bottom, bottom]]) {
    el.querySelector('.p-avatar').className = `p-avatar ${p.avatar || ''}`;
    el.querySelector('.p-name').textContent = p.name;
    el.querySelector('.p-sub').textContent = p.sub || '';
    const cap = el.querySelector('.p-captured');
    cap.replaceChildren();
    if (mat && p.color) {
      const taken = p.color === 'w' ? mat.byWhite : mat.byBlack;
      const victim = p.color === 'w' ? 'b' : 'w';
      for (const piece of taken) {
        cap.append(h('span', { class: 'cap-piece', style: `background-image:url(pieces/${settings.pieceSet}/${victim}${piece}.svg)` }));
      }
      const adv = p.color === 'w' ? mat.balance : -mat.balance;
      if (adv > 0) cap.append(h('span', { class: 'cap-adv' }, `+${adv}`));
    }
    const clock = el.querySelector('.p-clock');
    clock.hidden = p.clock == null;
    clock.textContent = p.clock ?? '';
    clock.classList.toggle('active', !!p.clockActive);
  }
}

export function formatClock(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
