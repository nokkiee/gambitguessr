'use strict';
// Takes the README screenshots (npm run screenshots). The progress shown in the Library is
// demo data written into the throwaway test profile, so the bars and ticks have something to show.

const DEMO_LEARNED = ['Italian Game', 'Ruy Lopez', 'Sicilian Defense', 'French Defense', 'Caro-Kann Defense',
  "Queen's Gambit", 'London System', 'Scotch Game', "King's Gambit", 'Scandinavian Defense', 'Slav Defense', 'Vienna Game'];

const ready = (H) => H.waitFor(() => H.js(`!document.body.classList.contains('loading')`));
const movable = (H) => H.waitFor(() => H.js(`document.querySelectorAll('.pc.mine').length > 0`), 15000);
const search = (H, q) => H.js(`(() => { const i = document.querySelector('.search-input'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input')); })()`);
async function library(H, category, query) {
  await H.click('.nav-item[data-view="library"]');
  if (await H.js(`!!document.querySelector('.back-btn')`)) await H.click('.back-btn');
  await H.click(`.cat-card`, category);
  await search(H, query || '');
  await H.sleep(200);
}

module.exports = async (H) => {
  await H.js(`(() => {
    const p = {};
    for (const n of ${JSON.stringify(DEMO_LEARNED)}) p[n] = { name: { seen: 2, good: 2, streak: 2 }, play: { seen: 1, good: 1, streak: 1 }, last: Date.now() };
    p['Pirc Defense'] = { name: { seen: 1, good: 0, streak: 0 }, last: Date.now() };
    localStorage.setItem('gambit.progress.v1', JSON.stringify(p));
    localStorage.setItem('gambit.records.v1', JSON.stringify({ nameStreak: 14, mateStreak: 9 }));
  })()`);
  await H.js(`location.reload()`);
  await H.sleep(400);
  await ready(H);

  // Library: categories with progress.
  await library(H, 'Beginner');
  await H.shot('library');

  // Name It: the Najdorf, named correctly.
  await library(H, 'Intermediate', 'Najdorf Variation');
  await H.click('.op-row');
  await H.sleep(150);
  await H.click('.btn', 'Name it');
  await H.waitFor(() => H.js(`document.querySelectorAll('.moves .move .san').length === 10`), 15000);
  await H.sleep(600);
  await H.js(`document.querySelector('.answer-input').value = 'Sicilian Najdorf'`);
  await H.click('.btn-primary', 'Submit');
  await H.sleep(500);
  await H.shot('name-it');

  // Play It: Ruy Lopez, but 3.Bc4 is played, a book move into the Italian Game.
  await library(H, 'Beginner', 'Ruy Lopez');
  await H.click('.op-row');
  await H.sleep(150);
  await H.click('.btn-primary', 'Play it');
  for (const [from, to] of [['e2', 'e4'], ['g1', 'f3']]) {
    await movable(H);
    await H.dragMove(from, to);
    await H.sleep(900);
  }
  await movable(H);
  await H.dragMove('f1', 'c4');
  await H.sleep(250);
  await H.shot('play-it');
  await H.sleep(1000);

  // Mate It: a solved puzzle from a real game.
  await H.click('.nav-item[data-view="mate"]');
  await movable(H);
  const mate = await H.js(`(async () => {
    const { Chess } = await import('./vendor/chess.js');
    const c = new Chess(document.getElementById('board').dataset.fen);
    const m = c.moves({ verbose: true }).find((m) => { const x = new Chess(c.fen()); x.move(m); return x.isCheckmate(); });
    return { from: m.from, to: m.to };
  })()`);
  await H.dragMove(mate.from, mate.to);
  await H.sleep(700);
  await H.shot('mate-it');

  // Make it yours: brown board, Celtic pieces, a long line in the Library.
  await H.click('#btn-settings');
  await H.click('.theme[data-theme="brown"]');
  await H.click('.piece-set[data-set="celtic"]');
  await H.sleep(200);
  await H.click('.dlg-close');
  await library(H, 'Intermediate', 'Marshall Attack');
  await H.click('.op-row');
  await H.sleep(600);
  await H.shot('themes');
  await H.click('#btn-settings');
  await H.click('.theme[data-theme="green"]');
  await H.click('.piece-set[data-set="cburnett"]');
  await H.click('.dlg-close');

  // The language picker, then the app in Polish.
  await library(H, 'Beginner');
  await H.click('#btn-lang');
  await H.click('.lang-card[data-lang="pl"]');
  await H.sleep(200);
  await H.shot('languages');
  await H.click('.lang-confirm');
  await H.sleep(400);
  await H.click('.nav-item[data-view="name"]');
  await H.sleep(300);
  await library(H, 'Początkujący');
  await H.shot('polish');
};
