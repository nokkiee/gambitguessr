// Chessboard view: draws a position, animates changes between positions and turns
// clicks / drags into move requests. It knows nothing about chess rules: the owner
// supplies the legal destinations and decides what a move request does.

const FILES = 'abcdefgh';
const SVG_NS = 'http://www.w3.org/2000/svg';

const BADGES = {
  correct: { color: '#81b64c', icon: '<path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>' },
  wrong: { color: '#fa412d', icon: '<path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>' },
  book: { color: '#a88865', icon: '<path d="M6.5 7.5c2-.9 3.9-.9 5.5.4 1.6-1.3 3.5-1.3 5.5-.4v9c-2-.9-3.9-.9-5.5.4-1.6-1.3-3.5-1.3-5.5-.4z" fill="#fff"/><path d="M12 8v9" stroke="#a88865" stroke-width="1.1"/>' },
  order: { color: '#f0a33c', icon: '<path d="M8 10.2a4.5 4.5 0 0 1 8.3-1.2M16 13.8a4.5 4.5 0 0 1-8.3 1.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M17.4 6.4l-.5 3.6-3.5-.9M6.6 17.6l.5-3.6 3.5.9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' },
};

export function parseFen(fen) {
  const map = new Map();
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      const color = ch === ch.toUpperCase() ? 'w' : 'b';
      map.set(FILES[f] + (8 - r), color + ch.toUpperCase());
      f++;
    }
  });
  return map;
}

const fileOf = (sq) => FILES.indexOf(sq[0]);
const rankOf = (sq) => Number(sq[1]) - 1;

export class Board {
  constructor(root, { onMove } = {}) {
    this.root = root;
    this.onMove = onMove || (() => {});
    this.orientation = 'white';
    this.pieceSet = 'cburnett';
    this.fen = '8/8/8/8/8/8/8/8 w - - 0 1';
    this.pieces = new Map(); // square -> { el, code }
    this.movable = null; // { color: 'w'|'b'|'both', dests: Map<from, to[]> }
    this.selected = null;
    this.lastMove = null;
    this.checkSquare = null;
    this.hintSquares = [];
    this.marks = new Set();
    this.userArrows = new Map();
    this.hintArrows = [];
    this.drag = null;
    this.dropped = null;

    root.classList.add('board');
    root.innerHTML = `
      <div class="b-squares"></div>
      <div class="b-layer b-hl"></div>
      <div class="b-layer b-dests"></div>
      <div class="b-layer b-pieces"></div>
      <svg class="b-layer b-arrows" viewBox="0 0 8 8" preserveAspectRatio="none"></svg>
      <div class="b-layer b-badges"></div>`;
    this.$squares = root.querySelector('.b-squares');
    this.$hl = root.querySelector('.b-hl');
    this.$dests = root.querySelector('.b-dests');
    this.$pieces = root.querySelector('.b-pieces');
    this.$arrows = root.querySelector('.b-arrows');
    this.$badges = root.querySelector('.b-badges');

    root.addEventListener('pointerdown', (e) => this.pointerDown(e));
    root.addEventListener('pointermove', (e) => this.pointerMove(e));
    root.addEventListener('pointerup', (e) => this.pointerUp(e));
    root.addEventListener('pointercancel', () => this.cancelDrag());
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.drawSquares();
  }

  // ---- geometry ---------------------------------------------------------------

  colRow(sq) {
    const f = fileOf(sq), r = rankOf(sq);
    return this.orientation === 'white' ? [f, 7 - r] : [7 - f, r];
  }

  place(el, sq) {
    const [c, r] = this.colRow(sq);
    el.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
  }

