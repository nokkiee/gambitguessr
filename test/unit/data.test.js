import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from '../../renderer/vendor/chess.js';
import { loadOpenings, acceptedNames, pool, replay, ownerSide, epdOf, LEVELS } from '../../renderer/js/openings.js';
import { gradeAnswer, splitName } from '../../renderer/js/grading.js';

const data = JSON.parse(readFileSync(new URL('../../renderer/data/openings.json', import.meta.url)));
const all = await loadOpenings(data);

test('the dataset is complete', () => {
  assert.ok(all.length > 3000);
  assert.equal(pool('beginner').length, all.filter((o) => o.tier === 1).length);
  assert.ok(pool('beginner').length >= 30);
  assert.ok(pool('intermediate').length > pool('beginner').length);
  assert.equal(pool('expert').length, all.length);
});

test('every line is legal and ends in its stored position', () => {
  for (const o of all) {
    const c = new Chess();
    for (const san of o.plies) c.move(san);
    assert.equal(epdOf(c), o.epd, o.name);
    assert.equal(replay(o).fens.length, o.plies.length + 1);
  }
});

test('every opening accepts its own name at every level', () => {
  for (const o of all) {
    for (const depth of [1, 2, Infinity]) {
      for (const n of acceptedNames(o)) {
        assert.equal(gradeAnswer(n, acceptedNames(o), depth).result, 'correct', `${n} (depth ${depth}) for ${o.name}`);
      }
    }
  }
});

test('essential openings are not confused with each other', () => {
  const essentials = pool('beginner');
  for (const a of essentials) {
    for (const b of essentials) {
      if (splitName(a.title)[0] === splitName(b.title)[0]) continue;
      if (acceptedNames(a).includes(b.title)) continue;
      const g = gradeAnswer(b.title, acceptedNames(a), LEVELS.beginner.depth);
      assert.notEqual(g.result, 'correct', `"${b.title}" was accepted for ${a.title}`);
    }
  }
});

test('Play It drills give the player at least two moves', () => {
  for (const o of pool('intermediate')) {
    const side = ownerSide(o);
    const mine = replay(o).moves.filter((m) => m.color === side).length;
    assert.ok(mine >= 2, `${o.title} has ${mine} move(s) for ${side}`);
  }
});
