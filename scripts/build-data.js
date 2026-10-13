#!/usr/bin/env node
'use strict';
// Builds renderer/data/openings.json from the Lichess opening TSVs in data/raw
// plus the hand-picked list in data/curated.js.
//   node scripts/build-data.js            build
//   node scripts/build-data.js --fetch    re-download the TSVs first

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'renderer', 'data', 'openings.json');
const SOURCE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';

async function main() {
  const { Chess } = await import('../renderer/vendor/chess.js');
  process.removeAllListeners('warning');

  if (process.argv.includes('--fetch')) {
    fs.mkdirSync(RAW, { recursive: true });
    for (const v of 'abcde') {
      execFileSync('curl', ['-sfL', '-o', path.join(RAW, `${v}.tsv`), `${SOURCE}/${v}.tsv`], { stdio: 'inherit' });
    }
  }

  function epdOf(chess) {
    const [board, turn, castling, ep] = chess.fen().split(' ');
    const epLegal = ep !== '-' && chess.moves({ verbose: true }).some((m) => m.flags.includes('e'));
    return [board, turn, castling, epLegal ? ep : '-'].join(' ');
  }

  function play(moves, label) {
    const chess = new Chess();
    const san = [];
    for (const m of moves) {
      let r;
      try { r = chess.move(m); } catch { r = null; }
      if (!r) throw new Error(`${label}: illegal move "${m}" after "${san.join(' ')}"`);
      san.push(r.san);
    }
    return { san, epd: epdOf(chess) };
  }

  const pgnMoves = (pgn) => pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);

  // Shortest line per name (the Lichess convention for a name's defining line).
  const byName = new Map();
  for (const v of 'abcde') {
    const rows = fs.readFileSync(path.join(RAW, `${v}.tsv`), 'utf8').split('\n').slice(1).filter(Boolean);
    for (const row of rows) {
      const [eco, name, pgn] = row.split('\t');
      const { san, epd } = play(pgnMoves(pgn), name);
      const prev = byName.get(name);
      if (!prev || san.length < prev.san.length) byName.set(name, { eco, name, san, epd });
    }
  }

  const curated = require(path.join(ROOT, 'data', 'curated.js'));
  const missing = [];
  for (const c of curated) {
    const base = byName.get(c.name);
    if (!base) { missing.push(c.name); continue; }
    if (base.tier) throw new Error(`Curated twice: ${c.name}`);
    base.tier = c.tier;
    base.side = c.side || (base.san.length % 2 ? 'w' : 'b');
    if (c.display) base.display = c.display;
    if (c.aka) base.aka = c.aka;
    if (c.moves) Object.assign(base, play(c.moves.split(' '), c.name));
  }
  if (missing.length) {
    const all = [...byName.keys()];
    for (const m of missing) {
      const head = m.split(/[:,]/)[0];
      const near = all.filter((n) => n.startsWith(head) && n.split(',').length === 1).slice(0, 12);
      console.error(`Not in dataset: "${m}"\n   candidates: ${near.join(' | ')}`);
    }
    process.exit(1);
  }

  const list = [...byName.values()]
    .sort((a, b) => a.eco.localeCompare(b.eco) || a.san.length - b.san.length || a.name.localeCompare(b.name))
    .map((o, i) => {
      const out = { id: i, eco: o.eco, name: o.name, moves: o.san.join(' '), epd: o.epd };
      if (o.tier) out.tier = o.tier;
      if (o.side) out.side = o.side;
      if (o.display) out.display = o.display;
      if (o.aka) out.aka = o.aka;
      return out;
    });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(list));
  const t1 = list.filter((o) => o.tier === 1).length;
  const t2 = list.filter((o) => o.tier === 2).length;
  console.log(`Wrote ${list.length} openings (${t1} essential, ${t2} popular) to ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
