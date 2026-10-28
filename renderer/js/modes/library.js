// "Library": two shelves, the openings and the Mate It puzzles. Each is split into the
// Beginner/Intermediate/Expert categories with their progress, can be filtered and
// searched, and every entry opens on the board with a button to drill it.
import { Chess } from '../../vendor/chess.js';
import {
  replay, displayAliases, searchText, acceptedNames, openingByName, localFamily, localFamilyOf,
  checkedKing, LEVELS, categoryOf, inCategory,
} from '../openings.js';
import { puzzlesInCategory, puzzleLevel, puzzleOpening, puzzleSolver, puzzleMoveNumber, preparePuzzle } from '../puzzles.js';
import { normalize, splitName } from '../grading.js';
import { settings, setSetting, stats, mastery, mateStatus, recordMate } from '../store.js';
import { playMove } from '../sound.js';
import { LANGUAGES, t, tIn, num } from '../i18n.js';
import { h, icon, button, nameEl, localNameEl, lineEl, renderMoves, navBar, showPly, setPlayers } from '../ui.js';

const PAGE = 200;
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// What differs between the shelves. Status of an entry: 0 new, 1 tried, 2 done (an
// opening named on the first try and played cleanly; a puzzle's mate found on the
// first try without hints).
const SHELVES = {
  openings: {
    label: 'lib.kind.openings', icon: 'book', title: 'lib.title',
    items: inCategory,
    status: (o) => mastery(o.name),
    hay: (o) => o._hay || (o._hay = normalize(searchText(o))),
    // The curated categories read best alphabetically; Expert keeps ECO order.
    sort: (list, cat) => (cat === 'expert' ? list : [...list].sort((a, b) => a.title.localeCompare(b.title))),
    goal: (cat) => t(`goal.${cat}`),
    drills: [['name', 'nav.name'], ['play', 'nav.play']],
    text: {
      todo: 'lib.todo', done: 'lib.learned', card: 'lib.cardTitle', left: 'lib.left', allDone: 'lib.allLearned',
      search: 'lib.search', noMatch: 'lib.noMatch', noneDone: 'lib.noneLearned', listDone: 'lib.allDone',
    },
  },
  mates: {
    label: 'lib.kind.mates', icon: 'mate', title: 'lib.mateTitle',
    items: puzzlesInCategory, // easiest first, the famous traps leading Beginner
    status: (p) => mateStatus(p.id),
    hay: puzzleHay,
    sort: (list) => list,
    goal: (cat) => `${t(`lib.mateGoal.${cat}`)} ${t('lib.mateRule')}`,
    drills: [['mate', 'nav.mate']],
    text: {
      todo: 'lib.mateTodo', done: 'lib.mateSolved', card: 'lib.mateCardTitle', left: 'lib.mateLeft', allDone: 'lib.mateAllSolved',
      search: 'lib.mateSearch', noMatch: 'lib.mateNoMatch', noneDone: 'lib.mateNoneSolved', listDone: 'lib.mateAllDone',
    },
  },
};

/** Puzzles are found by their opening (in any language), trap name or rating. */
function puzzleHay(p) {
  if (p._hay) return p._hay;
  const name = puzzleOpening(p);
  const o = name && openingByName(name);
  const words = [name, ...(o ? acceptedNames(o) : []), o?.eco, p.r];
  if (p.trap) for (const [code] of LANGUAGES) words.push(tIn(code, `trap.${p.trap}`), tIn(code, 'mate.trapLabel'));
  return (p._hay = normalize(words.filter(Boolean).join(' ')));
}

/** An opening given by name, family in bold (also for the rare name not in the opening list). */
function openingNameEl(name) {
  return nameEl(openingByName(name) || { parts: splitName(name) });
}

export class LibraryView {
  constructor(ctx) {
    this.ctx = ctx;
    this.kind = SHELVES[settings.libraryKind] ? settings.libraryKind : 'openings';
    // Each shelf keeps its own place: category, filter, search and scroll position.
    this.shelf = Object.fromEntries(Object.keys(SHELVES).map((k) => [k, { category: settings.level, filter: 'all', query: '', limit: PAGE, scroll: 0 }]));
    this.opening = null;
    this.puzzle = null;
  }

