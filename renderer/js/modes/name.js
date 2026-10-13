// "Name It": a position from an opening is played out on the board and the
// player types the opening's name.
import { gradeAnswer, requiredPart, letterHint, splitName } from '../grading.js';
import { LEVELS, pickNext, replay, acceptedNames, askText, categoryOf } from '../openings.js';
import { settings, setSetting, stats, record, getRecord, setRecord } from '../store.js';
import { play } from '../sound.js';
import { h, icon, button, nameEl, renderMoves, navBar, showPly, setPlayers } from '../ui.js';

export class NameView {
  constructor(ctx) {
    this.ctx = ctx;
    this.recent = [];
    this.session = { streak: 0, correct: 0, total: 0 };
    this.opening = null;
  }

  enter(opening) {
    const { board } = this.ctx;
    board.setMovable(null);
    board.clearHint();
    board.clearBadges();
    if (opening || !this.opening || this.askedLevel !== settings.level) {
      this.ask(opening);
    } else {
      // Coming back: restore this screen's board, which another screen may have changed.
      board.setOrientation(this.orientation);
      this.render();
      this.view(this.ply, { animate: false });
    }
  }

  leave() {
    this.stopAutoplay();
    this.orientation = this.ctx.board.orientation;
  }

  get depth() {
    return this.askDepth ?? LEVELS[settings.level].depth;
  }

  // ---- question lifecycle -------------------------------------------------------

  ask(opening) {
    this.stopAutoplay();
    const o = opening || pickNext(settings.level, stats, this.recent, 'name');
    this.opening = o;
    // An opening picked in the Library is asked at its own category's level (at least),
    // so naming it counts towards learning that category.
    this.askedLevel = settings.level;
    this.askDepth = Math.max(LEVELS[settings.level].depth, LEVELS[categoryOf(o)].depth);
    this.recent.push(o.name);
    this.line = replay(o);
    this.phase = 'asking';
    this.attempts = 0;
    this.hintLevel = 0;
    this.feedback = null;
    this.answer = '';
    this.result = null;
    const { board } = this.ctx;
    board.setOrientation('white');
    board.clearBadges();
    board.clearHint();
    this.render();
    if (settings.nameAnimate) {
      this.replayLine();
    } else {
      this.view(this.line.moves.length, { animate: false });
    }
    this.focusInput();
  }

  autoplay() {
    this.stopAutoplay();
    this.autoplaying = true;
    const step = Math.max(380, (settings.animMs || 0) + 220);
    const tick = () => {
      if (this.ply >= this.line.moves.length) return this.stopAutoplay();
      this.view(this.ply + 1, { sound: true });
      this.timer = setTimeout(tick, step);
    };
    this.timer = setTimeout(tick, 350);
  }

  stopAutoplay() {
    clearTimeout(this.timer);
    this.timer = null;
    this.autoplaying = false;
  }

  view(n, opts = {}) {
    n = Math.max(0, Math.min(this.line.moves.length, n));
    this.ply = n;
    showPly(this.ctx.board, this.line, n, opts);
    this.updatePlayers();
    this.renderMoveList();
  }

  submit() {
    if (this.phase !== 'asking') return;
    const input = this.$input.value.trim();
    if (!input) {
      this.$input.focus();
      return;
    }
    this.answer = input;
    this.attempts++;
    const g = gradeAnswer(input, acceptedNames(this.opening), this.depth);
    if (g.result === 'correct') {
      this.finish(true, g);
      return;
    }
    if (g.result === 'partial') {
      play('partial');
      const family = splitName(this.opening.title)[0];
      const familyRight = g.hits[0] && !g.extras.length;
      this.feedback = {
        kind: 'partial',
        text: familyRight && this.depth > 1
          ? `Close! “${family}” is right. Which variation is it?`
          : 'Close, but not quite. Check the details and try again.',
      };
    } else {
      play('wrong');
      this.feedback = { kind: 'wrong', text: this.attempts > 1 ? 'Still not it. Try a hint?' : 'Not this one. Try again!' };
      this.$input.classList.remove('shake');
      void this.$input.offsetWidth;
      this.$input.classList.add('shake');
    }
    this.renderFeedback();
    this.$input.select();
  }

