// "Play It": the player is given an opening's name and plays its moves on the
// board; the app answers with the book moves for the other side.
import { Chess } from '../../vendor/chess.js';
import { pickNext, replay, ownerSide, namedAt, epdOf, checkedKing } from '../openings.js';
import { settings, setSetting, stats, record } from '../store.js';
import { play, playMove } from '../sound.js';
import { h, icon, button, nameEl, renderMoves, navBar, showPly, setPlayers, formatClock } from '../ui.js';

const PIECE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const SIDES = [['auto', 'Auto'], ['w', 'White'], ['b', 'Black'], ['both', 'Both']];
const REPLY_DELAY = 450;
const WRONG_SHOW_MS = 750;

export class PlayView {
  constructor(ctx) {
    this.ctx = ctx;
    this.recent = [];
    this.opening = null;
  }

  enter(opening) {
    this.ctx.board.clearHint();
    this.ctx.board.clearBadges();
    if (opening || !this.opening || this.startedLevel !== settings.level) this.start(opening);
    else {
      this.ctx.board.setOrientation(this.orientation);
      this.render();
      this.view(this.ply);
      if (this.phase === 'playing') {
        this.startClock();
        this.advance();
      }
    }
  }

  leave() {
    this.orientation = this.ctx.board.orientation;
    clearTimeout(this.replyTimer);
    clearTimeout(this.wrongTimer);
    this.stopClock();
    this.ctx.board.setMovable(null);
    this.ctx.board.clearHint();
    this.ctx.board.clearBadges();
    this.pendingReply = false; // the reply is made again by advance() on return
    this.locked = false;
  }

  // ---- drill lifecycle --------------------------------------------------------------

  start(opening) {
    clearTimeout(this.replyTimer);
    clearTimeout(this.wrongTimer);
    const o = opening || pickNext(settings.level, stats, this.recent, 'play');
    this.opening = o;
    this.startedLevel = settings.level;
    this.recent.push(o.name);
    this.line = replay(o);
    this.chess = new Chess();
    this.ply = 0;
    this.viewPly = 0;
    this.mistakes = 0;
    this.hints = 0;
    this.hintStage = 0;
    this.locked = false;
    this.phase = 'playing';
    this.side = settings.playSide === 'auto' ? ownerSide(o) : settings.playSide;
    this.coach = { kind: 'info', text: this.introText() };
    this.elapsed = 0;
    const { board } = this.ctx;
    board.clearBadges();
    board.clearHint();
    board.setOrientation(this.side === 'b' ? 'black' : 'white');
    board.setPosition(this.chess.fen(), { animate: false });
    this.render();
    this.startClock();
    this.advance();
  }

  introText() {
    const yours = this.userPlies();
    const sideName = this.side === 'both' ? 'both sides' : this.side === 'w' ? 'White' : 'Black';
    return `Play ${yours} ${yours === 1 ? 'move' : 'moves'} as ${sideName}.` + (this.side !== 'both' ? ' I\'ll answer with the book moves.' : '');
  }

  userPlies() {
    return this.line.moves.filter((m) => this.isUserColor(m.color)).length;
  }

  isUserColor(color) {
    return this.side === 'both' || this.side === color;
  }

  /** Moves the line forward: book replies for the opponent, or waits for the player. */
  advance() {
    const { board } = this.ctx;
    board.setMovable(null);
    if (this.ply >= this.line.moves.length) {
      this.complete();
      return;
    }
    const next = this.line.moves[this.ply];
    if (!this.isUserColor(next.color)) {
      this.pendingReply = true;
      this.replyTimer = setTimeout(() => {
        this.pendingReply = false;
        this.applyBookMove(true);
        this.advance();
      }, this.ply === 0 ? 600 : REPLY_DELAY);
      return;
    }
    this.hintStage = 0;
    this.enableInput();
  }

  applyBookMove(animate) {
    const m = this.chess.move(this.line.moves[this.ply].san);
    this.ply++;
    this.viewPly = this.ply;
    this.showLive(m, { animate });
    if (animate) playMove(m, this.chess.inCheck());
    this.renderProgress();
  }