  get s() {
    return this.shelf[this.kind];
  }

  enter(opening) {
    const { board } = this.ctx;
    board.setMovable(null);
    board.clearHint();
    board.clearBadges();
    if (opening) {
      this.kind = 'openings';
      this.open(opening);
    } else if (this.kind === 'mates' && this.puzzle) this.openPuzzle(this.puzzle, { resume: true });
    else if (this.kind === 'openings' && this.opening) this.open(this.opening, { keepPly: true });
    else this.renderList();
  }

  leave() {
    clearTimeout(this.timer);
    this.orientation = this.ctx.board.orientation;
  }

  /** Redraws the panel, e.g. after the interface language changed. */
  refresh() {
    if (this.puzzle) this.renderPuzzleDetail();
    else if (this.opening) this.renderDetail();
    else this.renderList();
    this.updatePlayers(this.ctx.board.fen);
  }

  // ---- list --------------------------------------------------------------------------

  filters() {
    const { status, text } = SHELVES[this.kind];
    return [
      ['all', 'lib.all', () => true],
      ['todo', text.todo, (x) => status(x) < 2],
      ['done', text.done, (x) => status(x) === 2],
    ];
  }

  filtered() {
    const shelf = SHELVES[this.kind];
    const test = this.filters().find(([id]) => id === this.s.filter)[2];
    const words = normalize(this.s.query).split(' ').filter(Boolean);
    const list = shelf.items(this.s.category).filter((x) => test(x) && words.every((w) => shelf.hay(x).includes(w)));
    return shelf.sort(list, this.s.category);
  }

  setKind(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    setSetting('libraryKind', kind);
    this.renderList();
  }

  setCategory(id) {
    Object.assign(this.s, { category: id, limit: PAGE, scroll: 0 });
    this.renderList();
  }

  kindSwitch() {
    return h('div', { class: 'seg lib-kinds', role: 'tablist' }, ...Object.entries(SHELVES).map(([id, shelf]) => h('button', {
      type: 'button', role: 'tab', class: 'seg-opt' + (id === this.kind ? ' active' : ''), 'data-kind': id,
      html: icon(shelf.icon), onclick: () => this.setKind(id),
    }, h('span', {}, t(shelf.label)))));
  }

  categoryCards() {
    const shelf = SHELVES[this.kind];
    return h('div', { class: 'cat-cards', role: 'tablist' }, ...Object.entries(LEVELS).map(([id, l]) => {
      const list = shelf.items(id);
      const done = list.filter((x) => shelf.status(x) === 2).length;
      const all = done === list.length;
      return h('button', {
        type: 'button', role: 'tab',
        class: 'cat-card' + (id === this.s.category ? ' active' : '') + (all ? ' done' : ''),
        style: `--cat:${l.color}`,
        title: t(shelf.text.card, { level: t(`level.${id}`), learned: done, solved: done, total: list.length }),
        onclick: () => this.setCategory(id),
      },
      h('span', { class: 'cat-name' }, t(`level.${id}`), all ? h('span', { class: 'cat-trophy', html: icon('trophy') }) : null),
      h('span', { class: 'cat-count' }, h('b', {}, num(done)), ` / ${num(list.length)}`),
      h('span', { class: 'cat-bar' }, h('span', { class: 'cat-fill', style: `width:${(done / list.length) * 100}%` })));
    }));
  }

