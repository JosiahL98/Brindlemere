// The villagers' scripted moves, and how they are played on a Tripo biped rig. tools/bake/bakes.mjs
// names them (@hammer, @smite, @thrust, @jab, @fork, @stab); tools/bake/bake.mjs bakes them and
// tools/viewer/ shows them.
//
// A move is posed over the first frame of the villager's idle clip, the whole body at once. Its
// keys say, in the villager's own terms (heights; x to their left, y up, z ahead; degrees, which
// turn to their left and lean forward when positive):
//   hip [x,y,z]        the hips moved (a crouch, a lunge)      turn  the hips turned
//   twist, lean, side  the chest turned against the hips, bent forward, bent to the left, the bend
//                      shared along the spine
//   Lf, Rf [x,y,z]     a foot moved (a step), Lfy, Rfy turned; the legs bend to keep the feet where
//                      they are put, knees over the toes
//   R, L [x,y,z]       a wrist, its elbow bending towards Rp, Lp (directions)
//   Rh [pitch, yaw]    which way what the right hand holds points: a hammer's handle, towards its
//                      head (its face then leads the swing), or a knife's blade; pitch up from level
//                      ahead, yaw to their left
//   aim [x,y,z]        a pole held in both hands, which way it points: the right wrist at R, the
//                      left hand `gap` further along the pole, the pole's end `butt` behind the right
//   Ra [a, b, c]       instead of R: the right arm by its joints in a swing's plane (Rplane), see below
//   work, bar [x,y,z]  for a move with tongs: where they hold the bar, and which way it lies
//   load               for a move with hay: over a half while a forkful rides on the tines
//   look [x,y,z]       what the head turns to look at (a point; else straight ahead)
// A key without a value keeps the one before; the first key gives them all. The pose follows a
// smooth curve through the keys, so the timing comes from how they're spaced; `stop` marks a key
// the move runs into hard and leaves from rest (a blow landing).
import * as THREE from 'three';

