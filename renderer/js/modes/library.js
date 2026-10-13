// "Library": browse and search every opening, step through its moves, and jump
// into either drill with it.
import { replay, acceptedNames, LEVELS, categoryOf, inCategory } from '../openings.js';
import { normalize } from '../grading.js';
import { settings, setSetting, stats, mastery } from '../store.js';
import { h, icon, button, nameEl, renderMoves, navBar, showPly, setPlayers } from '../ui.js';

const FILTERS = [
  ['all', 'All', () => true],
  ['todo', 'To learn', (o) => mastery(o.name) < 2],
  ['learned', 'Learned', (o) => mastery(o.name) === 2],
];
const PAGE = 200;
const fmt = (n) => n.toLocaleString('en-US');

export class LibraryView {
  constructor(ctx) {
    this.ctx = ctx;
    this.category = settings.level;
    this.filter = 'all';
    this.query = '';
    this.limit = PAGE;
    this.opening = null;
    this.scroll = 0;
  }

  enter(opening) {
    const { board } = this.ctx;
    board.setMovable(null);
    board.clearHint();
    board.clearBadges();
    if (opening) this.open(opening);
    else if (this.opening) this.open(this.opening, { keepPly: true });
    else this.renderList();
  }

  leave() {
    clearTimeout(this.timer);
    this.orientation = this.ctx.board.orientation;
  }

  // ---- list --------------------------------------------------------------------------

  filtered() {
    const test = FILTERS.find(([id]) => id === this.filter)[2];
    const words = normalize(this.query).split(' ').filter(Boolean);
    const hay = (o) => o._hay || (o._hay = normalize([o.title, o.name, ...(o.aka || []), o.eco, o.moves].join(' ')));
    const list = inCategory(this.category).filter((o) => test(o) && words.every((w) => hay(o).includes(w)));
    // The curated categories read best alphabetically; Expert keeps ECO order.
    return this.category === 'expert' ? list : [...list].sort((a, b) => a.title.localeCompare(b.title));
  }

  setCategory(id) {
    this.category = id;
    this.limit = PAGE;
    this.scroll = 0;
    this.renderList();
  }

  categoryCards() {
    return h('div', { class: 'cat-cards', role: 'tablist' }, ...Object.entries(LEVELS).map(([id, l]) => {
      const list = inCategory(id);
      const learned = list.filter((o) => mastery(o.name) === 2).length;
      const done = learned === list.length;
      return h('button', {
        type: 'button', role: 'tab',
        class: 'cat-card' + (id === this.category ? ' active' : '') + (done ? ' done' : ''),
        style: `--cat:${l.color}`,
        title: `${fmt(learned)} of ${fmt(list.length)} ${l.label} openings learned`,
        onclick: () => this.setCategory(id),
      },
      h('span', { class: 'cat-name' }, l.label, done ? h('span', { class: 'cat-trophy', html: icon('trophy') }) : null),
      h('span', { class: 'cat-count' }, h('b', {}, fmt(learned)), ` / ${fmt(list.length)}`),
      h('span', { class: 'cat-bar' }, h('span', { class: 'cat-fill', style: `width:${(learned / list.length) * 100}%` })));
    }));
  }

  categoryInfo() {
    const l = LEVELS[this.category];
    const list = inCategory(this.category);
    const left = list.filter((o) => mastery(o.name) < 2).length;
    const practise = (view) => () => {
      setSetting('level', this.category);
      this.ctx.go(view);
    };
    return h('div', { class: 'cat-info', style: `--cat:${l.color}` },
      h('div', { class: 'cat-goal' }, l.goal),
      h('div', { class: 'cat-actions' },
        h('span', { class: 'cat-left' + (left ? '' : ' done') },
          left ? `${fmt(left)} left to learn` : `All ${fmt(list.length)} learned!`),
        h('span', { class: 'grow' }),
        h('span', { class: 'cat-practise' }, 'Practise:'),
        h('button', { type: 'button', class: 'link-btn', html: icon('name'), onclick: practise('name') }, 'Name It'),
        h('button', { type: 'button', class: 'link-btn', html: icon('play'), onclick: practise('play') }, 'Play It')));
  }

  renderList() {
    this.opening = null;
    const { panel, board } = this.ctx;
    board.setOrientation('white');
    board.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { animate: true });
    this.updatePlayers(board.fen);

    const search = h('input', {
      class: 'search-input', type: 'search', placeholder: 'Search by name, ECO code or moves…',
      value: this.query, spellcheck: 'false',
      oninput: (e) => { this.query = e.target.value; this.limit = PAGE; this.fillList(); },
    });
    const inCat = inCategory(this.category);
    const filters = h('div', { class: 'seg seg-small lib-filter' }, ...FILTERS.map(([id, label, test]) => h('button', {
      type: 'button', class: 'seg-opt' + (this.filter === id ? ' active' : ''),
      onclick: () => { this.filter = id; this.limit = PAGE; this.scroll = 0; this.renderList(); },
    }, label, h('span', { class: 'seg-count' }, fmt(inCat.filter(test).length)))));

