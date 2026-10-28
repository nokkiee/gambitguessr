// App shell: sidebar navigation, shared board, settings dialog and keyboard shortcuts.
import { Board } from './board.js';
import { loadOpenings, LEVELS } from './openings.js';
import { loadPuzzles } from './puzzles.js';
import { settings, setSetting, resetProgress } from './store.js';
import { LANGUAGES, pickLanguage, setLanguage, t, tIn, lang } from './i18n.js';
import { h, icon, button, fitButtonRows } from './ui.js';
import { NameView } from './modes/name.js';
import { PlayView } from './modes/play.js';
import { MateView } from './modes/mate.js';
import { LibraryView } from './modes/library.js';

// Every set here may be freely redistributed; see THIRD_PARTY_NOTICES.md.
const PIECE_SETS = [
  ['cburnett', 'pieces.classic'], ['mpchess', 'pieces.bold'], ['merida', 'pieces.merida'], ['chessnut', 'pieces.chessnut'],
  ['celtic', 'pieces.celtic'], ['fantasy', 'pieces.fantasy'], ['rhosgfx', 'pieces.wood'],
];
const THEMES = [
  ['green', 'theme.green', '#ebecd0', '#739552'], ['brown', 'theme.brown', '#f0d9b5', '#b58863'],
  ['blue', 'theme.blue', '#dee3e6', '#8ca2ad'], ['purple', 'theme.purple', '#efeff5', '#8877b7'],
  ['gray', 'theme.gray', '#d9d9d9', '#8c8c8c'],
];
const SPEEDS = [[0, 'set.speed.off'], [120, 'set.speed.fast'], [200, 'set.speed.normal'], [320, 'set.speed.slow']];

// Sidebar order; the number keys 1–4 follow it.
const VIEWS = [
  ['name', 'nav.name', 'name'],
  ['play', 'nav.play', 'play'],
  ['mate', 'nav.mate', 'mate'],
  ['library', 'nav.library', 'library'],
];

let current = null;
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
    return h('div', { class: 'seg', role: 'tablist', title: t('level.difficulty') },
      ...Object.entries(LEVELS).map(([id, l]) => h('button', {
        type: 'button', class: 'seg-opt' + (settings.level === id ? ' active' : ''),
        onclick: () => { if (settings.level !== id) { setSetting('level', id); onChange(); } },
      }, h('span', { class: 'lvl-dot', style: `background:${l.color}` }), t(`level.${id}`))));
  },
};

function go(id, arg) {
  current?.leave();
  current = views[id];
  for (const b of document.querySelectorAll('.nav-item[data-view]')) b.classList.toggle('active', b.dataset.view === id);
  setSetting('lastView', id);
  current.enter(arg);
}

// ---- sidebar & appearance -------------------------------------------------------------------

function renderNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren(...VIEWS.map(([id, label, iconName]) => h('button', {
    type: 'button', class: 'nav-item' + (current === views[id] ? ' active' : ''), 'data-view': id,
    html: icon(iconName), onclick: () => go(id), title: t(label),
  }, h('span', {}, t(label)))));
  const settingsBtn = document.getElementById('btn-settings');
  settingsBtn.innerHTML = icon('settings') + `<span>${t('nav.settings')}</span>`;
  settingsBtn.title = t('nav.settings');
  document.querySelector('#settings .dlg-close').title = t('set.close');
  const langBtn = document.getElementById('btn-lang');
  langBtn.innerHTML = icon('globe') + `<span>${LANGUAGES.find(([c]) => c === lang)[1]}</span>`;
  langBtn.title = t('set.language');
}

// ---- language picker: shown on the very first start, and from the sidebar's language button ----

/**
 * Lets the player choose the interface language. On the first start it can't be dismissed
 * without choosing; the choice is saved, so it isn't asked again.
 * @returns {Promise<void>} resolves once a language is chosen (or the picker is closed)
 */