  categoryInfo() {
    const shelf = SHELVES[this.kind];
    const cat = this.s.category;
    const list = shelf.items(cat);
    const left = list.filter((x) => shelf.status(x) < 2).length;
    const practise = (view) => () => {
      setSetting('level', cat);
      this.ctx.go(view);
    };
    return h('div', { class: 'cat-info', style: `--cat:${LEVELS[cat].color}` },
      h('div', { class: 'cat-goal' }, shelf.goal(cat)),
      h('div', { class: 'cat-actions' },
        h('span', { class: 'cat-left' + (left ? '' : ' done') },
          left ? t(shelf.text.left, { n: left }) : t(shelf.text.allDone, { n: list.length })),
        h('span', { class: 'grow' }),
        h('span', { class: 'cat-practise' }, t('lib.practise')),
        ...shelf.drills.map(([view, label]) => h('button', { type: 'button', class: 'link-btn', html: icon(view), onclick: practise(view) }, t(label)))));
  }

  renderList() {
    clearTimeout(this.timer);
    this.opening = null;
    this.puzzle = null;
    const shelf = SHELVES[this.kind];
    const { panel, board } = this.ctx;
    board.setOrientation('white');
    board.setPosition(START, { animate: true });
    this.updatePlayers(board.fen);

    const search = h('input', {
      class: 'search-input', type: 'search', placeholder: t(shelf.text.search),
      value: this.s.query, spellcheck: 'false',
      oninput: (e) => { this.s.query = e.target.value; this.s.limit = PAGE; this.fillList(); },
    });
    const inCat = shelf.items(this.s.category);
    const filters = h('div', { class: 'seg seg-small lib-filter' }, ...this.filters().map(([id, label, test]) => h('button', {
      type: 'button', class: 'seg-opt' + (this.s.filter === id ? ' active' : ''),
      onclick: () => { Object.assign(this.s, { filter: id, limit: PAGE, scroll: 0 }); this.renderList(); },
    }, t(label), h('span', { class: 'seg-count' }, num(inCat.filter(test).length)))));

    this.$list = h('div', { class: 'op-list' });
    this.$summary = h('div', { class: 'lib-summary' });
    panel.replaceChildren(
      this.ctx.panelHead('library', t(shelf.title)),
      h('div', { class: 'panel-body lib-body' },
        this.kindSwitch(),
        this.categoryCards(),
        this.categoryInfo(),
        h('div', { class: 'search-wrap', html: icon('search') }, search),
        filters,
        this.$summary,
        this.$list));
    this.fillList();
    this.$list.scrollTop = this.s.scroll;
  }

  fillList() {
    const { text } = SHELVES[this.kind];
    const list = this.filtered();
    this.$summary.textContent = this.s.query ? t('lib.matches', { n: list.length }) : '';
    this.$summary.hidden = !this.s.query;
    const row = this.kind === 'mates' ? (p) => this.puzzleRowEl(p) : (o) => this.rowEl(o);
    this.$list.replaceChildren(...list.slice(0, this.s.limit).map(row));
    if (!list.length) {
      const msg = this.s.query ? text.noMatch : this.s.filter === 'done' ? text.noneDone : text.listDone;
      this.$list.append(h('div', { class: 'moves-empty' }, t(msg)));
    }
    if (list.length > this.s.limit) {
      this.$list.append(h('button', {
        type: 'button', class: 'more-btn',
        onclick: () => {
          this.s.limit += PAGE;
          this.s.scroll = this.$list.scrollTop;
          this.fillList();
          this.$list.scrollTop = this.s.scroll;
        },
      }, t('lib.showMore', { n: list.length - this.s.limit })));
    }
  }

  rowEl(o) {
    const m = mastery(o.name);
    const fam = localFamily(o);
    return h('button', { type: 'button', class: 'op-row', onclick: () => { this.s.scroll = this.$list.scrollTop; this.open(o); } },
      h('span', { class: 'eco' }, o.eco),
      h('span', { class: 'op-row-main' }, nameEl(o),
        h('span', { class: 'op-row-moves' }, fam ? h('span', { class: 'op-row-local' }, `${fam} · `) : null, lineEl(o.plies))),
      h('span', { class: `mastery m${m}`, title: t(`lib.status.${m}`), html: m === 2 ? icon('check') : '' }));
  }

