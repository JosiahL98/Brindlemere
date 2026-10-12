// Dev tool: render dialogue portraits for the cast into one sheet.
//   node tools/portraits.js [id ...] [--res 7] [--out file.png]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const root = path.join(__dirname, '..'), gameDir = path.join(root, 'game');
const html = fs.readFileSync(path.join(gameDir, 'index.html'), 'utf8');
for (const m of [...html.matchAll(/<script src="([^"]+)"( data-dom)?/g)]) if (!m[2]) vm.runInThisContext(fs.readFileSync(path.join(gameDir, m[1]), 'utf8'), { filename: m[1] });
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const res = +opt('res', 7), out = opt('out', path.join(root, 'tools', 'out', 'portraits.png'));
const ids = args.length ? args : Object.keys(CAST);
const defs = ACTOR_DEFS();
const t0 = Date.now();
const sprs = ids.map((id) => renderPortrait(defs[id], res));
const cw = Math.max(...sprs.map((s) => s.w)) + 6, ch = Math.max(...sprs.map((s) => s.h)) + 6;
const cols = Math.min(ids.length, 5), rows = Math.ceil(ids.length / cols);
const W = cw * cols, H = ch * rows, img = new Uint32Array(W * H).fill(0xFF241C1A);
sprs.forEach((s, n) => {
  const ox = (n % cols) * cw + ((cw - s.w) >> 1), oy = Math.floor(n / cols) * ch + (ch - s.h - 3);
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) { const v = s.data[j * s.w + i]; if (v !== 0xFFFF) img[(oy + j) * W + ox + i] = PAL32[v & 255]; }
});
function crc32(b) { let c, r = 0xFFFFFFFF; for (let n = 0; n < b.length; n++) { c = (r ^ b[n]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; r = (r >>> 8) ^ c; } return (r ^ 0xFFFFFFFF) >>> 0; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6;
const raw = Buffer.alloc((W * 4 + 1) * H); const u8 = new Uint8Array(img.buffer);
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(u8.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${ids.length} portraits in ${Date.now() - t0} ms -> ${out} (${W}x${H})`);
