'use strict';
// Runs the real app (main.js) against a throwaway data dir and lets a scenario drive it.
//   npx electron test/e2e/harness.js test/e2e/scenarios/<name>.js
// Screenshots go to $SHOT_DIR (default: <tmp>/gambitguessr-shots).
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.GAMBIT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gambitguessr-e2e-'));
const OUT = process.env.SHOT_DIR || path.join(os.tmpdir(), 'gambitguessr-shots');
fs.mkdirSync(OUT, { recursive: true });

const { app } = require('electron');
const main = require('../../main.js');

function waitFor(fn, ms = 10000, step = 50) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = async () => {
      try {
        const v = await fn();
        if (v) return resolve(v);
      } catch {}
      if (Date.now() - t0 > ms) return reject(new Error('waitFor timed out: ' + fn.toString().slice(0, 140)));
      setTimeout(tick, step);
    };
    tick();
  });
}

(async () => {
  await app.whenReady();
  const win = await waitFor(() => main.getWindow());
  const wc = win.webContents;
  const errors = [];
  wc.on('console-message', (e) => {
    const level = e.level ?? e.severity;
    if (level === 'error' || level === 3) {
      errors.push(e.message);
      console.log('[renderer error]', e.message);
    }
  });
  await waitFor(() => !wc.isLoading());
  win.setSize(1360, 860);
  win.showInactive();

  const H = {
    win, wc, OUT, errors, waitFor,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    js: (code) => wc.executeJavaScript(code, true),
    async shot(name) {
      await H.sleep(120);
      const img = await wc.capturePage();
      const file = path.join(OUT, `${name}.png`);
      fs.writeFileSync(file, img.toPNG());
      console.log('shot', file);
    },
    // Clicks the centre of an element found by CSS selector (optionally the n-th match / containing text).
    async click(selector, text) {
      const ok = await H.js(`(() => {
        const els = [...document.querySelectorAll(${JSON.stringify(selector)})]
          .filter((el) => ${JSON.stringify(text ?? null)} === null || el.textContent.includes(${JSON.stringify(text ?? '')}));
        if (!els.length) return false;
        els[0].click();
        return true;
      })()`);
      if (!ok) throw new Error(`click: nothing matches ${selector} ${text ?? ''}`);
      await H.sleep(60);
    },
    // Real mouse input on a board square, e.g. dragSquare('e2', 'e4').
    async squareCenter(sq) {
      return H.js(`(() => {
        const r = document.getElementById('board').getBoundingClientRect();
        const flipped = document.querySelector('.coord.file')?.textContent === 'h' ? true : false;
        const f = 'abcdefgh'.indexOf(${JSON.stringify(sq[0])}), k = Number(${JSON.stringify(sq[1])}) - 1;
        const c = flipped ? 7 - f : f, row = flipped ? k : 7 - k;
        return { x: Math.round(r.left + (c + 0.5) * r.width / 8), y: Math.round(r.top + (row + 0.5) * r.height / 8) };
      })()`);
    },
    async dragMove(from, to) {
      const a = await H.squareCenter(from);
      const b = await H.squareCenter(to);
      wc.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y });
      wc.sendInputEvent({ type: 'mouseDown', x: a.x, y: a.y, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 6; i++) {
        wc.sendInputEvent({ type: 'mouseMove', x: Math.round(a.x + ((b.x - a.x) * i) / 6), y: Math.round(a.y + ((b.y - a.y) * i) / 6), button: 'left' });
        await H.sleep(16);
      }
      wc.sendInputEvent({ type: 'mouseUp', x: b.x, y: b.y, button: 'left', clickCount: 1 });
      await H.sleep(80);
    },
    async clickMove(from, to) {
      for (const sq of [from, to]) {
        const p = await H.squareCenter(sq);
        wc.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 });
        wc.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 });
        await H.sleep(60);
      }
    },
    assert(cond, msg) {
      if (!cond) throw new Error('Assertion failed: ' + msg);
    },
  };

  const scenario = require(path.resolve(process.argv[process.argv.length - 1]));
  let code = 0;
  try {
    await waitFor(() => H.js(`!document.body.classList.contains('loading')`));
    await scenario(H);
    if (errors.length) throw new Error(`renderer logged ${errors.length} error(s)`);
    console.log('PASS');
  } catch (err) {
    console.error('FAIL', err.stack || err.message);
    await H.shot('failure').catch(() => {});
    code = 1;
  }
  app.exit(code);
})();
