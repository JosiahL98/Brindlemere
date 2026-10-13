// Dev tool: bakes the first-person arm from Tripo models of a forearm already holding each weapon
// (assets/tripo/fp-*) into game/js/data/baked/viewmodel.js, using three.js in headless Chrome.
//   node tools/bake-viewmodel.js              bake everything
//   node tools/bake-viewmodel.js --preview    raw renders of every frame -> tools/out/viewmodel-preview.png
//   node tools/bake-viewmodel.js --calibrate  each model's four palm candidates at the ready pose
// VM_ONLY=club,knife limits a run to some models.
//
// The arm moves like a person's: a shoulder a little right of and below the eyes, an upper arm
// and a forearm, the elbow found by two-bone IK for each hand position. Each attack is a few
// keyframes (hand position, which way the elbow points, which way the palm faces) sampled into
// frames at fixed points of the swing. Camera space, game units: x right, y up, -z ahead.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { root, inBakePage, png } = require('./bake/common');

const preview = process.argv.includes('--preview');
const calibrate = process.argv.includes('--calibrate');
const big = process.argv.includes('--big'); // with --preview: full 4x resolution
const T = (id, n = 1) => `/assets/tripo/${id}/model-${n}.glb`;

// ---- The arm ----------------------------------------------------------------------------------
const SHOULDER = [6.5, -9, 2], UPPER = 11, FORE = 12;
const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]), mul = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.sqrt(dot(a, a)), norm = (a) => mul(a, 1 / (len(a) || 1));
// Two-bone IK: the elbow for a hand at H, bending towards `pole`. Returns the hand (pulled in if
// out of reach), the elbow and the forearm's direction.
function ik(H, pole) {
  const d = sub(H, SHOULDER), n = norm(d), L = Math.min(len(d), UPPER + FORE - 0.05);
  const a = (UPPER * UPPER - FORE * FORE + L * L) / (2 * L), r = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
  const p = norm(sub(pole, mul(n, dot(pole, n))));
  const hand = add(SHOULDER, mul(n, L)), elbow = add(add(SHOULDER, mul(n, a)), mul(p, r));
  return { hand, elbow, fore: norm(sub(hand, elbow)) };
}
const smooth = (t) => t * t * (3 - 2 * t);
// Unit vectors turned evenly from a to b.
function slerp(a, b, t) {
  const c = Math.max(-1, Math.min(1, dot(a, b))), w = Math.acos(c);
  if (w < 1e-4) return a;
  const sw = Math.sin(w);
  return norm(add(mul(a, Math.sin((1 - t) * w) / sw), mul(b, Math.sin(t * w) / sw)));
}
// A key gives either the elbow and the forearm's direction (for swings, where the forearm is a
// lever turning about the elbow) or the hand and which way the elbow bends (for the punch, where
// IK finds the elbow). Either way it becomes an elbow and a forearm direction.
function keyArm(k) {
  if (k.elbow) return { elbow: k.elbow, fore: norm(k.fore) };
  const a = ik(k.hand, k.pole);
  return { elbow: a.elbow, fore: a.fore };
}
// A move's pose at swing phase t: the elbow on a Catmull-Rom curve through the keys, the forearm
// and the palm turned smoothly between them; the fist sits a forearm's length from the elbow.
function poseAt(keys, t) {
  const arms = keys.map(keyArm);
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].at) i++;
  const i0 = Math.max(0, i - 1), i3 = Math.min(keys.length - 1, i + 2);
  const u = Math.min(1, Math.max(0, (t - keys[i].at) / (keys[i + 1].at - keys[i].at))), u2 = u * u, u3 = u2 * u;
  const [p0, p1, p2, p3] = [arms[i0].elbow, arms[i].elbow, arms[i + 1].elbow, arms[i3].elbow];
  const elbow = [0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3));
  const s = smooth(u), fore = slerp(arms[i].fore, arms[i + 1].fore, s);
  // The weapon's direction, which the wrist turns it to (the punch has none).
  const weapon = keys[i].weapon && keys[i + 1].weapon ? slerp(norm(keys[i].weapon), norm(keys[i + 1].weapon), s) : undefined;
  return { hand: add(elbow, mul(fore, FORE)), fore, palm: slerp(norm(keys[i].palm), norm(keys[i + 1].palm), s), elbow, weapon };
}
// Each move: keyframes over the swing (phase 0 = ready, 0.42 = the blow lands, 1.15 = done, as
// in game/js/game/player.js) and the phases its frames are sampled at. Frame 0 is the ready pose.
// Keys give the elbow, the forearm's direction, which way the palm faces and where the weapon
// points; the wrist bends between forearm and weapon, so the weapon can lag and then whip through.
// At rest the arm is held forward, palm to the left, the weapon standing up from the fist.
const READY = { elbow: [9.5, -10, -6], fore: [-0.2, 0.25, -0.95], palm: [-1, 0, 0], weapon: [-0.1, 0.95, -0.3] };
const MOVES = {
  // Overhead chop: the arm rises to the right with the weapon cocked back over the shoulder, then
  // sweeps down and across, the weapon whipping over to the left and down after the forearm.
  chop: {
    keys: [
      { at: 0, ...READY },
      { at: 0.1, elbow: [10.5, -6, -8], fore: [-0.1, 0.5, -0.86], palm: [-1, 0, 0], weapon: [0, 0.9, 0.4] },
      { at: 0.2, elbow: [11, -2, -10], fore: [-0.12, 0.55, -0.83], palm: [-1, 0, 0], weapon: [0.15, 0.7, 0.7] },
      { at: 0.3, elbow: [11, 1, -12], fore: [-0.7, 0.35, -0.62], palm: [-1, 0, 0], weapon: [-0.2, 0.95, 0.1] },
      { at: 0.36, elbow: [10.5, -0.5, -12.5], fore: [-0.8, 0.1, -0.58], palm: [-1, 0, 0], weapon: [-0.7, 0.7, -0.1] },
      { at: 0.42, elbow: [10, -2, -12.5], fore: [-0.78, -0.2, -0.6], palm: [-1, 0, 0], weapon: [-0.6, -0.75, -0.25] },
      { at: 0.5, elbow: [9.5, -4.5, -11.5], fore: [-0.6, -0.55, -0.58], palm: [-1, 0, 0], weapon: [-0.3, -0.95, -0.1] },
      { at: 0.7, elbow: [9.5, -11, -6.5], fore: [-0.2, -0.05, -0.98], palm: [-1, 0, 0], weapon: [-0.1, 0.5, -0.85] },
      { at: 1.15, ...READY },
    ],
    frames: [0, 0.1, 0.2, 0.27, 0.32, 0.37, 0.42, 0.47, 0.54, 0.7, 0.9],
  },
  // A sweep for blades: the palm turns up, the arm draws back to the right with the blade
  // trailing, then the blade sweeps across in front and on round to the left.
  slash: {
    keys: [
      { at: 0, ...READY },
      { at: 0.12, elbow: [10.5, -8, -8], fore: [0.15, 0.12, -0.98], palm: [0, 1, 0], weapon: [0.85, 0.2, -0.5] },
      { at: 0.27, elbow: [10, -7.5, -10], fore: [-0.1, 0.1, -0.99], palm: [0, 1, 0], weapon: [0.4, 0.1, -0.9] },
      { at: 0.42, elbow: [9.5, -6.5, -11.5], fore: [-0.5, 0.08, -0.86], palm: [0, 1, 0], weapon: [-0.45, 0.05, -0.9] },
      { at: 0.52, elbow: [8.5, -6.5, -12], fore: [-0.85, 0.05, -0.52], palm: [0, 1, 0], weapon: [-0.97, 0, -0.2] },
      { at: 0.62, elbow: [8, -7, -11], fore: [-0.95, 0, -0.25], palm: [0, 1, 0], weapon: [-0.75, 0, 0.65] },
      { at: 0.85, elbow: [9.5, -10, -7], fore: [-0.4, 0.15, -0.9], palm: [-0.7, 0.7, 0], weapon: [-0.2, 0.9, -0.4] },
      { at: 1.15, ...READY },
    ],
    frames: [0, 0.08, 0.16, 0.25, 0.32, 0.37, 0.42, 0.48, 0.56, 0.72, 0.92],
  },
  // A straight punch: from a guard with the fist by the chin and the elbow down, the elbow
  // drives forward and the forearm turns over, palm down as the arm straightens.
  punch: {
    keys: [
      { at: 0, hand: [5, -4.5, -10.5], pole: [0.4, -1, 0.3], palm: [-1, 0, 0] },
      { at: 0.15, hand: [5.5, -5.2, -9.5], pole: [0.4, -1, 0.3], palm: [-1, 0, 0] },
      { at: 0.3, hand: [3.5, -3.8, -13.5], pole: [0.8, -0.6, 0.2], palm: [-0.7, -0.7, 0] },
      { at: 0.42, hand: [1.5, -3, -16.5], pole: [1, -0.3, 0], palm: [0, -1, 0] },
      { at: 0.55, hand: [1.7, -3.2, -16], pole: [1, -0.3, 0], palm: [0, -1, 0] },
      { at: 0.75, hand: [3.5, -4.2, -13], pole: [0.6, -0.8, 0.2], palm: [-0.7, -0.7, 0] },
      { at: 1.15, hand: [5, -4.5, -10.5], pole: [0.4, -1, 0.3], palm: [-1, 0, 0] },
    ],
    frames: [0, 0.12, 0.24, 0.32, 0.38, 0.42, 0.5, 0.6, 0.72, 0.86, 1.0],
  },
};
const moves = {};
for (const [id, M] of Object.entries(MOVES)) moves[id] = M.frames.map((t) => poseAt(M.keys, t));