  enableInput() {
    const dests = new Map();
    for (const m of this.chess.moves({ verbose: true })) {
      if (!dests.has(m.from)) dests.set(m.from, []);
      if (!dests.get(m.from).includes(m.to)) dests.get(m.from).push(m.to);
    }
    this.ctx.board.setMovable({ color: this.chess.turn(), dests });
  }

  showLive(m, { animate = true } = {}) {
    this.ctx.board.setPosition(this.chess.fen(), {
      lastMove: m ? { from: m.from, to: m.to } : null,
      check: checkedKing(this.chess),
      animate,
    });
    this.updatePlayers();
    this.renderMoveList();
  }

  handleMove({ from, to }) {
    if (this.phase !== 'playing' || this.locked || this.viewPly !== this.ply) return;
    const expected = this.line.moves[this.ply];
    const piece = this.chess.get(from);
    const promotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1')
      ? (expected.from === from && expected.to === to && expected.promotion) || 'q'
      : undefined;
    const { board } = this.ctx;
    board.clearHint();

    if (expected.from === from && expected.to === to && (expected.promotion || undefined) === promotion) {
      const m = this.chess.move({ from, to, promotion });
      this.ply++;
      this.viewPly = this.ply;
      this.showLive(m);
      playMove(m, this.chess.inCheck());
      board.showBadge(to, 'correct');
      this.coach = { kind: 'good', text: this.ply >= this.line.moves.length ? 'That\'s the line!' : pick(GOOD) };
      this.renderCoach();
      this.renderProgress();
      this.advance();
      return;
    }

    // A wrong move: show it briefly with a badge explaining why, then take it back.
    const trial = new Chess(this.chess.fen());
    let m;
    try { m = trial.move({ from, to, promotion }); } catch { return; }
    this.mistakes++;
    const later = this.line.moves.slice(this.ply + 1).some((x) => x.color === m.color && x.from === from && x.to === to);
    const named = namedAt(epdOf(trial)).filter((x) => x.name !== this.opening.name);
    let badge = 'wrong';
    if (later) {
      badge = 'order';
      this.coach = { kind: 'warn', text: `${m.san} is part of this line, but not yet. What comes first?` };
    } else if (named.length) {
      badge = 'book';
      this.coach = { kind: 'warn', text: `${m.san} is a book move. It leads to the ${named[0].display || named[0].name}, which is a different line.` };
    } else {
      this.coach = { kind: 'bad', text: `${m.san} isn't the move here. Try again.` };
    }
    this.locked = true;
    board.setMovable(null);
    board.setPosition(trial.fen(), { lastMove: { from, to }, check: checkedKing(trial) });
    board.showBadge(to, badge);
    playMove(m, trial.inCheck());
    setTimeout(() => play('wrong'), 120);
    this.renderCoach();
    this.renderProgress();
    this.wrongTimer = setTimeout(() => {
      this.locked = false;
      board.clearBadges();
      const prev = this.ply > 0 ? this.line.moves[this.ply - 1] : null;
      this.showLive(prev);
      this.enableInput();
    }, WRONG_SHOW_MS);
  }

  hint() {
    if (this.phase !== 'playing' || this.locked || this.pendingReply) return;
    if (this.viewPly !== this.ply) this.view(this.ply);
    const m = this.line.moves[this.ply];
    this.hintStage++;
    this.hints++;
    const { board } = this.ctx;
    if (this.hintStage === 1) {
      board.setHint({ squares: [m.from] });
      this.coach = { kind: 'info', text: `Move your ${PIECE[m.piece]}.` };
    } else {
      board.setHint({ squares: [m.from], arrows: [[m.from, m.to]] });
      this.coach = { kind: 'info', text: `Play ${m.san}.` };
    }
    this.renderCoach();
    this.renderProgress();
  }

