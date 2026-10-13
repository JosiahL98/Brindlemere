// The first-person arm: its kinematics, its attacks and the arm-and-weapon models it uses.
// Shared by tools/bake-viewmodel.js (which bakes it) and tools/viewer/ (which shows it moving).
//
// The arm moves like a person's: a shoulder a little right of and below the eyes, an upper arm
// and a forearm, and a wrist between the forearm and whatever the fist holds. Camera space, game
// units: x right, y up, -z ahead, the eye at the origin.

export const SHOULDER = [6.5, -9, 2], UPPER = 11, FORE = 12;
const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]), mul = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.sqrt(dot(a, a)), norm = (a) => mul(a, 1 / (len(a) || 1));
export const armLength = (fr) => len(sub(fr.elbow, SHOULDER)); // how long the upper arm would have to be

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
// A move's pose at swing phase t: the elbow on a Catmull-Rom curve through the keys, the forearm,
// palm and weapon turned smoothly between them; the fist sits a forearm's length from the elbow.
// `key` is the index of the key the pose is leaving.
export function armPose(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].at) i++;
  if (keys[0].tilt !== undefined) return rigidPose(keys, t, i);
  const arms = keys.map(keyArm);
  const i0 = Math.max(0, i - 1), i3 = Math.min(keys.length - 1, i + 2);
  const u = Math.min(1, Math.max(0, (t - keys[i].at) / (keys[i + 1].at - keys[i].at))), u2 = u * u, u3 = u2 * u;
  const [p0, p1, p2, p3] = [arms[i0].elbow, arms[i].elbow, arms[i + 1].elbow, arms[i3].elbow];
  const elbow = [0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3));
  const s = smooth(u), fore = slerp(arms[i].fore, arms[i + 1].fore, s);
  // The weapon's direction, which the wrist turns it to (the punch has none).
  const weapon = keys[i].weapon && keys[i + 1].weapon ? slerp(norm(keys[i].weapon), norm(keys[i + 1].weapon), s) : undefined;
  return { hand: add(elbow, mul(fore, FORE)), fore, palm: slerp(norm(keys[i].palm), norm(keys[i + 1].palm), s), elbow, weapon, key: i };
}

