// Dev tool: front, side and top orthographic views of a model with a 0.05-unit grid, for
// reading off key points (elbow, fist, weapon tip) to pose first-person models.
//   node tools/model-views.js assets/tripo/fp-club/model-1.glb [--out tools/out/views.png]
// Front: right = +x, up = +y. Side: right = -z, up = +y. Top: right = +x, down = +z.
'use strict';
const fs = require('fs');
const path = require('path');
const { root, inBakePage, png } = require('./bake/common');

const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const out = oi >= 0 ? args.splice(oi, 2)[1] : path.join(root, 'tools', 'out', 'views.png');
const model = args[0];
(async () => {
  const PX = 500; // pixels per model unit
  const r = await inBakePage(([u, px]) => window.orthoViews(u, px), ['/' + model.split(path.sep).join('/'), PX]);
  console.log('bounds min', r.min.map((v) => v.toFixed(3)).join(' '), 'max', r.max.map((v) => v.toFixed(3)).join(' '));
  const gap = 10, W = r.views.reduce((a, v) => a + v.W + gap, 0), H = Math.max(...r.views.map((v) => v.H));
  const img = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) img.set([40, 36, 48, 255], i * 4);
  const ax = { x: 0, y: 1, z: 2 };
  let ox = 0;
  for (const v of r.views) {
    const u0 = r.min[ax[v.uAxis]], u1 = r.max[ax[v.uAxis]], v0 = r.min[ax[v.vAxis]], v1 = r.max[ax[v.vAxis]];
    for (let y = 0; y < v.H; y++) for (let x = 0; x < v.W; x++) {
      // Model coordinates of this pixel (side view's right is -z; top view's down is +z).
      const mu = v.name === 'side' ? u1 - (x / v.W) * (u1 - u0) : u0 + (x / v.W) * (u1 - u0);
      const mv = v.name === 'top' ? v0 + (y / v.H) * (v1 - v0) : v1 - (y / v.H) * (v1 - v0);
      const o = (y * W + ox + x) * 4, s = (y * v.W + x) * 4;
      if (v.rgba[s + 3] > 127) img.set([v.rgba[s], v.rgba[s + 1], v.rgba[s + 2], 255], o);
      const near = (m) => Math.abs(m - Math.round(m / 0.05) * 0.05) < 0.6 / PX * 2;
      const major = (m) => Math.abs(m - Math.round(m / 0.25) * 0.25) < 0.6 / PX * 2;
      if (major(mu) || major(mv)) img.set([230, 80, 80, 255], o);
      else if (near(mu) || near(mv)) img.set([120, 120, 150, 255], o);
    }
    console.log(`${v.name}: x ${ox}..${ox + v.W} px; right = ${v.name === 'side' ? '-' : '+'}${v.uAxis} from ${(v.name === 'side' ? u1 : u0).toFixed(3)}, ${v.name === 'top' ? 'down = +z from ' + v0.toFixed(3) : 'up = +y from ' + v0.toFixed(3) + ' (bottom)'}; red lines every 0.25, grey every 0.05`);
    ox += v.W + gap;
  }
  fs.writeFileSync(out, png(W, H, img));
  console.log('wrote', path.relative(root, out));
})().catch((e) => { console.error(e); process.exit(1); });
