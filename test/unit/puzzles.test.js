import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from '../../renderer/vendor/chess.js';
import { loadOpenings } from '../../renderer/js/openings.js';
import { loadPuzzles, puzzlePool, pickPuzzle, preparePuzzle } from '../../renderer/js/puzzles.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../../renderer/data/${p}`, import.meta.url)));
await loadOpenings(read('openings.json'), read('opening-names.json'));
const data = await loadPuzzles(read('puzzles.json'));

test('each level has plenty of puzzles in its rating range', () => {
  const ranges = { beginner: [400, 1000], intermediate: [1000, 1600], expert: [1600, 4000] };
  for (const [level, [lo, hi]] of Object.entries(ranges)) {
    const games = puzzlePool(level, 'games');
    assert.ok(games.length >= 800, `${level}: ${games.length}`);
    for (const p of games) assert.ok(p.r >= lo && p.r < hi, `${p.id} rated ${p.r} in ${level}`);
    const traps = puzzlePool(level, 'traps');
    assert.ok(traps.filter((p) => p.trap).length === 9, 'all named traps in every level');
    assert.ok(traps.length >= 150, `${level} traps: ${traps.length}`);
  }
});

test('every puzzle is a mate in one after the opponent’s move', () => {
  for (const p of [...data.puzzles, ...puzzlePool('beginner', 'traps').filter((x) => x.trap)]) {
    const q = preparePuzzle(p);
    const chess = new Chess(q.positions[q.live].fen);
    assert.equal(chess.turn(), q.solver);
    chess.move(q.solution.san);
    assert.ok(chess.isCheckmate(), `${p.id} solution ${q.solution.san} is not mate`);
    assert.ok(q.opening, `${p.id} has an opening`);
  }
});

test('famous traps are shown first, then new puzzles, never a recent one', () => {
  const status = () => 0;
  const first = pickPuzzle('beginner', 'traps', [], status);
  assert.equal(first.trap, 'fools');
  const seen = new Set();
  const recent = [];
  for (let i = 0; i < 50; i++) {
    const p = pickPuzzle('beginner', 'games', recent, (id) => (seen.has(id) ? 2 : 0));
    assert.ok(!recent.includes(p.id));
    seen.add(p.id);
    recent.push(p.id);
  }
});
