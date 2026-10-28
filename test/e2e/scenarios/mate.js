'use strict';
// Mate It: a wrong move is taken back, any mate is accepted, traps play out first, hints work.

// All mating moves in the board's current position (computed in the page with chess.js).
const matingMoves = (H) => H.js(`(async () => {
  const { Chess } = await import('./vendor/chess.js');
  const c = new Chess(document.getElementById('board').dataset.fen);
  return c.moves({ verbose: true }).filter((m) => { const x = new Chess(c.fen()); x.move(m); return x.isCheckmate(); })
    .map((m) => ({ from: m.from, to: m.to, san: m.san }));
})()`);
const quietMove = (H) => H.js(`(async () => {
  const { Chess } = await import('./vendor/chess.js');
  const c = new Chess(document.getElementById('board').dataset.fen);
  const m = c.moves({ verbose: true }).find((m) => { const x = new Chess(c.fen()); x.move(m); return !x.inCheck(); });
  return { from: m.from, to: m.to };
})()`);
const ready = (H) => H.waitFor(() => H.js(`document.querySelectorAll('.pc.mine').length > 0`), 15000);

module.exports = async (H) => {
  await H.click('.nav-item[data-view="mate"]');
  await ready(H);
  await H.shot('mate-01-puzzle');
  const task = await H.js(`document.querySelector('.target-label').textContent`);
  H.assert(/to move: checkmate in one/.test(task), `task text: ${task}`);
  H.assert(await H.js(`/From a game: /.test(document.querySelector('.mate-from').textContent)`), 'shows the opening the game came from');

  // A move that isn't mate gets a cross and is taken back.
  const before = await H.js(`document.getElementById('board').dataset.fen`);
  const quiet = await quietMove(H);
  await H.dragMove(quiet.from, quiet.to);
  await H.sleep(150);
  H.assert(await H.js(`!!document.querySelector('.badge') && !!document.querySelector('.coach-bad')`), 'wrong move flagged');
  await H.shot('mate-02-wrong');
  await H.sleep(1000);
  H.assert(await H.js(`document.getElementById('board').dataset.fen`) === before, 'wrong move was taken back');

  // Any mate is accepted.
  const mates = await matingMoves(H);
  H.assert(mates.length > 0, 'position has a mate in one');
  const pick = mates[mates.length - 1];
  await H.clickMove(pick.from, pick.to);
  await H.sleep(300);
  H.assert(await H.js(`!!document.querySelector('.coach-good')`), 'mate accepted');
  H.assert(await H.js(`!!document.querySelector('.game-link')`), 'link to the Lichess game');
  await H.shot('mate-03-solved');
  H.assert(await H.js(`document.querySelector('.stat-strip .stat:nth-child(2) b').textContent`) === '0/1', 'a puzzle with a wrong try is not a clean solve');

  // Opening traps: Fool's Mate first, played out move by move.
  await H.click('.seg-opt', 'Opening traps');
  await ready(H);
  const name = await H.js(`document.querySelector('.target-name').textContent`);
  H.assert(name === 'Fool’s Mate', `first trap is Fool's Mate, got ${name}`);
  await H.dragMove('d8', 'h4');
  await H.sleep(300);
  H.assert(await H.js(`!!document.querySelector('.coach-good') && document.querySelector('.stat-strip .stat b').textContent === '1'`), 'clean solve starts a streak');
  await H.shot('mate-04-fools-mate');
  await H.click('.btn-primary', 'Next');
  await ready(H);
  H.assert(await H.js(`document.querySelector('.target-name').textContent`) === 'Scholar’s Mate', 'then Scholar’s Mate');

  // Hints: piece first, then the arrow; then show the solution.
  await H.click('.btn', 'Hint');
  H.assert(await H.js(`!!document.querySelector('.hl-hint')`), 'first hint highlights the piece');
  await H.click('.btn', 'Hint');
  H.assert(await H.js(`!!document.querySelector('.arrow-hint')`), 'second hint draws the arrow');
  await H.shot('mate-05-hint');
  await H.click('.btn', 'Show solution');
  await H.sleep(300);
  H.assert(await H.js(`/The mate was/.test(document.querySelector('.coach-bubble').textContent)`), 'solution shown');

  // Expert level: puzzles rated 1600+.
  await H.click('.seg-opt', 'Real games');
  await H.click('.seg-opt', 'Expert');
  await ready(H);
  const rating = await H.js(`Number(document.querySelector('.target-meta').textContent.match(/rating ([\\d,]+)/)[1].replace(',', ''))`);
  H.assert(rating >= 1600, `expert puzzle rating ${rating}`);
  await H.shot('mate-06-expert');
};
