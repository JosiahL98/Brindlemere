// Dev tool: render game actors (villagers, beasts) to a PNG sheet.
//   node tools/actorpreview.js <actorId|all> [action ...] [--dirs 0,1,2] [--scale 4] [--frames 1] [--band y0,y1] [--res 1] [--out f.png]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const root = path.join(__dirname, '..'), gameDir = path.join(root, 'game');
const html = fs.readFileSync(path.join(gameDir, 'index.html'), 'utf8');
for (const m of [...html.matchAll(/<script src="([^"]+)"( data-dom)?/g)]) if (!m[2]) vm.runInThisContext(fs.readFileSync(path.join(gameDir, m[1]), 'utf8'), { filename: m[1] });
function crc32(buf) { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function png(w, h, rgba) {
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const scale = +opt('scale', 4), dirs = opt('dirs', '0,1,2').split(',').map(Number), maxF = +opt('frames', 99);
const res = opt('res', null), band = opt('band', null), pitch = opt('pitch', null);
const out = opt('out', path.join(root, 'tools', 'out', 'actor.png'));
const [bLo, bHi] = band ? band.split(',').map(Number) : [-1e9, 1e9];
const id = args.shift();
const defs = typeof ACTOR_DEFS === 'function' ? ACTOR_DEFS() : {};
const list = id === 'all' ? Object.values(defs) : [defs[id]];
if (!list[0]) { console.error('unknown actor', id, Object.keys(defs).join(' ')); process.exit(1); }
const rows = [];
const t0 = Date.now(); let n = 0;
for (const def of list) {
  const acts = args.length ? args : Object.keys(def.actions);
  for (const a of acts) {
    if (!def.actions[a]) continue;
    for (const d of dirs) {
      const row = [];
      const act = def.actions[a];
      for (let f = 0; f < Math.min(act.frames, maxF); f++) {
        const tt = act.loop ? f / act.frames : f / Math.max(1, act.frames - 1);
        const s = new Shape(); def.build(s, act.pose(tt, f), a, tt);
        row.push(renderSprite(s, d * Math.PI / 4, Object.assign({ res: res ? +res : def.res || 1 }, pitch !== null ? { pitch: +pitch * DEG } : {})));
        n++;
      }
      rows.push(row);
    }
  }
}
const ms = Date.now() - t0;
const pad = 4; let W = 0, H = 0;
const lay = rows.map((row) => {
  const r = row[0].res || 1;
  const up = Math.min(Math.max(...row.map((s) => s.ay)), bHi * r), down = Math.min(Math.max(...row.map((s) => s.h - s.ay)), -bLo * r);
  const cell = Math.max(...row.map((s) => Math.max(s.ax, s.w - s.ax))) * 2 + pad;
  W = Math.max(W, cell * row.length);
  const lo = band ? -bLo * r : down;
  const o = { up, down: lo, cell, y: H }; H += Math.max(1, up + lo) + pad; return o;
});
const sheet = new Uint32Array(W * H).fill(0xFF1A1414);
rows.forEach((row, ri) => { const L = lay[ri]; row.forEach((s, fi) => {
  const ox = fi * L.cell + Math.round(L.cell / 2 - s.ax), oy = L.y + L.up - Math.round(s.ay);
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const v = s.data[j * s.w + i]; if (v === 0xFFFF) continue;
    const hg = (s.ay - j - 0.5) / (s.res || 1); if (hg < bLo || hg > bHi) continue;
    const x = ox + i, y = oy + j; if (x >= 0 && y >= 0 && x < W && y < H) sheet[y * W + x] = PAL32[v & 0xFF];
  }
}); });
const SW = W * scale, SH = H * scale, big = new Uint32Array(SW * SH);
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) big[y * SW + x] = sheet[((y / scale) | 0) * W + ((x / scale) | 0)];
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png(SW, SH, new Uint8Array(big.buffer)));
console.log(`${n} sprites in ${ms} ms -> ${out} (${SW}x${SH})`);
