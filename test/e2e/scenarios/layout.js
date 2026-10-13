'use strict';
// Screenshots each screen at the smallest supported window size and a large one,
// and checks nothing spills out of the window.

module.exports = async (H) => {
  for (const [w, hgt] of [[960, 620], [1920, 1080]]) {
    H.win.setSize(w, hgt);
    await H.sleep(400);
    for (const view of ['name', 'play', 'library']) {
      await H.click(`.nav-item[data-view="${view}"]`);
      await H.sleep(500);
      const overflow = await H.js(`(() => {
        const vw = innerWidth, vh = innerHeight;
        return [...document.querySelectorAll('.board-col, .panel, .sidebar')]
          .map((el) => el.getBoundingClientRect())
          .some((r) => r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1);
      })()`);
      H.assert(!overflow, `${view} fits in ${w}x${hgt}`);
      await H.shot(`layout-${w}-${view}`);
    }
  }

  // Coming back to a screen restores its own board (orientation and position).
  await H.click('.nav-item[data-view="play"]');
  await H.click('.seg-opt', 'Black');
  await H.sleep(900);
  const playFen = await H.js(`document.querySelectorAll('.pc').length + ':' + document.querySelector('.coord.file').textContent`);
  await H.click('.nav-item[data-view="library"]');
  await H.click('.nav-item[data-view="name"]');
  await H.sleep(300);
  H.assert(await H.js(`!!document.querySelector('.hl-last')`), 'Name It shows its own position again');
  await H.click('.nav-item[data-view="play"]');
  await H.sleep(300);
  const back = await H.js(`document.querySelectorAll('.pc').length + ':' + document.querySelector('.coord.file').textContent`);
  H.assert(back.endsWith(':h'), `Play It as Black is flipped again after returning, got ${back} (before ${playFen})`);
};
