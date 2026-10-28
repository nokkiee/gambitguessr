'use strict';
// Walks through every screen with real mouse/keyboard input and takes screenshots.

// Looks up the opening on screen and returns its moves as {from, to, color, san}.
async function lineFor(H, { title, sanList }) {
  return H.js(`(async () => {
    const { Chess } = await import('./vendor/chess.js');
    const data = await (await fetch('data/openings.json')).json();
    const title = ${JSON.stringify(title ?? null)};
    const sanList = ${JSON.stringify(sanList ?? null)};
    const o = data.find((x) => title ? (x.display || x.name) === title : x.moves === sanList.join(' '));
    if (!o) return null;
    const c = new Chess();
    return { name: o.display || o.name, aka: o.aka || [], moves: o.moves.split(' ').map((s) => { const m = c.move(s); return { from: m.from, to: m.to, color: m.color, san: m.san }; }) };
  })()`);
}

module.exports = async (H) => {
  // ---- Name It ------------------------------------------------------------------------
  await H.waitFor(() => H.js(`document.querySelector('.answer-input') !== null`));
  // Wait for the moves to finish playing out.
  let last = -1;
  await H.waitFor(async () => {
    const n = await H.js(`document.querySelectorAll('.moves .move:not(:empty)').length`);
    const stable = n === last && n > 0;
    last = n;
    return stable;
  }, 15000, 600);
  await H.shot('01-name-question');

  const sanList = await H.js(`[...document.querySelectorAll('.moves .move .san')].map((e) => e.dataset.san)`);
  const asked = await lineFor(H, { sanList });
  H.assert(asked, `opening for ${sanList.join(' ')} not found`);

  await H.js(`document.querySelector('.answer-input').focus()`);
  await H.wc.insertText('Bongcloud Attack');
  H.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  H.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await H.sleep(200);
  const fb = await H.js(`document.querySelector('.feedback').innerText`);
  H.assert(/not this one|close/i.test(fb), `wrong answer feedback, got: ${fb}`);
  await H.click('.btn', 'Hint');
  await H.shot('02-name-wrong-and-hint');

  await H.js(`(() => { const i = document.querySelector('.answer-input'); i.value = ''; i.focus(); })()`);
  await H.wc.insertText(asked.name);
  // Enter submits; it must not also skip straight to the next question.
  H.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  H.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await H.sleep(300);
  const title = await H.js(`document.querySelector('.result-title')?.textContent`);
  H.assert(title === 'Got it!' || title === 'Correct!', `expected a correct result, got ${title}`);
  await H.shot('03-name-correct');

  // Next question, then give up on it.
  await H.click('.btn-primary', 'Next');
  await H.sleep(200);
  await H.click('.btn', 'Show answer');
  await H.sleep(200);
  H.assert(await H.js(`document.querySelector('.result-wrong') !== null`), 'giving up shows the answer');

  // Expert level: quiz the Najdorf from the Library. The family alone is only partly right.
  await H.click('.seg-opt', 'Expert');
  await H.click('.nav-item[data-view="library"]');
  await H.click('.cat-card', 'Intermediate');
  await H.js(`(() => { const i = document.querySelector('.search-input'); i.value = 'Najdorf Variation'; i.dispatchEvent(new Event('input')); })()`);
  await H.sleep(150);
  await H.click('.op-row');
  await H.sleep(150);
  await H.click('.btn', 'Name it');
  await H.sleep(200);
  await H.js(`document.querySelector('.answer-input').value = 'Sicilian Defence'`);
  await H.click('.btn-primary', 'Submit');
  await H.sleep(200);
  const partial = await H.js(`document.querySelector('.fb-partial')?.textContent || ''`);
  H.assert(/Sicilian Defense.*right/.test(partial), `family-only answer at Expert is partial, got: ${partial}`);
  await H.js(`document.querySelector('.answer-input').value = 'sicilian najdorf'`);
  await H.click('.btn-primary', 'Submit');
  await H.sleep(200);
  H.assert(await H.js(`document.querySelector('.result-title')?.textContent === 'Got it!'`), 'second try is accepted');
  await H.shot('03b-name-expert-second-try');
  await H.click('.seg-opt', 'Beginner');
  await H.sleep(200);

  // ---- Play It ----------------------------------------------------------------------------
  await H.click('.nav-item[data-view="play"]');
  await H.waitFor(() => H.js(`!!document.querySelector('.target-name')`));
  const target = await H.js(`document.querySelector('.target-name').textContent`);
  const line = await lineFor(H, { title: target });
  H.assert(line, `play target ${target} not found`);
  const userColor = await H.js(`document.querySelector('#player-bottom .p-sub').textContent.includes('Black') ? 'b' : 'w'`);

  let madeMistake = false;
  for (let i = 0; i < line.moves.length; i++) {
    const m = line.moves[i];
    if (m.color !== userColor) continue;
    await H.waitFor(() => H.js(`document.querySelectorAll('.pc.mine').length > 0 && document.querySelectorAll('.moves .move:not(:empty)').length === ${i}`), 8000);
    if (!madeMistake) {
      // Make a legal but wrong move first: any piece move that isn't the book move.
      const wrong = await H.js(`(async () => {
        const { Chess } = await import('./vendor/chess.js');
        const c = new Chess();
        for (const s of ${JSON.stringify(line.moves.slice(0, i).map((x) => x.san))}) c.move(s);
        const ms = c.moves({ verbose: true }).filter((x) => !(x.from === ${JSON.stringify(m.from)} && x.to === ${JSON.stringify(m.to)}));
        const pick = ms.find((x) => x.piece === 'p') || ms[0];
        return { from: pick.from, to: pick.to };
      })()`);
      await H.dragMove(wrong.from, wrong.to);
      await H.sleep(150);
      H.assert(await H.js(`!!document.querySelector('.badge')`), 'a wrong move shows a badge');
      await H.shot('04-play-wrong-move');
      await H.sleep(900);
      madeMistake = true;
    }
    if (i % 4 === 0) await H.clickMove(m.from, m.to);
    else await H.dragMove(m.from, m.to);
    await H.sleep(120);
  }
  await H.waitFor(() => H.js(`!!document.querySelector('.summary')`), 8000);
  const mistakes = await H.js(`document.querySelector('.summary .sum-item b').textContent`);
  H.assert(mistakes === '1', `expected 1 mistake, got ${mistakes}`);
  await H.shot('05-play-complete');

  // Hint flow on the next opening.
  await H.click('.btn-primary', 'Next');
  await H.waitFor(() => H.js(`document.querySelectorAll('.pc.mine').length > 0`), 8000);
  await H.click('.btn', 'Hint');
  await H.click('.btn', 'Hint');
  await H.sleep(150);
  H.assert(await H.js(`!!document.querySelector('.arrow-hint')`), 'second hint draws an arrow');
  await H.shot('06-play-hint');

  // ---- Library ---------------------------------------------------------------------------
  await H.click('.nav-item[data-view="library"]');
  await H.sleep(200);
  // The library remembers the last opening it showed; go back to the list.
  if (await H.js(`!!document.querySelector('.back-btn')`)) await H.click('.back-btn');
  await H.click('.cat-card', 'Beginner');
  await H.sleep(200);
  await H.shot('07-library-list');
  await H.click('.cat-card', 'Intermediate');
  await H.js(`(() => { const i = document.querySelector('.search-input'); i.value = ''; i.focus(); })()`);
  await H.wc.insertText('najdorf english');
  await H.sleep(250);
  const rows = await H.js(`document.querySelectorAll('.op-row').length`);
  H.assert(rows > 0, 'search finds the Najdorf English Attack');
  await H.click('.op-row');
  await H.sleep(300);
  await H.shot('08-library-detail');
  await H.click('.btn-primary', 'Play it');
  await H.sleep(300);
  const tgt = await H.js(`document.querySelector('.target-name').textContent`);
  H.assert(/Najdorf/.test(tgt), `Play it from the library opens that opening, got ${tgt}`);

  // ---- Settings ---------------------------------------------------------------------------
  await H.click('#btn-settings');
  await H.sleep(200);
  await H.click('.theme[title="Brown"]');
  await H.click('.piece-set[title="Celtic"]');
  await H.sleep(200);
  await H.shot('09-settings');
  await H.click('.dlg-close');
  await H.sleep(200);
  await H.shot('10-brown-celtic');
};
