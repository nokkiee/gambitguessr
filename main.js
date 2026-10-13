'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, protocol, Menu, shell, net } = require('electron');
const { pathToFileURL } = require('url');

app.setName('GambitGuessr');
app.setDesktopName('gambitguessr.desktop'); // lets GNOME/KDE match the window to its launcher and icon on Wayland
if (process.env.GAMBIT_DATA_DIR) app.setPath('userData', process.env.GAMBIT_DATA_DIR);
else carryOverOldData();
if (process.platform === 'linux') app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
if (process.platform === 'win32') app.setAppUserModelId('app.gambitguessr'); // taskbar grouping and pinning
const DEV = !!process.env.GAMBIT_DEV || process.argv.includes('--dev');

// The renderer is served from gambit://app/ so ES modules, fetch() and localStorage
// all behave as on a normal (secure) web origin. The scheme keeps its pre-rename name
// because localStorage (all progress) is stored per origin.
protocol.registerSchemesAsPrivileged([
  { scheme: 'gambit', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const RENDERER = path.join(__dirname, 'renderer');
const BG = '#302e2b';
let win = null;

// The app was called "Gambit" before, with its data in ~/.config/Gambit. On the first
// start under the new name, bring over the saved progress, settings and window size.
function carryOverOldData() {
  const oldDir = path.join(app.getPath('appData'), 'Gambit');
  if (!fs.existsSync(oldDir)) return;
  const newDir = app.getPath('userData'); // note: getPath creates this folder, so check its contents
  try {
    for (const item of ['Local Storage', 'window-state.json']) {
      const from = path.join(oldDir, item);
      const to = path.join(newDir, item);
      if (fs.existsSync(from) && !fs.existsSync(to)) fs.cpSync(from, to, { recursive: true });
    }
  } catch (err) {
    console.error('Could not copy data from the old Gambit folder:', err);
  }
}

function inside(base, target) {
  const rel = path.relative(base, target);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function serve(request) {
  const { pathname } = new URL(request.url);
  const file = path.join(RENDERER, decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!inside(RENDERER, file)) return new Response('Not found', { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

// ---- window size memory ---------------------------------------------------------------

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return { width: 1360, height: 860 };
  }
}

function saveBounds() {
  if (!win || win.isDestroyed()) return;
  const state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(state));
  } catch {
    // Not worth bothering the user about.
  }
}

// ---- window ------------------------------------------------------------------------------

function createWindow() {
  const bounds = loadBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: BG,
    title: 'GambitGuessr',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required', // move sounds play before the first click
      backgroundThrottling: !process.env.GAMBIT_HIDDEN,
    },
  });
  if (bounds.maximized) win.maximize();
  win.once('ready-to-show', () => !process.env.GAMBIT_HIDDEN && win.show());
  win.on('close', saveBounds);
  win.on('closed', () => { win = null; });

  // Nothing in the app links out, but never let the window navigate away from it.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('gambit://')) e.preventDefault();
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (DEV && input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });

  win.loadURL('gambit://app/index.html');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle('gambit', serve);
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}

module.exports = { getWindow: () => win };