export const SCRIPTS = {
  // Tobin at the anvil: the hammer lifted, cocked back over the shoulder, brought down onto the
  // anvil's face with the body behind it, bounced off and lifted again. The left hand holds the
  // work on the anvil. A blow a second.
  hammer: { period: 1.0, loop: true, tongs: true, keys: [
    { at: 0, hip: [0, -0.01, 0], turn: -10, twist: -6, lean: 8, side: 0, Lf: [0.035, 0, 0.07], Rf: [-0.04, 0, -0.05], Lfy: 0, Rfy: -20,
      Ra: [5, 55, -12], Rplane: [12, 0], L: [0.16, 0.47, 0.16], Lp: [1, 0.6, 0], work: [0.075, 0.378, 0.34], bar: [-1, 0, 0.25], look: [0, 0.4, 0.62] },
    { at: 0.125, Ra: [-25, 50, 5], lean: 12, turn: -6, twist: -2 },
    { at: 0.25, stop: true, hip: [0, -0.016, 0.01], turn: -2, twist: 4, lean: 17, Ra: [-60, 5, -33] },
    { at: 0.375, hip: [0, -0.015, 0.008], lean: 15, Ra: [-48, 18, -24] },
    { at: 0.5, hip: [0, -0.013, 0.005], turn: -4, twist: 0, lean: 12, Ra: [-38, 38, -18] },
    { at: 0.625, hip: [0, -0.012, 0.002], turn: -7, twist: -3, lean: 10, Ra: [-22, 50, -14] },
    { at: 0.75, hip: [0, -0.011, 0], turn: -9, twist: -5, lean: 9, Ra: [-6, 55, -12] },
    { at: 0.875, turn: -10, twist: -6, lean: 8, Ra: [3, 56, -12] },
  ] },
  // Tobin's blow in a fight: the hammer swung up over his right shoulder, a step in with the left
  // foot, and down at the head of whoever is in front of him, following through to his left hip.
  smite: { period: 0.8, keys: [
    { at: 0, hip: [0, -0.01, 0], turn: -4, twist: -2, lean: 4, side: 0, Lf: [0.02, 0, 0.04], Rf: [-0.02, 0, -0.03], Lfy: 0, Rfy: -15,
      Ra: [-65, 45, -8], Rplane: [5, 0], L: [0.16, 0.58, 0.15], Lp: [1, -0.5, -0.3], look: [0, 0.8, 1.2] },
    { at: 0.143, hip: [0, -0.012, -0.015], turn: -12, twist: -10, lean: 0, side: -3, Ra: [-5, 75, -12], Rplane: [2, 25], L: [0.17, 0.62, 0.18] },
    { at: 0.286, hip: [0, -0.01, -0.025], turn: -22, twist: -16, lean: -5, side: -6, Lf: [0.025, 0.035, 0.08], Ra: [28, 62, -20], Rplane: [0, 38], L: [0.18, 0.64, 0.22] },
    { at: 0.429, hip: [0, -0.03, 0.03], turn: -6, twist: -2, lean: 8, side: 0, Lf: [0.035, 0, 0.15], Ra: [10, 45, -8], Rplane: [6, 22], L: [0.18, 0.56, 0.12] },
    { at: 0.571, stop: true, hip: [0, -0.045, 0.06], turn: 10, twist: 12, lean: 16, side: 2, Ra: [-14, 4, -38], Rplane: [10, 8], L: [0.22, 0.52, 0.04], Lp: [1, -0.3, -0.6] },
    { at: 0.714, hip: [0, -0.05, 0.065], turn: 14, twist: 14, lean: 22, Ra: [-60, 0, -32], Rplane: [22, 0] },
    { at: 0.857, hip: [0, -0.03, 0.04], turn: 4, twist: 4, lean: 12, side: 0, Ra: [-62, 30, -14], Rplane: [12, 0], L: [0.2, 0.54, 0.12], Lp: [1, -0.5, -0.3] },
    { at: 1, hip: [0, -0.015, 0.02], turn: -2, twist: -1, lean: 5, Lf: [0.03, 0, 0.08], Ra: [-65, 45, -8], Rplane: [5, 0], L: [0.16, 0.58, 0.15] },
  ] },
  // Rolf's spear: lowered from the upright into a guard, the right hand at the hip and the left
  // ahead; drawn back with the body turned away, then driven straight out with a lunge onto the
  // left foot, and back into guard.
  thrust: { period: 0.8, keys: [
    { at: 0, hip: [0, 0, 0], turn: -10, twist: -4, lean: 2, side: 0, Lf: [0.02, 0, 0.04], Rf: [-0.02, 0, -0.03], Lfy: 0, Rfy: -25,
      R: [-0.19, 0.6, 0.02], Rp: [-1, -0.6, -0.4], aim: [0.1, 0.72, 0.68], gap: 0.22, butt: 0.55, Lp: [0.6, -0.8, -0.2], look: [0, 0.82, 1.2] },
    { at: 0.143, hip: [0, -0.02, 0], turn: -20, twist: -8, lean: 4, Lf: [0.04, 0, 0.1], Rf: [-0.04, 0, -0.07], R: [-0.17, 0.6, 0.02], aim: [0.15, 0.18, 0.97], gap: 0.22 },
    { at: 0.286, hip: [0, -0.03, -0.04], turn: -30, twist: -14, lean: -2, R: [-0.17, 0.6, -0.07], aim: [0.12, 0.14, 0.98], gap: 0.23 },
    { at: 0.429, hip: [0, -0.045, 0.03], turn: -16, twist: 0, lean: 10, Lf: [0.05, 0, 0.17], R: [-0.15, 0.56, 0.1], aim: [0.16, 0.16, 0.97], gap: 0.2 },
    { at: 0.571, stop: true, hip: [0, -0.055, 0.08], turn: -16, twist: 0, lean: 13, R: [-0.15, 0.56, 0.2], Rp: [-1, -0.3, -0.4], aim: [0.16, 0.18, 0.97], gap: 0.2 },
    { at: 0.714, hip: [0, -0.055, 0.075], turn: -16, twist: 0, lean: 13, R: [-0.155, 0.56, 0.18], gap: 0.2 },
    { at: 0.857, hip: [0, -0.025, 0.02], turn: -16, twist: -6, lean: 4, Lf: [0.04, 0, 0.1], R: [-0.16, 0.6, 0.03], Rp: [-1, -0.6, -0.4], aim: [0.12, 0.25, 0.96], gap: 0.22 },
    { at: 1, hip: [0, -0.005, 0], turn: -10, twist: -4, lean: 2, Lf: [0.02, 0, 0.04], R: [-0.19, 0.6, 0.02], aim: [0.1, 0.72, 0.68], gap: 0.22 },
  ] },
  // Odo's pitchfork in a fight: down from the upright, held low across the body, then jabbed up
  // and forward from the hip with both arms, a lunge behind it, and pulled back.
  jab: { period: 0.8, keys: [
    { at: 0, hip: [0, -0.01, 0], turn: -14, twist: -6, lean: 6, side: 0, Lf: [0.03, 0, 0.05], Rf: [-0.03, 0, -0.04], Lfy: -10, Rfy: -30,
      R: [-0.2, 0.59, 0.02], Rp: [-1, -0.1, -0.4], aim: [0.14, 0.66, 0.74], gap: 0.24, butt: 0.42, Lp: [0.8, -0.6, -0.1], look: [0, 0.8, 1.2] },
    { at: 0.143, hip: [0, -0.035, 0], turn: -24, twist: -10, lean: 10, Lf: [0.05, 0, 0.1], Rf: [-0.05, 0, -0.08], R: [-0.18, 0.55, 0.02], aim: [0.2, 0.08, 0.98], gap: 0.24 },
    { at: 0.286, hip: [0, -0.045, -0.04], turn: -32, twist: -14, lean: 8, R: [-0.19, 0.54, -0.06], aim: [0.18, 0.04, 0.98], gap: 0.25 },
    { at: 0.429, hip: [0, -0.05, 0.03], turn: -16, twist: -4, lean: 11, Lf: [0.06, 0, 0.17], R: [-0.19, 0.55, 0.1], aim: [0.16, 0.2, 0.97], gap: 0.2 },
    { at: 0.571, stop: true, hip: [0, -0.055, 0.08], turn: -4, twist: 4, lean: 13, R: [-0.18, 0.54, 0.2], Rp: [-1, -0.3, -0.4], aim: [0.16, 0.3, 0.94], gap: 0.2 },
    { at: 0.714, hip: [0, -0.055, 0.075], turn: -4, twist: 3, lean: 13, R: [-0.185, 0.54, 0.18], gap: 0.2 },
    { at: 0.857, hip: [0, -0.03, 0.02], turn: -18, twist: -6, lean: 9, Lf: [0.05, 0, 0.1], R: [-0.19, 0.57, 0.03], Rp: [-1, -0.1, -0.4], aim: [0.18, 0.2, 0.96], gap: 0.23 },
    { at: 1, hip: [0, -0.012, 0], turn: -14, twist: -6, lean: 6, Lf: [0.03, 0, 0.05], R: [-0.2, 0.59, 0.02], aim: [0.14, 0.66, 0.74], gap: 0.24 },
  ] },
  // Odo forking hay: the tines driven into a heap on the ground ahead, the load levered up over
  // the left hand, swung round to the left and tossed, and the fork brought back.
  fork: { period: 1.8, loop: true, hay: [0.12, 0, 0.88], keys: [
    { at: 0, hip: [0, -0.05, 0.02], turn: -30, twist: -10, lean: 24, side: 0, Lf: [0.06, 0, 0.1], Rf: [-0.05, 0, -0.08], Lfy: -15, Rfy: -40,
      R: [-0.22, 0.55, -0.01], Rp: [-1, 0.3, -0.2], aim: [0.22, -0.42, 0.88], gap: 0.27, butt: 0.05, Lp: [0.8, -0.6, 0.1], look: [0.1, 0.1, 0.9], load: 0 },
    { at: 0.2, hip: [0, -0.065, 0.06], lean: 28, R: [-0.22, 0.53, 0.06], aim: [0.22, -0.44, 0.87] },
    { at: 0.4, hip: [0, -0.05, 0.03], lean: 20, R: [-0.22, 0.5, 0.04], Rp: [-1, -0.2, -0.4], aim: [0.2, -0.04, 0.98], gap: 0.26, load: 1 },
    { at: 0.58, hip: [0, -0.03, 0.01], turn: -10, twist: 6, lean: 12, R: [-0.19, 0.56, 0.08], aim: [0.5, 0.3, 0.81], gap: 0.25, look: [0.5, 0.5, 0.8] },
    { at: 0.7, hip: [0, -0.02, 0], turn: 2, twist: 16, lean: 6, R: [-0.18, 0.63, 0.13], aim: [0.72, 0.45, 0.53], look: [0.8, 0.7, 0.5], load: 0 },
    { at: 0.85, hip: [0, -0.035, 0.01], turn: -20, twist: -4, lean: 16, R: [-0.19, 0.57, 0.03], Rp: [-1, 0.3, -0.2], aim: [0.3, -0.2, 0.93], gap: 0.27, look: [0.1, 0.2, 0.9] },
  ] },
  // Nell's knife: the left hand up to guard, the knife drawn back to her hip, then a step in on the
  // left foot and a stab at the belly with her weight behind it, and back.
  stab: { period: 0.7, keys: [
    { at: 0, hip: [0, 0, 0], turn: 0, twist: 0, lean: 3, side: 0, Lf: [0, 0, 0], Rf: [0, 0, 0], Lfy: 0, Rfy: 0,
      R: [-0.14, 0.5, 0.06], Rp: [-1, -0.5, -0.5], Rh: [-40, 10], L: [0.17, 0.5, 0.05], Lp: [1, -0.5, -0.5], look: [0, 0.75, 1.2] },
    { at: 0.143, hip: [0, -0.015, -0.01], turn: -12, twist: -8, lean: 6, Lf: [0.02, 0, 0.06], Rf: [-0.02, 0, -0.04], Rfy: -20, R: [-0.15, 0.56, 0.0], Rp: [-0.6, -0.3, -1], Rh: [-22, 5], L: [0.1, 0.66, 0.16], Lp: [1, -0.6, -0.2] },
    { at: 0.286, hip: [0, -0.025, -0.025], turn: -22, twist: -14, lean: 6, R: [-0.15, 0.58, -0.04], Rp: [-0.5, -0.3, -1], Rh: [-14, 5], L: [0.07, 0.7, 0.17] },
    { at: 0.571, stop: true, hip: [0, -0.04, 0.06], turn: 12, twist: 16, lean: 14, Lf: [0.04, 0, 0.16], R: [-0.02, 0.58, 0.27], Rp: [-1, -0.6, -0.2], Rh: [4, 2], L: [0.12, 0.66, 0.22], Lp: [1, -0.6, -0.3] },
    { at: 0.714, hip: [0, -0.04, 0.05], turn: 10, twist: 14, lean: 13, R: [-0.03, 0.57, 0.24] },
    { at: 1, hip: [0, -0.005, 0.01], turn: 0, twist: 0, lean: 4, Lf: [0.01, 0, 0.03], Rf: [0, 0, 0], Rfy: 0, R: [-0.14, 0.5, 0.06], Rp: [-1, -0.5, -0.5], Rh: [-40, 10], L: [0.17, 0.5, 0.05], Lp: [1, -0.5, -0.5] },
  ] },
};

