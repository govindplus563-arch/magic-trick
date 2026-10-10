/* Copies the static site into www/ (the folder Capacitor packages into the Android app). */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
['index.html', 'manifest.webmanifest', 'sw.js'].forEach(f => fs.copyFileSync(path.join(root, f), path.join(out, f)));
['css', 'js', 'vendor', 'icons'].forEach(d => fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true }));
console.log('www ready:', fs.readdirSync(out).join(', '));