  // A famous trap: its name, then its opening. A game: the opening it came from.
  puzzleRowEl(p) {
    const st = mateStatus(p.id);
    const opening = puzzleOpening(p);
    const local = localFamilyOf(opening);
    const where = `${t(`lib.mateBy.${puzzleSolver(p)}`)} · ${t('mate.moveN', { n: puzzleMoveNumber(p) })}`;
    return h('button', { type: 'button', class: 'op-row', onclick: () => { this.s.scroll = this.$list.scrollTop; this.openPuzzle(p); } },
      p.trap
        ? h('span', { class: 'eco eco-trap', title: t('mate.trapLabel'), html: icon('mate') })
        : h('span', { class: 'eco', title: t('mate.rating', { r: String(p.r) }) }, p.r),
      h('span', { class: 'op-row-main' },
        p.trap ? h('span', { class: 'op-name' }, h('span', { class: 'op-family' }, t(`trap.${p.trap}`))) : openingNameEl(opening),
        h('span', { class: 'op-row-moves' },
          p.trap && opening ? `${local || opening} · ` : null,
          !p.trap && local ? h('span', { class: 'op-row-local' }, `${local} · `) : null,
          where)),
      h('span', { class: `mastery m${st}`, title: t(`lib.mateStatus.${st}`), html: st === 2 ? icon('check') : '' }));
  }

  // ---- one opening ------------------------------------------------------------------

  open(o, { keepPly = false } = {}) {
    const same = this.opening === o;
    this.opening = o;
    this.puzzle = null;
    this.line = replay(o);
    const resume = keepPly && same;
    if (!resume) this.ply = this.line.moves.length;
    const { board } = this.ctx;
    board.setOrientation(resume ? this.orientation || 'white' : 'white');
    this.renderDetail();
    showPly(board, this.line, this.ply, { animate: false });
    this.updatePlayers(board.fen);
  }

  renderDetail() {
    const o = this.opening;
    const st = stats(o.name) || {};
    const chip = (label, s) => h('span', { class: 'chip' + (s?.streak > 0 ? ' ok' : s?.seen ? ' tried' : ''), html: s?.streak > 0 ? icon('check') : '' },
      `${label}${s?.seen ? ` ${s.good}/${s.seen}` : ''}`);
    const others = displayAliases(o);
    this.$moves = h('div', { class: 'moves' });
    this.ctx.panel.replaceChildren(
      this.ctx.panelHead('library', t('lib.title')),
      h('div', { class: 'panel-body' },
        h('button', { type: 'button', class: 'link-btn back-btn', html: icon('back'), onclick: () => this.renderList() }, t('lib.back')),
        h('div', { class: 'detail-head' },
          h('div', { class: 'detail-name' }, nameEl(o)),
          localNameEl(o),
          h('div', { class: 'result-meta' }, `ECO ${o.eco} · ${t('common.halfMoves', { n: o.plies.length })} · `, this.levelTag(categoryOf(o))),
          o.display && o.display !== o.name ? h('div', { class: 'result-meta' }, t('name.listedAs', { name: o.name })) : null,
          others.length ? h('div', { class: 'result-meta' }, t('lib.knownAs', { names: others.slice(0, 3).join(' · ') })) : null,
          h('div', { class: 'chips' }, chip(t('lib.named'), st.name), chip(t('lib.played'), st.play))),
        h('div', { class: 'moves-card' }, h('div', { class: 'moves-head' }, h('span', {}, t('common.moves')),
          h('button', { class: 'link-btn', type: 'button', onclick: () => this.replayLine() }, t('common.replay'))), this.$moves),
        h('div', { class: 'btn-row' },
          button(t('common.nameIt'), { iconName: 'name', onclick: () => this.ctx.go('name', o) }),
          h('div', { class: 'grow' }),
          button(t('common.playIt'), { kind: 'primary', iconName: 'play', onclick: () => this.ctx.go('play', o) }))),
      navBar({
        first: () => this.nav(0), prev: () => this.nav(this.ply - 1),
        next: () => this.nav(this.ply + 1), last: () => this.nav(this.line.moves.length),
        flip: () => { this.ctx.board.flip(); this.updatePlayers(this.ctx.board.fen); },
      }));
    this.renderMoveList();
  }