const DEG = Math.PI / 180;
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const worldPos = (o) => o.getWorldPosition(new THREE.Vector3());
const worldQuat = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const turnAbout = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, deg * DEG);
const UP = new THREE.Vector3(0, 1, 0);
// Ahead and to the left, for a body turned `deg` to its left.
const aheadOf = (deg) => new THREE.Vector3(Math.sin(deg * DEG), 0, Math.cos(deg * DEG));
const leftOf = (deg) => new THREE.Vector3(Math.cos(deg * DEG), 0, -Math.sin(deg * DEG));

// Turn bone b, in the world, by rotation q (its children follow).
export function turnBone(b, q) {
  b.quaternion.copy(worldQuat(b.parent).invert().multiply(q.clone().multiply(worldQuat(b))));
  b.updateMatrixWorld(true);
}
function setWorldQuat(b, q) {
  b.quaternion.copy(worldQuat(b.parent).invert().multiply(q));
  b.updateMatrixWorld(true);
}
const swingBone = (b, from, to) => turnBone(b, new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize()));
// Two-bone IK: bone a, its child b and b's child c (shoulder, elbow, wrist; hip, knee, ankle), with
// c brought to `target` and the middle joint bending towards `pole` (world space).
function ik2(a, b, c, target, pole) {
  const S = worldPos(a), E = worldPos(b), H = worldPos(c);
  const L1 = S.distanceTo(E), L2 = E.distanceTo(H);
  const d = target.clone().sub(S), L = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min(d.length(), L1 + L2 - 1e-3)), n = d.normalize();
  const x = (L1 * L1 - L2 * L2 + L * L) / (2 * L), r = Math.sqrt(Math.max(0, L1 * L1 - x * x));
  const p = pole.clone().projectOnPlane(n).normalize();
  swingBone(a, E.clone().sub(S), S.clone().addScaledVector(n, x).addScaledVector(p, r).sub(S));
  const E2 = worldPos(b);
  swingBone(b, worldPos(c).sub(E2), S.clone().addScaledVector(n, L).sub(E2));
}

// What a move needs to know about a rig, taken in its rest pose: where the hips and feet are, and
// how each hand lies against its forearm (its fingers' way, and its thumb's, which faces ahead as
// the arms hang).
export function rigOf(M) {
  const B = (n) => M.model.getObjectByName(n);
  const R = { hip: B('Hip'), spine: ['Waist', 'Spine01', 'Spine02'].map(B), neck: B('NeckTwist01'), head: B('Head') };
  R.hipP = worldPos(R.hip); R.headQi = worldQuat(R.head).invert();
  for (const s of ['L', 'R']) {
    const S = R[s] = {};
    for (const [k, n] of [['thigh', 'Thigh'], ['calf', 'Calf'], ['foot', 'Foot'], ['cl', 'Clavicle'], ['up', 'Upperarm'], ['fo', 'Forearm'], ['ha', 'Hand'], ['tw1', 'ForearmTwist01'], ['tw2', 'ForearmTwist02']]) S[k] = B(`${s}_${n}`);
    S.footP = worldPos(S.foot); S.footQ = worldQuat(S.foot);
    const f = worldPos(S.ha).sub(worldPos(S.fo)).normalize(), qi = worldQuat(S.ha).invert();
    S.along = f.clone().applyQuaternion(qi);
    S.thumb = new THREE.Vector3(0, 0, 1).projectOnPlane(f).normalize().applyQuaternion(qi);
    S.axis = S.ha.position.clone().normalize(); // the forearm's length, in its own frame
    S.rel0i = worldQuat(S.fo).invert().multiply(worldQuat(S.ha)).invert();
    S.tw0 = [S.tw1, S.tw2].map((b) => b && b.quaternion.clone());
  }
  return R;
}