  showMove() {
    if (this.phase !== 'playing' || this.locked || this.pendingReply) return;
    if (this.viewPly !== this.ply) this.view(this.ply);
    const m = this.line.moves[this.ply];
    this.hints++;
    this.ctx.board.clearHint();
    this.coach = { kind: 'info', text: `The move was ${m.san}.` };
    this.applyBookMove(true);
    this.ctx.board.setHint({ arrows: [[m.from, m.to]] });
    this.renderCoach();
    this.advance();
  }

  complete() {
    this.phase = 'done';
    this.stopClock();
    this.ctx.board.setMovable(null);
    const clean = this.mistakes === 0 && this.hints === 0;
    record(this.opening.name, 'play', clean);
    play('complete');
    this.coach = clean
      ? { kind: 'good', text: 'Perfect, no mistakes and no hints!' }
      : { kind: 'info', text: 'Done! Play it again without help to make it stick.' };
    this.render();
  }

  // ---- clock -------------------------------------------------------------------------

  startClock() {
    this.stopClock();
    const started = Date.now() - this.elapsed;
    this.clock = setInterval(() => {
      this.elapsed = Date.now() - started;
      this.updatePlayers();
    }, 250);
  }

  stopClock() {
    clearInterval(this.clock);
    this.clock = null;
  }

  // ---- rendering ---------------------------------------------------------------------

  updatePlayers() {
    const side = this.side;
    const userColor = side === 'both' ? (this.ctx.board.orientation === 'white' ? 'w' : 'b') : side;
    const you = {
      name: 'You',
      sub: side === 'both' ? 'Playing both sides' : `Playing ${side === 'w' ? 'White' : 'Black'}`,
      avatar: 'av-you', color: userColor,
      clock: formatClock(this.elapsed), clockActive: this.phase === 'playing',
    };
    const book = side === 'both'
      ? { name: 'You', sub: 'Playing both sides', avatar: 'av-you', color: userColor === 'w' ? 'b' : 'w' }
      : { name: 'Opening Book', sub: 'Plays the book moves', avatar: 'av-book', color: userColor === 'w' ? 'b' : 'w' };
    setPlayers(this.ctx.bars, { fen: this.ctx.board.fen, top: book, bottom: you });
  }

  render() {
    const o = this.opening;
    this.$moves = h('div', { class: 'moves' });
    this.$coach = h('div', { class: 'coach' });
    this.$progress = h('div', { class: 'progress' });

    const sideSeg = h('div', { class: 'seg seg-small', role: 'tablist' },
      ...SIDES.map(([value, label]) => h('button', {
        type: 'button',
        class: 'seg-opt' + (settings.playSide === value ? ' active' : ''),
        title: value === 'auto' ? 'Play the side whose move gives the opening its name' : null,
        onclick: () => { setSetting('playSide', value); this.start(this.opening); },
      }, label)));

    const target = h('div', { class: 'target' },
      h('div', { class: 'target-label' }, this.phase === 'done' ? 'You played' : 'Play the'),
      h('div', { class: 'target-name' }, nameEl(o)),
      h('div', { class: 'target-meta' }, `ECO ${o.eco}`),
      this.$progress);

    const actions = this.phase === 'playing'
      ? h('div', { class: 'btn-row' },
        button('Hint', { iconName: 'hint', onclick: () => this.hint() }),
        button('Show move', { iconName: 'eye', onclick: () => this.showMove() }),
        h('div', { class: 'grow' }),
        button('Skip', { iconName: 'arrowRight', onclick: () => this.start(), cls: 'icon-right' }))
      : h('div', { class: 'btn-row' },
        button('Retry', { iconName: 'retry', onclick: () => this.start(o) }),
        button('Name it', { iconName: 'name', onclick: () => this.ctx.go('name', o) }),
        h('div', { class: 'grow' }),
        button('Next', { kind: 'primary', iconName: 'arrowRight', onclick: () => this.start(), cls: 'icon-right' }));

    const body = h('div', { class: 'panel-body' },
      this.ctx.levelPicker(() => this.start()),
      h('div', { class: 'row-between' }, h('span', { class: 'label' }, 'You play'), sideSeg),
      target,
      this.$coach,
      h('div', { class: 'moves-card' }, h('div', { class: 'moves-head' }, h('span', {}, 'Moves')), this.$moves),
      this.phase === 'done' ? this.summaryEl() : null,
      actions);

    this.ctx.panel.replaceChildren(
      this.ctx.panelHead('play', 'Play the Opening'),
      body,
      navBar({
        first: () => this.view(0), prev: () => this.view(this.viewPly - 1),
        next: () => this.view(this.viewPly + 1), last: () => this.view(this.ply),
        flip: () => { this.ctx.board.flip(); this.updatePlayers(); },
      }));
    this.renderCoach();
    this.renderProgress();
    this.renderMoveList();
    this.updatePlayers();
  }