// ---- The models -------------------------------------------------------------------------------
// Points read off each model (tools/model-views.js, or window.fusedInfo): the elbow end and the
// middle of the fist, and the weapon's tip; palm: which way the palm faces, in the model (from
// --calibrate). mirror: the model came out as a left hand.
const cfg = {
  ss: 4, fistWidth: 4, shoulder: SHOULDER, preview: preview || calibrate, rawFull: big, calibrate, moves,
  light: { ambient: 1.1, key: 2.6, fill: 0.5, edge: 0.75, dither: 10 },
  fused: {
    empty: { url: T('fp-empty'), move: 'punch', elbow: [0.005, -0.317, 0.031], hand: [0, 0.37, -0.03], palm: [1, 0, 0] },
    club: { url: T('fp-club', 2), move: 'chop', mirror: true, elbow: [0, -0.45, 0.04], hand: [-0.02, -0.08, -0.04], tip: [0.004, 0.5, 0.043], palm: [0, -0.211, -0.977] },
    hammer: { url: T('fp-hammer'), move: 'chop', mirror: true, elbow: [0.09, -0.37, 0.32], hand: [-0.06, 0.09, -0.12], tip: [-0.14, 0.36, -0.25], palm: [0, -0.691, -0.723] },
    knife: { url: T('fp-knife'), move: 'slash', elbow: [0.09, -0.458, -0.126], hand: [-0.009, -0.044, 0.083], tip: [-0.223, 0.489, 0.286], palm: [0, -0.451, 0.893] },
    dagger: { url: T('fp-dagger'), move: 'slash', elbow: [0.026, -0.475, -0.018], hand: [-0.003, 0.058, 0.053], tip: [-0.005, 0.492, 0.052], palm: [0, -0.132, 0.991] },
    rusty_dagger: { url: T('fp-rusty-dagger'), move: 'slash', elbow: [0.129, -0.435, -0.009], hand: [0.0, -0.12, 0.003], tip: [-0.237, 0.5, 0.011], palm: [0, -0.038, 0.999] },
    longsword: { url: T('fp-longsword'), move: 'slash', elbow: [0.021, -0.435, 0.45], hand: [0.021, -0.173, -0.197], tip: [-0.105, 0.478, -0.299], palm: [-1, 0, 0] },
    sword: { url: T('fp-sword', 3), move: 'slash', elbow: [0.013, -0.476, 0.001], hand: [-0.043, 0.055, 0.006], tip: [-0.127, 0.493, -0.027], palm: [0, -0.009, 1] },
    axe: { url: T('fp-axe'), move: 'chop', elbow: [-0.013, -0.441, -0.141], hand: [0.011, -0.163, 0.013], tip: [0.03, 0.472, 0.289], palm: [0, -0.485, 0.875] },
    mace: { url: T('fp-mace'), move: 'chop', elbow: [0.049, -0.376, 0.028], hand: [0.001, 0.065, -0.022], tip: [-0.151, 0.481, 0.02], palm: [0, 0.113, 0.994] },
  },
};
if (process.env.VM_ONLY) { const keep = process.env.VM_ONLY.split(','); for (const id of Object.keys(cfg.fused)) if (!keep.includes(id)) delete cfg.fused[id]; }
if (process.env.VM_MOVE) for (const F of Object.values(cfg.fused)) F.move = process.env.VM_MOVE;