// A hand turned about its forearm takes the forearm's skin round with it, most of the way near the
// wrist, as a forearm turns: the twist bones, which carry that skin, take shares of the turn.
function spreadTwist(S) {
  const d = worldQuat(S.fo).invert().multiply(worldQuat(S.ha)).multiply(S.rel0i);
  if (d.w < 0) { d.x = -d.x; d.y = -d.y; d.z = -d.z; d.w = -d.w; }
  const a = S.axis, turn = 2 * Math.atan2(a.x * d.x + a.y * d.y + a.z * d.z, d.w);
  [[S.tw1, 0.25], [S.tw2, 0.6]].forEach(([b, share], i) => {
    if (!b) return;
    b.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(a, turn * share).multiply(S.tw0[i]));
    b.updateMatrixWorld(true);
  });
}
// How far a hand is bent at the wrist, in degrees.
function wristBend(S) {
  const f = worldPos(S.ha).sub(worldPos(S.fo)).normalize();
  return Math.acos(Math.max(-1, Math.min(1, S.along.clone().applyQuaternion(worldQuat(S.ha)).dot(f)))) / DEG;
}
// Turn a hand so what it holds points along `dir` and, given `face` and the thing has a face, with
// that facing `face`. `item` gives both in the hand bone's frame.
function aimHand(S, item, dir, face) {
  const q = worldQuat(S.ha), d = V3(item.d).normalize().applyQuaternion(q), D = dir.clone().normalize();
  let turn;
  if (face && item.n) {
    const n = V3(item.n).applyQuaternion(q).projectOnPlane(d).normalize(), N = face.clone().projectOnPlane(D).normalize();
    const from = new THREE.Matrix4().makeBasis(d, n, d.clone().cross(n)), to = new THREE.Matrix4().makeBasis(D, N, D.clone().cross(N));
    turn = new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.transpose()));
  } else turn = new THREE.Quaternion().setFromUnitVectors(d, D);
  setWorldQuat(S.ha, turn.multiply(q));
  spreadTwist(S);
}
// Turn a hand about its forearm so its thumb points as near `dir` as it can: how a hand takes hold
// of a pole. Along the forearm there is no telling, and the hand stays as it is.
function rollHand(S, dir, local = S.thumb) {
  const f = worldPos(S.ha).sub(worldPos(S.fo)).normalize();
  const t = local.clone().applyQuaternion(worldQuat(S.ha)).projectOnPlane(f), want = dir.clone().projectOnPlane(f);
  const k = Math.min(1, want.length() / 0.3);
  if (!k || !t.lengthSq()) return;
  t.normalize(); want.normalize();
  turnBone(S.ha, new THREE.Quaternion().setFromAxisAngle(f, k * Math.atan2(t.clone().cross(want).dot(f), t.dot(want))));
  spreadTwist(S);
}
// The collarbone lifts the shoulder of an arm raised high and brings it forward for a long reach.
function shrug(S, target, h) {
  const s0 = worldPos(S.up), c = s0.clone().sub(worldPos(S.cl)).normalize(), d = target.clone().sub(s0);
  const rise = Math.max(0, Math.min(22, (Math.asin(Math.max(-1, Math.min(1, d.y / d.length()))) / DEG - 10) * 0.35));
  const reach = Math.max(0, Math.min(14, (d.z / h - 0.1) * 90));
  if (rise) turnBone(S.cl, turnAbout(c.clone().cross(UP).normalize(), rise));
  if (reach) turnBone(S.cl, turnAbout(c.clone().cross(new THREE.Vector3(0, 0, 1)).normalize(), reach));
}
// Where a hand grips: the hole through its fist if its fingers have been curled (curlHand), else
// a little past the wrist, along the forearm.
export function gripOf(S, h) {
  if (S.fist) return S.ha.localToWorld(S.fist.at.clone());
  const H = worldPos(S.ha), E = worldPos(S.fo);
  return H.clone().addScaledVector(H.clone().sub(E).normalize(), 0.055 * h);
}

