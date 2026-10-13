'use strict';
// Learning one opening from the Library moves its category's progress, and a quiz
// started from the Library asks at that opening's category level.

async function playLine(H, title) {
  const line = await H.js(`(async () => {
    const { Chess } = await import('./vendor/chess.js');
    const data = await (await fetch('data/openings.json')).json();
    const o = data.find((x) => (x.display || x.name) === ${JSON.stringify(title)});
    const c = new Chess();
    return o.moves.split(' ').map((s) => { const m = c.move(s); return { from: m.from, to: m.to, color: m.color }; });
  })()`);
  const userColor = await H.js(`document.querySelector('#player-bottom .p-sub').textContent.includes('Black') ? 'b' : 'w'`);
  for (let i = 0; i < line.length; i++) {
    if (line[i].color !== userColor) continue;
    await H.waitFor(() => H.js(`document.querySelectorAll('.pc.mine').length > 0 && document.querySelectorAll('.moves .move:not(:empty)').length === ${i}`), 8000);
    await H.dragMove(line[i].from, line[i].to);
  }
  await H.waitFor(() => H.js(`!!document.querySelector('.summary')`), 8000);
}

const cardCount = (H, label) => H.js(`[...document.querySelectorAll('.cat-card')].find((c) => c.textContent.includes(${JSON.stringify(label)})).querySelector('b').textContent`);

module.exports = async (H) => {
  await H.click('.nav-item[data-view="library"]');
  await H.sleep(200);
  const cards = await H.js(`[...document.querySelectorAll('.cat-card')].map((c) => c.textContent)`);
  H.assert(cards.length === 3 && /Beginner0 \/ 38/.test(cards[0]) && /Intermediate0 \/ 114/.test(cards[1]) && /Expert0 \/ 3,025/.test(cards[2]), `three category cards, got ${cards}`);
  await H.shot('lib-01-categories');

  // Learn the first Beginner opening still to learn: name it, then play it cleanly.
  await H.click('.cat-card', 'Beginner');
  await H.click('.lib-filter .seg-opt', 'To learn');
  await H.click('.op-row');
  await H.sleep(200);
  const title = await H.js(`document.querySelector('.detail-name').textContent`);
  await H.click('.btn', 'Name it');
  await H.sleep(200);
  await H.js(`document.querySelector('.answer-input').value = ${JSON.stringify(title)}`);
  await H.click('.btn-primary', 'Submit');
  await H.sleep(200);
  H.assert(await H.js(`document.querySelector('.result-title')?.textContent === 'Correct!'`), `named ${title}`);
  await H.click('.btn', 'Practice moves');
  await H.sleep(200);
  await playLine(H, title);
  H.assert(await H.js(`document.querySelector('.summary .sum-item b').textContent === '0'`), 'played without mistakes');

  await H.click('.nav-item[data-view="library"]');
  await H.sleep(200);
  if (await H.js(`!!document.querySelector('.back-btn')`)) await H.click('.back-btn');
  H.assert(await cardCount(H, 'Beginner') === '1', 'Beginner progress shows 1 learned');
  await H.click('.lib-filter .seg-opt', 'Learned');
  const learned = await H.js(`[...document.querySelectorAll('.op-row .op-name')].map((e) => e.textContent)`);
  H.assert(learned.length === 1 && learned[0] === title, `Learned filter lists ${title}, got ${learned}`);
  await H.shot('lib-02-one-learned');

  // An Intermediate opening quizzed from the Library needs its variation, even at Beginner level.
  await H.click('.lib-filter .seg-opt', 'All');
  await H.click('.cat-card', 'Intermediate');
  await H.js(`(() => { const i = document.querySelector('.search-input'); i.value = 'Najdorf Variation'; i.dispatchEvent(new Event('input')); })()`);
  await H.sleep(150);
  await H.click('.op-row');
  await H.sleep(150);
  await H.click('.btn', 'Name it');
  await H.sleep(200);
  H.assert(await H.js(`/variation/.test(document.querySelector('.q-sub').textContent)`), 'question asks for the variation');
  await H.js(`document.querySelector('.answer-input').value = 'Sicilian Defense'`);
  await H.click('.btn-primary', 'Submit');
  await H.sleep(200);
  H.assert(await H.js(`!!document.querySelector('.fb-partial')`), 'family only is partial for an Intermediate opening');

  // Practise buttons switch the drill level to that category.
  await H.click('.nav-item[data-view="library"]');
  await H.sleep(150);
  if (await H.js(`!!document.querySelector('.back-btn')`)) await H.click('.back-btn');
  await H.click('.cat-card', 'Expert');
  await H.sleep(150);
  await H.shot('lib-03-expert');
  await H.click('.cat-actions .link-btn', 'Play It');
  await H.sleep(300);
  H.assert(await H.js(`document.querySelector('.seg-opt.active').textContent === 'Expert'`), 'Play It switched to Expert');
};
