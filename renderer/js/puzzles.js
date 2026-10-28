// "Mate It" puzzles: loading, the pool for a level and source, and picking the next one.
// Puzzles come from the Lichess puzzle database (see scripts/build-puzzles.js): the
// opponent's move is played first, then the player has to find a checkmate.
import { Chess } from '../vendor/chess.js';
import { namedAt, epdOf, checkedKing } from './openings.js';

let data = { openings: [], puzzles: [], traps: [] };
let named = [];
let byLevel = {};
const LV = { beginner: 'b', intermediate: 'i', expert: 'e' };

export async function loadPuzzles(d) {
  data = d || await (await fetch('data/puzzles.json')).json();
  byLevel = {};
  // Label each famous trap with the deepest named opening its line passes through.
  named = data.traps.map((tr) => {
    const chess = new Chess();
    const line = tr.line.split(' ');
    let opening = null;
    for (const san of line.slice(0, -1)) {
      chess.move(san);
      const at = namedAt(epdOf(chess));
      if (at.length) opening = at[0].display || at[0].name;
    }
    return { id: `trap:${tr.id}`, trap: tr.id, line, opening };
  });
  return data;
}

/** The puzzles for a level: 'games' (any opening position) or 'traps' (famous traps + mates by move 10). */
export function puzzlePool(level, source) {
  const lv = LV[level];
  const list = data.puzzles.filter((p) => p.lv === lv && (source !== 'traps' || p.t));
  return source === 'traps' ? [...named, ...list] : list;
}

/**
 * Every puzzle of one level, for the Library: easiest first. The famous traps are listed
 * under Beginner (in Mate It they appear in every level's "Opening traps").
 */
export function puzzlesInCategory(level) {
  if (!byLevel[level]) {
    const list = data.puzzles.filter((p) => p.lv === LV[level]).sort((a, b) => a.r - b.r || (a.id < b.id ? -1 : 1));
    byLevel[level] = level === 'beginner' ? [...named, ...list] : list;
  }
  return byLevel[level];
}

/** The Library category of a puzzle: its level, and Beginner for the famous traps. */
export function puzzleLevel(p) {
  return p.trap ? 'beginner' : Object.keys(LV).find((k) => LV[k] === p.lv);
}

/** The opening the puzzle's game came from (or a famous trap's opening). */
export function puzzleOpening(p) {
  return p.trap ? p.opening : data.openings[p.o];
}

/** Who has to find the mate: 'w' or 'b'. */
export function puzzleSolver(p) {
  if (p.trap) return p.line.length % 2 ? 'w' : 'b';
  return p.fen.split(' ')[1] === 'w' ? 'b' : 'w';
}

/** The move number of the mating move. */
export function puzzleMoveNumber(p) {
  if (p.trap) return Math.ceil(p.line.length / 2);
  const [, turn, , , , full] = p.fen.split(' ');
  return turn === 'b' ? Number(full) + 1 : Number(full);
}

/**
 * Next puzzle: famous traps first (in order), then unseen puzzles, then ones not yet
 * solved cleanly, then anything; never one of the recently shown.
 * @param {(id: string) => number} status 0 = new, 1 = tried, 2 = solved cleanly
 */
export function pickPuzzle(level, source, recent, status) {
  const pool = puzzlePool(level, source);
  const fresh = (p) => !recent.includes(p.id);
  const first = pool.find((p) => p.trap && status(p.id) === 0 && fresh(p));
  if (first) return first;
  for (const test of [(p) => status(p.id) === 0, (p) => status(p.id) === 1, () => true]) {
    const list = pool.filter((p) => test(p) && fresh(p));
    if (list.length) return list[Math.floor(Math.random() * list.length)];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Everything the board needs for a puzzle: the positions to play through before the
 * player moves (`positions[live]` is the one to solve), and the game's mating move.
 */
export function preparePuzzle(p) {
  const positions = [];
  const push = (chess, move) => positions.push({
    fen: chess.fen(), move, lastMove: move ? { from: move.from, to: move.to } : null, check: checkedKing(chess),
  });
  let chess;
  let solution;
  if (p.trap) {
    chess = new Chess();
    push(chess, null);
    for (const san of p.line.slice(0, -1)) push(chess, chess.move(san));
    solution = new Chess(chess.fen()).move(p.line[p.line.length - 1]);
  } else {
    chess = new Chess(p.fen);
    push(chess, null);
    const [setup, mate] = p.m.split(' ');
    push(chess, chess.move({ from: setup.slice(0, 2), to: setup.slice(2, 4), promotion: setup[4] }));
    solution = new Chess(chess.fen()).move({ from: mate.slice(0, 2), to: mate.slice(2, 4), promotion: mate[4] });
  }
  return {
    id: p.id,
    trap: p.trap || null,
    opening: puzzleOpening(p),
    rating: p.r || null,
    moveNumber: chess.moveNumber(),
    solver: chess.turn(),
    positions,
    live: positions.length - 1,
    solution,
    url: p.trap ? null : `https://lichess.org/training/${p.id}`,
  };
}