// A Tripo rig has no finger bones, and the villagers' hands are open. To hold a pole, a hand's
// fingers are bent round it in the mesh itself, as real fingers bend: each is three stiff lengths
// (a half, then a little over a quarter, then the tip) hinged at the knuckle and the two finger
// joints, the hinges running across the hand (the thumb's way), so no part of a finger is drawn
// out longer; only the skin over a joint rounds over it. The thumb, shorter than the fingers and
// off to their side, stays straight along the pole. The pole, r (heights) thick, lies across the
// palm and the fingers close on it. Sets S.fist: where the pole runs through the fist and which way,
// in the hand bone's frame. Works on the mesh's bind pose, so it holds whatever the hand does after.
export function curlHand(M, S, side, h, r) {
  let mesh = null;
  M.model.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const geo = mesh.geometry, pos = geo.attributes.position, nor = geo.attributes.normal, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const hi = mesh.skeleton.bones.indexOf(S.ha);
  const toHand = mesh.skeleton.boneInverses[hi].clone().multiply(mesh.bindMatrix), fromHand = toHand.clone().invert();
  const sc = new THREE.Vector3(); S.ha.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
  const k = h / sc.x; // the bone's units in a height
  // The hand's points (and normals) in its bone's frame.
  const pts = [], v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let j = 0; j < 4; j++) if (si.getComponent(i, j) === hi) w += sw.getComponent(i, j);
    if (w >= 0.5) pts.push([i, v.fromBufferAttribute(pos, i).applyMatrix4(toHand).clone(), nor ? new THREE.Vector3().fromBufferAttribute(nor, i).transformDirection(toHand) : null]);
  }
  // Its own frame: the fingers' way (to the far end of the hand), the thumb's across it, the palm's.
  const far = Math.max(...pts.map(([, q]) => q.length())), tips = pts.filter(([, q]) => q.length() > 0.8 * far);
  const a = tips.reduce((acc, [, q]) => acc.add(q), new THREE.Vector3()).normalize();
  const t = S.thumb.clone().projectOnPlane(a).normalize(), p = side === 'R' ? t.clone().cross(a) : a.clone().cross(t);
  const A = (q) => q.dot(a), P = (q) => q.dot(p), T = (q) => q.dot(t);
  const len = Math.max(...pts.map(([, q]) => A(q))), base = 0.53 * len, fl = len - base;
  const span = (lo, hi2, f) => pts.filter(([, q]) => A(q) >= lo * len && A(q) <= hi2 * len).map(([, q]) => f(q));
  // The fingers' width: from the little finger's edge (anywhere past the knuckles; it is the
  // shortest) to the far edge of the longest fingers' tips, short of the thumb.
  const tMin = Math.min(...span(0.55, 1, T)), tMax = Math.max(...span(0.85, 1, T)), margin = 0.15 * (tMax - tMin);
  const across = (q) => T(q) <= tMax + margin && T(q) >= tMin - margin;
  const palm = Math.max(...pts.filter(([, q]) => across(q) && A(q) >= 0.35 * len && A(q) <= 0.5 * len).map(([, q]) => P(q))); // the palm's face
  // The fingers' thickness and middle (where the hinges run), taken at their roots, where a relaxed
  // hand's fingers are still straight.
  const fp = pts.filter(([, q]) => across(q) && A(q) >= base && A(q) <= base + 0.3 * fl).map(([, q]) => P(q));
  const mid = (Math.min(...fp) + Math.max(...fp)) / 2;
  const fingers = pts.filter(([, q]) => across(q) && A(q) > base - 0.15 * fl);
  // The hinges: the knuckle, then the joints half and three quarters of the way along a finger.
  const hinge = [base, base + 0.5 * fl, base + 0.78 * fl], soft = 0.12 * fl;
  const sgn = a.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(t, 0.1)).dot(p) > 0 ? 1 : -1; // which way curls towards the palm
  const ramp = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const bend = (q0, n0, angles) => {
    const q = q0.clone(), n = n0 && n0.clone(), s0 = A(q0);
    for (let j = 2; j >= 0; j--) {
      const f = ramp((s0 - hinge[j] + soft) / (2 * soft));
      if (!f) continue;
      const turn = new THREE.Quaternion().setFromAxisAngle(t, sgn * angles[j] * f * DEG), c = a.clone().multiplyScalar(hinge[j]).addScaledVector(p, mid);
      q.sub(c).applyQuaternion(turn).add(c);
      if (n) n.applyQuaternion(turn);
    }
    return [q, n];
  };
  // The pole lies across the palm a little short of the knuckles (seen along the hinges). The three
  // joints bend together, as fingers close on a handle (the middle one most), until some length of
  // finger meets the pole, or as far as fingers bend. A finger presses a little flat against what
  // it holds: a firm grip takes it to 0.7 of its depth.
  const half = 0.7 * (Math.max(...fp) - Math.min(...fp)) / 2, R = r * k, C = [base - 0.25 * fl, Math.max(palm, mid + half) + R];
  const segs = [0.5, 0.28, 0.22].map((l) => l * fl), share = [0.35, 0.45, 0.2], most = [90, 105, 80];
  const shape = (total) => share.map((f, j) => Math.min(most[j], f * total));
  const clear = (angles) => {
    let J = [base, mid], acc = 0, near = Infinity;
    for (let j = 0; j < 3; j++) {
      acc += angles[j] * DEG;
      const d = [Math.cos(acc), Math.sin(acc)], v = [C[0] - J[0], C[1] - J[1]], s2 = Math.max(0, Math.min(segs[j], v[0] * d[0] + v[1] * d[1]));
      near = Math.min(near, Math.hypot(v[0] - s2 * d[0], v[1] - s2 * d[1]));
      J = [J[0] + segs[j] * d[0], J[1] + segs[j] * d[1]];
    }
    return near - R - half;
  };
  let total = 0;
  while (total < 270 && clear(shape(total + 2)) > 0) total += 2;
  const angles = shape(total).map(Math.round);
  for (const [i, q, n] of fingers) {
    const [b, nb] = bend(q, n, angles);
    pos.setXYZ(i, ...b.applyMatrix4(fromHand).toArray());
    if (nb) { const m = nb.transformDirection(fromHand); nor.setXYZ(i, m.x, m.y, m.z); }
  }
  pos.needsUpdate = true; if (nor) nor.needsUpdate = true;
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  S.fist = { at: a.clone().multiplyScalar(C[0]).addScaledVector(p, C[1]).addScaledVector(t, (tMin + tMax) / 2), way: t.clone(), angles };
  return S.fist;
}
// Turn a fist so the hole through it lies along `dir`, the thumb's side towards where `dir` points
// (always that way, so a hand never flips over between frames): how a curled hand takes hold of a
// pole. slack: degrees the hold may stay off it, the thing lying across the palm on a slant, as a
// shaft or tongs' reins do in a real grip.
function fistOnto(S, dir, slack = 0) {
  // First the forearm turns (the way a hand turns over, palm up to palm down); the wrist then bends
  // for what's left.
  rollHand(S, dir);
  const q = worldQuat(S.ha), way = S.fist.way.clone().applyQuaternion(q), d = dir.clone().normalize();
  const off = Math.acos(Math.max(-1, Math.min(1, way.dot(d)))), turn = off - slack * DEG;
  if (turn <= 0) return;
  const axis = way.clone().cross(d);
  if (axis.lengthSq() < 1e-12) axis.copy(new THREE.Vector3(1, 0, 0).cross(way).lengthSq() > 1e-6 ? new THREE.Vector3(1, 0, 0).cross(way) : new THREE.Vector3(0, 1, 0).cross(way));
  setWorldQuat(S.ha, new THREE.Quaternion().setFromAxisAngle(axis.normalize(), turn).multiply(q));
  spreadTwist(S);
}
// Dev aid: how close the pole comes to the body: the nearest point of the mesh to the pole's
// shaft that isn't of a hand holding it, nor of a wrist within a palm's width of a grip (the shaft
// lies against the heel of the palm), in heights, and the bone it belongs to.
export function poleClearance(M, pole, h) {
  const grips = M.rig ? ['R', 'L'].map((s) => gripOf(M.rig[s], h)) : [];
  let mesh = null;
  M.model.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const pos = mesh.geometry.attributes.position, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, bones = mesh.skeleton.bones;
  const base = pole.g.position.clone(), dir = UP.clone().applyQuaternion(pole.g.quaternion), v = new THREE.Vector3();
  let best = { d: Infinity, bone: '' };
  for (let i = 0; i < pos.count; i += 2) {
    let top = 0, bi = 0;
    for (let j = 0; j < 4; j++) if (sw.getComponent(i, j) > top) { top = sw.getComponent(i, j); bi = si.getComponent(i, j); }
    if (/Hand/.test(bones[bi].name)) continue;
    mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld);
    if (/Forearm/.test(bones[bi].name) && grips.some((g) => g.distanceTo(v) < 0.075 * h)) continue;
    const s = Math.max(0, Math.min(pole.len, v.clone().sub(base).dot(dir))), d = v.distanceTo(base.clone().addScaledVector(dir, s));
    if (d < best.d) best = { d, bone: bones[bi].name, along: s / pole.len };
  }
  return { d: +(best.d / h).toFixed(4), bone: best.bone, along: +best.along.toFixed(2) };
}

