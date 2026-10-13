// Dev tool: bakes a Tripo-generated, rigged and animated villager or animal (assets/tripo/<name>/)
// into game sprites, using three.js in headless Chrome (tools/bake/). Writes
// game/js/data/baked/<name>.js, a contact sheet at tools/out/baked-<name>.png and one per action.
//   node tools/bake-mesh.js tobin
// Each one's height, pole and actions are in tools/bake/bakes.mjs; any can be overridden:
//   node tools/bake-mesh.js elsa --height 58 --res 2.5 --actions idle=idle:4,walk=walk:8:cycle
//   --prop spear|pitchfork, --wide, --foot, --flip, --no-portrait (see bakes.mjs), --raw
//   --stage  bake to tools/out/staged/<name>.js instead of the game, for reviewing in the viewer
// Needs `npm install` in tools/ (three, puppeteer-core) and Chrome.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const zlib = require('zlib');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf('--' + n); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (n) => { const i = args.indexOf('--' + n); if (i < 0) return false; args.splice(i, 1); return true; };
const over = {};
for (const k of ['height', 'res', 'wide']) { const v = opt(k); if (v !== undefined) over[k] = +v; }
for (const k of ['actions', 'prop', 'foot']) { const v = opt(k); if (v !== undefined) over[k] = v; }
if (flag('flip')) over.flip = true;
if (flag('no-portrait')) over.noPortrait = true;
const debugRaw = flag('raw');
const stage = flag('stage');
const chrome = opt('chrome') || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const name = args[0];
if (!name) { console.error('usage: node tools/bake-mesh.js <name> [--height 58] [--actions ...]'); process.exit(1); }
let cfg; // from tools/bake/bakes.mjs, filled in before baking

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function crc32(buf) { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function png(w, h, rgba) {
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// Contact sheet: one row per action frame, eight rotations across, then the portrait.
let palLoaded = false;
function sheet(result, file) {
  if (!palLoaded) for (const s of ['math.js', 'palette.js']) vm.runInThisContext(fs.readFileSync(path.join(root, 'js', s), 'utf8'));
  palLoaded = true;
  const S = 3, cellW = Math.max(...result.sprites.map((s) => s.w)) + 4, cellH = Math.max(...result.sprites.map((s) => s.h)) + 4;
  const rows = result.sprites.length / 8, pr = result.portrait || { w: 1, h: 1, ax: 0, ay: 0, data: [0] };
  const W = Math.max(cellW * 8, pr.w + 4) * S, H = (cellH * rows + pr.h + 8) * S;
  const img = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) img.set([58, 52, 66, 255], i * 4);
  const blit = (sp, ox, oy) => {
    for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) {
      const v = sp.data[y * sp.w + x]; if (!v) continue;
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) img.set([PAL[v * 3], PAL[v * 3 + 1], PAL[v * 3 + 2], 255], (((oy + y) * S + dy) * W + (ox + x) * S + dx) * 4);
    }
  };
  result.sprites.forEach((sp, i) => blit(sp, (i % 8) * cellW + 2 + Math.round(cellW / 2 - 2 - sp.ax), Math.floor(i / 8) * cellH + 2));
  blit(pr, 2, cellH * rows + 4);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png(W, H, img));
}

(async () => {
  const { bakeConfig } = await import('./bake/bakes.mjs');
  cfg = Object.assign(bakeConfig(name, over), { ss: 4, pitchDeg: 9, debugRaw, light: { ambient: 1.1, key: 2.6, fill: 0.5, edge: 0.72, dither: 9 } });
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/tools/bake/bake.html`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.bakeReady === true', { timeout: 30000 });
  const t0 = Date.now();
  const result = await page.evaluate((c) => window.bake(c), cfg);
  await browser.close();
  server.close();
  console.log(`rendered ${result.sprites.length} sprites + portrait in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (result.portraitRaw) {
    const r = result.portraitRaw, S = 4, img = new Uint8Array(r.w * S * r.h * S * 4);
    for (let y = 0; y < r.h * S; y++) for (let x = 0; x < r.w * S; x++) {
      const i = Math.floor(y / S) * r.w + Math.floor(x / S), o = (y * r.w * S + x) * 4;
      img.set(r.solid[i] ? [r.rgb[i * 3], r.rgb[i * 3 + 1], r.rgb[i * 3 + 2], 255] : [58, 52, 66, 255], o);
    }
    fs.writeFileSync(path.join(root, 'tools', 'out', `baked-${name}-portrait-raw.png`), png(r.w * S, r.h * S, img));
  }
  for (const [id, a] of Object.entries(result.actions)) console.log(`  ${id}: ${a.frames} frames from "${a.clip}", loop ${a.period}s, ${a.fps} fps${a.travel ? `, travel ${a.travel}` : ''}`);

  // Pack every sprite's indices (0 = transparent) into one deflated blob.
  const parts = [], index = [];
  let off = 0;
  for (const s of result.sprites) { index.push([s.action, s.frame, s.rot, s.w, s.h, s.ax, s.ay]); parts.push(Uint8Array.from(s.data)); off += s.data.length; }
  const pr = result.portrait;
  if (pr) parts.push(Uint8Array.from(pr.data));
  const raw = Buffer.concat(parts.map((p) => Buffer.from(p)));
  const packed = zlib.deflateRawSync(raw, { level: 9 });
  const out = path.join(root, ...(stage ? ['tools', 'out', 'staged'] : ['game', 'js', 'data', 'baked']), `${name}.js`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const meta = { res: cfg.res, height: result.height, actions: result.actions, index, portrait: pr ? [pr.w, pr.h, pr.ax, pr.ay, cfg.portrait.res] : null };
  fs.writeFileSync(out, `'use strict';\n// Baked by tools/bake-mesh.js from assets/tripo/${name}/ (a Tripo model, rigged and animated). Do not edit.\n`
    + `BAKED[${JSON.stringify(name)}] = Object.assign(${JSON.stringify(meta)}, {\n  data: '${packed.toString('base64')}',\n});\n`);
  console.log(`wrote ${path.relative(root, out)}: ${(raw.length / 1024).toFixed(0)} KB of pixels, ${(packed.length / 1024).toFixed(0)} KB packed`);
  const sheetFile = path.join(root, 'tools', 'out', `baked-${name}.png`);
  sheet(result, sheetFile);
  // And one sheet per action, for checking a single move.
  for (const id of Object.keys(result.actions)) sheet({ sprites: result.sprites.filter((sp) => sp.action === id), portrait: { w: 1, h: 1, ax: 0, ay: 0, data: [0] } }, path.join(root, 'tools', 'out', `baked-${name}-${id}.png`));
  console.log(`contact sheet ${path.relative(root, sheetFile)}`);
})().catch((e) => { console.error(e); process.exit(1); });