(async () => {
  const t0 = Date.now();
  // Sanity check: how far each frame's implied upper arm is from its real length.
  for (const [id, fr] of Object.entries(moves)) console.log(id.padEnd(6), fr.map((f) => len(sub(f.elbow, SHOULDER)).toFixed(1)).join(' '));
  const result = await inBakePage((c) => window.bakeViewmodel(c), cfg);
  console.log(`rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (cfg.preview) {
    const frames = result.previews, per = calibrate ? 4 : moves.chop.length, cols = big ? 1 : per;
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
  for (const [id, M] of Object.entries(MOVES)) phases[id] = M.frames;
  const raw = Buffer.concat(parts), packed = zlib.deflateRawSync(raw, { level: 9 });
  const out = path.join(root, 'game', 'js', 'data', 'baked', 'viewmodel.js');
  fs.writeFileSync(out, `'use strict';\n// Baked by tools/bake-viewmodel.js from the Tripo arm-and-weapon models. Do not edit.\n`
    + `BAKED_VM.moves = ${JSON.stringify(used)};\nBAKED_VM.phases = ${JSON.stringify(phases)};\n`
    + `BAKED_VM.index = ${JSON.stringify(index)};\nBAKED_VM.data = '${packed.toString('base64')}';\n`);
  console.log(`wrote ${path.relative(root, out)}: ${index.length} sprites, ${(raw.length / 1024).toFixed(0)} KB of pixels, ${(packed.length / 1024).toFixed(0)} KB packed`);
  // Contact sheet of the finished sprites in palette colours, one row per model.
  for (const s of ['math.js', 'palette.js']) vm.runInThisContext(fs.readFileSync(path.join(root, 'js', s), 'utf8'));
  const ids = Object.keys(result.fused), n = moves.chop.length, W = 320, H = 200, img = new Uint8Array(W * n * H * ids.length * 4);
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