// ---- Timing -------------------------------------------------------------------------------------
// The keys with every value filled in (a cycle ends on its first key again), and the names of what
// they move.
function prepared(S) {
  if (S.ready) return S.ready;
  const keys = []; let prev = {};
  for (const k of S.keys) { prev = Object.assign({}, prev, k, { stop: !!k.stop }); keys.push(prev); }
  if (S.loop && keys[keys.length - 1].at < 1) keys.push(Object.assign({}, keys[0], { at: 1, stop: false }));
  S.ready = { keys, names: Object.keys(keys[0]).filter((n) => n !== 'at' && n !== 'stop') };
  return S.ready;
}
// Every value at phase u (0..1): a Hermite curve through the keys whose slope at each key runs from
// the key before to the one after, flat at the ends of a move that plays once and on leaving a
// stop, steep on running into one.
export function sampleScript(S, u) {
  const { keys, names } = prepared(S), n = keys.length;
  if (S.loop) u = ((u % 1) + 1) % 1;
  u = Math.min(1, Math.max(0, u));
  let i = 0;
  while (i < n - 2 && u > keys[i + 1].at) i++;
  const k0 = keys[i], k1 = keys[i + 1], dt = k1.at - k0.at, s = Math.min(1, Math.max(0, (u - k0.at) / dt));
  const before = (j) => (j > 0 ? keys[j - 1] : S.loop ? Object.assign({}, keys[n - 2], { at: keys[n - 2].at - 1 }) : null);
  const after = (j) => (j < n - 1 ? keys[j + 1] : S.loop ? Object.assign({}, keys[1], { at: keys[1].at + 1 }) : null);
  const h00 = 2 * s ** 3 - 3 * s * s + 1, h10 = s ** 3 - 2 * s * s + s, h01 = -2 * s ** 3 + 3 * s * s, h11 = s ** 3 - s * s;
  const out = { key: i };
  for (const name of names) {
    const get = (k) => (Array.isArray(k[name]) ? k[name] : [k[name]]);
    const slope = (j, k, into) => {
      const a = before(j), b = after(j);
      if (into && k.stop) return get(k).map((v, c) => (1.6 * (v - get(a)[c])) / (k.at - a.at));
      if (k.stop || !a || !b) return get(k).map(() => 0);
      return get(b).map((v, c) => (v - get(a)[c]) / (b.at - a.at));
    };
    const p0 = get(k0), p1 = get(k1), m0 = slope(i, k0, false), m1 = slope(i + 1, k1, true);
    const v = p0.map((a, c) => h00 * a + h10 * dt * m0[c] + h01 * p1[c] + h11 * dt * m1[c]);
    out[name] = Array.isArray(k0[name]) ? v : v[0];
  }
  return out;
}

// ---- Posing ---------------------------------------------------------------------------------------
// Poses villager model M (in its rest pose, with M.rig from rigOf) at phase u of move S. h: its
// height; pole: what it holds in both hands, if anything ({ g, len }). Returns where the wrists
// were sent and how far each wrist bends, for the viewer.
export function poseScript(M, S, u, h, pole) {
  const rig = M.rig, k = sampleScript(S, u), H = (a) => V3(a).multiplyScalar(h), out = { key: k.key, bend: {} };
  // The hips, moved and turned; the spine turned and bent over them, a share at each bone.
  const turn = k.turn || 0;
  if (turn) turnBone(rig.hip, turnAbout(UP, turn));
  if (k.hip) { rig.hip.position.copy(rig.hip.parent.worldToLocal(rig.hipP.clone().add(H(k.hip)))); rig.hip.updateMatrixWorld(true); }
  let facing = turn;
  [0.25, 0.35, 0.4].forEach((share, i) => {
    const tw = (k.twist || 0) * share;
    facing += tw;
    const q = turnAbout(UP, tw);
    if (k.lean) q.premultiply(turnAbout(leftOf(facing), k.lean * share));
    if (k.side) q.premultiply(turnAbout(aheadOf(facing), -k.side * share));
    turnBone(rig.spine[i], q);
  });
  // The legs: each foot where it stood or where the key steps it, the knee bending over the toes.
  for (const s of ['L', 'R']) {
    const L = rig[s], at = L.footP.clone(), yaw = k[s + 'fy'] || 0;
    if (k[s + 'f']) at.add(H(k[s + 'f']));
    ik2(L.thigh, L.calf, L.foot, at, aheadOf(turn + yaw * 0.5).addScaledVector(leftOf(turn), s === 'L' ? 0.25 : -0.25));
    setWorldQuat(L.foot, turnAbout(UP, yaw).multiply(L.footQ.clone()));
  }
  // A swing of the right arm given by its joints instead: Ra [shoulder, elbow, wrist] in degrees,
  // in the swing's plane (Rplane [yaw to the left, tilt of its top out to the right]). The upper
  // arm's pitch from level ahead, how far the elbow bends it up from there, and how far the wrist
  // cocks what's held back from where it sits in a straight wrist (hold.neutral degrees on from the
  // forearm). What's held follows in the plane, its face leading.
  let swing = null;
  if (k.Ra) {
    const A = rig.R, [yaw, tilt] = k.Rplane || [0, 0];
    const fwd = aheadOf(yaw), up = UP.clone().applyAxisAngle(fwd, tilt * DEG);
    const L1 = worldPos(A.up).distanceTo(worldPos(A.fo)), L2 = worldPos(A.fo).distanceTo(worldPos(A.ha));
    const [tu, flex, cock] = k.Ra, tf = tu + flex, th = (tf + ((M.item && M.item.neutral) || 0) + cock) * DEG;
    const way = (deg) => fwd.clone().multiplyScalar(Math.cos(deg * DEG)).addScaledVector(up, Math.sin(deg * DEG));
    const place = () => { const S = worldPos(A.up), E = S.clone().addScaledVector(way(tu), L1); return { S, E, W: E.clone().addScaledVector(way(tf), L2) }; };
    shrug(A, place().W, h); // the collarbone first: it moves the shoulder the arm hangs from
    const { S, E, W } = place();
    ik2(A.up, A.fo, A.ha, W, E.clone().sub(S.clone().add(W).multiplyScalar(0.5)));
    out.R = W;
    swing = { dir: fwd.clone().multiplyScalar(Math.cos(th)).addScaledVector(up, Math.sin(th)), face: fwd.clone().multiplyScalar(Math.sin(th)).addScaledVector(up, -Math.cos(th)) };
  }
  // The arms.
  for (const s of ['R', 'L']) {
    if (!k[s] || (s === 'L' && k.aim && pole) || (s === 'R' && swing)) continue;
    const A = rig[s], t = H(k[s]);
    shrug(A, t, h);
    ik2(A.up, A.fo, A.ha, t, V3(k[s + 'p']));
    out[s] = t;
  }
  // What the right hand holds: a hammer's handle (its face leading the swing) or a blade.
  if (swing && M.item) aimHand(rig.R, M.item, swing.dir, swing.face);
  else if (k.Rh && M.item) {
    const [p, y] = k.Rh.map((a) => a * DEG);
    const dir = new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
    const face = new THREE.Vector3(Math.sin(y) * Math.sin(p), -Math.cos(p), Math.cos(y) * Math.sin(p));
    aimHand(rig.R, M.item, dir, face);
  }
  // A pole in both hands: the right fist turned onto it, the left hand put further along it and
  // turned onto it too, the pole through the right fist.
  if (k.aim && pole) {
    const aim = V3(k.aim).normalize(), A = rig.L, hold = (S, d = aim) => (S.fist ? fistOnto(S, d, 25) : rollHand(S, d));
    hold(rig.R);
    // The left hand takes the pole `gap` along from the right, or as near that as it reaches: along
    // the pole's line, the stretch within an arm (and fist) of the left shoulder.
    const gR = gripOf(rig.R, h), S0 = worldPos(A.up), reach = 0.97 * (S0.distanceTo(worldPos(A.fo)) + worldPos(A.fo).distanceTo(worldPos(A.ha)) + 0.04 * h);
    const sMid = S0.clone().sub(gR).dot(aim), off = gR.clone().addScaledVector(aim, sMid).distanceTo(S0), half = Math.sqrt(Math.max(0, reach * reach - off * off));
    const gap = Math.min(Math.max(k.gap * h, sMid - half), sMid + half);
    const want = gR.clone().addScaledVector(aim, gap), t = want.clone();
    shrug(A, t, h);
    for (let it = 0; it < 4; it++) {
      ik2(A.up, A.fo, A.ha, t, V3(k.Lp));
      hold(A);
      t.add(want.clone().sub(gripOf(A, h)));
    }
    out.L = t; out.miss = +(gripOf(A, h).distanceTo(want) / h).toFixed(3);
    // The pole runs through both fists, whatever the left hand's last fraction of a miss: a turn of
    // a degree or two from `aim`, the fists turned onto it too.
    // (Within 12 degrees: a hand well short of the pole doesn't swing it about.)
    let way = aim;
    for (let it = 0; it < 5; it++) {
      const gL = gripOf(A, h), d = gL.clone().sub(gripOf(rig.R, h));
      if (d.length() > 0.05 * h && d.clone().normalize().dot(aim) > Math.cos(12 * DEG)) way = d.normalize();
      hold(rig.R, way); hold(A, way);
    }
    out.miss = +(gripOf(A, h).clone().sub(gripOf(rig.R, h)).cross(way).length() / h).toFixed(4);
    pole.g.position.copy(gripOf(rig.R, h)).addScaledVector(way, -(k.butt || 0.3) * h);
    pole.g.quaternion.setFromUnitVectors(UP, way);
    pole.g.updateMatrixWorld(true);
  }
  if (M.hay) M.hay.fork.visible = (k.load || 0) > 0.5;
  // Tongs in the left hand, from its grip to the work on the anvil.
  if (M.tongs && k.work) {
    const work = H(k.work);
    if (rig.L.fist) for (let it = 0; it < 2; it++) fistOnto(rig.L, work.clone().sub(gripOf(rig.L, h)), 35);
    else rollHand(rig.L, work.clone().sub(gripOf(rig.L, h)));
    placeTongs(M.tongs, gripOf(rig.L, h), work, V3(k.bar || [-1, 0, 0.3]), h);
  }
  // The head, turned to look where the key says (or straight ahead), the neck taking part.
  const head = worldPos(rig.head), want = (k.look ? H(k.look) : head.clone().add(new THREE.Vector3(0, 0, h))).sub(head).normalize();
  for (const [b, share] of [[rig.neck, 0.4], [rig.head, 1]]) {
    if (!b) continue;
    const now = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat(rig.head).multiply(rig.headQi));
    const q = new THREE.Quaternion().setFromUnitVectors(now, want), ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    turnBone(b, new THREE.Quaternion().slerp(q, share * Math.min(1, (70 * DEG) / Math.max(ang, 1e-6))));
  }
  for (const s of ['R', 'L']) out.bend[s] = Math.round(wristBend(rig[s]));
  return out;
}

