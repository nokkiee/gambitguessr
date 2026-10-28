// "Mate It": the opponent's last move is played (or a famous trap is shown move by
// move), then the player finds the checkmate in one. Any mating move counts.
import { Chess } from '../../vendor/chess.js';
import { checkedKing, localFamilyOf } from '../openings.js';
import { pickPuzzle, preparePuzzle, puzzlePool } from '../puzzles.js';
import { settings, setSetting, mateStatus, recordMate, getRecord, setRecord } from '../store.js';
import { play, playMove } from '../sound.js';
import { t, num } from '../i18n.js';
import { h, icon, button, navBar, setPlayers, statEl } from '../ui.js';
import { coachEls } from './play.js';

const SOURCES = [['games', 'mate.games', 'mate.gamesTitle'], ['traps', 'mate.traps', 'mate.trapsTitle']];
const WRONG_SHOW_MS = 800;

export class MateView {
  constructor(ctx) {
    this.ctx = ctx;
    this.recent = [];
    this.session = { streak: 0, solved: 0, total: 0 };
    this.puzzle = null;
  }

  enter() {
    const { board } = this.ctx;
    board.clearHint();
    board.clearBadges();
    if (!this.puzzle || this.level !== settings.level || this.source !== settings.mateSource) {
      this.next();
      return;
    }
    // Coming back: show the puzzle again, skipping any intro that was still playing.
    board.setOrientation(this.orientation);
    if (this.phase === 'intro') this.phase = 'solving';
    this.render();
    this.view(this.phase === 'done' ? this.puzzle.positions.length - 1 : this.puzzle.live, { animate: false });
  }

  leave() {
    clearTimeout(this.timer);
    clearTimeout(this.wrongTimer);
    this.locked = false;
    this.orientation = this.ctx.board.orientation;
    this.ctx.board.setMovable(null);
    this.ctx.board.clearHint();
    this.ctx.board.clearBadges();
  }

  /** Redraws the panel, e.g. after the interface language changed. */
  refresh() {
    this.render();
    this.updatePlayers();
  }

  // ---- puzzle lifecycle -----------------------------------------------------------------

  next() {
    clearTimeout(this.timer);
    clearTimeout(this.wrongTimer);
    // Leaving a puzzle unsolved ends the streak.
    if (this.puzzle && this.phase !== 'done') this.session.streak = 0;
    this.level = settings.level;
    this.source = settings.mateSource;
    const raw = pickPuzzle(this.level, this.source, this.recent, mateStatus);
    this.recent.push(raw.id);
    if (this.recent.length > 40) this.recent.shift();
    const p = (this.puzzle = preparePuzzle(raw));
    this.phase = 'intro';
    this.failed = false;
    this.hints = 0;
    this.hintStage = 0;
    this.locked = false;
    this.coach = { kind: 'info', key: p.trap ? 'mate.trapIntro' : 'mate.yourTurn' };
    const { board } = this.ctx;
    board.clearBadges();
    board.clearHint();
    board.setMovable(null);
    board.setOrientation(p.solver === 'w' ? 'white' : 'black');
    this.render();
    this.view(0, { animate: false });

    // Play the moves leading to the puzzle: one opponent move, or a whole famous trap.
    const step = p.trap ? Math.max(260, (settings.animMs || 0) + 110) : 0;
    const tick = () => {
      if (this.viewIndex >= p.live) {
        this.phase = 'solving';
        const last = p.positions[p.live].move;
        this.coach = p.trap || !last ? { kind: 'info', key: 'mate.yourTurn' } : { kind: 'info', key: 'mate.theyPlayed', san: last.san };
        this.renderCoach();
        this.enableInput();
        return;
      }
      this.view(this.viewIndex + 1, { sound: true });
      this.timer = setTimeout(tick, step);
    };
    this.timer = setTimeout(tick, p.trap ? 450 : 650);
  }

  enableInput() {
    const p = this.puzzle;
    if (this.phase !== 'solving' || this.viewIndex !== p.live) {
      this.ctx.board.setMovable(null);
      return;
    }
    const chess = new Chess(p.positions[p.live].fen);
    const dests = new Map();
    for (const m of chess.moves({ verbose: true })) {
      if (!dests.has(m.from)) dests.set(m.from, []);
      if (!dests.get(m.from).includes(m.to)) dests.get(m.from).push(m.to);
    }
    this.ctx.board.setMovable({ color: chess.turn(), dests });
  }

