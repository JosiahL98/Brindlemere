// Bundles index.html, the stylesheet and every script into one self-contained HTML file.
//   node tools/build.js               -> dist/bestiary.html (complete document)
//   node tools/build.js --game        -> dist/brindlemere.html (the RPG in game/) and dist/music/
//   node tools/build.js --fragment F  -> F without the <!doctype>/<html>/<head>/<body> wrapper
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const fragIdx = args.indexOf('--fragment');
const fragment = fragIdx >= 0;
const game = args.includes('--game');
const base = game ? path.join(root, 'game') : root;
const out = fragment ? path.resolve(args[fragIdx + 1]) : path.join(root, 'dist', game ? 'brindlemere.html' : 'bestiary.html');

let html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, href) =>
  `<style>\n${fs.readFileSync(path.join(base, href), 'utf8')}</style>`);
// --external DIR (with --fragment): baked sprite data goes to DIR/baked/<name>-N.txt pieces,
// fetched at startup instead of inlined, for hosts that limit upload size.
const extIdx = args.indexOf('--external');
const extDir = extIdx >= 0 ? path.resolve(args[extIdx + 1]) : null;
function externalise(src, code) {
  const m = src.match(/data\/baked\/([\w-]+)\.js$/);
  if (!extDir || !m) return code;
  const name = m[1];
  return code.replace(/(data: |BAKED_VM\.data = )'([A-Za-z0-9+/=]+)'/, (_, lead, b64) => {
    const n = Math.ceil(b64.length / (600 * 1024)), size = Math.ceil(b64.length / n);
    fs.mkdirSync(path.join(extDir, 'baked'), { recursive: true });
    for (let i = 0; i < n; i++) fs.writeFileSync(path.join(extDir, 'baked', `${name}-${i}.txt`), b64.slice(i * size, (i + 1) * size));
    return lead.startsWith('data') ? `data: null, file: 'baked/${name}', parts: ${n}` : `BAKED_VM.data = null; BAKED_VM.file = 'baked/${name}'; BAKED_VM.parts = ${n}`;
  });
}
html = html.replace(/<script src="([^"]+)"(?: data-dom)?><\/script>/g, (_, src) =>
  `<script>\n${externalise(src, fs.readFileSync(path.join(base, src), 'utf8')).replace(/<\/script/gi, '<\\/script')}</script>`);

if (fragment) {
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta[^>]*>\s*/g, '')
    .replace(title, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  html = `${title}\n${head.trim()}\n${body.trim()}\n`;
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
// --split-music DIR: also write each track as ~700 KB pieces (name-0.mp3, name-1.mp3, ...) for
// hosts that limit upload size; the game rejoins them when the whole file isn't there.
const splitIdx = args.indexOf('--split-music');
if (game && splitIdx >= 0) {
  const dst = path.resolve(args[splitIdx + 1]), src = path.join(base, 'music');
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.mp3'))) {
    const buf = fs.readFileSync(path.join(src, f)), n = Math.ceil(buf.length / (700 * 1024)), size = Math.ceil(buf.length / n);
    for (let i = 0; i < n; i++) fs.writeFileSync(path.join(dst, f.replace(/\.mp3$/, `-${i}.mp3`)), buf.subarray(i * size, (i + 1) * size));
  }
  console.log(`split music into ${fs.readdirSync(dst).length} pieces in ${dst}`);
}
// The game's music is too big to inline; it sits next to the page as music/*.mp3.
if (game && !fragment) {
  const src = path.join(base, 'music'), dst = path.join(path.dirname(out), 'music');
  if (fs.existsSync(src)) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dst, f));
    console.log(`copied ${fs.readdirSync(src).length} music files to ${dst}`);
  }
}
