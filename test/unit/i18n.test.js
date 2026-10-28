import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dictionaries, setLanguage, t, pickLanguage } from '../../renderer/js/i18n.js';

const en = dictionaries.en;
const placeholders = (s) => [...new Set((typeof s === 'string' ? [s] : Object.values(s)).flatMap((x) => x.match(/\{\w+\}/g) || []))].sort();

test('every language has every key, with the same placeholders', () => {
  for (const [code, dict] of Object.entries(dictionaries)) {
    const missing = Object.keys(en).filter((k) => !(k in dict));
    const extra = Object.keys(dict).filter((k) => !(k in en));
    assert.deepEqual(missing, [], `${code} is missing keys`);
    assert.deepEqual(extra, [], `${code} has keys English doesn't`);
    for (const k of Object.keys(en)) {
      assert.deepEqual(placeholders(dict[k]), placeholders(en[k]), `${code} ${k} placeholders`);
      assert.equal(typeof dict[k], typeof en[k], `${code} ${k}: plural vs plain mismatch`);
    }
  }
});

test('plural entries cover every form the language uses', () => {
  for (const [code, dict] of Object.entries(dictionaries)) {
    const forms = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
    for (const [k, v] of Object.entries(dict)) {
      if (typeof v !== 'object') continue;
      for (const f of forms) assert.ok(v[f] || v.other, `${code} ${k} lacks "${f}"`);
    }
  }
});

test('every key used in the code exists', () => {
  const dir = new URL('../../renderer/js/', import.meta.url);
  const files = [...readdirSync(dir).map((f) => new URL(f, dir)), ...readdirSync(new URL('modes/', dir)).map((f) => new URL(`modes/${f}`, dir))]
    .filter((u) => u.pathname.endsWith('.js'));
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const [, key] of src.matchAll(/\bt(?:Nodes)?\('([a-z]+\.[A-Za-z0-9.]+)'/g)) {
      assert.ok(key in en, `${file.pathname.split('/').pop()} uses unknown key ${key}`);
    }
  }
});

test('Polish plurals and number formatting', () => {
  setLanguage('pl');
  assert.equal(t('play.mistakes', { n: 1 }), '1 błąd');
  assert.equal(t('play.mistakes', { n: 3 }), '3 błędy');
  assert.equal(t('play.mistakes', { n: 5 }), '5 błędów');
  assert.equal(t('lib.matches', { n: 22 }), '22 wyniki');
  assert.equal(t('mate.progress', { solved: 1200, total: 3025 }), 'Rozwiązane: 1200 z 3025'.replace('1200', (1200).toLocaleString('pl')).replace('3025', (3025).toLocaleString('pl')));
  setLanguage('en');
  assert.equal(t('lib.left', { n: 3025 }), '3,025 left to learn');
});

test('language choice: saved, then system, then English', () => {
  assert.equal(pickLanguage('de', 'pl-PL'), 'de');
  assert.equal(pickLanguage(null, 'pl-PL'), 'pl');
  assert.equal(pickLanguage(null, 'ja-JP'), 'en');
  assert.equal(pickLanguage('xx', 'fr-CA'), 'fr');
});