  giveUp() {
    if (this.phase !== 'asking') return;
    this.finish(false, null);
  }

  finish(correct, grade) {
    this.stopAutoplay();
    this.phase = 'answered';
    const firstTry = correct && this.attempts === 1 && this.hintLevel === 0;
    this.result = { correct, firstTry, grade };
    record(this.opening.name, 'name', firstTry);
    this.session.total++;
    if (firstTry) {
      this.session.correct++;
      this.session.streak++;
      if (this.session.streak > getRecord('nameStreak')) setRecord('nameStreak', this.session.streak);
    } else {
      this.session.streak = 0;
    }
    play(correct ? 'correct' : 'wrong');
    if (this.ply < this.line.moves.length) this.view(this.line.moves.length);
    this.render();
  }

  hint() {
    if (this.phase !== 'asking') return;
    this.hintLevel = Math.min(this.hintLevel + 1, 2);
    this.renderFeedback();
    this.focusInput();
  }

  hintText() {
    const target = requiredPart(this.opening.title, this.depth);
    if (this.hintLevel === 1) return `ECO ${this.opening.eco} · ${letterHint(target)}`;
    const parts = splitName(target);
    if (parts.length > 1) return `${parts[0]}: ${letterHint(parts.slice(1).join(', '))}`;
    return target.replace(/[A-Za-zÀ-ÿ]+/g, (w) => (w.length <= 3 ? w : w.slice(0, 3) + '_'.repeat(w.length - 3)));
  }

  // ---- rendering ----------------------------------------------------------------

  updatePlayers() {
    const white = { name: 'White', avatar: 'av-white', color: 'w' };
    const black = { name: 'Black', avatar: 'av-black', color: 'b' };
    const flipped = this.ctx.board.orientation === 'black';
    setPlayers(this.ctx.bars, { fen: this.line.fens[this.ply], top: flipped ? white : black, bottom: flipped ? black : white });
  }

  render() {
    const { panel } = this.ctx;
    if (this.phase === 'asking' && this.$input?.isConnected) this.answer = this.$input.value;
    const best = getRecord('nameStreak');
    const s = this.session;

    this.$moves = h('div', { class: 'moves' });
    const movesHead = h('div', { class: 'moves-head' },
      h('span', {}, 'Moves'),
      h('button', {
        class: 'link-btn', type: 'button',
        onclick: () => { setSetting('nameShowMoves', !settings.nameShowMoves); this.render(); },
      }, settings.nameShowMoves ? 'Hide moves' : 'Show moves'),
      h('button', { class: 'link-btn', type: 'button', onclick: () => this.replayLine() }, 'Replay'));

    const body = h('div', { class: 'panel-body' },
      this.ctx.levelPicker(() => this.ask()),
      h('div', { class: 'stat-strip' },
        h('div', { class: 'stat' + (s.streak ? ' hot' : ''), html: `${icon('flame')}<b>${s.streak}</b><span>Streak</span>` }),
        h('div', { class: 'stat', html: `${icon('check')}<b>${s.correct}/${s.total}</b><span>This session</span>` }),
        h('div', { class: 'stat', html: `${icon('trophy')}<b>${best}</b><span>Best streak</span>` })),
      h('div', { class: 'moves-card' }, movesHead, this.$moves),
      this.phase === 'asking' ? this.questionEl() : this.resultEl());

    panel.replaceChildren(
      this.ctx.panelHead('name', 'Name the Opening'),
      body,
      navBar({
        first: () => this.nav(0), prev: () => this.nav(this.ply - 1),
        next: () => this.nav(this.ply + 1), last: () => this.nav(this.line.moves.length),
        flip: () => { this.ctx.board.flip(); this.updatePlayers(); },
      }));
    this.renderMoveList();
    if (this.phase === 'asking') this.renderFeedback();
  }

