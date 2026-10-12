// Dev tool: renders sprite sheets to PNG without a browser.
//   node tools/preview.js <creature> [action ...] [--dirs 0,1,2] [--scale 3] [--out file.png]
// Rows = actions x directions, columns = frames.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/app\.js$/.test(s));
for (const s of scripts) vm.runInThisContext(fs.readFileSync(path.join(root, s), 'utf8'), { filename: s });

function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function png(w, h, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const scale = +opt('scale', 3);
const dirs = opt('dirs', '0,1,2,6').split(',').map(Number);
const out = opt('out', path.join(root, 'tools', 'out', 'preview.png'));
const maxFrames = +opt('frames', 99);
const band = opt('band', null); // "y0,y1": only keep heights y0..y1 above the ground (e.g. heads)
const [bandLo, bandHi] = band ? band.split(',').map(Number) : [-1e9, 1e9];
const cid = args.shift() || 'skeleton';
const creature = CREATURES.find((c) => c.id === cid);
if (!creature) { console.error('unknown creature', cid, CREATURES.map((c) => c.id)); process.exit(1); }
const actions = args.length ? args : Object.keys(creature.actions);

const t0 = Date.now();
let rendered = 0;
const rows = [];
for (const a of actions) {
  const act = creature.actions[a];
  const n = Math.min(act.frames, maxFrames);
  for (const d of dirs) {
    const row = [];
    for (let f = 0; f < n; f++) {
      const shape = buildFrame(creature, a, f);
      row.push(renderSprite(shape, d * Math.PI / 4));
      rendered++;
    }
    rows.push(row);
  }
}
const ms = Date.now() - t0;

// Lay out on a common baseline per row.
const pad = 4;
let W = 0, H = 0;
const layout = rows.map((row) => {
  const res = row[0].res || 1;
  const up = Math.min(Math.max(...row.map((s) => s.ay)), bandHi * res), down = Math.min(Math.max(...row.map((s) => s.h - s.ay)), -bandLo * res);
  const cell = Math.max(...row.map((s) => Math.max(s.ax, s.w - s.ax))) * 2 + pad;
  W = Math.max(W, cell * row.length);
  const r = { up, down, cell, y: H };
  H += up + down + pad;
  return r;
});
const sheet = new Uint32Array(W * H).fill(0xFF1A1414);
rows.forEach((row, ri) => {
  const L = layout[ri];
  row.forEach((s, fi) => {
    const ox = fi * L.cell + Math.round(L.cell / 2 - s.ax), oy = L.y + L.up - Math.round(s.ay);
    // ground line
    for (let x = fi * L.cell; x < (fi + 1) * L.cell - 1; x++) sheet[(L.y + L.up) * W + x] = 0xFF2E2828;
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const v = s.data[j * s.w + i];
      if (v === 0xFFFF) continue;
      const hgt = (s.ay - j - 0.5) / (s.res || 1);
      if (hgt < bandLo || hgt > bandHi) continue;
      const x = ox + i, y = oy + j;
      if (x >= 0 && y >= 0 && x < W && y < H) sheet[y * W + x] = PAL32[v & 0xFF];
    }
  });
});
const SW = W * scale, SH = H * scale;
const big = new Uint32Array(SW * SH);
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) big[y * SW + x] = sheet[((y / scale) | 0) * W + ((x / scale) | 0)];
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png(SW, SH, new Uint8Array(big.buffer)));
console.log(`${rendered} frames in ${ms} ms (${(ms / rendered).toFixed(1)} ms/frame) -> ${out} (${SW}x${SH})`);
