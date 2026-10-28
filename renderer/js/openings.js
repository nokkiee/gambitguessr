// Opening data: loading, the per-level pools, and picking what to practise next.
import { Chess } from '../vendor/chess.js';
import { splitName } from './grading.js';
import { lang, t } from './i18n.js';

// Each level drills its own openings plus the easier levels' ones. In the Library every
// opening belongs to exactly one category (its level), so "learn them all" is a clear goal.
// Labels and descriptions are translated: t('level.<id>') and t('goal.<id>').
export const LEVELS = {
  beginner: { depth: 1, tiers: [1], color: '#81b64c' },
  intermediate: { depth: 2, tiers: [1, 2], color: '#4ba3e3' },
  expert: { depth: Infinity, tiers: null, color: '#b07ce8' },
};

/** What a Name It question asks for at a given depth. */
export function askText(depth) {
  return t(depth === 1 ? 'ask.family' : depth === 2 ? 'ask.variation' : 'ask.full');
}

/** The Library category (level) an opening belongs to. */
export function categoryOf(o) {
  return o.tier === 1 ? 'beginner' : o.tier === 2 ? 'intermediate' : 'expert';
}

let all = [];
let byEpd = new Map();
let byName = new Map();
// Opening names in other languages, from data/opening-names.json:
// { "Sicilian Defense": { "pl": "Obrona sycylijska", "de": [...], ... }, ... }
let localized = {};
const OTHER_LANGS = ['pl', 'de', 'es', 'fr'];

export async function loadOpenings(data, names) {
  all = data || await (await fetch('data/openings.json')).json();
  localized = names || (data ? {} : await (await fetch('data/opening-names.json')).json());
  byEpd = new Map();
  byName = new Map();
  for (const o of all) {
    o.title = o.display || o.name;
    o.parts = splitName(o.title);
    o.plies = o.moves.split(' ');
    if (!byName.has(o.name)) byName.set(o.name, o);
    if (!byEpd.has(o.epd)) byEpd.set(o.epd, []);
    byEpd.get(o.epd).push(o);
  }
  return all;
}

export const allOpenings = () => all;
export const openingByName = (name) => byName.get(name);

export function pool(level) {
  const { tiers } = LEVELS[level];
  return tiers ? all.filter((o) => tiers.includes(o.tier)) : all;
}

/** The openings in one Library category (no overlap between categories). */
export function inCategory(level) {
  return all.filter((o) => categoryOf(o) === level);
}

/** The English names that count as right for this opening's final position (primary first). */
export function englishNames(o) {
  const names = [o.title];
  for (const other of byEpd.get(o.epd) || [o]) {
    for (const n of [other.display, ...(other.aka || []), other.name]) {
      if (n && !names.includes(n)) names.push(n);
    }
  }
  return names;
}

function localList(name, code) {
  const v = localized[name]?.[code];
  return v ? (Array.isArray(v) ? v : [v]) : [];
}

// "Sicilian Defense: Najdorf Variation" in another language: the family (or a whole
// standalone name like "Evans Gambit") is translated, the rest stays as it is.
function translations(name, code) {
  const whole = localList(name, code);
  const family = splitName(name)[0];
  const rest = name.startsWith(family) ? name.slice(family.length) : '';
  const viaFamily = rest ? localList(family, code).map((f) => f + rest) : [];
  return [...whole, ...viaFamily];
}

/** Every name that counts as a right answer, in English and in each translated language. */
export function acceptedNames(o) {
  const names = englishNames(o);
  for (const n of [...names]) {
    for (const code of OTHER_LANGS) {
      for (const tr of translations(n, code)) if (!names.includes(tr)) names.push(tr);
    }
  }
  return names;
}

/** The opening's family in the interface language ("Obrona sycylijska"), or null if not translated. */
export function localFamily(o, code = lang) {
  return localFamilyOf(o.title, code) || localFamilyOf(o.name, code);
}

/** Same, for an opening name given as text ("French Defense: Tarrasch Variation"). */
export function localFamilyOf(name, code = lang) {
  if (code === 'en' || !name) return null;
  return localList(splitName(name)[0], code)[0] || null;
}

/** The opening's title with the family translated, for hints in the interface language. */
export function localTitle(o, code = lang) {
  const fam = localFamily(o, code);
  return fam ? fam + o.title.slice(o.parts[0].length) : o.title;
}

/** Other names worth showing: English alternatives plus translations in the interface language. */
export function displayAliases(o, code = lang) {
  const out = englishNames(o).filter((n) => n !== o.title && n !== o.name);
  if (code !== 'en') {
    for (const n of englishNames(o)) for (const tr of translations(n, code)) if (!out.includes(tr)) out.push(tr);
  }
  return out;
}

/** Text to search in: every name in every language, the ECO code and the moves. */
export function searchText(o) {
  return [...acceptedNames(o), o.eco, o.moves].join(' ');
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