  handleMove({ from, to }) {
    const p = this.puzzle;
    if (this.phase !== 'solving' || this.locked || this.viewIndex !== p.live) return;
    const chess = new Chess(p.positions[p.live].fen);
    const promotion = chess.get(from)?.type === 'p' && (to[1] === '8' || to[1] === '1')
      ? (p.solution.from === from && p.solution.to === to && p.solution.promotion) || 'q'
      : undefined;
    let m;
    try { m = chess.move({ from, to, promotion }); } catch { return; }
    const { board } = this.ctx;
    board.clearHint();
    if (chess.isCheckmate()) {
      this.finish(m, chess);
      return;
    }

    // Not mate: show the move with a red cross, then take it back.
    this.failed = true;
    this.session.streak = 0;
    const checking = chess.inCheck();
    this.locked = true;
    board.setMovable(null);
    board.setPosition(chess.fen(), { lastMove: { from, to }, check: checkedKing(chess) });
    board.showBadge(to, 'wrong');
    playMove(m, checking);
    setTimeout(() => play('wrong'), 120);
    this.coach = { kind: checking ? 'warn' : 'bad', key: checking ? 'mate.check' : 'mate.notMate', san: m.san };
    this.renderCoach();
    this.updateStats();
    this.wrongTimer = setTimeout(() => {
      this.locked = false;
      board.clearBadges();
      this.view(p.live);
    }, WRONG_SHOW_MS);
  }

  finish(m, chess, { shown = false } = {}) {
    const p = this.puzzle;
    this.phase = 'done';
    const clean = !this.failed && this.hints === 0;
    recordMate(p.id, clean);
    this.session.total++;
    if (clean) {
      this.session.solved++;
      this.session.streak++;
      if (this.session.streak > getRecord('mateStreak')) setRecord('mateStreak', this.session.streak);
    } else {
      this.session.streak = 0;
    }
    p.positions.length = p.live + 1;
    p.positions.push({ fen: chess.fen(), move: m, lastMove: { from: m.from, to: m.to }, check: checkedKing(chess) });
    this.view(p.positions.length - 1, { sound: false });
    this.ctx.board.showBadge(m.to, shown ? 'book' : 'correct');
    playMove(m, true);
    if (!shown) setTimeout(() => play('correct'), 140);
    if (shown) this.coach = { kind: 'info', key: 'mate.solution', san: m.san };
    else if (!p.trap && m.san !== p.solution.san) this.coach = { kind: 'good', key: 'mate.otherMate', san: p.solution.san };
    else this.coach = { kind: 'good', key: clean ? 'mate.solved' : 'mate.solvedRetry' };
    this.render();
  }

  hint() {
    const p = this.puzzle;
    if (this.phase !== 'solving' || this.locked) return;
    if (this.viewIndex !== p.live) this.view(p.live);
    this.hintStage++;
    this.hints++;
    this.session.streak = 0;
    const s = p.solution;
    if (this.hintStage === 1) {
      this.ctx.board.setHint({ squares: [s.from] });
      this.coach = { kind: 'info', key: `mate.hint.${s.piece}` };
    } else {
      this.ctx.board.setHint({ squares: [s.from], arrows: [[s.from, s.to]] });
      this.coach = { kind: 'info', key: 'play.playMove', san: s.san };
    }
    this.renderCoach();
    this.updateStats();
  }

  showSolution() {
    const p = this.puzzle;
    if (this.phase !== 'solving' || this.locked) return;
    this.hints++;
    this.ctx.board.clearHint();
    const chess = new Chess(p.positions[p.live].fen);
    const m = chess.move(p.solution.san);
    this.finish(m, chess, { shown: true });
  }

  // ---- board navigation ---------------------------------------------------------------------

  view(i, { animate = true, sound = false } = {}) {
    const p = this.puzzle;
    if (this.locked) return;
    i = Math.max(0, Math.min(p.positions.length - 1, i));
    this.viewIndex = i;
    const pos = p.positions[i];
    this.ctx.board.setPosition(pos.fen, { lastMove: pos.lastMove, check: pos.check, animate });
    if (sound && pos.move) playMove(pos.move, !!pos.check);
    if (this.phase !== 'done') this.ctx.board.clearBadges();
    this.enableInput();
    this.updatePlayers();
  }

  // ---- rendering ----------------------------------------------------------------------------

  updatePlayers() {
    const p = this.puzzle;
    if (!p) return;
    const opp = p.solver === 'w' ? 'b' : 'w';
    const avatar = (c) => (c === 'w' ? 'av-white' : 'av-black');
    const colorName = (c) => t(c === 'w' ? 'color.white' : 'color.black');
    const you = { name: t('common.you'), sub: colorName(p.solver), avatar: avatar(p.solver), color: p.solver };
    const them = { name: t('mate.opponent'), sub: colorName(opp), avatar: avatar(opp), color: opp };
    const flipped = (this.ctx.board.orientation === 'white') !== (p.solver === 'w');
    setPlayers(this.ctx.bars, { fen: this.ctx.board.fen, top: flipped ? you : them, bottom: flipped ? them : you });
  }

