#!/usr/bin/env node
'use strict';
// Copies chess.js (installed by npm) into renderer/vendor so the app runs without a bundler.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'chess.js', 'dist', 'esm', 'chess.js');
const out = path.join(__dirname, '..', 'renderer', 'vendor', 'chess.js');
const code = fs.readFileSync(src, 'utf8').split('\n').filter((l) => !l.startsWith('//# sourceMappingURL')).join('\n');
fs.writeFileSync(out, code);
console.log('Copied chess.js to', path.relative(process.cwd(), out));
