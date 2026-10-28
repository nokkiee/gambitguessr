#!/usr/bin/env node
'use strict';
// Builds renderer/data/puzzles.json for "Mate It" from the Lichess puzzle database (CC0).
//   node scripts/build-puzzles.js            use data/raw/lichess_mate1.csv
//   node scripts/build-puzzles.js --fetch    download the database first (about 300 MB)
// Only mate-in-one puzzles from games with a known opening are used, and every puzzle
// is checked: after the opponent's move, the solution must be a legal checkmate.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw', 'lichess_mate1.csv');
const OUT = path.join(ROOT, 'renderer', 'data', 'puzzles.json');

const LEVELS = [
  { id: 'beginner', min: 400, max: 1000 },
  { id: 'intermediate', min: 1000, max: 1600 },
  { id: 'expert', min: 1600, max: 4000 },
];
const PER_LEVEL = 700; // from any point in the first ~20 moves
const TRAPS_PER_LEVEL = 250; // mates by move 10: "opening traps"
const EARLY_MOVE = 10;

// Famous named traps: the whole line is shown, then the player finds the final mate.
const NAMED_TRAPS = [
  { id: 'fools', line: 'f3 e5 g4 Qh4#' },
  { id: 'scholars', line: 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#' },
  { id: 'legal', line: 'e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#' },
  { id: 'blackburne', line: 'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#' },
  { id: 'englund', line: 'd4 e5 dxe5 Nc6 Nf3 Qe7 Bf4 Qb4+ Bd2 Qxb2 Bc3 Bb4 Qd2 Bxc3 Qxc3 Qc1#' },
  { id: 'carokann', line: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2 Ngf6 Nd6#' },
  { id: 'kieninger', line: 'd4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3 Bb4+ Nbd2 Qe7 a3 Ngxe5 axb4 Nd3#' },
  { id: 'siberian', line: 'e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 e6 Bc4 Qc7 O-O Nf6 Qe2 Ng4 h3 Nd4 Nxd4 Qh2#' },
  { id: 'froms', line: 'f4 e5 fxe5 d6 exd6 Bxd6 Nf3 g5 h3 Bg3#' },
];

// Lichess puzzle tags that don't spell an opening the way the opening database does.
const TAG_ALIASES = {
  russiangame: "Petrov's Defense",
  giuocopiano: 'Italian Game: Giuoco Piano',
  englundgambitcomplex: 'Englund Gambit',
  englundgambitcomplexdeclined: 'Englund Gambit',
  neogrunfelddefense: 'Grünfeld Defense',
};

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Small deterministic hash so the selection is the same on every build.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

async function main() {
  const { Chess } = await import('../renderer/vendor/chess.js');
  process.removeAllListeners('warning');

  if (process.argv.includes('--fetch')) {
    console.log('Downloading the Lichess puzzle database…');
    execSync(`curl -sfL https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | awk -F, 'NR==1 || $8 ~ /mateIn1/' > "${RAW}"`, { stdio: 'inherit', shell: '/bin/bash' });
  }

  // Opening names from the opening database, to label each puzzle's game.
  const openings = JSON.parse(fs.readFileSync(path.join(ROOT, 'renderer', 'data', 'openings.json'), 'utf8'));
  const byNorm = new Map();
  for (const o of openings) {
    byNorm.set(norm(o.name), o.name);
    const family = (o.name.includes(':') ? o.name.split(':')[0] : o.name.split(',')[0]).trim();
    if (!byNorm.has(norm(family))) byNorm.set(norm(family), family);
  }
  const openingFor = (tags) => {
    const list = tags.split(' ');
    for (let i = list.length - 1; i >= 0; i--) {
      const key = norm(list[i]);
      if (TAG_ALIASES[key]) return TAG_ALIASES[key];
      if (byNorm.has(key)) return byNorm.get(key);
    }
    return list[0].replace(/_/g, ' ');
  };

  const candidates = { beginner: [], intermediate: [], expert: [] };
  let read = 0;
  let rejected = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(RAW) });
  let header = null;
  for await (const line of rl) {
    if (!header) { header = line.split(','); continue; }
    read++;
    const f = line.split(',');
    const row = Object.fromEntries(header.map((k, i) => [k, f[i]]));
    if (!row.OpeningTags || +row.NbPlays < 300 || +row.RatingDeviation > 80 || +row.Popularity < 85) continue;
    const level = LEVELS.find((l) => +row.Rating >= l.min && +row.Rating < l.max);
    if (!level) continue;
    const [setup, solution] = row.Moves.split(' ');
    const chess = new Chess(row.FEN);
    let ok = false;
    try {
      chess.move({ from: setup.slice(0, 2), to: setup.slice(2, 4), promotion: setup[4] });
      chess.move({ from: solution.slice(0, 2), to: solution.slice(2, 4), promotion: solution[4] });
      ok = chess.isCheckmate();
    } catch { ok = false; }
    if (!ok) { rejected++; continue; }
    const opening = openingFor(row.OpeningTags);
    candidates[level.id].push({
      id: row.PuzzleId, fen: row.FEN, moves: row.Moves, rating: +row.Rating,
      opening, family: opening.split(/[:,]/)[0].trim(), plays: +row.NbPlays,
      move: +row.FEN.split(' ')[5],
    });
  }

  // Pick a varied set: spread over openings (no family takes more than ~6%), in a fixed order.
  function choose(list, n) {
    const sorted = [...list].sort((a, b) => hash(a.id) - hash(b.id));
    const cap = Math.max(3, Math.ceil(n * 0.06));
    const perFamily = new Map();
    const out = [];
    for (const p of sorted) {
      if (out.length >= n) break;
      const c = perFamily.get(p.family) || 0;
      if (c >= cap) continue;
      perFamily.set(p.family, c + 1);
      out.push(p);
    }
    // Not enough variety for the cap: fill up with whatever is left.
    for (const p of sorted) {
      if (out.length >= n) break;
      if (!out.includes(p)) out.push(p);
    }
    return out;
  }

  const names = [];
  const nameIndex = (n) => {
    let i = names.indexOf(n);
    if (i < 0) { i = names.length; names.push(n); }
    return i;
  };
  const puzzles = [];
  for (const level of LEVELS) {
    const pool = candidates[level.id];
    const traps = choose(pool.filter((p) => p.move <= EARLY_MOVE), TRAPS_PER_LEVEL);
    const trapIds = new Set(traps.map((p) => p.id));
    const rest = choose(pool.filter((p) => !trapIds.has(p.id)), PER_LEVEL);
    for (const p of [...traps, ...rest]) {
      puzzles.push({ id: p.id, fen: p.fen, m: p.moves, r: p.rating, o: nameIndex(p.opening), lv: level.id[0], ...(p.move <= EARLY_MOVE ? { t: 1 } : {}) });
    }
    console.log(`${level.id.padEnd(12)} ${pool.length} valid → ${traps.length} traps + ${rest.length} others`);
  }

  // Named traps are checked the same way: legal line, ending in checkmate.
  const named = NAMED_TRAPS.map((t) => {
    const chess = new Chess();
    for (const san of t.line.split(' ')) chess.move(san);
    if (!chess.isCheckmate()) throw new Error(`Named trap ${t.id} doesn't end in mate`);
    return { id: t.id, line: t.line };
  });

  fs.writeFileSync(OUT, JSON.stringify({ openings: names, puzzles, traps: named }));
  console.log(`Read ${read} mate-in-one puzzles (${rejected} failed the check). Wrote ${puzzles.length} puzzles + ${named.length} named traps to ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
