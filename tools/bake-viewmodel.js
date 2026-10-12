// Dev tool: bakes the first-person arm and weapons from Tripo models (assets/tripo/arm-*,
// assets/tripo/w-*) into game/js/data/baked/viewmodel.js, using three.js in headless Chrome.
//   node tools/bake-viewmodel.js            bake everything
//   node tools/bake-viewmodel.js --preview  raw renders of each frame -> tools/out/viewmodel-preview.png
// Poses are in camera space, in game units: x right, y up, -z ahead. `hand` is the fist's
// centre, `elbow` sets the forearm's direction, `blade` points from the grip to the tip.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { root, inBakePage, png } = require('./bake/common');

const preview = process.argv.includes('--preview');
const fusedOnly = process.argv.includes('--fused-only'); // with --preview: just the fused models
const big = process.argv.includes('--big'); // with --preview: full 4x resolution, one frame per row
const T = (id) => `/assets/tripo/${id}/model-1.glb`;
const cfg = {
  ss: 4, armLength: 18, fistWidth: 4.4, preview, previewOnly: preview, fusedOnly: preview && fusedOnly, rawFull: preview && big,
  // Arms modelled already holding their weapon. Points are read off tools/model-views.js:
  // elbow end, centre of the fist, and the weapon tip (empty: a point on the thumb side).
  fused: {
    // free: the forearm follows each frame's elbow (a fist has no weapon angle to keep).
    // roll: extra turn about the forearm so the palm faces left (inward); mirror: the model came
    // out as a left hand. Both checked against full-size renders (--preview --big).
    empty: { url: T('fp-empty'), set: 'fist', free: true, roll: 90, elbow: [0, -0.45, 0], hand: [0, 0.38, 0], tip: [-0.15, 0.38, 0] },
    club: { url: '/assets/tripo/fp-club/model-2.glb', set: 'swing', poses: 'chop', free: true, roll: 90, elbow: [0, -0.45, 0.04], hand: [-0.02, -0.08, -0.04], tip: [-0.01, 0.48, 0.09] },
    hammer: { url: T('fp-hammer'), set: 'swing', poses: 'chop', free: true, mirror: true, elbow: [0.09, -0.37, 0.32], hand: [-0.06, 0.09, -0.12], tip: [-0.14, 0.36, -0.25] },
    knife: { url: T('fp-knife'), set: 'swing', elbow: [0.05, -0.47, -0.14], hand: [-0.06, 0.08, 0.23], tip: [-0.21, 0.49, 0.27] },
  },
  light: { ambient: 1.1, key: 2.6, fill: 0.5, edge: 0.75, dither: 10 },
  // sign: which way along the fist's grip the weapon leaves it (the thumb side).
  arms: { cloth: { url: T('arm-cloth'), sign: +(process.env.VM_SIGN || 1) }, mail: { url: T('arm-mail'), sign: +(process.env.VM_SIGN_MAIL || -1) } },
  // grip: where the fist closes, as a fraction of the length from the handle end.
  weapons: {
    club: { url: T('w-club'), length: 24, grip: 0.1, flip: true },
    dagger: { url: T('w-dagger'), length: 12, grip: 0.12 },
    rusty_dagger: { url: T('w-rusty-dagger'), length: 12, grip: 0.12 },
    knife: { url: T('w-knife'), length: 9, grip: 0.18 },
    hammer: { url: T('w-hammer'), length: 15, grip: 0.12 },
    sword: { url: T('w-sword'), length: 30, grip: 0.08 },
    bram_sword: { url: T('w-bram-sword'), length: 30, grip: 0.08 },
    longsword: { url: T('w-longsword'), length: 38, grip: 0.1 },
    axe: { url: T('w-axe'), length: 24, grip: 0.1 },
    mace: { url: T('w-mace'), length: 22, grip: 0.1 },
  },
  // Ready, wind-up, strike, follow-through, recover.
  swing: [
    { hand: [8.5, -6, -18], elbow: [9.5, -10, -5], blade: [-0.25, 1, -0.35], roll: 0 },
    { hand: [7.5, 2, -16], elbow: [9.5, -8.5, -5], blade: [0.35, 0.9, 0.35], roll: 0 },
    { hand: [1.5, -4.5, -19], elbow: [9, -10, -7], blade: [-1, 0.15, -0.7], roll: 0 },
    { hand: [-3, -5.5, -17], elbow: [7, -10.5, -6], blade: [-0.9, -0.3, -0.45], roll: 0 },
    { hand: [7, -6.5, -17], elbow: [9, -10.5, -5], blade: [-0.5, 0.85, -0.3], roll: 0 },
  ],
  // Clubs and hammers: an overhead chop, from high over the right shoulder down and across to
  // the lower left. Ready, cocked back, impact, follow-through, recover.
  // These pose the forearm itself (elbow to hand); the weapon rides along at its grip angle.
  // At impact the elbow is just off the right edge and the forearm drives forward, down and left.
  chop: [
    { hand: [8.5, -6, -18], elbow: [10, -13, -8], blade: [-0.25, 1, -0.35] },
    { hand: [8, 3, -13], elbow: [11, -8, -6], blade: [0.25, 0.75, 0.6] },
    { hand: [2, -8, -19], elbow: [9, -3, -8], blade: [-0.35, -0.5, -0.8] },
    { hand: [-3, -8, -16], elbow: [6, -5, -7], blade: [-0.55, -0.7, -0.45] },
    { hand: [7, -6.5, -17], elbow: [9.5, -13, -7], blade: [-0.4, 0.9, -0.3] },
  ],
  // Bare-handed: ready, pull back, punch, hold, recover.
  fist: [
    { hand: [7, -7, -17], elbow: [9, -11, -5], blade: [-0.3, 1, -0.2] },
    { hand: [9, -8.5, -14], elbow: [10, -11, -4], blade: [-0.2, 1, -0.2] },
    { hand: [1.5, -3.5, -25], elbow: [7, -9, -9], blade: [-0.5, 1, 0] },
    { hand: [2, -4, -24], elbow: [7.5, -9.5, -9], blade: [-0.5, 1, 0] },
    { hand: [6, -6.5, -18], elbow: [9, -10.5, -5], blade: [-0.3, 1, -0.2] },
  ],
};
// VM_ONLY=club keeps a single fused model (quicker previews).
if (process.env.VM_ONLY) for (const id of Object.keys(cfg.fused)) if (id !== process.env.VM_ONLY) delete cfg.fused[id];
if (process.env.VM_ROLL) for (const F of Object.values(cfg.fused)) F.roll = +process.env.VM_ROLL;
if (process.env.VM_MIRROR) for (const F of Object.values(cfg.fused)) F.mirror = process.env.VM_MIRROR === '1';
// --preview shows the first arm; VM_PREVIEW_ARM=mail puts the mail arm first.
if (process.env.VM_PREVIEW_ARM === 'mail') cfg.arms = { mail: cfg.arms.mail, cloth: cfg.arms.cloth };
// Only weapons whose models exist yet.
for (const [id, W] of Object.entries(cfg.weapons)) if (!fs.existsSync(path.join(root, W.url))) { console.log(`(no model yet for ${id})`); delete cfg.weapons[id]; }

