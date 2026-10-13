// Dev tool: bakes the first-person arm from Tripo models of a forearm already holding each weapon
// (assets/tripo/fp-*) into game/js/data/baked/viewmodel.js, using three.js in headless Chrome.
//   node tools/bake-viewmodel.js              bake everything
//   node tools/bake-viewmodel.js --preview    raw renders of every frame -> tools/out/viewmodel-preview.png
//   node tools/bake-viewmodel.js --calibrate  each model's four palm candidates at the ready pose
//   node tools/bake-viewmodel.js --stage      bake to tools/out/staged/ instead of the game, for
//                                             reviewing in the viewer (tools/viewer.js) first
// VM_ONLY=club,knife limits a run to some models.
//
// The arm, its attacks (keyframes sampled into frames at fixed points of the swing) and the
// models are in tools/bake/arm.mjs; tools/viewer/ shows them moving.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { root, inBakePage, png } = require('./bake/common');

const preview = process.argv.includes('--preview');
const calibrate = process.argv.includes('--calibrate');
const big = process.argv.includes('--big'); // with --preview: full 4x resolution
const stage = process.argv.includes('--stage');

(async () => {
  // The arm, its moves and its models live in tools/bake/arm.mjs (shared with tools/viewer/).
  const { FUSED, ARM, MOVES, MOCAP, sampleMoves, armLength } = await import('./bake/arm.mjs');
  const moves = sampleMoves();
  const cfg = Object.assign({ ss: 4, preview: preview || calibrate, rawFull: big, calibrate, moves, mocap: MOCAP, fused: JSON.parse(JSON.stringify(FUSED)) }, ARM);
  if (process.env.VM_ONLY) { const keep = process.env.VM_ONLY.split(','); for (const id of Object.keys(cfg.fused)) if (!keep.includes(id)) delete cfg.fused[id]; }
  if (process.env.VM_MOVE) for (const F of Object.values(cfg.fused)) F.move = process.env.VM_MOVE;
  const t0 = Date.now();
  // Sanity check: how far each frame's implied upper arm is from its real length.
  for (const [id, fr] of Object.entries(moves)) console.log(id.padEnd(6), fr.map((f) => armLength(f).toFixed(1)).join(' '));
  const result = await inBakePage((c) => window.bakeViewmodel(c), cfg);
  console.log(`rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (cfg.preview) {
    const frames = result.previews, per = calibrate ? 4 : moves.swing.length, cols = big ? 1 : per;
    const W = frames[0].w, H = frames[0].h, rows = Math.ceil(frames.length / cols);
    const img = new Uint8Array(W * cols * H * rows * 4);
    frames.forEach((f, n) => {
      const ox = (n % cols) * W, oy = Math.floor(n / cols) * H;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = ((oy + y) * W * cols + ox + x) * 4;
        img.set(f.solid[i] ? [f.rgb[i * 3], f.rgb[i * 3 + 1], f.rgb[i * 3 + 2], 255] : [((x >> 4) + (y >> 4)) & 1 ? 70 : 60, 62, 74, 255], o);
      }
      // A cross at the screen centre, and the frame's edge.
      for (let k = -3; k <= 3; k++) { img.set([255, 255, 0, 255], ((oy + H / 2) * W * cols + ox + W / 2 + k) * 4); img.set([255, 255, 0, 255], ((oy + H / 2 + k) * W * cols + ox + W / 2) * 4); }
      for (let y = 0; y < H; y++) img.set([20, 20, 20, 255], ((oy + y) * W * cols + ox) * 4);
    });
    if (calibrate) frames.forEach((f, n) => console.log(n, f.label));
    const file = path.join(root, 'tools', 'out', calibrate ? 'viewmodel-calibrate.png' : 'viewmodel-preview.png');
    fs.writeFileSync(file, png(W * cols, H * rows, img));
    console.log(`preview ${path.relative(root, file)}`);
    return;
  }
  // Pack: an index of [id, frame, w, h, x0, y0], each move's frame phases, and one deflated blob.
  const index = [], parts = [], used = {};
  for (const [id, frames] of Object.entries(result.fused)) {
    used[id] = cfg.fused[id].move;
    frames.forEach((s, f) => { index.push([id, f, s.w, s.h, s.x0, s.y0]); parts.push(Buffer.from(Uint8Array.from(s.data))); });
  }
  const phases = {};
  for (const [id, M] of Object.entries(Object.assign({}, MOVES, MOCAP))) phases[id] = M.frames;
  const raw = Buffer.concat(parts), packed = zlib.deflateRawSync(raw, { level: 9 });
  const out = stage ? path.join(root, 'tools', 'out', 'staged', 'viewmodel.js') : path.join(root, 'game', 'js', 'data', 'baked', 'viewmodel.js');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `'use strict';\n// Baked by tools/bake-viewmodel.js from the Tripo arm-and-weapon models. Do not edit.\n`
    + `BAKED_VM.moves = ${JSON.stringify(used)};\nBAKED_VM.phases = ${JSON.stringify(phases)};\n`
    + `BAKED_VM.index = ${JSON.stringify(index)};\nBAKED_VM.data = '${packed.toString('base64')}';\n`);
  console.log(`wrote ${path.relative(root, out)}: ${index.length} sprites, ${(raw.length / 1024).toFixed(0)} KB of pixels, ${(packed.length / 1024).toFixed(0)} KB packed`);
  // Contact sheet of the finished sprites in palette colours, one row per model.
  for (const s of ['math.js', 'palette.js']) vm.runInThisContext(fs.readFileSync(path.join(root, 'js', s), 'utf8'));
  const ids = Object.keys(result.fused), n = moves.swing.length, W = 320, H = 200, img = new Uint8Array(W * n * H * ids.length * 4);
  ids.forEach((id, row) => result.fused[id].forEach((s, f) => {
    const ox = f * W, oy = row * H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img.set([46, 40, 52, 255], ((oy + y) * W * n + ox + x) * 4);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const v = s.data[y * s.w + x]; if (!v) continue;
      img.set([PAL[v * 3], PAL[v * 3 + 1], PAL[v * 3 + 2], 255], ((oy + s.y0 + y) * W * n + ox + s.x0 + x) * 4);
    }
  }));
  const sheet = path.join(root, 'tools', 'out', 'viewmodel-baked.png');
  fs.writeFileSync(sheet, png(W * n, H * ids.length, img));
  console.log(`contact sheet ${path.relative(root, sheet)}`);
})().catch((e) => { console.error(e); process.exit(1); });