function openLanguagePicker({ firstRun = false } = {}) {
  const dlg = document.getElementById('language');
  let chosen = lang;
  return new Promise((resolve) => {
    const done = () => {
      dlg.removeEventListener('cancel', onCancel);
      if (dlg.open) dlg.close();
      resolve();
    };
    const confirm = () => {
      changeLanguage(chosen);
      done();
    };
    const onCancel = (e) => {
      if (firstRun) e.preventDefault(); // a choice is needed on the first start
      else done();
    };
    dlg.addEventListener('cancel', onCancel);

    const render = () => {
      dlg.lang = chosen;
      dlg.replaceChildren(...[
        firstRun ? null : h('button', { type: 'button', class: 'dlg-close lang-close', title: tIn(chosen, 'set.close'), onclick: done }, '✕'),
        h('div', { class: 'lang-hero' },
          h('span', { class: 'logo-mark' }),
          h('span', { class: 'logo-text' }, 'Gambit', h('span', { class: 'logo-accent' }, 'Guessr'))),
        h('div', { class: 'lang-title' }, tIn(chosen, 'welcome.title')),
        h('div', { class: 'lang-grid', role: 'radiogroup' }, ...LANGUAGES.map(([code, label]) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(code === chosen), lang: code, 'data-lang': code,
          class: 'lang-card' + (code === chosen ? ' active' : ''),
          onclick: () => { chosen = code; render(); },
          ondblclick: () => { chosen = code; confirm(); },
        }, h('span', { class: 'lang-code' }, code.toUpperCase()), h('span', { class: 'lang-name' }, label)))),
        h('div', { class: 'lang-sub' }, tIn(chosen, 'welcome.sub')),
        h('div', { class: 'lang-actions' },
          button(tIn(chosen, firstRun ? 'welcome.start' : 'welcome.save'), { kind: 'primary', onclick: confirm, cls: 'lang-confirm' })),
      ].filter(Boolean));
      dlg.querySelector('.lang-card.active')?.focus();
    };
    render();
    if (!dlg.open) dlg.showModal();
  });
}

function applyAppearance() {
  const root = document.getElementById('board');
  root.dataset.theme = settings.boardTheme;
  root.classList.toggle('no-coords', !settings.coords);
  board.setPieceSet(settings.pieceSet);
  board.setAnimation(settings.animMs);
  board.showDests = settings.showDests;
  board.renderOverlays();
  const btn = document.getElementById('btn-sound');
  const label = t(settings.sound ? 'nav.soundOn' : 'nav.soundOff');
  btn.innerHTML = icon(settings.sound ? 'soundOn' : 'soundOff') + `<span>${label}</span>`;
  btn.title = label;
}

function changeLanguage(code) {
  setSetting('lang', code);
  setLanguage(code);
  renderNav();
  applyAppearance();
  current?.refresh?.();
}

// ---- settings dialog ---------------------------------------------------------------------

