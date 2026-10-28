// Interface translations. The strings live in renderer/i18n/<code>.js; English fills any gap.
import en from '../i18n/en.js';
import pl from '../i18n/pl.js';
import de from '../i18n/de.js';
import es from '../i18n/es.js';
import fr from '../i18n/fr.js';

export const LANGUAGES = [['en', 'English'], ['pl', 'Polski'], ['de', 'Deutsch'], ['es', 'Español'], ['fr', 'Français']];
const DICTS = { en, pl, de, es, fr };

export let lang = 'en';
let plural = new Intl.PluralRules('en');
let numbers = new Intl.NumberFormat('en');

/** Picks a supported language: the saved choice, else the system language, else English. */
export function pickLanguage(saved, system) {
  for (const code of [saved, (system || '').slice(0, 2).toLowerCase()]) {
    if (code && DICTS[code]) return code;
  }
  return 'en';
}

export function setLanguage(code) {
  lang = DICTS[code] ? code : 'en';
  plural = new Intl.PluralRules(lang);
  numbers = new Intl.NumberFormat(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export const num = (n) => numbers.format(n);

/**
 * Translates `key`, filling {placeholders} from `vars`. Numbers are formatted for the
 * language, and a plural entry ({one, few, many, other}) is chosen by `vars.n`.
 */
export function t(key, vars = {}) {
  let s = DICTS[lang][key] ?? en[key];
  if (s == null) return key;
  if (typeof s === 'object') s = s[plural.select(vars.n ?? 0)] ?? s.other;
  return s.replace(/\{(\w+)\}/g, (whole, k) => {
    const v = vars[k];
    if (v == null) return whole;
    return typeof v === 'number' ? num(v) : String(v);
  });
}

/** Like t(), but a value may be a DOM node (a move in figurine notation, for example). */
export function tNodes(key, vars = {}) {
  const nodes = {};
  const text = {};
  for (const [k, v] of Object.entries(vars)) (v instanceof Node ? nodes : text)[k] = v;
  const frag = document.createDocumentFragment();
  for (const part of t(key, text).split(/(\{\w+\})/)) {
    const m = part.match(/^\{(\w+)\}$/);
    if (m && nodes[m[1]]) frag.append(nodes[m[1]]);
    else if (part) frag.append(part);
  }
  return frag;
}

/** For tests: every dictionary by language code. */
export const dictionaries = DICTS;
