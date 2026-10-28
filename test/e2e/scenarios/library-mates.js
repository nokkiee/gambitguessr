'use strict';
// The Library's Mate puzzles shelf: categories with solved counts, search, a puzzle's
// detail with its moves and the hidden mate, and "Solve it" opening that very puzzle.

const text = (H, sel) => H.js(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
const cards = (H) => H.js(`[...document.querySelectorAll('.cat-card')].map((c) => c.textContent)`);
const rowNames = (H) => H.js(`[...document.querySelectorAll('.op-row .op-name')].map((e) => e.textContent)`);
const flipped = (H) => H.js(`document.querySelector('.coord.file')?.textContent === 'h'`);
const shownMoves = (H) => H.js(`[...document.querySelectorAll('.moves .move .san')].map((e) => e.dataset.san)`);
const search = (H, q) => H.js(`(() => { const i = document.querySelector('.search-input'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input')); })()`);

module.exports = async (H) => {
  await H.click('.nav-item[data-view="library"]');
  await H.sleep(200);
  H.assert(await text(H, '.panel-head') === 'Opening Library', 'opens on the openings shelf');
  await H.click('.lib-kinds .seg-opt[data-kind="mates"]');
  await H.sleep(150);
  H.assert(await text(H, '.panel-head') === 'Puzzle Library', 'switched to the puzzle shelf');
  const c = await cards(H);
  H.assert(c.length === 3 && /Beginner0 \/ 959/.test(c[0]) && /Intermediate0 \/ 950/.test(c[1]) && /Expert0 \/ 887/.test(c[2]), `puzzle category cards, got ${c}`);
  H.assert(/rated under 1000/.test(await text(H, '.cat-goal')), 'Beginner goal names its rating range');
  H.assert(await text(H, '.cat-left') === '959 left to solve', 'puzzles left to solve');

  // Beginner starts with the nine famous traps, then the easiest rated puzzles.
  const names = await rowNames(H);
  H.assert(names[0] === 'Fool’s Mate' && names[1] === 'Scholar’s Mate', `traps first, got ${names.slice(0, 3)}`);
  H.assert(await H.js(`document.querySelectorAll('.op-row .eco-trap').length`) === 9, 'nine trap badges');
  H.assert(/^\d{3,4}$/.test(await H.js(`document.querySelectorAll('.op-row .eco')[9].textContent`)), 'rated puzzles show their rating');
  await H.shot('libm-01-shelf');

  // Search finds puzzles by opening name, in any language, and by trap name.
  await search(H, 'sicilian');
  await H.sleep(100);
  const sicilian = await H.js(`[...document.querySelectorAll('.op-row')].map((r) => r.textContent)`);
  // Nicknames count too: the English Opening's King's English is the "Reversed Sicilian".
  H.assert(sicilian.length > 20 && sicilian.every((n) => /Sicilian|English Opening/.test(n)), `Sicilian search, got ${sicilian.slice(0, 3)}`);
  await search(H, 'obrona sycylijska');
  await H.sleep(100);
  const polish = await H.js(`[...document.querySelectorAll('.op-row')].map((r) => r.textContent)`);
  H.assert(polish.length === sicilian.filter((n) => n.includes('Sicilian Defense')).length, 'the Polish name finds the Sicilian puzzles');
  await search(H, 'shilling');
  await H.sleep(100);
  H.assert(JSON.stringify(await rowNames(H)) === JSON.stringify(['Blackburne Shilling Trap']), 'trap found by name');
  await search(H, '');

  // A trap's page: its moves up to the mate, the board from the mating side, the mate hidden.
  await H.click('.op-row', 'Fool’s Mate');
  await H.sleep(200);
  H.assert(await text(H, '.detail-head .target-label') === 'Black to move: checkmate in one', 'task shown');
  H.assert(await text(H, '.chip.mate-status') === 'New', 'status New');
  H.assert(JSON.stringify(await shownMoves(H)) === '["f3","e5","g4"]', `moves before the mate, got ${await shownMoves(H)}`);
  H.assert(await flipped(H), 'board seen from Black');
  await H.click('.btn', 'Show the mate');
  await H.sleep(300);
  H.assert(JSON.stringify(await shownMoves(H)) === '["f3","e5","g4","Qh4#"]', 'mate revealed');
  H.assert(await text(H, '.chip.mate-status') === 'Tried', 'revealing counts as tried');
  await H.shot('libm-02-fools-revealed');
  H.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Left' });
  H.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Left' });
  await H.sleep(150);
  H.assert(await H.js(`document.querySelector('.moves .move.current .san').dataset.san`) === 'g4', 'arrow keys step through the moves');
  await H.click('.back-btn');
  await H.sleep(150);
  H.assert(/Beginner0 \/ 959/.test((await cards(H))[0]), 'a revealed puzzle is not solved');
  H.assert(await H.js(`document.querySelector('.op-row .mastery').classList.contains('m1')`), 'Fool’s Mate marked as tried');

  // "Solve it" opens that puzzle in Mate It; solving it moves the Library's progress.
  await H.click('.op-row', 'Scholar’s Mate');
  await H.sleep(150);
  await H.click('.btn-primary', 'Solve it');
  await H.waitFor(() => H.js(`document.querySelector('.nav-item[data-view="mate"]').classList.contains('active') && document.querySelectorAll('.pc.mine').length > 0`), 15000);
  H.assert(await text(H, '.target-name') === 'Scholar’s Mate', 'Mate It shows the chosen puzzle');
  await H.dragMove('h5', 'f7');
  await H.sleep(300);
  H.assert(await H.js(`!!document.querySelector('.coach-good')`), 'solved in Mate It');
  await H.click('.nav-item[data-view="library"]');
  await H.sleep(200);
  H.assert(await text(H, '.chip.mate-status') === 'Solved', 'back in the Library, the puzzle shows Solved');
  await H.click('.back-btn');
  await H.sleep(150);
  H.assert(/Beginner1 \/ 959/.test((await cards(H))[0]), 'Beginner shows 1 solved');
  await H.click('.lib-filter .seg-opt', 'Solved');
  H.assert(JSON.stringify(await rowNames(H)) === '["Scholar’s Mate"]', 'Solved filter lists it');
  await H.click('.lib-filter .seg-opt', 'All');

  // A puzzle from a real game: the move list starts mid-game, with a link to the game.
  await H.click('.cat-card', 'Intermediate');
  await H.sleep(150);
  await H.click('.op-row');
  await H.sleep(200);
  const moveNo = await H.js(`document.querySelector('.moves .move-no').textContent`);
  H.assert(/^\d+\.$/.test(moveNo) && moveNo !== '1.', `move numbers continue from the game, got ${moveNo}`);
  H.assert(await shownMoves(H).then((m) => m.length === 1), 'only the opponent’s move is shown before the mate');
  H.assert(await H.js(`!!document.querySelector('.game-link')`), 'link to the game on Lichess');
  const fen = await H.js(`document.getElementById('board').dataset.fen`);
  await H.shot('libm-03-game-puzzle');
  await H.click('.btn-primary', 'Solve it');
  await H.waitFor(() => H.js(`document.querySelectorAll('.pc.mine').length > 0`), 15000);
  H.assert(await H.js(`document.getElementById('board').dataset.fen`) === fen, 'Mate It shows the same position');

  // The Library remembers the shelf, and each shelf keeps its own category.
  await H.click('.nav-item[data-view="library"]');
  await H.sleep(150);
  await H.click('.back-btn');
  await H.click('.lib-kinds .seg-opt[data-kind="openings"]');
  await H.sleep(150);
  H.assert(/Beginner0 \/ 38/.test((await cards(H))[0]) && await H.js(`document.querySelector('.cat-card.active').textContent.startsWith('Beginner')`), 'openings shelf unchanged');
  await H.click('.lib-kinds .seg-opt[data-kind="mates"]');
  await H.sleep(150);
  H.assert(await H.js(`document.querySelector('.cat-card.active').textContent.startsWith('Intermediate')`), 'puzzle shelf kept Intermediate');
  H.assert(await H.js(`JSON.parse(localStorage.getItem('gambit.settings.v1')).libraryKind`) === 'mates', 'shelf choice saved');
  H.assert(!/\blib\.[a-zA-Z]/.test(await H.js(`document.body.innerText`)), 'no untranslated keys on screen');
};