    this.$list = h('div', { class: 'op-list' });
    this.$summary = h('div', { class: 'lib-summary' });
    panel.replaceChildren(
      this.ctx.panelHead('library', 'Opening Library'),
      h('div', { class: 'panel-body lib-body' },
        this.categoryCards(),
        this.categoryInfo(),
        h('div', { class: 'search-wrap', html: icon('search') }, search),
        filters,
        this.$summary,
        this.$list));
    this.fillList();
    this.$list.scrollTop = this.scroll;
  }

  fillList() {
    const list = this.filtered();
    this.$summary.textContent = this.query ? `${fmt(list.length)} ${list.length === 1 ? 'match' : 'matches'}` : '';
    this.$summary.hidden = !this.query;
    this.$list.replaceChildren(...list.slice(0, this.limit).map((o) => this.rowEl(o)));
    if (!list.length) {
      const msg = this.query ? 'No openings match your search.'
        : this.filter === 'learned' ? 'Nothing learned here yet. Name an opening and play its moves to learn it.'
          : 'You have learned every opening in this category!';
      this.$list.append(h('div', { class: 'moves-empty' }, msg));
    }
    if (list.length > this.limit) {
      this.$list.append(h('button', {
        type: 'button', class: 'more-btn',
        onclick: () => { this.limit += PAGE; this.scroll = this.$list.scrollTop; this.fillList(); this.$list.scrollTop = this.scroll; },
      }, `Show more (${fmt(list.length - this.limit)} left)`));
    }
  }

  rowEl(o) {
    const m = mastery(o.name);
    const preview = o.plies.slice(0, 8).map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.${san}` : san)).join(' ') + (o.plies.length > 8 ? ' …' : '');
    return h('button', { type: 'button', class: 'op-row', onclick: () => { this.scroll = this.$list.scrollTop; this.open(o); } },
      h('span', { class: 'eco' }, o.eco),
      h('span', { class: 'op-row-main' }, nameEl(o), h('span', { class: 'op-row-moves' }, preview)),
      h('span', { class: `mastery m${m}`, title: ['New', 'Practised', 'Learned'][m], html: m === 2 ? icon('check') : '' }));
  }

  // ---- one opening ------------------------------------------------------------------

  open(o, { keepPly = false } = {}) {
    const same = this.opening === o;
    this.opening = o;
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
    const others = acceptedNames(o).filter((n) => n !== o.title && n !== o.name);
    this.$moves = h('div', { class: 'moves' });
    this.ctx.panel.replaceChildren(
      this.ctx.panelHead('library', 'Opening Library'),
      h('div', { class: 'panel-body' },
        h('button', { type: 'button', class: 'link-btn back-btn', html: icon('back'), onclick: () => this.renderList() }, 'All openings'),
        h('div', { class: 'detail-head' },
          h('div', { class: 'detail-name' }, nameEl(o)),
          h('div', { class: 'result-meta' }, `ECO ${o.eco} · ${o.plies.length} half-moves · `,
            h('span', { class: 'level-tag', style: `--cat:${LEVELS[categoryOf(o)].color}` }, LEVELS[categoryOf(o)].label)),
          o.display && o.display !== o.name ? h('div', { class: 'result-meta' }, `Listed as ${o.name}`) : null,
          others.length ? h('div', { class: 'result-meta' }, `Also known as ${others.slice(0, 3).join(' · ')}`) : null,
          h('div', { class: 'chips' }, chip('Named', st.name), chip('Played', st.play))),
        h('div', { class: 'moves-card' }, h('div', { class: 'moves-head' }, h('span', {}, 'Moves'),
          h('button', { class: 'link-btn', type: 'button', onclick: () => this.replayLine() }, 'Replay')), this.$moves),
        h('div', { class: 'btn-row' },
          button('Name it', { iconName: 'name', onclick: () => this.ctx.go('name', o) }),
          h('div', { class: 'grow' }),
          button('Play it', { kind: 'primary', iconName: 'play', onclick: () => this.ctx.go('play', o) }))),
      navBar({
        first: () => this.nav(0), prev: () => this.nav(this.ply - 1),
        next: () => this.nav(this.ply + 1), last: () => this.nav(this.line.moves.length),
        flip: () => { this.ctx.board.flip(); this.updatePlayers(this.ctx.board.fen); },
      }));
    this.renderMoveList();
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

  updatePlayers(fen) {
    const white = { name: 'White', avatar: 'av-white', color: 'w' };
    const black = { name: 'Black', avatar: 'av-black', color: 'b' };
    const flipped = this.ctx.board.orientation === 'black';
    setPlayers(this.ctx.bars, { fen, top: flipped ? white : black, bottom: flipped ? black : white });
  }

  onKey(e) {
    if (e.target instanceof HTMLInputElement || !this.opening) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.nav(this.ply - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.nav(this.ply + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.nav(0); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.nav(this.line.moves.length); }
    else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); this.renderList(); }
  }
}