// ---- Things held ----------------------------------------------------------------------------------
// A hand holding something that must stay upright (Bram's mug), its arm posed as people hold a mug,
// over whatever the clip does with it: the upper arm hanging a little forward, the forearm raised
// just as far as it lies in the model, where the mug stands up with the wrist straight, then turned
// about its length to stand it up; the wrist takes only what's left. Kept with the chest as the
// body moves. Set up in the bind pose (where the mug was made upright), used in any pose after.
export function holdSetup(M, side, up, h, bindPose, restPose) {
  bindPose();
  const rig = rigOf(M), S = rig[side];
  const lift = Math.acos(Math.max(-1, Math.min(1, worldPos(S.ha).sub(worldPos(S.fo)).normalize().y)));
  restPose();
  const chest = rig.spine[2], toChest = chest.matrixWorld.clone().invert(), out = side === 'R' ? -1 : 1;
  const sh = worldPos(S.up), L1 = sh.distanceTo(worldPos(S.fo)), L2 = worldPos(S.fo).distanceTo(worldPos(S.ha));
  const E = sh.clone().addScaledVector(new THREE.Vector3(0.12 * out, -0.97, 0.2).normalize(), L1);
  const W = E.clone().addScaledVector(new THREE.Vector3(0, Math.cos(lift), Math.sin(lift)), L2);
  return { S, up: up.clone(), chest, sh: sh.applyMatrix4(toChest), E: E.applyMatrix4(toChest), W: W.applyMatrix4(toChest), lift: lift / DEG };
}
export function holdApply(Hd) {
  const { S, chest } = Hd, at = (v) => v.clone().applyMatrix4(chest.matrixWorld);
  const sh = at(Hd.sh), E = at(Hd.E), W = at(Hd.W);
  ik2(S.up, S.fo, S.ha, W, E.clone().sub(sh.clone().add(W).multiplyScalar(0.5)));
  // The wrist straight (as the model was made), the forearm turned to stand the mug up, the
  // wrist the last of the way.
  setWorldQuat(S.ha, worldQuat(S.fo).multiply(S.rel0i.clone().invert()));
  rollHand(S, UP, Hd.up);
  const now = Hd.up.clone().applyQuaternion(worldQuat(S.ha));
  turnBone(S.ha, new THREE.Quaternion().setFromUnitVectors(now.normalize(), UP));
  spreadTwist(S);
  return Math.round(wristBend(S));
}

// A pole held in the hands: a shaft with an iron spearhead or a pitchfork's tines.
export function makePole(kind, h) {
  const g = new THREE.Group(), wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2c }), iron = new THREE.MeshLambertMaterial({ color: 0x8c8f93 });
  const len = kind === 'spear' ? 1.3 * h : 1.05 * h, r = 0.0085 * h;
  const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(r, r * 1.1, len, 8), wood, len / 2);
  if (kind === 'spear') add(new THREE.ConeGeometry(r * 2.6, 0.1 * h, 6), iron, len + 0.05 * h);
  else {
    add(new THREE.BoxGeometry(0.1 * h, r * 1.6, r * 1.6), iron, len);
    for (const x of [-0.045, 0, 0.045]) { const t = add(new THREE.CylinderGeometry(r * 0.55, r * 0.25, 0.12 * h, 5), iron, len + 0.06 * h); t.position.x = x * h; }
  }
  return { g, len };
}