// Each move: keyframes over the swing (phase 0 = ready, 0.42 = the blow lands, 1.15 = done, as
// in game/js/game/player.js) and the phases its frames are sampled at. Frame 0 is the ready pose.
// Keys give the elbow, the forearm's direction, which way the palm faces and where the weapon
// points; the wrist bends between forearm and weapon, so the weapon can lag and then whip through.
// The swing holds the wrist still, the fist keeping the weapon cocked COCK degrees towards the
// thumb, so the hand never turns against the forearm: forearm, hand and weapon move as one, and
// the arm does the work. At rest the palm faces left and the weapon stands straight up, so the
// forearm rises at 90 - COCK degrees. Keys give where the fist is and how far the whole forearm,
// hand and weapon lean to the right (degrees, as seen through the eyes; negative leans left).
const COCK = 35, DEG = Math.PI / 180;
const REST = { fore: [0, Math.sin((90 - COCK) * DEG), -Math.cos((90 - COCK) * DEG)], palm: [-1, 0, 0], weapon: [0, 1, 0] };
const lean = (v, deg) => { const c = Math.cos(-deg * DEG), s = Math.sin(-deg * DEG); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
function rigidPose(keys, t, i) {
  const i0 = Math.max(0, i - 1), i3 = Math.min(keys.length - 1, i + 2);
  const u = Math.min(1, Math.max(0, (t - keys[i].at) / (keys[i + 1].at - keys[i].at))), u2 = u * u, u3 = u2 * u;
  const [p0, p1, p2, p3] = [keys[i0].hand, keys[i].hand, keys[i + 1].hand, keys[i3].hand];
  const hand = [0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3));
  const tilt = keys[i].tilt + (keys[i + 1].tilt - keys[i].tilt) * smooth(u);
  const fore = lean(REST.fore, tilt);
  return { hand, fore, palm: lean(REST.palm, tilt), weapon: lean(REST.weapon, tilt), elbow: sub(hand, mul(fore, FORE)), key: i, tilt };
}
const READY = { hand: [7.4, -5.4, -14.5], tilt: 0 };
export const MOVES = {
  // Every weapon: the fist shifts a little to the right as forearm, hand and weapon lean right,
  // tipping the weapon up and to the right; then the arm drags it down and to the left across
  // the screen, the lean easing through upright, and comes back to rest.
  swing: {
    keys: [
      { at: 0, ...READY },
      { at: 0.18, hand: [8.4, -2.5, -14.5], tilt: 35 },
      { at: 0.3, hand: [5.5, -4.3, -15], tilt: 33 },
      { at: 0.42, hand: [1.5, -6.8, -15.5], tilt: 15 },
      { at: 0.55, hand: [-1.5, -8.6, -16], tilt: -12 },
      { at: 0.85, hand: [4, -7, -15], tilt: -4 },
      { at: 1.15, ...READY },
    ],
    frames: [0, 0.09, 0.18, 0.26, 0.32, 0.37, 0.42, 0.48, 0.56, 0.75, 0.95],
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
// Moves captured from real people (Mixamo, assets/adobemokap/<mocap>.fbx): the arm is read off
// the captured body's right arm, seen from its own eyes (tools/bake/bake.mjs mocapMove). start and
// end trim the clip to the attack (seconds); impact, if given, is when the blow lands (otherwise
// when the fist moves fastest). Frames are sampled at the same phases as the swing's.
const PHASES = [0, 0.09, 0.18, 0.26, 0.32, 0.37, 0.42, 0.48, 0.56, 0.75, 0.95];
// Where the camera sits against the real eyes (tools/bake/bake.mjs mocapArm): lower, further back
// and looking down, the way first-person games keep the arms in sight.
const VIEW = { drop: 0, back: 0, pitch: 0 };
export const MOCAP = {
  overhead: { mocap: 'Standing Melee Attack Downward', frames: PHASES, view: { ...VIEW } },
  horizontal: { mocap: 'Standing Melee Attack Horizontal', frames: PHASES, view: { ...VIEW } },
  slash: { mocap: 'Sword And Shield Slash', frames: PHASES, view: { ...VIEW } },
  inward: { mocap: 'Stable Sword Inward Slash', frames: PHASES, view: { ...VIEW } },
  outward: { mocap: 'Stable Sword Outward Slash', frames: PHASES, view: { ...VIEW } },
  stab: { mocap: 'Stabbing', frames: PHASES, view: { ...VIEW } },
  cross: { mocap: 'Cross Punch', frames: PHASES, view: { ...VIEW } },
};

// Every keyframed move's baked frames, posed.
export function sampleMoves() {
  const out = {};
  for (const [id, M] of Object.entries(MOVES)) out[id] = M.frames.map((t) => armPose(M.keys, t));
  return out;
}

// The arm-and-weapon models. Points read off each model (tools/model-views.js, or
// window.fusedInfo): the elbow end, the middle of the fist and the weapon's tip; palm: which way
// the palm faces, in the model (from tools/bake-viewmodel.js --calibrate). mirror: the model came
// out as a left hand. items: what the game uses it for (game/js/game/viewmodel.js).
const T = (id, n = 1) => `/assets/tripo/${id}/model-${n}.glb`;
export const FUSED = {
  empty: { url: T('fp-empty'), move: 'punch', items: ['Bare fists'], elbow: [0.005, -0.317, 0.031], hand: [0, 0.37, -0.03], palm: [1, 0, 0] },
  club: { url: T('fp-club', 2), move: 'swing', items: ['Wooden Club'], mirror: true, elbow: [0, -0.45, 0.04], hand: [-0.02, -0.08, -0.04], tip: [0.004, 0.5, 0.043], palm: [0, -0.211, -0.977] },
  hammer: { url: T('fp-hammer'), move: 'swing', items: ["Apprentice's Hammer"], mirror: true, elbow: [0.09, -0.37, 0.32], hand: [-0.06, 0.09, -0.12], tip: [-0.14, 0.36, -0.25], palm: [0, -0.691, -0.723] },
  knife: { url: T('fp-knife'), move: 'swing', items: ['Fishing Knife'], elbow: [0.09, -0.458, -0.126], hand: [-0.009, -0.044, 0.083], tip: [-0.223, 0.489, 0.286], palm: [0, -0.451, 0.893] },
  dagger: { url: T('fp-dagger'), move: 'swing', items: ['Iron Dagger'], elbow: [0.026, -0.475, -0.018], hand: [-0.003, 0.058, 0.053], tip: [-0.005, 0.492, 0.052], palm: [0, -0.132, 0.991] },
  rusty_dagger: { url: T('fp-rusty-dagger'), move: 'swing', items: ['Rusty Dagger'], elbow: [0.129, -0.435, -0.009], hand: [0.0, -0.12, 0.003], tip: [-0.237, 0.5, 0.011], palm: [0, -0.038, 0.999] },
  longsword: { url: T('fp-longsword'), move: 'swing', items: ['Steel Longsword'], elbow: [0.021, -0.435, 0.45], hand: [0.021, -0.173, -0.197], tip: [-0.105, 0.478, -0.299], palm: [-1, 0, 0] },
  sword: { url: T('fp-sword', 3), move: 'swing', items: ['Iron Shortsword', "Bram's Old Sword"], elbow: [0.013, -0.476, 0.001], hand: [-0.043, 0.055, 0.006], tip: [-0.127, 0.493, -0.027], palm: [0, -0.009, 1] },
  axe: { url: T('fp-axe'), move: 'swing', items: ['Iron War Axe'], elbow: [-0.013, -0.441, -0.141], hand: [0.011, -0.163, 0.013], tip: [0.03, 0.472, 0.289], palm: [0, -0.485, 0.875] },
  mace: { url: T('fp-mace'), move: 'swing', items: ['Iron Mace'], elbow: [0.049, -0.376, 0.028], hand: [0.001, 0.065, -0.022], tip: [-0.151, 0.481, 0.02], palm: [0, 0.113, 0.994] },
};
// The baker's scale and lighting, which the viewer matches.
export const ARM = { fistWidth: 4, shoulder: SHOULDER, light: { ambient: 1.1, key: 2.6, fill: 0.5, edge: 0.75, dither: 10 } };