  levelTag(cat) {
    return h('span', { class: 'level-tag', style: `--cat:${LEVELS[cat].color}` }, t(`level.${cat}`));
  }

  renderMoveList() {
    renderMoves(this.$moves, { san: this.line.moves.map((m) => m.san), current: this.ply, onPick: (n) => this.nav(n) });
  }

  nav(n) {
    if (!this.opening) return;
    clearTimeout(this.timer);
    this.go(n);
  }

  go(n) {
    this.ply = Math.max(0, Math.min(this.line.moves.length, n));
    showPly(this.ctx.board, this.line, this.ply, { sound: true });
    this.renderMoveList();
    this.updatePlayers(this.ctx.board.fen);
  }

  replayLine() {
    clearTimeout(this.timer);
    this.ply = 0;
    showPly(this.ctx.board, this.line, 0, { animate: false });
    this.renderMoveList();
    const tick = () => {
      if (this.ply >= this.line.moves.length || !this.opening) return;
      this.go(this.ply + 1);
      this.timer = setTimeout(tick, Math.max(380, settings.animMs + 220));
    };
    this.timer = setTimeout(tick, 300);
  }

  // ---- one puzzle --------------------------------------------------------------------
  // The board shows the position to solve; the mate stays hidden until asked for.

  openPuzzle(p, { resume = false } = {}) {
    clearTimeout(this.timer);
    if (!(resume && this.puzzle === p && this.prepared)) {
      this.prepared = preparePuzzle(p);
      this.revealed = false;
      this.ply = this.prepared.live;
      this.orientation = this.prepared.solver === 'w' ? 'white' : 'black';
    }
    this.puzzle = p;
    this.opening = null;
    this.ctx.board.setOrientation(this.orientation);
    this.renderPuzzleDetail();
    this.showPosition(this.ply, { animate: false });
  }

  renderPuzzleDetail() {
    const p = this.puzzle;
    const q = this.prepared;
    const st = mateStatus(p.id);
    const local = localFamilyOf(q.opening);
    const meta = p.trap ? t('mate.trapLabel') : t('mate.rating', { r: String(q.rating) });
    this.$moves = h('div', { class: 'moves' });
    this.ctx.panel.replaceChildren(
      this.ctx.panelHead('library', t('lib.mateTitle')),
      h('div', { class: 'panel-body' },
        h('button', { type: 'button', class: 'link-btn back-btn', html: icon('back'), onclick: () => this.renderList() }, t('lib.allPuzzles')),
        h('div', { class: 'detail-head' },
          h('div', { class: 'target-label' }, t(`mate.task.${q.solver}`)),
          h('div', { class: 'detail-name' }, p.trap
            ? h('span', { class: 'op-name' }, h('span', { class: 'op-family' }, t(`trap.${p.trap}`)))
            : openingNameEl(q.opening)),
          p.trap && q.opening ? h('div', { class: 'op-local' }, local ? `${local} · ${q.opening}` : q.opening) : null,
          !p.trap && local ? h('div', { class: 'op-local' }, local) : null,
          h('div', { class: 'result-meta' }, `${meta} · ${t('mate.moveN', { n: q.moveNumber })} · `, this.levelTag(puzzleLevel(p))),
          h('div', { class: 'chips' }, h('span', {
            class: 'chip mate-status' + (st === 2 ? ' ok' : st === 1 ? ' tried' : ''), html: st === 2 ? icon('check') : '',
          }, t(`lib.mateStatus.${st}`)))),
        h('div', { class: 'moves-card' }, h('div', { class: 'moves-head' }, h('span', {}, t('common.moves')),
          h('button', { class: 'link-btn', type: 'button', onclick: () => this.replayPuzzle() }, t('common.replay'))), this.$moves),
        q.url ? h('button', {
          type: 'button', class: 'link-btn game-link', html: icon('external'),
          onclick: () => window.open(q.url, '_blank', 'noopener'),
        }, t('mate.viewGame')) : null,
        h('div', { class: 'btn-row' },
          button(t('lib.revealMate'), { iconName: 'eye', title: t('lib.revealTitle'), onclick: () => this.revealMate() }),
          h('div', { class: 'grow' }),
          button(t('lib.solveIt'), { kind: 'primary', iconName: 'mate', onclick: () => this.ctx.go('mate', p) }))),
      navBar({
        first: () => this.stepPuzzle(0), prev: () => this.stepPuzzle(this.ply - 1),
        next: () => this.stepPuzzle(this.ply + 1), last: () => this.stepPuzzle(Infinity),
        flip: () => { this.ctx.board.flip(); this.orientation = this.ctx.board.orientation; this.updatePlayers(this.ctx.board.fen); },
      }));
    this.renderPuzzleMoves();
  }