// A smith's tongs for the left hand, holding a bar of hot iron on the anvil: the tongs run from the
// hand's grip to the bar's end at `work`, the bar on along `bar` (heights, the villager's frame).
export function makeTongs(h) {
  const iron = new THREE.MeshLambertMaterial({ color: 0x3e4045 }), hot = new THREE.MeshLambertMaterial({ color: 0xc0582a });
  const tongs = new THREE.Group(), r = 0.006 * h;
  for (const x of [-1, 1]) {
    // Two reins, one a little above the other, meeting at the jaws (the group's +y, length 1).
    const m = new THREE.Mesh(new THREE.BoxGeometry(r, 1, r), iron);
    m.position.set(0, 0.5, x * r * 0.9); m.castShadow = m.receiveShadow = true;
    tongs.add(m);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.016 * h, 0.016 * h, 1), hot);
  bar.castShadow = bar.receiveShadow = true;
  return { tongs, bar, parts: [tongs, bar] };
}
function placeTongs(T, grip, work, bar, h) {
  const d = work.clone().sub(grip), len = d.length();
  T.tongs.position.copy(grip); T.tongs.quaternion.setFromUnitVectors(UP, d.normalize()); T.tongs.scale.set(1, len, 1);
  const b = bar.clone().normalize(), L = 0.17 * h;
  T.bar.position.copy(work).addScaledVector(b, L / 2 - 0.01 * h); T.bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b); T.bar.scale.set(1, 1, L);
  for (const o of T.parts) o.updateMatrixWorld(true);
}

// Hay for Odo to fork: a low heap on the ground ahead (`heap`, heights), and a forkful that rides
// on the tines while a key's `load` is over a half.
export function makeHay(h, pole, heap) {
  const straw = new THREE.MeshLambertMaterial({ color: 0xc9a456 }), lumpy = (r, seed) => {
    const g = new THREE.IcosahedronGeometry(r, 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + 0.18 * Math.sin(p.getX(i) * 9.1 + seed) * Math.sin(p.getY(i) * 7.3 + seed * 2) * Math.sin(p.getZ(i) * 8.7); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    g.computeVertexNormals();
    return g;
  };
  const mound = new THREE.Mesh(lumpy(1, 1), straw);
  mound.scale.set(0.24 * h, 0.1 * h, 0.2 * h); mound.position.copy(V3(heap).multiplyScalar(h));
  const fork = new THREE.Mesh(lumpy(1, 4), straw);
  fork.scale.set(0.07 * h, 0.045 * h, 0.07 * h); fork.position.y = pole.len + 0.07 * h;
  pole.g.add(fork);
  for (const m of [mound, fork]) { m.castShadow = m.receiveShadow = true; m.updateMatrixWorld(true); }
  return { mound, fork };
}

// Tobin's model holds its hammer right up against the head, the rest of the handle sticking out
// behind his fist. To work and fight with it he holds it near the end instead: the head is cut out
// of the mesh and set further along, and the handle is made anew, a wooden shaft through the fist.
// G (bakes.mjs) gives, in the hand bone's frame and in heights: the handle's line (`through` a point
// on it, along `axis` towards the head), where along it the head begins and the old handle's end
// starts behind the fist (`head`, `tail`), how far to `slide` the head, where the new handle ends
// behind the fist (`end`) and its radius.
export function regrip(M, G, h) {
  const hand = M.model.getObjectByName(G.hand);
  M.holder.updateMatrixWorld(true);
  const inv = hand.matrixWorld.clone().invert(), sc = new THREE.Vector3();
  hand.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
  const k = h / sc.x; // the bone's own units in a height
  const ax = V3(G.axis).normalize(), at = V3(G.through).multiplyScalar(k);
  let mesh = null;
  M.model.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const geo = mesh.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, hi = mesh.skeleton.bones.indexOf(hand);
  const kind = new Int8Array(pos.count), local = new Float32Array(pos.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let j = 0; j < 4; j++) if (si.getComponent(i, j) === hi) w += sw.getComponent(i, j);
    if (w < 0.95) continue;
    mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
    const rel = v.clone().sub(at), s = rel.dot(ax) / k;
    if (s > G.head) kind[i] = 1;
    else if (s < G.tail && rel.projectOnPlane(ax).length() / k < 0.03) kind[i] = 2;
    local.set([v.x, v.y, v.z], i * 3);
  }
  // Triangles all of the head go to it; the old handle's go; any touching either go too.
  const idx = geo.index.array, keep = [], head = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = kind[idx[t]], b = kind[idx[t + 1]], c = kind[idx[t + 2]];
    if (a === 1 && b === 1 && c === 1) head.push(idx[t], idx[t + 1], idx[t + 2]);
    else if (!a && !b && !c) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  geo.setIndex(keep);
  // The head, a mesh of its own on the hand bone, its points in the bone's frame.
  const used = [...new Set(head)], remap = new Map(used.map((o, n) => [o, n]));
  const hg = new THREE.BufferGeometry(), P = new Float32Array(used.length * 3), UV = new Float32Array(used.length * 2);
  used.forEach((o, n) => { P.set(local.subarray(o * 3, o * 3 + 3), n * 3); if (geo.attributes.uv) UV.set([geo.attributes.uv.getX(o), geo.attributes.uv.getY(o)], n * 2); });
  hg.setAttribute('position', new THREE.BufferAttribute(P, 3));
  if (geo.attributes.uv) hg.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  hg.setIndex(head.map((o) => remap.get(o)));
  hg.computeVertexNormals();
  const hm = new THREE.Mesh(hg, mesh.material);
  hm.position.copy(ax).multiplyScalar(G.slide * k);
  // The handle, from behind the fist to inside the moved head.
  const from = G.end * k, to = (G.head + G.slide + 0.02) * k, shaft = new THREE.Mesh(new THREE.CylinderGeometry(G.r * k, G.r * k * 1.1, to - from, 8), new THREE.MeshLambertMaterial({ color: G.wood || 0x4f3524 }));
  shaft.quaternion.setFromUnitVectors(UP, ax);
  shaft.position.copy(at).addScaledVector(ax, (from + to) / 2);
  for (const m of [hm, shaft]) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; hand.add(m); }
  M.holder.updateMatrixWorld(true);
  return { head: hm, shaft };
}
