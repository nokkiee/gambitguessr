// Settings and learning progress, kept in localStorage (persisted by Electron per app).

const SETTINGS_KEY = 'gambit.settings.v1';
const PROGRESS_KEY = 'gambit.progress.v1';

export const DEFAULT_SETTINGS = {
  lang: null, // null: follow the system language
  level: 'beginner',
  mateSource: 'games', // 'games' or 'traps'
  libraryKind: 'openings', // Library shelf: 'openings' or 'mates'
  playSide: 'auto',
  pieceSet: 'cburnett',
  boardTheme: 'green',
  sound: true,
  showDests: true,
  coords: true,
  animMs: 200,
  nameAnimate: true,
  nameShowMoves: true,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: progress just isn't saved this session.
  }
}

const listeners = new Set();
export const settings = { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) };

export function setSetting(key, value) {
  settings[key] = value;
  write(SETTINGS_KEY, settings);
  for (const fn of listeners) fn(key, value);
}

export function onSettingChange(fn) {
  listeners.add(fn);
}

// progress[name] = { name: {seen, good, streak}, play: {seen, good, streak}, last }
let progress = read(PROGRESS_KEY, {});

export function stats(name) {
  return progress[name];
}

/**
 * @param {string} name opening name
 * @param {'name'|'play'} mode
 * @param {boolean} success a correct name / a line played without mistakes or hints
 */
export function record(name, mode, success) {
  const entry = progress[name] || (progress[name] = {});
  const s = entry[mode] || (entry[mode] = { seen: 0, good: 0, streak: 0 });
  s.seen++;
  if (success) {
    s.good++;
    s.streak++;
  } else {
    s.streak = 0;
  }
  entry.last = Date.now();
  write(PROGRESS_KEY, progress);
}

/** 0 = new, 1 = practised, 2 = learned (succeeded at it last time in both modes). */
export function mastery(name) {
  const e = progress[name];
  if (!e) return 0;
  if (e.name?.streak > 0 && e.play?.streak > 0) return 2;
  return 1;
}

export function resetProgress() {
  progress = {};
  write(PROGRESS_KEY, progress);
  mates = {};
  write(MATE_KEY, mates);
}

// Mate It: puzzle id -> 2 (solved on the first try, no hints) or 1 (tried).
const MATE_KEY = 'gambit.mate.v1';
let mates = read(MATE_KEY, {});

export function mateStatus(id) {
  return mates[id] || 0;
}

export function recordMate(id, clean) {
  mates[id] = clean ? 2 : Math.max(mates[id] || 0, 1);
  write(MATE_KEY, mates);
}

// Small all-time records (best streaks).
const RECORDS_KEY = 'gambit.records.v1';
const records = read(RECORDS_KEY, {});

export function getRecord(key) {
  return records[key] || 0;
}

export function setRecord(key, value) {
  records[key] = value;
  write(RECORDS_KEY, records);
}
