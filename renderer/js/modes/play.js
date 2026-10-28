// "Play It": the player is given an opening's name and plays its moves on the
// board; the app answers with the book moves for the other side.
import { Chess } from '../../vendor/chess.js';
import { pickNext, replay, ownerSide, namedAt, epdOf, checkedKing } from '../openings.js';
import { settings, setSetting, stats, record } from '../store.js';
import { play, playMove } from '../sound.js';
import { t, tNodes } from '../i18n.js';
import { h, icon, button, nameEl, localNameEl, sanEl, renderMoves, navBar, showPly, setPlayers, formatClock } from '../ui.js';

const SIDES = [['auto', 'side.auto'], ['w', 'side.white'], ['b', 'side.black'], ['both', 'side.both']];
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

  /** Redraws the panel, e.g. after the interface language changed. */
  refresh() {
    this.render();
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
    this.coach = this.introCoach();
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

  introCoach() {
    const key = this.side === 'both' ? 'play.introBoth' : this.side === 'w' ? 'play.introWhite' : 'play.introBlack';
    return { kind: 'info', key, vars: { n: this.userPlies() }, extra: this.side === 'both' ? null : 'play.introBook' };
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
      this.coach = { kind: 'good', key: this.ply >= this.line.moves.length ? 'play.lineDone' : `play.good.${1 + Math.floor(Math.random() * 5)}` };
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
      this.coach = { kind: 'warn', key: 'play.later', san: m.san };
    } else if (named.length) {
      badge = 'book';
      this.coach = { kind: 'warn', key: 'play.book', san: m.san, vars: { name: named[0].display || named[0].name } };
    } else {
      this.coach = { kind: 'bad', key: 'play.wrong', san: m.san };
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
      this.coach = { kind: 'info', key: `play.hint.${m.piece}` };
    } else {
      board.setHint({ squares: [m.from], arrows: [[m.from, m.to]] });
      this.coach = { kind: 'info', key: 'play.playMove', san: m.san };
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
    this.coach = { kind: 'info', key: 'play.moveWas', san: m.san };
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
    this.coach = { kind: clean ? 'good' : 'info', key: clean ? 'play.perfect' : 'play.done' };
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
      name: t('common.you'),
      sub: t(side === 'both' ? 'play.playingBoth' : side === 'w' ? 'play.playingWhite' : 'play.playingBlack'),
      avatar: 'av-you', color: userColor,
      clock: formatClock(this.elapsed), clockActive: this.phase === 'playing',
    };
    const book = side === 'both'
      ? { name: t('common.you'), sub: t('play.playingBoth'), avatar: 'av-you', color: userColor === 'w' ? 'b' : 'w' }
      : { name: t('play.bookName'), sub: t('play.bookSub'), avatar: 'av-book', color: userColor === 'w' ? 'b' : 'w' };
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
        title: value === 'auto' ? t('side.autoTitle') : null,
        onclick: () => { setSetting('playSide', value); this.start(this.opening); },
      }, t(label))));

    const target = h('div', { class: 'target' },
      h('div', { class: 'target-label' }, t(this.phase === 'done' ? 'play.youPlayed' : 'play.playThe')),
      h('div', { class: 'target-name' }, nameEl(o)),
      localNameEl(o),
      h('div', { class: 'target-meta' }, `ECO ${o.eco}`),
      this.$progress);

    const actions = this.phase === 'playing'
      ? h('div', { class: 'btn-row' },
        button(t('common.hint'), { iconName: 'hint', onclick: () => this.hint() }),
        button(t('play.showMove'), { iconName: 'eye', onclick: () => this.showMove() }),
        h('div', { class: 'grow' }),
        button(t('common.skip'), { iconName: 'arrowRight', onclick: () => this.start(), cls: 'icon-right' }))
      : h('div', { class: 'btn-row' },
        button(t('common.retry'), { iconName: 'retry', onclick: () => this.start(o) }),
        button(t('common.nameIt'), { iconName: 'name', onclick: () => this.ctx.go('name', o) }),
        h('div', { class: 'grow' }),
        button(t('common.next'), { kind: 'primary', iconName: 'arrowRight', onclick: () => this.start(), cls: 'icon-right' }));

    const body = h('div', { class: 'panel-body' },
      this.ctx.levelPicker(() => this.start()),
      h('div', { class: 'row-between' }, h('span', { class: 'label' }, t('play.youPlay')), sideSeg),
      target,
      this.$coach,
      h('div', { class: 'moves-card' }, h('div', { class: 'moves-head' }, h('span', {}, t('common.moves'))), this.$moves),
      this.phase === 'done' ? this.summaryEl() : null,
      actions);

    this.ctx.panel.replaceChildren(
      this.ctx.panelHead('play', t('play.title')),
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
      h('div', { class: 'sum-item' }, h('b', {}, String(this.mistakes)), h('span', {}, t('play.sumMistakes', { n: this.mistakes }))),
      h('div', { class: 'sum-item' }, h('b', {}, String(this.hints)), h('span', {}, t('play.sumHints', { n: this.hints }))),
      h('div', { class: 'sum-item' }, h('b', {}, formatClock(this.elapsed)), h('span', {}, t('play.sumTime'))));
  }

  renderCoach() {
    if (!this.$coach) return;
    this.$coach.replaceChildren(...coachEls(this.coach));
  }

  renderProgress() {
    if (!this.$progress) return;
    const total = this.userPlies();
    const done = this.line.moves.slice(0, this.ply).filter((m) => this.isUserColor(m.color)).length;
    const pct = total ? Math.round((done / total) * 100) : 100;
    this.$progress.replaceChildren(
      h('div', { class: 'progress-bar' }, h('div', { class: 'progress-fill', style: `width:${pct}%` })),
      h('div', { class: 'progress-text' },
        h('span', {}, t('play.progress', { done, n: total })),
        h('span', { class: this.mistakes ? 'bad' : '' }, t('play.mistakes', { n: this.mistakes }))));
  }

  renderMoveList() {
    if (!this.$moves) return;
    renderMoves(this.$moves, {
      san: this.line.moves.slice(0, this.ply).map((m) => m.san),
      current: this.viewPly,
      onPick: (n) => this.view(n),
      placeholder: t(this.isUserColor('w') ? 'play.makeFirst' : 'play.waitWhite'),
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

/**
 * The coach's avatar and speech bubble. A message is { kind, key, vars?, san?, extra? }:
 * `san` is shown as the {move} placeholder in figurine notation, `extra` is a second sentence.
 */
export function coachEls(c) {
  const iconName = { good: 'check', bad: 'cross', warn: 'half', info: 'book' }[c?.kind || 'info'];
  const text = h('span', {});
  if (c?.key) {
    text.append(tNodes(c.key, { ...c.vars, ...(c.san ? { move: sanEl(c.san) } : {}) }));
    if (c.extra) text.append(' ', t(c.extra));
  }
  return [
    h('div', { class: 'coach-avatar av-book' }),
    h('div', { class: `coach-bubble coach-${c?.kind || 'info'}`, html: icon(iconName) }, text),
  ];
}
