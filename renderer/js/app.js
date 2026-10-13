// App shell: sidebar navigation, shared board, settings dialog and keyboard shortcuts.
import { Board } from './board.js';
import { loadOpenings, LEVELS } from './openings.js';
import { settings, setSetting, resetProgress } from './store.js';
import { h, icon } from './ui.js';
import { NameView } from './modes/name.js';
import { PlayView } from './modes/play.js';
import { LibraryView } from './modes/library.js';

// Every set here may be freely redistributed; see THIRD_PARTY_NOTICES.md.
const PIECE_SETS = [
  ['cburnett', 'Classic'], ['mpchess', 'Bold'], ['merida', 'Merida'], ['chessnut', 'Chessnut'],
  ['celtic', 'Celtic'], ['fantasy', 'Fantasy'], ['rhosgfx', 'Wood'],
];
const THEMES = [
  ['green', 'Green', '#ebecd0', '#739552'], ['brown', 'Brown', '#f0d9b5', '#b58863'],
  ['blue', 'Blue', '#dee3e6', '#8ca2ad'], ['purple', 'Purple', '#efeff5', '#8877b7'],
  ['gray', 'Gray', '#d9d9d9', '#8c8c8c'],
];
const SPEEDS = [[0, 'Off'], [120, 'Fast'], [200, 'Normal'], [320, 'Slow']];

const VIEWS = [
  ['name', 'Name It', 'name'],
  ['play', 'Play It', 'play'],
  ['library', 'Library', 'library'],
];

let current = null;
let currentId = null;
let views = {};
let board;

const ctx = {
  get board() { return board; },
  panel: document.getElementById('panel'),
  bars: { top: document.getElementById('player-top'), bottom: document.getElementById('player-bottom') },
  go,
  panelHead(iconName, title) {
    return h('div', { class: 'panel-head', html: icon(iconName) }, h('span', {}, title));
  },
  levelPicker(onChange) {
    return h('div', { class: 'seg', role: 'tablist', title: 'Difficulty' },
      ...Object.entries(LEVELS).map(([id, l]) => h('button', {
        type: 'button', class: 'seg-opt' + (settings.level === id ? ' active' : ''),
        onclick: () => { if (settings.level !== id) { setSetting('level', id); onChange(); } },
      }, h('span', { class: 'lvl-dot', style: `background:${l.color}` }), l.label)));
  },
};

function go(id, arg) {
  current?.leave();
  currentId = id;
  current = views[id];
  for (const b of document.querySelectorAll('.nav-item[data-view]')) b.classList.toggle('active', b.dataset.view === id);
  setSetting('lastView', id);
  current.enter(arg);
}

// ---- appearance ----------------------------------------------------------------------

function applyAppearance() {
  const root = document.getElementById('board');
  root.dataset.theme = settings.boardTheme;
  root.classList.toggle('no-coords', !settings.coords);
  board.setPieceSet(settings.pieceSet);
  board.setAnimation(settings.animMs);
  board.showDests = settings.showDests;
  board.renderOverlays();
  const btn = document.getElementById('btn-sound');
  btn.innerHTML = icon(settings.sound ? 'soundOn' : 'soundOff') + `<span>${settings.sound ? 'Sound on' : 'Sound off'}</span>`;
}

// ---- settings dialog ---------------------------------------------------------------------

