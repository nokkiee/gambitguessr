'use strict';
// Rasterises build/icon.svg to PNGs (build/icon.png + build/icons/<size>x<size>.png).
//   npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

app.whenReady().then(async () => {
  fs.mkdirSync(path.join(root, 'icons'), { recursive: true });
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<body></body>');
  const dataUrls = await win.webContents.executeJavaScript(`(async () => {
    const svg = ${JSON.stringify(svg)};
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const out = {};
    for (const size of ${JSON.stringify(SIZES)}) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, size, size);
      out[size] = c.toDataURL('image/png');
    }
    return out;
  })()`);
  for (const size of SIZES) {
    const png = Buffer.from(dataUrls[size].split(',')[1], 'base64');
    fs.writeFileSync(path.join(root, 'icons', `${size}x${size}.png`), png);
    if (size === 512) fs.writeFileSync(path.join(root, 'icon.png'), png);
  }
  console.log('icons written to', root);
  app.quit();
});
