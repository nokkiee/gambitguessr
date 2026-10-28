'use strict';
// Every screen in every language: no untranslated keys, Polish names accepted in Name It.

const SCREENS = ['name', 'play', 'mate', 'library'];

module.exports = async (H) => {
  const keys = await H.js(`(async () => Object.keys((await import('./i18n/en.js')).default))()`);
  const leaked = () => H.js(`(() => {
    const text = document.querySelector('.app').innerText + ' ' + [...document.querySelectorAll('[title],[placeholder]')].map((e) => e.title || e.placeholder).join(' ');
    return ${JSON.stringify(keys)}.filter((k) => text.includes(k));
  })()`);

  for (const [code, label, word] of [['pl', 'Polski', 'Nazwij'], ['de', 'Deutsch', 'Benennen'], ['es', 'Español', 'Nombrar'], ['fr', 'Français', 'Nommer']]) {
    await H.click('#btn-settings');
    await H.click('.lang-seg .seg-opt', label);
    await H.sleep(100);
    await H.shot(`i18n-${code}-settings`);
    await H.click('.dlg-close');
    H.assert(await H.js(`document.documentElement.lang`) === code, `${code}: html lang`);
    H.assert(await H.js(`document.querySelector('.nav-item[data-view="name"]').textContent`) === word, `${code}: nav label`);
    for (const view of SCREENS) {
      await H.click(`.nav-item[data-view="${view}"]`);
      await H.sleep(view === 'mate' ? 1200 : 500);
      const bad = await leaked();
      H.assert(!bad.length, `${code} ${view}: untranslated keys ${bad.join(', ')}`);
      await H.shot(`i18n-${code}-${view}`);
    }
  }

  // In Polish, the Polish name of an opening is a right answer.
  await H.click('#btn-settings');
  await H.click('.lang-seg .seg-opt', 'Polski');
  await H.click('.dlg-close');
  await H.click('.nav-item[data-view="library"]');
  if (await H.js(`!!document.querySelector('.back-btn')`)) await H.click('.back-btn');
  await H.click('.cat-card', 'Początkujący');
  await H.js(`(() => { const i = document.querySelector('.search-input'); i.value = 'sycylijska'; i.dispatchEvent(new Event('input')); })()`);
  await H.sleep(150);
  H.assert(await H.js(`document.querySelectorAll('.op-row').length`) === 1, 'search finds the Sicilian by its Polish name');
  await H.click('.op-row');
  await H.sleep(150);
  H.assert(await H.js(`document.querySelector('.op-local').textContent`) === 'Obrona sycylijska', 'Polish name shown');
  await H.click('.btn', 'Nazwij');
  await H.sleep(200);
  await H.js(`document.querySelector('.answer-input').value = 'obrona sycylijska'`);
  await H.click('.btn-primary', 'Sprawdź');
  await H.sleep(250);
  H.assert(await H.js(`document.querySelector('.result-title')?.textContent`) === 'Dobrze!', 'Polish answer accepted');
  await H.shot('i18n-pl-answer');
};