(async () => {
  const t0 = Date.now();
  const result = await inBakePage((c) => window.bakeViewmodel(c), cfg);
  console.log(`rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (preview) {
    const frames = result.previews, cols = big ? 1 : 5, W = frames[0].w, H = frames[0].h, rows = Math.ceil(frames.length / cols);
    const img = new Uint8Array(W * cols * H * rows * 4);
    frames.forEach((f, n) => {
      const ox = (n % cols) * W, oy = Math.floor(n / cols) * H;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = ((oy + y) * W * cols + ox + x) * 4;
        img.set(f.solid[i] ? [f.rgb[i * 3], f.rgb[i * 3 + 1], f.rgb[i * 3 + 2], 255] : [((x >> 4) + (y >> 4)) & 1 ? 70 : 60, 62, 74, 255], o);
      }
    });
    const file = path.join(root, 'tools', 'out', 'viewmodel-preview.png');
    fs.writeFileSync(file, png(W * cols, H * rows, img));
    console.log(`preview ${path.relative(root, file)}`);
    return;
  }
  // Pack: an index of [kind, id, set, frame, w, h, x0, y0] and one deflated blob of indices.
  const index = [], parts = [];
  const add = (kind, id, set, frames) => frames.forEach((s, f) => { index.push([kind, id, set, f, s.w, s.h, s.x0, s.y0]); parts.push(Buffer.from(Uint8Array.from(s.data))); });
  for (const [id, frames] of Object.entries(result.fused)) add('fused', id, cfg.fused[id].set, frames);
  for (const [id, a] of Object.entries(result.arms)) { add('arm', id, 'swing', a.swing); add('arm', id, 'fist', a.fist); }
  for (const [id, frames] of Object.entries(result.weapons)) add('weapon', id, 'swing', frames);
  const raw = Buffer.concat(parts), packed = zlib.deflateRawSync(raw, { level: 9 });
  const out = path.join(root, 'game', 'js', 'data', 'baked', 'viewmodel.js');
  fs.writeFileSync(out, `'use strict';\n// Baked by tools/bake-viewmodel.js from the Tripo arm and weapon models. Do not edit.\n`
    + `BAKED_VM.index = ${JSON.stringify(index)};\nBAKED_VM.data = '${packed.toString('base64')}';\n`);
  console.log(`wrote ${path.relative(root, out)}: ${index.length} sprites, ${(raw.length / 1024).toFixed(0)} KB of pixels, ${(packed.length / 1024).toFixed(0)} KB packed`);
  // Contact sheet of the finished sprites in palette colours: arms, then each weapon over the cloth arm.
  for (const s of ['math.js', 'palette.js']) vm.runInThisContext(fs.readFileSync(path.join(root, 'js', s), 'utf8'));
  const sets = [['arm cloth swing', [result.arms.cloth.swing]], ['arm cloth fist', [result.arms.cloth.fist]], ['arm mail swing', [result.arms.mail.swing]]];
  for (const [id, frames] of Object.entries(result.weapons)) sets.push([id, [frames, result.arms.cloth.swing]]);
  const W = 320, H = 200, img = new Uint8Array(W * 5 * H * sets.length * 4);
  sets.forEach(([, layers], row) => {
    for (let f = 0; f < 5; f++) {
      const ox = f * W, oy = row * H;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img.set([46, 40, 52, 255], ((oy + y) * W * 5 + ox + x) * 4);
      for (const frames of layers) {
        const s = frames[f];
        for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
          const v = s.data[y * s.w + x]; if (!v) continue;
          img.set([PAL[v * 3], PAL[v * 3 + 1], PAL[v * 3 + 2], 255], ((oy + s.y0 + y) * W * 5 + ox + s.x0 + x) * 4);
        }
      }
    }
  });
  const sheet = path.join(root, 'tools', 'out', 'viewmodel-baked.png');
  fs.writeFileSync(sheet, png(W * 5, H * sets.length, img));
  console.log(`contact sheet ${path.relative(root, sheet)}`);
})().catch((e) => { console.error(e); process.exit(1); });