  summaryEl() {
    const clean = this.mistakes === 0 && this.hints === 0;
    return h('div', { class: `summary ${clean ? 'clean' : ''}` },
      h('div', { class: 'sum-item', html: `<b>${this.mistakes}</b><span>${this.mistakes === 1 ? 'Mistake' : 'Mistakes'}</span>` }),
      h('div', { class: 'sum-item', html: `<b>${this.hints}</b><span>${this.hints === 1 ? 'Hint' : 'Hints'}</span>` }),
      h('div', { class: 'sum-item', html: `<b>${formatClock(this.elapsed)}</b><span>Time</span>` }));
  }

  renderCoach() {
    if (!this.$coach) return;
    const c = this.coach || { kind: 'info', text: '' };
    const iconName = { good: 'check', bad: 'cross', warn: 'half', info: 'book' }[c.kind];
    this.$coach.replaceChildren(
      h('div', { class: 'coach-avatar av-book' }),
      h('div', { class: `coach-bubble coach-${c.kind}`, html: icon(iconName) }, h('span', {}, c.text)));
  }

  renderProgress() {
    if (!this.$progress) return;
    const total = this.userPlies();
    const done = this.line.moves.slice(0, this.ply).filter((m) => this.isUserColor(m.color)).length;
    const pct = total ? Math.round((done / total) * 100) : 100;
    this.$progress.replaceChildren(
      h('div', { class: 'progress-bar' }, h('div', { class: 'progress-fill', style: `width:${pct}%` })),
      h('div', { class: 'progress-text' },
        h('span', {}, `${done} of ${total} ${total === 1 ? 'move' : 'moves'}`),
        h('span', { class: this.mistakes ? 'bad' : '' }, `${this.mistakes} ${this.mistakes === 1 ? 'mistake' : 'mistakes'}`)));
  }

  renderMoveList() {
    if (!this.$moves) return;
    renderMoves(this.$moves, {
      san: this.line.moves.slice(0, this.ply).map((m) => m.san),
      current: this.viewPly,
      onPick: (n) => this.view(n),
      placeholder: this.isUserColor('w') ? 'Make the first move' : 'Waiting for White…',
    });
  }

  /** Looks back through the moves played so far (the board is only playable at the live position). */
  view(n) {
    if (this.locked) return;
    n = Math.max(0, Math.min(this.ply, n));
    this.viewPly = n;
    showPly(this.ctx.board, this.line, n, { sound: true });
    const live = n === this.ply && this.phase === 'playing' && !this.pendingReply;
    if (live && this.isUserColor(this.chess.turn())) this.enableInput();
    else this.ctx.board.setMovable(null);
    this.ctx.board.clearBadges();
    this.renderMoveList();
    this.updatePlayers();
  }

  onKey(e) {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.view(this.viewPly - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.view(this.viewPly + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.view(0); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.view(this.ply); }
    else if (e.key === 'Enter' && this.phase === 'done') { e.preventDefault(); this.start(); }
    else if (e.key.toLowerCase() === 'h') this.hint();
  }
}

const GOOD = ['Correct!', 'Nice, that\'s the book move.', 'Right!', 'Exactly.', 'Good move.'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