function openSettings() {
  const dlg = document.getElementById('settings');
  const body = dlg.querySelector('.dlg-body');

  const pieceRow = h('div', { class: 'piece-sets' }, ...PIECE_SETS.map(([id, label]) => h('button', {
    type: 'button', class: 'piece-set' + (settings.pieceSet === id ? ' active' : ''), title: label,
    onclick: () => { setSetting('pieceSet', id); applyAppearance(); openSettings(); },
  }, h('span', { class: 'ps-img', style: `background-image:url(pieces/${id}/wN.svg)` }), h('span', {}, label))));

  const themeRow = h('div', { class: 'themes' }, ...THEMES.map(([id, label, light, dark]) => h('button', {
    type: 'button', class: 'theme' + (settings.boardTheme === id ? ' active' : ''), title: label,
    style: `background: linear-gradient(135deg, ${light} 0 50%, ${dark} 50% 100%)`,
    onclick: () => { setSetting('boardTheme', id); applyAppearance(); openSettings(); },
  })));

  const toggle = (key, label, hint) => h('label', { class: 'toggle-row' },
    h('span', {}, h('span', { class: 'toggle-label' }, label), hint ? h('span', { class: 'toggle-hint' }, hint) : null),
    h('input', {
      type: 'checkbox', class: 'switch', checked: settings[key],
      onchange: (e) => { setSetting(key, e.target.checked); applyAppearance(); },
    }));

  const speed = h('div', { class: 'seg seg-small' }, ...SPEEDS.map(([ms, label]) => h('button', {
    type: 'button', class: 'seg-opt' + (settings.animMs === ms ? ' active' : ''),
    onclick: () => { setSetting('animMs', ms); applyAppearance(); openSettings(); },
  }, label)));

  body.replaceChildren(
    h('div', { class: 'dlg-section' }, h('div', { class: 'dlg-label' }, 'Pieces'), pieceRow),
    h('div', { class: 'dlg-section' }, h('div', { class: 'dlg-label' }, 'Board'), themeRow),
    h('div', { class: 'dlg-section' },
      h('div', { class: 'toggle-row' }, h('span', { class: 'toggle-label' }, 'Piece animation'), speed),
      toggle('sound', 'Sound effects'),
      toggle('showDests', 'Show legal moves', 'Dots on the squares a selected piece can go to'),
      toggle('coords', 'Show coordinates'),
      toggle('nameAnimate', 'Play the moves out in Name It', 'Otherwise the final position appears at once')),
    h('div', { class: 'dlg-section' },
      h('div', { class: 'toggle-row' },
        h('span', {}, h('span', { class: 'toggle-label' }, 'Learning progress'), h('span', { class: 'toggle-hint' }, 'Clears which openings you have named and played')),
        h('button', {
          type: 'button', class: 'btn btn-danger',
          onclick: (e) => {
            const b = e.currentTarget;
            if (b.dataset.armed) { resetProgress(); b.textContent = 'Cleared'; b.disabled = true; return; }
            b.dataset.armed = '1';
            b.textContent = 'Click again to confirm';
          },
        }, 'Reset progress'))));
  if (!dlg.open) dlg.showModal();
}

// ---- keyboard --------------------------------------------------------------------------

function onKey(e) {
  if (document.getElementById('settings').open) return;
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (!typing && (e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
    board.flip();
    current?.updatePlayers?.(board.fen);
    return;
  }
  if (!typing && !e.ctrlKey && !e.altKey && ['1', '2', '3'].includes(e.key)) {
    go(VIEWS[Number(e.key) - 1][0]);
    return;
  }
  current?.onKey?.(e);
}

// ---- start ---------------------------------------------------------------------------

async function main() {
  const nav = document.getElementById('nav');
  for (const [id, label, iconName] of VIEWS) {
    nav.append(h('button', { type: 'button', class: 'nav-item', 'data-view': id, html: icon(iconName), onclick: () => go(id) }, h('span', {}, label)));
  }
  document.getElementById('btn-settings').innerHTML = icon('settings') + '<span>Settings</span>';
  document.getElementById('btn-settings').onclick = openSettings;
  document.getElementById('btn-sound').onclick = () => { setSetting('sound', !settings.sound); applyAppearance(); };
  document.getElementById('settings').addEventListener('click', (e) => {
    if (e.target.id === 'settings' || e.target.closest('.dlg-close')) document.getElementById('settings').close();
  });

  board = new Board(document.getElementById('board'), { onMove: (m) => current?.handleMove?.(m) });
  // A piece set saved by an older version may no longer exist.
  if (!PIECE_SETS.some(([id]) => id === settings.pieceSet)) setSetting('pieceSet', 'cburnett');
  applyAppearance();
  await loadOpenings();
  views = { name: new NameView(ctx), play: new PlayView(ctx), library: new LibraryView(ctx) };
  document.addEventListener('keydown', onKey);
  document.body.classList.remove('loading');
  go(views[settings.lastView] ? settings.lastView : 'name');
}

main().catch((err) => {
  console.error(err);
  document.getElementById('panel').textContent = `Something went wrong while starting: ${err.message}`;
});
