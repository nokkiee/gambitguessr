// Opening data: loading, the per-level pools, and picking what to practise next.
import { Chess } from '../vendor/chess.js';
import { splitName } from './grading.js';

// Each level drills its own openings plus the easier levels' ones. In the Library every
// opening belongs to exactly one category (its level), so "learn them all" is a clear goal.
export const LEVELS = {
  beginner: {
    label: 'Beginner', depth: 1, tiers: [1], color: '#81b64c',
    goal: 'The essential openings every player should know. To learn one, name its family and play its moves.',
  },
  intermediate: {
    label: 'Intermediate', depth: 2, tiers: [1, 2], color: '#4ba3e3',
    goal: 'Popular variations of those openings. To learn one, name the opening and its variation, and play its moves.',
  },
  expert: {
    label: 'Expert', depth: Infinity, tiers: null, color: '#b07ce8',
    goal: 'Every other named opening. To learn one, give its full name and play its moves.',
  },
};

/** What a Name It question asks for at a given depth. */
export function askText(depth) {
  if (depth === 1) return 'Name the opening family, e.g. “Sicilian Defense”.';
  if (depth === 2) return 'Name the opening and its variation, e.g. “Sicilian Defense: Najdorf Variation”.';
  return 'Give the full name, e.g. “Sicilian Defense: Najdorf Variation, English Attack”.';
}

/** The Library category (level) an opening belongs to. */
export function categoryOf(o) {
  return o.tier === 1 ? 'beginner' : o.tier === 2 ? 'intermediate' : 'expert';
}

let all = [];
let byEpd = new Map();

export async function loadOpenings(data) {
  all = data || await (await fetch('data/openings.json')).json();
  byEpd = new Map();
  for (const o of all) {
    o.title = o.display || o.name;
    o.parts = splitName(o.title);
    o.plies = o.moves.split(' ');
    if (!byEpd.has(o.epd)) byEpd.set(o.epd, []);
    byEpd.get(o.epd).push(o);
  }
  return all;
}

export const allOpenings = () => all;
export const openingByName = (name) => all.find((o) => o.name === name);

export function pool(level) {
  const { tiers } = LEVELS[level];
  return tiers ? all.filter((o) => tiers.includes(o.tier)) : all;
}

/** The openings in one Library category (no overlap between categories). */
export function inCategory(level) {
  return all.filter((o) => categoryOf(o) === level);
}

// Every name that counts as a right answer for this opening's final position.
export function acceptedNames(o) {
  const names = [o.title];
  for (const other of byEpd.get(o.epd) || [o]) {
    for (const n of [other.display, ...(other.aka || []), other.name]) {
      if (n && !names.includes(n)) names.push(n);
    }
  }
  return names;
}

// Named openings reached by exactly this position (used to tell the player
// "that's a real opening, just not this one").
export function namedAt(epd) {
  return byEpd.get(epd) || [];
}

export function epdOf(chess) {
  const [board, turn, castling, ep] = chess.fen().split(' ');
  const epLegal = ep !== '-' && chess.moves({ verbose: true }).some((m) => m.flags.includes('e'));
  return [board, turn, castling, epLegal ? ep : '-'].join(' ');
}

/** The square of the king that is in check, if any. */
export function checkedKing(chess) {
  if (!chess.inCheck()) return null;
  const turn = chess.turn();
  for (const row of chess.board()) {
    for (const p of row) if (p && p.type === 'k' && p.color === turn) return p.square;
  }
  return null;
}

/** Replays an opening's moves: verbose moves, plus the FEN and checked king after each ply. */
export function replay(o) {
  const chess = new Chess();
  const fens = [chess.fen()];
  const checks = [null];
  const moves = o.plies.map((san) => {
    const m = chess.move(san);
    fens.push(chess.fen());
    checks.push(checkedKing(chess));
    return m;
  });
  return { moves, fens, checks };
}

/**
 * Picks the next opening, favouring ones the player hasn't seen or got wrong,
 * and never repeating the last few.
 */
export function pickNext(level, stats, recent, mode) {
  const candidates = pool(level);
  const avoid = new Set(recent.slice(-Math.min(8, Math.floor(candidates.length / 2))));
  let total = 0;
  const weights = candidates.map((o) => {
    if (avoid.has(o.name)) return 0;
    const s = stats(o.name)?.[mode];
    let w = 1;
    if (!s || !s.seen) w = 1.6;
    else if (s.streak === 0) w = 3;
    else w = 1 / (1 + s.streak);
    total += w;
    return w;
  });
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0 && weights[i] > 0) return candidates[i];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Which side a player "owns" in an opening: whoever played the move that gives it its name. */
export function ownerSide(o) {
  return o.side || (o.plies.length % 2 === 1 ? 'w' : 'b');
}
