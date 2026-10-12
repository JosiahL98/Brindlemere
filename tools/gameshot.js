// Dev tool: renders frames of the game world to PNG without a browser.
//   node tools/gameshot.js [--map town] [--at x,z,angleDeg[,pitchDeg]] [--hour 10] [--out file.png] [--scale 3]
// Several --at values make a contact sheet (one frame per camera).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const gameDir = path.join(root, 'game');
const html = fs.readFileSync(path.join(gameDir, 'index.html'), 'utf8');
// Load every script that doesn't need the DOM (those are marked data-dom).
const scripts = [...html.matchAll(/<script src="([^"]+)"( data-dom)?/g)].filter((m) => !m[2]).map((m) => m[1]);
for (const s of scripts) vm.runInThisContext(fs.readFileSync(path.join(gameDir, s), 'utf8'), { filename: s });

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
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const args = process.argv.slice(2);
const opts = { at: [] };
for (let i = 0; i < args.length; i += 2) {
  const k = args[i].replace(/^--/, '');
  if (k === 'at') opts.at.push(args[i + 1]); else opts[k] = args[i + 1];
}
const mapId = opts.map || 'town';
const hour = +(opts.hour || 10);
const scale = +(opts.scale || 2);
const out = opts.out || path.join(root, 'tools', 'out', 'game.png');
if (!opts.at.length) opts.at.push('32.5,30.5,-90');

const town = buildTown();
const maps = Object.assign({ town }, buildInteriors());
const map = maps[mapId];
const t0 = Date.now();
const frames = opts.at.map((a) => {
  const [x, z, deg, pitchDeg = 0] = a.split(',').map(Number);
  const cam = { x: x * TILE, z: z * TILE, ang: deg * DEG, eye: 50, pitch: pitchDeg * DEG };
  const env = map.outdoor ? outdoorEnv(hour) : indoorEnv(map);
  const sprites = typeof gatherPropSprites === 'function' ? gatherPropSprites(map) : [];
  renderWorld(map, cam, env, sprites, 1.0);
  if (typeof drawHudPreview === 'function') drawHudPreview();
  return Uint8Array.from(Render.fb);
});
const ms = Date.now() - t0;
const cols = Math.min(frames.length, 2), rows = Math.ceil(frames.length / cols);
const W = VW * cols * scale, H = Math.round(VH * 1.2) * rows * scale;
const img = new Uint32Array(W * H);
frames.forEach((f, n) => {
  const ox = (n % cols) * VW * scale, oy = Math.floor(n / cols) * Math.round(VH * 1.2) * scale;
  for (let y = 0; y < Math.round(VH * 1.2) * scale; y++) for (let x = 0; x < VW * scale; x++) {
    const sy = Math.min(VH - 1, Math.floor(y / scale / 1.2)), sx = Math.floor(x / scale);
    img[(oy + y) * W + ox + x] = PAL32[f[sy * VW + sx]];
  }
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png(W, H, new Uint8Array(img.buffer)));
console.log(`${frames.length} frame(s) in ${ms} ms -> ${out}`);