function openSettings() {
  const dlg = document.getElementById('settings');
  dlg.querySelector('.dlg-head > span').textContent = t('set.title');
  const body = dlg.querySelector('.dlg-body');

  const langRow = h('div', { class: 'seg seg-small lang-seg' }, ...LANGUAGES.map(([code, label]) => h('button', {
    type: 'button', class: 'seg-opt' + (settings.lang === code || (!settings.lang && document.documentElement.lang === code) ? ' active' : ''),
    lang: code,
    onclick: () => { changeLanguage(code); openSettings(); },
  }, label)));

  const pieceRow = h('div', { class: 'piece-sets' }, ...PIECE_SETS.map(([id, label]) => h('button', {
    type: 'button', class: 'piece-set' + (settings.pieceSet === id ? ' active' : ''), title: t(label), 'data-set': id,
    onclick: () => { setSetting('pieceSet', id); applyAppearance(); current?.refresh?.(); openSettings(); },
  }, h('span', { class: 'ps-img', style: `background-image:url(pieces/${id}/wN.svg)` }), h('span', {}, t(label)))));

  const themeRow = h('div', { class: 'themes' }, ...THEMES.map(([id, label, light, dark]) => h('button', {
    type: 'button', class: 'theme' + (settings.boardTheme === id ? ' active' : ''), title: t(label), 'data-theme': id,
    style: `background: linear-gradient(135deg, ${light} 0 50%, ${dark} 50% 100%)`,
    onclick: () => { setSetting('boardTheme', id); applyAppearance(); openSettings(); },
  })));

  const toggle = (key, label, hint) => h('label', { class: 'toggle-row' },
    h('span', {}, h('span', { class: 'toggle-label' }, t(label)), hint ? h('span', { class: 'toggle-hint' }, t(hint)) : null),
    h('input', {
      type: 'checkbox', class: 'switch', checked: settings[key],
      onchange: (e) => { setSetting(key, e.target.checked); applyAppearance(); },
    }));

  const speed = h('div', { class: 'seg seg-small' }, ...SPEEDS.map(([ms, label]) => h('button', {
    type: 'button', class: 'seg-opt' + (settings.animMs === ms ? ' active' : ''),
    onclick: () => { setSetting('animMs', ms); applyAppearance(); openSettings(); },
  }, t(label))));

  body.replaceChildren(
    h('div', { class: 'dlg-section' }, h('div', { class: 'dlg-label' }, t('set.language')), langRow),
    h('div', { class: 'dlg-section' }, h('div', { class: 'dlg-label' }, t('set.pieces')), pieceRow),
    h('div', { class: 'dlg-section' }, h('div', { class: 'dlg-label' }, t('set.board')), themeRow),
    h('div', { class: 'dlg-section' },
      h('div', { class: 'toggle-row' }, h('span', { class: 'toggle-label' }, t('set.anim')), speed),
      toggle('sound', 'set.sound'),
      toggle('showDests', 'set.dests', 'set.destsHint'),
      toggle('coords', 'set.coords'),
      toggle('nameAnimate', 'set.nameAnimate', 'set.nameAnimateHint')),
    h('div', { class: 'dlg-section' },
      h('div', { class: 'toggle-row' },
        h('span', {}, h('span', { class: 'toggle-label' }, t('set.progress')), h('span', { class: 'toggle-hint' }, t('set.progressHint'))),
        h('button', {
          type: 'button', class: 'btn btn-danger',
          onclick: (e) => {
            const b = e.currentTarget;
            if (b.dataset.armed) {
              resetProgress();
              b.textContent = t('set.cleared');
              b.disabled = true;
              current?.refresh?.();
              return;
            }
            b.dataset.armed = '1';
            b.textContent = t('set.confirm');
          },
        }, t('set.reset')))));
  if (!dlg.open) dlg.showModal();
}

// ---- keyboard --------------------------------------------------------------------------

function onKey(e) {
  if (document.getElementById('settings').open || document.getElementById('language').open) return;
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (!typing && (e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
    board.flip();
    current?.updatePlayers?.(board.fen);
    return;
  }
  if (!typing && !e.ctrlKey && !e.altKey && /^[1-4]$/.test(e.key)) {
    go(VIEWS[Number(e.key) - 1][0]);
    return;
  }
  current?.onKey?.(e);
}

// ---- start ---------------------------------------------------------------------------

async function main() {
  setLanguage(pickLanguage(settings.lang, navigator.language));
  renderNav();
  document.getElementById('btn-settings').onclick = openSettings;
  document.getElementById('btn-lang').onclick = () => openLanguagePicker();
  document.getElementById('btn-sound').onclick = () => { setSetting('sound', !settings.sound); applyAppearance(); };
  document.getElementById('settings').addEventListener('click', (e) => {
    if (e.target.id === 'settings' || e.target.closest('.dlg-close')) document.getElementById('settings').close();
  });

  board = new Board(document.getElementById('board'), { onMove: (m) => current?.handleMove?.(m) });
  // A piece set saved by an older version may no longer exist.
  if (!PIECE_SETS.some(([id]) => id === settings.pieceSet)) setSetting('pieceSet', 'cburnett');
  applyAppearance();
  await loadOpenings();
  await loadPuzzles();
  views = { name: new NameView(ctx), play: new PlayView(ctx), mate: new MateView(ctx), library: new LibraryView(ctx) };
  // First start: ask which language to use (the system language is preselected).
  if (!settings.lang) await openLanguagePicker({ firstRun: true });
  document.addEventListener('keydown', onKey);
  // Re-fit button rows whenever a screen redraws its panel or the window is resized.
  new MutationObserver(() => fitButtonRows(ctx.panel)).observe(ctx.panel, { childList: true, subtree: true });
  window.addEventListener('resize', () => fitButtonRows(ctx.panel));
  document.body.classList.remove('loading');
  go(views[settings.lastView] ? settings.lastView : 'name');
}

main().catch((err) => {
  console.error(err);
  document.getElementById('panel').textContent = t('app.startError', { error: err.message });
});
