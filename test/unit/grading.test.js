import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer, splitName, requiredPart, letterHint, normalize } from '../../renderer/js/grading.js';

const NAJDORF_EA = ['Sicilian Defense: Najdorf Variation, English Attack'];
const result = (input, accepted, depth) => gradeAnswer(input, accepted, depth).result;

test('splits names into family and variations', () => {
  assert.deepEqual(splitName('Sicilian Defense: Najdorf Variation, English Attack'),
    ['Sicilian Defense', 'Najdorf Variation', 'English Attack']);
  assert.deepEqual(splitName('London System, with Bd3'), ['London System', 'with Bd3']);
  assert.deepEqual(splitName('Italian Game'), ['Italian Game']);
});

test('normalizes accents, apostrophes, spelling and digits', () => {
  assert.equal(normalize("Grünfeld Defence"), 'grunfeld defense');
  assert.equal(normalize("King's 4 Knights"), 'kings four knights');
});

test('beginner level only needs the family', () => {
  assert.equal(result('Sicilian', NAJDORF_EA, 1), 'correct');
  assert.equal(result('sicilian defence', NAJDORF_EA, 1), 'correct');
  assert.equal(result('Sicillian', NAJDORF_EA, 1), 'correct'); // typo
  assert.equal(result('French Defense', NAJDORF_EA, 1), 'wrong');
});

test('naming a wrong variation is only partly right', () => {
  assert.equal(result('Sicilian Dragon', NAJDORF_EA, 1), 'partial');
  assert.equal(result('Sicilian Dragon', NAJDORF_EA, 2), 'partial');
});

test('intermediate level needs the main variation', () => {
  assert.equal(result('Sicilian Najdorf', NAJDORF_EA, 2), 'correct');
  assert.equal(result('Najdorf Sicilian', NAJDORF_EA, 2), 'correct');
  assert.equal(result('Sicilian Defense', NAJDORF_EA, 2), 'partial');
});

test('expert level needs the full name', () => {
  assert.equal(result('Sicilian Najdorf English Attack', NAJDORF_EA, Infinity), 'correct');
  assert.equal(result('sicilian defense: najdorf variation, english', NAJDORF_EA, Infinity), 'correct');
  assert.equal(result('Sicilian Najdorf', NAJDORF_EA, Infinity), 'partial');
});

test('attack and defense are interchangeable only when nothing contradicts', () => {
  assert.equal(result("King's Indian Defense", ["King's Indian Attack"], 1), 'partial');
  assert.equal(result('English Defense', ['English Opening'], 1), 'partial');
  assert.equal(result('Italian Opening', ['Italian Game'], 1), 'correct');
  assert.equal(result('Ruy Lopez Opening', ['Ruy Lopez: Berlin Defense'], 1), 'correct');
  assert.equal(result("Kings Indian", ["King's Indian Attack"], 1), 'correct');
  assert.equal(result("King's Gambit", ["King's Indian Defense"], 1), 'wrong');
  assert.equal(result("Queen's Gambit", ["Queen's Gambit Declined"], 1), 'partial');
});

test('common aliases and joined words are understood', () => {
  assert.equal(result('Spanish Game', ['Ruy Lopez'], 1), 'correct');
  assert.equal(result('Petroff Defence', ["Petrov's Defense"], 1), 'correct');
  assert.equal(result('Russian Game', ["Petrov's Defense: Stafford Gambit"], 1), 'correct');
  assert.equal(result('Carokann', ['Caro-Kann Defense'], 1), 'correct');
  assert.equal(result('caro kann', ['Caro-Kann Defense'], 1), 'correct');
  assert.equal(result('Gruenfeld', ['Grünfeld Defense'], 1), 'correct');
  assert.equal(result('QGD', ["Queen's Gambit Declined"], 1), 'correct');
  assert.equal(result('Sicilian Morra Gambit', ['Sicilian Defense: Smith-Morra Gambit'], 2), 'correct');
  assert.equal(result('two knights defense', ['Italian Game: Two Knights Defense', 'Two Knights Defense'], 1), 'correct');
  assert.equal(result('Italian 2 knights', ['Italian Game: Two Knights Defense'], 2), 'correct');
});

test('the best of several accepted names wins', () => {
  const g = gradeAnswer('Fried Liver Attack', ['Italian Game: Two Knights Defense, Fried Liver Attack', 'Fried Liver Attack'], 2);
  assert.equal(g.result, 'correct');
});

test('empty input is wrong', () => {
  assert.equal(result('  ', NAJDORF_EA, 1), 'wrong');
});

test('helpers for hints', () => {
  assert.equal(requiredPart('Sicilian Defense: Najdorf Variation, English Attack', 2), 'Sicilian Defense: Najdorf Variation');
  assert.equal(requiredPart('Sicilian Defense: Najdorf Variation', 1), 'Sicilian Defense');
  assert.equal(letterHint("Queen's Gambit"), "Q____'s G_____");
});

test('translated opening names, Polish letters and German ß', async () => {
  assert.equal(normalize('Gambit królewski przyjęty'), 'gambit krolewski przyjety');
  assert.equal(normalize('Ruy López Łódź Straße'), 'ruy lopez lodz strasse');
  const sicilianPl = ['Sicilian Defense: Najdorf Variation', 'Obrona sycylijska: Najdorf Variation'];
  assert.equal(result('obrona sycylijska', sicilianPl, 1), 'correct');
  assert.equal(result('sycylijska', sicilianPl, 1), 'correct');
  assert.equal(result('Obrona sycylijska wariant Najdorfa', sicilianPl, 2), 'correct');
  const sicilianDe = ['Sicilian Defense: Najdorf Variation', 'Sizilianische Verteidigung: Najdorf Variation'];
  assert.equal(result('Sizilianisch Najdorf-Variante', sicilianDe, 2), 'correct');
  assert.equal(result('Defensa siciliana', ['Sicilian Defense', 'Defensa siciliana'], 1), 'correct');
  assert.equal(result('Défense sicilienne', ['Sicilian Defense', 'Défense sicilienne'], 1), 'correct');
  assert.equal(result('obrona francuska', sicilianPl, 1), 'wrong');
});