  squareAt(e) {
    const rect = this.root.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * 8);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * 8);
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;
    return this.orientation === 'white' ? FILES[c] + (8 - r) : FILES[7 - c] + (r + 1);
  }

  // ---- squares & coordinates ----------------------------------------------------

  drawSquares() {
    const frag = document.createDocumentFragment();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = this.orientation === 'white' ? FILES[c] + (8 - r) : FILES[7 - c] + (r + 1);
        const div = document.createElement('div');
        div.className = 'sq ' + ((c + r) % 2 === 0 ? 'light' : 'dark');
        if (c === 0) div.insertAdjacentHTML('beforeend', `<span class="coord rank">${sq[1]}</span>`);
        if (r === 7) div.insertAdjacentHTML('beforeend', `<span class="coord file">${sq[0]}</span>`);
        frag.appendChild(div);
      }
    }
    this.$squares.replaceChildren(frag);
  }

  setOrientation(color) {
    if (color === this.orientation) return;
    this.orientation = color;
    this.drawSquares();
    for (const [sq, p] of this.pieces) this.place(p.el, sq);
    this.clearBadges();
    this.renderOverlays();
  }

  flip() {
    this.setOrientation(this.orientation === 'white' ? 'black' : 'white');
  }

  setPieceSet(name) {
    this.pieceSet = name;
    for (const p of this.pieces.values()) this.paintPiece(p.el, p.code);
  }

  setAnimation(ms) {
    this.animMs = ms;
    this.root.style.setProperty('--anim', `${ms}ms`);
  }

  // ---- pieces -----------------------------------------------------------------

  paintPiece(el, code) {
    el.style.backgroundImage = `url(pieces/${this.pieceSet}/${code}.svg)`;
  }

  makePiece(code, sq) {
    const el = document.createElement('div');
    el.className = 'pc';
    this.paintPiece(el, code);
    this.place(el, sq);
    this.$pieces.appendChild(el);
    return el;
  }

  /**
   * Shows a position, sliding pieces from where they were.
   * @param {string} fen
   * @param {{lastMove?: {from: string, to: string}|null, check?: string|null, animate?: boolean}} opts
   */
  setPosition(fen, { lastMove = null, check = null, animate = true } = {}) {
    this.fen = fen;
    this.root.dataset.fen = fen; // handy for tests and debugging
    this.lastMove = lastMove;
    this.checkSquare = check;
    this.selected = null;
    const next = parseFen(fen);
    const prev = this.pieces;
    const out = new Map();
    const gone = [];
    for (const [sq, p] of prev) {
      if (next.get(sq) === p.code) out.set(sq, p);
      else gone.push({ sq, p, used: false });
    }
    const dropped = this.dropped;
    this.dropped = null;
    const dist = (a, b) => Math.hypot(fileOf(a) - fileOf(b), rankOf(a) - rankOf(b));

    for (const [sq, code] of next) {
      if (out.has(sq)) continue;
      let best = null;
      for (const g of gone) {
        if (g.used || g.p.code !== code) continue;
        if (!best || dist(g.sq, sq) < dist(best.sq, sq)) best = g;
      }
      if (best) {
        best.used = true;
        const { el } = best.p;
        const instant = !animate || (dropped && dropped.from === best.sq && dropped.to === sq);
        this.slide(el, sq, instant);
        out.set(sq, best.p);
      } else {
        // A piece that appears out of nowhere (promotion, position reset).
        const el = this.makePiece(code, sq);
        if (animate) {
          el.classList.add('fade-in');
          requestAnimationFrame(() => el.classList.remove('fade-in'));
        }
        out.set(sq, { el, code });
      }
    }
    for (const g of gone) {
      if (g.used) continue;
      const { el } = g.p;
      if (animate) {
        el.classList.add('captured');
        setTimeout(() => el.remove(), this.animMs ?? 200);
      } else el.remove();
    }
    this.pieces = out;
    this.renderOverlays();
  }

  slide(el, sq, instant) {
    el.classList.remove('dragging');
    if (instant) {
      el.classList.add('no-anim');
      this.place(el, sq);
      void el.offsetWidth; // apply the jump before re-enabling transitions
      el.classList.remove('no-anim');
      return;
    }
    el.classList.add('moving');
    this.place(el, sq);
    clearTimeout(el._movingTimer);
    el._movingTimer = setTimeout(() => el.classList.remove('moving'), (this.animMs ?? 200) + 30);
  }

  // ---- interaction ------------------------------------------------------------

  /** @param {{color: 'w'|'b'|'both', dests: Map<string, string[]>}|null} movable */
  setMovable(movable) {
    this.movable = movable;
    if (this.selected && !this.canMoveFrom(this.selected)) this.selected = null;
    this.renderOverlays();
  }

  canMoveFrom(sq) {
    const p = this.pieces.get(sq);
    if (!p || !this.movable) return false;
    const { color, dests } = this.movable;
    return (color === 'both' || p.code[0] === color) && (dests.get(sq) || []).length > 0;
  }

  canMove(from, to) {
    return !!this.movable && (this.movable.dests.get(from) || []).includes(to);
  }

  select(sq) {
    this.selected = sq;
    this.renderOverlays();
  }

  pointerDown(e) {
    if (e.button === 2) {
      this.rightStart = this.squareAt(e);
      return;
    }
    if (e.button !== 0) return;
    if (this.marks.size || this.userArrows.size) {
      this.marks.clear();
      this.userArrows.clear();
      this.renderOverlays();
    }
    const sq = this.squareAt(e);
    if (!sq) return;
    if (this.selected && this.canMove(this.selected, sq)) {
      this.requestMove(this.selected, sq);
      return;
    }
    if (this.canMoveFrom(sq)) {
      const reselect = this.selected === sq;
      this.select(sq);
      const rect = this.root.getBoundingClientRect();
      this.drag = { from: sq, el: this.pieces.get(sq).el, x: e.clientX, y: e.clientY, rect, started: false, reselect };
      this.root.setPointerCapture(e.pointerId);
      e.preventDefault();
    } else if (this.selected) {
      this.select(null);
    }
  }

  pointerMove(e) {
    const d = this.drag;
    if (!d) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
      d.started = true;
      d.el.classList.add('dragging');
    }
    const size = d.rect.width / 8;
    const x = e.clientX - d.rect.left - size / 2;
    const y = e.clientY - d.rect.top - size / 2;
    d.el.style.transform = `translate(${x}px, ${y}px)`;
    const over = this.squareAt(e);
    if (over !== d.over) {
      d.over = over;
      this.renderOverlays();
    }
  }

  pointerUp(e) {
    if (e.button === 2) {
      const end = this.squareAt(e);
      if (this.rightStart && end) {
        if (end === this.rightStart) {
          this.marks.has(end) ? this.marks.delete(end) : this.marks.add(end);
        } else {
          const key = this.rightStart + end;
          this.userArrows.has(key) ? this.userArrows.delete(key) : this.userArrows.set(key, [this.rightStart, end]);
        }
        this.renderOverlays();
      }
      this.rightStart = null;
      return;
    }
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!d.started) {
      if (d.reselect) this.select(null);
      return;
    }
    d.el.classList.remove('dragging');
    const to = this.squareAt(e);
    if (to && to !== d.from && this.canMove(d.from, to)) {
      d.el.classList.add('no-anim');
      this.place(d.el, to);
      void d.el.offsetWidth;
      d.el.classList.remove('no-anim');
      this.dropped = { from: d.from, to };
      this.requestMove(d.from, to);
    } else {
      this.place(d.el, d.from);
      if (to !== d.from) this.select(null);
      else this.renderOverlays();
    }
  }

  cancelDrag() {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    d.el.classList.remove('dragging');
    this.place(d.el, d.from);
    this.renderOverlays();
  }

  requestMove(from, to) {
    const before = this.fen;
    this.selected = null;
    this.onMove({ from, to });
    // The owner didn't accept the move: put everything back where it belongs.
    if (this.fen === before) {
      const dropped = this.dropped;
      this.dropped = null;
      if (dropped) this.place(this.pieces.get(from).el, from);
      this.renderOverlays();
    }
  }

  // ---- overlays: highlights, move dots, arrows ----------------------------------

  setHint({ squares = [], arrows = [] } = {}) {
    this.hintSquares = squares;
    this.hintArrows = arrows;
    this.renderOverlays();
  }

  clearHint() {
    this.setHint();
  }

  overlay(sq, cls, parent) {
    const div = document.createElement('div');
    div.className = cls;
    this.place(div, sq);
    parent.appendChild(div);
    return div;
  }

  renderOverlays() {
    this.$hl.replaceChildren();
    this.$dests.replaceChildren();
    if (this.lastMove) {
      this.overlay(this.lastMove.from, 'hl hl-last', this.$hl);
      this.overlay(this.lastMove.to, 'hl hl-last', this.$hl);
    }
    if (this.checkSquare) this.overlay(this.checkSquare, 'hl hl-check', this.$hl);
    for (const sq of this.hintSquares) this.overlay(sq, 'hl hl-hint', this.$hl);
    for (const sq of this.marks) this.overlay(sq, 'hl hl-mark', this.$hl);
    if (this.selected) {
      this.overlay(this.selected, 'hl hl-sel', this.$hl);
      if (this.showDests !== false) {
        for (const to of this.movable?.dests.get(this.selected) || []) {
          this.overlay(to, this.pieces.has(to) ? 'dest capture' : 'dest', this.$dests);
        }
      }
    }
    if (this.drag?.started && this.drag.over) this.overlay(this.drag.over, 'hl hl-hover', this.$hl);
    for (const [sq, p] of this.pieces) p.el.classList.toggle('mine', this.canMoveFrom(sq));
    this.root.classList.toggle('dragging-piece', !!this.drag?.started);
    this.drawArrows();
  }

  drawArrows() {
    const svg = this.$arrows;
    svg.replaceChildren();
    const all = [
      ...[...this.userArrows.values()].map(([a, b]) => ({ a, b, cls: 'arrow-user' })),
      ...this.hintArrows.map(([a, b]) => ({ a, b, cls: 'arrow-hint' })),
    ];
    for (const { a, b, cls } of all) svg.appendChild(this.arrowShape(a, b, cls));
  }

  // chess.com-style arrow: thick body with a wide head; knight moves bend in an L.
  arrowShape(from, to, cls) {
    const [c1, r1] = this.colRow(from);
    const [c2, r2] = this.colRow(to);
    const p1 = [c1 + 0.5, r1 + 0.5];
    const p2 = [c2 + 0.5, r2 + 0.5];
    const dc = c2 - c1, dr = r2 - r1;
    const knight = (Math.abs(dc) === 1 && Math.abs(dr) === 2) || (Math.abs(dc) === 2 && Math.abs(dr) === 1);
    const corner = knight ? (Math.abs(dr) === 2 ? [p1[0], p2[1]] : [p2[0], p1[1]]) : p1;
    const vx = p2[0] - corner[0], vy = p2[1] - corner[1];
    const len = Math.hypot(vx, vy);
    const ux = vx / len, uy = vy / len;
    const head = 0.4, halfHead = 0.27, halfBody = 0.11;
    const base = [p2[0] - ux * head, p2[1] - uy * head];
    const px = -uy, py = ux;

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', `arrow ${cls}`);
    const body = document.createElementNS(SVG_NS, 'path');
    const start = knight ? p1 : [p1[0] + ux * 0.22, p1[1] + uy * 0.22];
    const pts = knight ? [start, corner, base] : [start, base];
    body.setAttribute('d', 'M' + pts.map((p) => p.join(' ')).join(' L'));
    body.setAttribute('stroke-width', String(halfBody * 2));
    body.setAttribute('fill', 'none');
    body.setAttribute('stroke-linejoin', 'miter');
    if (knight) body.setAttribute('stroke-linecap', 'square');
    const tip = document.createElementNS(SVG_NS, 'polygon');
    tip.setAttribute('points', [
      [base[0] + px * halfHead, base[1] + py * halfHead],
      p2,
      [base[0] - px * halfHead, base[1] - py * halfHead],
    ].map((p) => p.join(',')).join(' '));
    g.append(body, tip);
    return g;
  }

  // ---- move badges (✓ ✕ book) ----------------------------------------------------

  showBadge(sq, kind) {
    this.clearBadges();
    const b = BADGES[kind];
    if (!b) return;
    const holder = this.overlay(sq, 'badge-holder', this.$badges);
    const [c] = this.colRow(sq);
    holder.innerHTML = `<svg class="badge${c === 7 ? ' edge' : ''}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${b.color}"/>${b.icon}</svg>`;
  }

  clearBadges() {
    this.$badges.replaceChildren();
  }
}