  render() {
    const p = this.puzzle;
    const pool = puzzlePool(this.level, this.source);
    const solved = pool.filter((x) => mateStatus(x.id) === 2).length;

    const sourceSeg = h('div', { class: 'seg seg-small' }, ...SOURCES.map(([id, label, title]) => h('button', {
      type: 'button', class: 'seg-opt' + (settings.mateSource === id ? ' active' : ''), title: t(title),
      onclick: () => { if (settings.mateSource !== id) { setSetting('mateSource', id); this.next(); } },
    }, t(label))));

    this.$stats = h('div', { class: 'stat-strip' });
    this.$coach = h('div', { class: 'coach' });

    const opening = p.opening;
    const local = localFamilyOf(opening);
    const card = h('div', { class: 'target' },
      h('div', { class: 'target-label' }, t(`mate.task.${p.solver}`)),
      p.trap
        ? h('div', { class: 'target-name' }, h('span', { class: 'op-family' }, t(`trap.${p.trap}`)))
        : h('div', { class: 'target-name mate-from' }, t('mate.from', { opening: local || opening })),
      p.trap && opening ? h('div', { class: 'op-local' }, local ? `${local} · ${opening}` : opening) : null,
      !p.trap && local ? h('div', { class: 'op-local' }, opening) : null,
      h('div', { class: 'target-meta' },
        p.trap ? t('mate.trapLabel') : `${t('mate.moveN', { n: p.moveNumber })} · ${t('mate.rating', { r: p.rating })}`),
      h('div', { class: 'progress' },
        h('div', { class: 'progress-bar' }, h('div', { class: 'progress-fill', style: `width:${(solved / pool.length) * 100}%` })),
        h('div', { class: 'progress-text' },
          h('span', {}, solved === pool.length ? t('mate.allSolved') : t('mate.progress', { solved, total: pool.length })))));

    const actions = this.phase === 'done'
      ? h('div', { class: 'btn-row' },
        p.url ? h('button', {
          type: 'button', class: 'link-btn game-link', html: icon('external'),
          onclick: () => window.open(p.url, '_blank', 'noopener'),
        }, t('mate.viewGame')) : null,
        h('div', { class: 'grow' }),
        button(t('common.next'), { kind: 'primary', iconName: 'arrowRight', onclick: () => this.next(), cls: 'icon-right' }))
      : h('div', { class: 'btn-row' },
        button(t('common.hint'), { iconName: 'hint', onclick: () => this.hint() }),
        button(t('mate.showMate'), { iconName: 'eye', onclick: () => this.showSolution() }),
        h('div', { class: 'grow' }),
        button(t('common.skip'), { iconName: 'arrowRight', onclick: () => this.next(), cls: 'icon-right' }));

    this.ctx.panel.replaceChildren(
      this.ctx.panelHead('mate', t('mate.title')),
      h('div', { class: 'panel-body' },
        this.ctx.levelPicker(() => this.next()),
        h('div', { class: 'row-between' }, h('span', { class: 'label' }, t('mate.sourceLabel')), sourceSeg),
        this.$stats,
        card,
        this.$coach,
        h('div', { class: 'grow' }),
        actions),
      navBar({
        first: () => this.step(0), prev: () => this.step(this.viewIndex - 1),
        next: () => this.step(this.viewIndex + 1), last: () => this.step(Infinity),
        flip: () => { this.ctx.board.flip(); this.updatePlayers(); },
      }));
    this.updateStats();
    this.renderCoach();
  }

  step(i) {
    if (this.phase === 'intro') return;
    this.view(i, { sound: true });
  }

  updateStats() {
    if (!this.$stats) return;
    const s = this.session;
    this.$stats.replaceChildren(
      statEl('flame', num(s.streak), t('stats.streak'), s.streak > 0),
      statEl('check', `${num(s.solved)}/${num(s.total)}`, t('stats.session')),
      statEl('trophy', num(getRecord('mateStreak')), t('stats.best')));
  }

  renderCoach() {
    if (this.$coach) this.$coach.replaceChildren(...coachEls(this.coach));
  }

  onKey(e) {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(this.viewIndex - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.step(this.viewIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.step(0); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.step(Infinity); }
    else if (e.key === 'Enter' && this.phase === 'done') { e.preventDefault(); this.next(); }
    else if (e.key.toLowerCase() === 'h') this.hint();
  }
}