  renderPuzzleMoves() {
    const q = this.prepared;
    const [, turn, , , , full] = q.positions[0].fen.split(' ');
    renderMoves(this.$moves, {
      san: q.positions.slice(1).map((pos) => pos.move.san),
      current: this.ply,
      offset: (Number(full) - 1) * 2 + (turn === 'b' ? 1 : 0),
      onPick: (n) => this.stepPuzzle(n),
    });
  }

  showPosition(i, { animate = true, sound = false } = {}) {
    const q = this.prepared;
    this.ply = Math.max(0, Math.min(q.positions.length - 1, i));
    const pos = q.positions[this.ply];
    this.ctx.board.setPosition(pos.fen, { lastMove: pos.lastMove, check: pos.check, animate });
    if (sound && pos.move) playMove(pos.move, !!pos.check);
    this.renderPuzzleMoves();
    this.updatePlayers(pos.fen);
  }

  stepPuzzle(i) {
    if (!this.puzzle) return;
    clearTimeout(this.timer);
    this.showPosition(i, { sound: true });
  }

  replayPuzzle() {
    clearTimeout(this.timer);
    this.showPosition(0, { animate: false });
    const end = this.prepared.positions.length - 1;
    const tick = () => {
      if (this.ply >= end || !this.puzzle) return;
      this.showPosition(this.ply + 1, { sound: true });
      this.timer = setTimeout(tick, Math.max(380, settings.animMs + 220));
    };
    this.timer = setTimeout(tick, 300);
  }

  // Seeing the answer counts like "Show solution" in Mate It: the puzzle is tried, not solved.
  revealMate() {
    const q = this.prepared;
    if (!this.revealed) {
      const chess = new Chess(q.positions[q.live].fen);
      const m = chess.move(q.solution.san);
      q.positions.push({ fen: chess.fen(), move: m, lastMove: { from: m.from, to: m.to }, check: checkedKing(chess) });
      this.revealed = true;
      recordMate(this.puzzle.id, false);
      this.renderPuzzleDetail();
    }
    clearTimeout(this.timer);
    this.showPosition(q.live, { animate: false });
    this.showPosition(q.positions.length - 1, { sound: true });
  }

  updatePlayers(fen) {
    const white = { name: t('color.white'), avatar: 'av-white', color: 'w' };
    const black = { name: t('color.black'), avatar: 'av-black', color: 'b' };
    const flipped = this.ctx.board.orientation === 'black';
    setPlayers(this.ctx.bars, { fen, top: flipped ? white : black, bottom: flipped ? black : white });
  }

  onKey(e) {
    if (e.target instanceof HTMLInputElement) return;
    const step = this.puzzle ? (n) => this.stepPuzzle(n) : this.opening ? (n) => this.nav(n) : null;
    if (!step) return;
    const end = this.puzzle ? this.prepared.positions.length - 1 : this.line.moves.length;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(this.ply - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(this.ply + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(0); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(end); }
    else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); this.renderList(); }
  }
}
