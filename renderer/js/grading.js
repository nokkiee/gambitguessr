// Grades a typed opening name against the accepted names for a position.
// Pure functions only, so it can be unit-tested under Node.

// "Opening"/"Game", "Defense" and "Attack" in every supported language (accents removed).
const KIND = {
  opening: 'opening', game: 'opening', debiut: 'opening', otwarcie: 'opening', partia: 'opening',
  eroffnung: 'opening', partie: 'opening', spiel: 'opening', apertura: 'opening', partida: 'opening',
  juego: 'opening', ouverture: 'opening', debut: 'opening',
  defense: 'defense', obrona: 'defense', verteidigung: 'defense', defensa: 'defense',
  attack: 'attack', atak: 'attack', angriff: 'attack', ataque: 'attack', attaque: 'attack',
};

// Words that may be left out or swapped freely ("Sicilian" = "Sicilian Defense").
const GENERIC = new Set([
  ...Object.keys(KIND),
  'variation', 'var', 'line', 'system', 'the', 'of', 'a', 'an', 'and', 'with', 'in', 'on',
  // The same little words in Polish, German, Spanish and French.
  'wariant', 'linia', 'variante', 'linie', 'variacion', 'linea', 'sistema', 'ligne', 'systeme',
  'w', 'z', 'der', 'die', 'das', 'des', 'den', 'dem', 'im', 'mit', 'und',
  'de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'le', 'les', 'du', 'avec', 'et', 'l', 'd',
]);

const NUMBERS = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };

// Common alternative names, rewritten to the dataset's wording before matching.
const ALIASES = [
  [/\bspanish( game| opening)?\b/g, 'ruy lopez'],
  [/\b(russian game|russian defense|petroffs?|petrovs?)\b/g, 'petrovs'],
  [/\bcentre\b/g, 'center'],
  [/\bcenter counter( defense| gambit)?\b/g, 'scandinavian defense'],
  [/\bgruenfeld\b/g, 'grunfeld'],
  [/(?<!smith )\bmorra\b/g, 'smith morra'],
  [/\bkid\b/g, 'kings indian defense'],
  [/\bkia\b/g, 'kings indian attack'],
  [/\bqgd\b/g, 'queens gambit declined'],
  [/\bqga\b/g, 'queens gambit accepted'],
  [/\bqg\b/g, 'queens gambit'],
];

export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/ł/g, 'l').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`´]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bdefence\b/g, 'defense')
    .replace(/\b([2-6])\b/g, (_, n) => NUMBERS[n])
    .trim();
}

function applyAliases(text) {
  let out = text;
  for (const [re, to] of ALIASES) out = out.replace(re, to);
  return out;
}

export function tokens(text) {
  return normalize(text).split(' ').filter(Boolean);
}

// "Family: Variation, Sub-variation" -> ["Family", "Variation", "Sub-variation"].
// Names without a colon still use commas ("London System, with Bd3").
export function splitName(name) {
  const colon = name.indexOf(':');
  const family = colon >= 0 ? name.slice(0, colon) : name.split(',')[0];
  const rest = colon >= 0 ? name.slice(colon + 1) : name.split(',').slice(1).join(',');
  return [family, ...rest.split(',')].map((s) => s.trim()).filter(Boolean);
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// Typo tolerance grows with word length; short words ("c3", "kan") must be exact-ish.
function similar(a, b) {
  if (a === b) return true;
  const len = Math.max(a.length, b.length);
  const allowed = len <= 3 ? 0 : len <= 6 ? 1 : 2;
  return allowed > 0 && levenshtein(a, b) <= allowed;
}

// Lets "carokann" match "caro kann" and "smithmorra" match "smith morra".
function expandJoined(userTokens, nameTokens) {
  const out = [];
  for (const t of userTokens) {
    let split = null;
    for (let i = 0; i < nameTokens.length - 1 && !split; i++) {
      const joined = nameTokens[i] + nameTokens[i + 1];
      if (joined.length > 5 && similar(t, joined)) split = [nameTokens[i], nameTokens[i + 1]];
    }
    out.push(...(split || [t]));
  }
  return out;
}

function familyCoverage(family, has) {
  const key = family.filter((t) => !GENERIC.has(t));
  return key.length ? key.filter(has).length / key.length : 0;
}

function gradeOne(input, name, depth) {
  const parts = splitName(name).map((p) => tokens(p));
  const all = parts.flat();
  const user = expandJoined(tokens(input), all);
  const meaningful = user.filter((t) => !GENERIC.has(t));

  const has = (t) => user.some((u) => similar(u, t));
  const hits = parts.map((p) => {
    const key = p.filter((t) => !GENERIC.has(t));
    return (key.length ? key : p).every(has);
  });
  // "Opening"/"Game", "Defense" and "Attack" may be omitted, but naming the wrong
  // kind (King's Indian *Defense* for the King's Indian *Attack*) is not a match.
  const familyKinds = new Set(parts[0].map((t) => KIND[t]).filter(Boolean));
  const wrongKind = user.filter((u) => KIND[u] && !all.includes(u) && familyKinds.size && !familyKinds.has(KIND[u]));
  const extras = [...meaningful.filter((u) => !all.some((t) => similar(u, t))), ...wrongKind];

  const need = Math.min(depth, parts.length);
  const requiredOk = hits.slice(0, need).every(Boolean);
  let result = 'wrong';
  if (requiredOk && extras.length === 0) result = 'correct';
  else if (hits[0]) result = 'partial';
  else if (!extras.length && familyCoverage(parts[0], has) >= 2 / 3) result = 'partial'; // "Queen's Gambit" for the QGD

  // Higher is better; used to pick the closest of several accepted names.
  const score = (result === 'correct' ? 100 : result === 'partial' ? 50 : 0)
    + hits.filter(Boolean).length * 5 - extras.length;
  return { result, name, hits, extras, score };
}

/**
 * @param {string} input what the player typed
 * @param {string[]} accepted every name that counts for this position (first = primary)
 * @param {number} depth how many name parts are required (1 = family, 2 = + variation, Infinity = all)
 * @returns {{result: 'correct'|'partial'|'wrong', name: string, hits: boolean[], extras: string[]}}
 */
export function gradeAnswer(input, accepted, depth = Infinity) {
  if (!normalize(input)) return { result: 'wrong', name: accepted[0], hits: splitName(accepted[0]).map(() => false), extras: [] };
  // Try the answer both as typed and with nicknames expanded ("Spanish" -> "Ruy Lopez"),
  // since a nickname can also be an ordinary word in a name ("Pseudo-Spanish Variation").
  const plain = normalize(input);
  const variants = [...new Set([plain, applyAliases(plain)])];
  let best = null;
  for (const name of accepted) {
    for (const v of variants) {
      const g = gradeOne(v, name, depth);
      if (!best || g.score > best.score) best = g;
    }
  }
  return best;
}

// The part of a name a player must give at a given depth ("Sicilian Defense: Najdorf Variation").
export function requiredPart(name, depth) {
  const parts = splitName(name);
  const need = parts.slice(0, Math.min(depth, parts.length));
  return need.length > 1 ? `${need[0]}: ${need.slice(1).join(', ')}` : need[0];
}

// "Sicilian Defense" -> "S_______ D______" style hint (keeps punctuation and short words).
export function letterHint(text) {
  return text.replace(/\p{L}+/gu, (w) => (w.length <= 2 ? w : w[0] + '_'.repeat(w.length - 1)));
}