  questionEl() {
    this.$input = h('input', {
      class: 'answer-input', type: 'text', placeholder: 'Type the opening name…', spellcheck: 'false', autocomplete: 'off',
      value: this.answer,
      onkeydown: (e) => {
        // Stop here so the document-level Enter ("next question") doesn't also fire.
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.submit(); }
      },
    });
    this.$feedback = h('div', { class: 'feedback' });
    return h('div', { class: 'question' },
      h('div', { class: 'q-title' }, 'Which opening is this?'),
      h('div', { class: 'q-sub' }, askText(this.depth)),
      this.$input,
      this.$feedback,
      h('div', { class: 'btn-row' },
        button('Hint', { iconName: 'hint', onclick: () => this.hint() }),
        button('Show answer', { iconName: 'eye', onclick: () => this.giveUp() }),
        h('div', { class: 'grow' }),
        button('Submit', { kind: 'primary', onclick: () => this.submit() })));
  }

  renderFeedback() {
    if (!this.$feedback) return;
    this.$feedback.replaceChildren();
    if (this.feedback) {
      this.$feedback.append(h('div', { class: `fb fb-${this.feedback.kind}`, html: icon(this.feedback.kind === 'partial' ? 'half' : 'cross') }, this.feedback.text));
    }
    if (this.hintLevel) {
      this.$feedback.append(h('div', { class: 'fb fb-hint', html: icon('hint') }, h('span', { class: 'mono' }, this.hintText())));
    }
  }

  resultEl() {
    const o = this.opening;
    const { correct, firstTry } = this.result;
    const kind = correct ? 'correct' : 'wrong';
    const title = correct ? (firstTry ? 'Correct!' : 'Got it!') : 'The answer was';
    const others = acceptedNames(o).filter((n) => n !== o.title && n !== o.name);
    return h('div', { class: `result result-${kind}` },
      h('div', { class: 'result-head' },
        h('span', { class: 'result-icon', html: icon(correct ? 'check' : 'cross') }),
        h('span', { class: 'result-title' }, title),
        this.answer && !correct ? h('span', { class: 'result-yours' }, `You said “${this.answer}”`) : null),
      h('div', { class: 'result-name' }, nameEl(o)),
      o.display && o.display !== o.name ? h('div', { class: 'result-meta' }, `Listed as ${o.name}`) : null,
      others.length ? h('div', { class: 'result-meta' }, `Also accepted: ${others.slice(0, 3).join(' · ')}`) : null,
      h('div', { class: 'result-meta' }, `ECO ${o.eco} · ${o.plies.length} ${o.plies.length === 1 ? 'move' : 'half-moves'}`),
      h('div', { class: 'btn-row' },
        button('Practice moves', { iconName: 'play', onclick: () => this.ctx.go('play', o) }),
        h('div', { class: 'grow' }),
        button('Next', { kind: 'primary', iconName: 'arrowRight', onclick: () => this.ask(), cls: 'icon-right' })));
  }

  renderMoveList() {
    if (!this.$moves) return;
    renderMoves(this.$moves, {
      san: this.line.moves.map((m) => m.san).slice(0, this.autoplaying ? this.ply : undefined),
      current: this.ply,
      onPick: (n) => this.nav(n),
      hidden: !settings.nameShowMoves && this.phase === 'asking',
      placeholder: 'Watch the moves…',
    });
  }

  nav(n) {
    this.stopAutoplay();
    this.view(n, { sound: true });
  }

  replayLine() {
    this.autoplaying = true;
    this.view(0, { animate: false });
    this.autoplay();
  }

  focusInput() {
    if (this.phase === 'asking') setTimeout(() => this.$input?.focus(), 0);
  }

  onKey(e) {
    const typing = e.target instanceof HTMLInputElement;
    if (e.key === 'Enter' && this.phase === 'answered') { e.preventDefault(); this.ask(); return; }
    if (typing && this.$input.value) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.nav(this.ply - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.nav(this.ply + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.nav(0); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.nav(this.line.moves.length); }
  }
}
