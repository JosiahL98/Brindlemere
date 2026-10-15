// Runs inside headless Chrome (driven by tools/bake-mesh.js). Loads rigged, animated GLB models
// with three.js and renders them into the game's sprite format: 8 rotations per frame, an
// orthographic camera tilted down like renderSprite's, the same light direction, 4x
// supersampling, then palette quantisation with ordered dithering and darkened silhouettes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SCRIPTS, rigOf, poseScript, sampleScript, makePole, makeTongs, makeHay, gripOf, curlHand, poleClearance, regrip, turnBone, holdSetup, holdApply } from './body.mjs';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LIGHT_VIEW = new THREE.Vector3(-0.6, 0.62, 0.62).normalize(); // as in js/sdf.js

let renderer;
const scene = new THREE.Scene();
const ambient = new THREE.AmbientLight(0xffffff, 1);
const key = new THREE.DirectionalLight(0xffffff, 1);
const fill = new THREE.DirectionalLight(0xffffff, 1);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -60, right: 60, top: 90, bottom: -30, near: 1, far: 400 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.04;
scene.add(ambient, key, key.target, fill, fill.target);

function ensureRenderer(w, h) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    renderer.localClippingEnabled = true;
    document.body.appendChild(renderer.domElement);
  }
  renderer.setSize(w, h, false);
}

async function loadModel(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    o.frustumCulled = false;
    const map = o.material.map;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    o.material = new THREE.MeshLambertMaterial({ map });
  });
  // Tripo exports face +x; the game's sprites face +z at rotation 0.
  const holder = new THREE.Group();
  holder.rotation.y = -Math.PI / 2;
  holder.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const clip = gltf.animations[0] || null;
  if (clip) mixer.clipAction(clip).play();
  return { holder, model, mixer, clip };
}
function bones(model) { const b = []; model.traverse((o) => { if (o.isBone) b.push(o); }); return b; }
function poseAt(M, t) { M.mixer.setTime(t); M.holder.updateMatrixWorld(true); }
function worldBox(M) {
  const box = new THREE.Box3();
  M.model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.computeBoundingBox();
    box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  return box;
}
// Length of one loop of a cyclic clip (a walk often holds two or more strides).
function cyclePeriod(M) {
  const bs = bones(M.model), dur = M.clip.duration, dt = 1 / 60;
  const snap = () => bs.map((b) => b.quaternion.clone());
  poseAt(M, 0); const q0 = snap();
  const dist = (t) => { poseAt(M, t); return bs.reduce((s, b, i) => s + (1 - Math.abs(b.quaternion.dot(q0[i]))), 0); };
  const d = []; for (let t = 0; t <= dur + 1e-6; t += dt) d.push(dist(t));
  const peak = Math.max(...d);
  let rose = false;
  for (let i = 1; i < d.length - 1; i++) {
    if (d[i] > peak * 0.5) rose = true;
    if (rose && d[i] < peak * 0.08 && d[i] <= d[i - 1] && d[i] <= d[i + 1]) return i * dt;
  }
  return dur;
}

// Nearest palette colour by perceptual (CIELAB) distance, so dim skin stays skin-coloured
// instead of snapping to a greyish olive. Never index 0: the baked data uses it for transparency.
function lab(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
let palLab = null;
// Fire is for flames and the ghost ramp for spectres; real materials never snap to them.
const SKIP_RAMPS = new Set(['FIRE', 'GHOST'].map((n) => RAMP_NAMES.indexOf(n)));
const SATURATE = 1.35;
const nearCache = new Map();
// mode 1: a first-person sleeve, which takes only the STONE ramp (the game recolours it to the
// tunic worn); mode 2: anything else in a first-person sprite, which never takes STONE.
const STONE_RAMP = RAMP_NAMES.indexOf('STONE');
function nearest(r, g, b, mode = 0) {
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  const k = (((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2)) * 3 + mode;
  let v = nearCache.get(k);
  if (v !== undefined) return v;
  if (!palLab) palLab = Array.from({ length: 256 }, (_, i) => lab(PAL[i * 3], PAL[i * 3 + 1], PAL[i * 3 + 2]));
  // The palette's ramps are saturated (as Daggerfall's were), so realistic soft shadows on skin
  // would land on greys and khaki. Push the colour out a little, then match with hue errors
  // weighted up (a CIE94-style distance), so a shadow keeps its hue even if it lands a shade off.
  const q = lab(r, g, b);
  const boost = 1 + (SATURATE - 1) * Math.max(0, Math.min(1, (75 - q[0]) / 35)); // shadows only
  q[1] *= boost; q[2] *= boost;
  const C1 = Math.hypot(q[1], q[2]), sc = 1 + 0.045 * C1, sh = 1 + 0.015 * C1;
  let best = 1, bd = Infinity;
  for (let i = 1; i < 256; i++) {
    if (SKIP_RAMPS.has(i >> 4) || (mode === 1 && i >> 4 !== STONE_RAMP) || (mode === 2 && i >> 4 === STONE_RAMP)) continue;
    const p = palLab[i], dL = q[0] - p[0], dC = C1 - Math.hypot(p[1], p[2]), da = q[1] - p[1], db = q[2] - p[2];
    const dH2 = Math.max(0, da * da + db * db - dC * dC);
    const d = dL * dL + (dC / sc) ** 2 + 2 * dH2 / (sh * sh);
    if (d < bd) { bd = d; best = i; }
  }
  nearCache.set(k, best);
  return best;
}

// Render one view. u/v are the camera's right/up axes in world units, as in renderSprite.
function shoot(M, yaw, pitch, res, ss, frame, cfg) {
  const ct = Math.cos(yaw), st = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const m0 = new THREE.Vector3(ct, 0, st), m1 = new THREE.Vector3(st * sp, cp, -ct * sp), m2 = new THREE.Vector3(-st * cp, sp, ct * cp);
  const { left, right, bottom, top } = frame;
  const W = Math.round((right - left) * res) * ss, H = Math.round((top - bottom) * res) * ss;
  ensureRenderer(W, H);
  const cam = new THREE.OrthographicCamera(left, right, top, bottom, 1, 1000);
  cam.position.copy(m2).multiplyScalar(500);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  const L = m0.clone().multiplyScalar(LIGHT_VIEW.x).add(m1.clone().multiplyScalar(LIGHT_VIEW.y)).add(m2.clone().multiplyScalar(LIGHT_VIEW.z));
  key.position.copy(L).multiplyScalar(200);
  fill.position.copy(m2).multiplyScalar(200);
  ambient.intensity = cfg.ambient; key.intensity = cfg.key; fill.intensity = cfg.fill;
  scene.add(M.holder, ...(M.extras || []));
  renderer.render(scene, cam);
  scene.remove(M.holder, ...(M.extras || []));
  const gl = renderer.getContext(), px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);

  // Downsample: a pixel is solid when at least half its samples are covered.
  const w = W / ss, h = H / ss, n = ss * ss;
  const col = new Float32Array(w * h * 3), solid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = 0, r = 0, g = 0, b = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const sy = H - 1 - (y * ss + j), o = (sy * W + x * ss + i) * 4; // GL rows run bottom-up
      if (px[o + 3] > 127) { c++; r += px[o]; g += px[o + 1]; b += px[o + 2]; }
    }
    if (c * 2 >= n) { const q = (y * w + x) * 3; col[q] = r / c; col[q + 1] = g / c; col[q + 2] = b / c; solid[y * w + x] = 1; }
  }
  // Quantise: darken the silhouette, dither, snap to the palette. Crop to the solid pixels.
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  const idx = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!solid[i]) continue;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !solid[i - 1] || !solid[i + 1] || !solid[i - w] || !solid[i + w];
    const k = edge ? cfg.edge : 1, dith = (BAYER4[(x & 3) + ((y & 3) << 2)] / 16 - 0.47) * cfg.dither;
    idx[i] = nearest(col[i * 3] * k + dith, col[i * 3 + 1] * k + dith, col[i * 3 + 2] * k + dith);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { w: 1, h: 1, ax: 0, ay: 0, data: [0] };
  if (cfg.raw) cfg.raw.push({ w, h, rgb: Array.from(col, (v) => Math.round(v)), solid: Array.from(solid) });
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = new Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out[y * cw + x] = idx[(y + y0) * w + x + x0];
  // Pixel of the world origin: u = 0 at -left*res, v = 0 at top*res from the top.
  return { w: cw, h: ch, ax: Math.round(-left * res) - x0, ay: Math.round(top * res) - y0, data: out };
}

// ---- Held poles ------------------------------------------------------------------------------
// Scripted moves (tools/bake/body.mjs) pose the whole body and place any pole themselves. Otherwise
// a pole (Rolf's spear, Odo's pitchfork) stands upright in the right hand, butt on the ground, or
// for a captured move lies along a given way through the right grip.
const boneNamed = (M, n) => M.model.getObjectByName(n);
const worldPos = (o) => o.getWorldPosition(new THREE.Vector3());
function placePole(M, P, h, axis) {
  const R = gripOf({ ha: boneNamed(M, 'R_Hand'), fo: boneNamed(M, 'R_Forearm') }, h);
  const butt = axis ? R.clone().addScaledVector(axis, -0.32 * h) : new THREE.Vector3(R.x, 0.01 * h, R.z);
  P.g.position.copy(butt);
  P.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis || new THREE.Vector3(0, 1, 0));
  P.g.updateMatrixWorld(true);
}

// ---- Motion capture ---------------------------------------------------------------------------
// Moves captured from real people (Mixamo, assets/adobemokap/<name>.fbx) played on the Tripo
// villagers. Each mapped bone is first turned to point the way the Mixamo bone does at rest (a
// T-pose against Tripo's A-pose), then given the same turn from rest, in world space, as the
// captured bone has at that moment. The hips' movement is scaled to the villager's size.
const MIXAMO = {
  Hips: 'Hip', Spine: 'Waist', Spine1: 'Spine01', Spine2: 'Spine02', Neck: 'NeckTwist01', Head: 'Head',
  LeftShoulder: 'L_Clavicle', LeftArm: 'L_Upperarm', LeftForeArm: 'L_Forearm', LeftHand: 'L_Hand',
  RightShoulder: 'R_Clavicle', RightArm: 'R_Upperarm', RightForeArm: 'R_Forearm', RightHand: 'R_Hand',
  LeftUpLeg: 'L_Thigh', LeftLeg: 'L_Calf', LeftFoot: 'L_Foot', LeftToeBase: 'L_ToeBase',
  RightUpLeg: 'R_Thigh', RightLeg: 'R_Calf', RightFoot: 'R_Foot', RightToeBase: 'R_ToeBase',
};
// The next bone along from each, which gives its direction (none: it turns like its parent).
const MIXAMO_NEXT = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand', LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase' };
const INHERIT = { Head: 'Neck', LeftHand: 'LeftForeArm', RightHand: 'RightForeArm', LeftToeBase: 'LeftFoot', RightToeBase: 'RightFoot' };
const mocapCache = new Map();
async function loadMocap(name) {
  if (mocapCache.has(name)) return mocapCache.get(name);
  const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
  const obj = await new FBXLoader().loadAsync(`/assets/adobemokap/${encodeURIComponent(name)}.fbx`);
  const clip = obj.animations[0];
  if (!clip || !clip.tracks.length) throw new Error(`${name}.fbx has no animation in it`);
  const bone = (n) => obj.getObjectByName('mixamorig' + n);
  // The rest (bind) pose, before the clip takes over the bones.
  obj.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
  obj.updateMatrixWorld(true);
  const rest = {};
  obj.traverse((o) => { if (o.isBone) rest[o.name.replace('mixamorig', '')] = { q: o.getWorldQuaternion(new THREE.Quaternion()), p: o.getWorldPosition(new THREE.Vector3()) }; });
  const mixer = new THREE.AnimationMixer(obj);
  mixer.clipAction(clip).play();
  const D = { name, obj, clip, mixer, bone, rest, duration: clip.duration };
  mocapCache.set(name, D);
  return D;
}
function mocapAt(D, t) { D.mixer.setTime(Math.max(0, Math.min(t, D.duration - 1e-4))); D.obj.updateMatrixWorld(true); }
// How each of a villager's bones lines up with the capture's, worked out once.
function retargetSetup(M, D) {
  bindPose(M);
  const T = {}, wp = (o) => o.getWorldPosition(new THREE.Vector3());
  for (const [mn, tn] of Object.entries(MIXAMO)) {
    const tb = M.model.getObjectByName(tn);
    if (!tb || !D.rest[mn]) continue;
    const e = { tb, q0: tb.getWorldQuaternion(new THREE.Quaternion()), A: null };
    const sn = MIXAMO_NEXT[mn], tn2 = sn && MIXAMO[sn], tc = tn2 && M.model.getObjectByName(tn2);
    if (tc && D.rest[sn]) e.A = new THREE.Quaternion().setFromUnitVectors(wp(tc).sub(wp(tb)).normalize(), D.rest[sn].p.clone().sub(D.rest[mn].p).normalize());
    T[mn] = e;
  }
  for (const [c, p] of Object.entries(INHERIT)) if (T[c] && !T[c].A) T[c].A = T[p] && T[p].A ? T[p].A.clone() : new THREE.Quaternion();
  for (const e of Object.values(T)) if (!e.A) e.A = new THREE.Quaternion();
  // The hips: where they rest, and how far the capture's hips are off the ground in villager terms.
  const hip = M.model.getObjectByName('Hip');
  const ground = Math.min(...['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'].filter((n) => D.rest[n]).map((n) => D.rest[n].p.y));
  return Object.assign(T, { hipRest: wp(hip), hipScale: (wp(hip).y - worldBox(M).min.y) / (D.rest.Hips.p.y - ground) });
}
function retarget(M, D, T, t) {
  mocapAt(D, t);
  bindPose(M);
  for (const mn of Object.keys(MIXAMO)) {
    const e = T[mn];
    if (!e) continue;
    const qt = D.bone(mn).getWorldQuaternion(new THREE.Quaternion()).multiply(D.rest[mn].q.clone().invert()).multiply(e.A).multiply(e.q0);
    e.tb.quaternion.copy(e.tb.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qt));
    e.tb.updateMatrixWorld(true);
  }
  // The hips move as the capture's do, scaled.
  const hip = T.Hips && T.Hips.tb;
  if (hip) {
    const d = D.bone('Hips').getWorldPosition(new THREE.Vector3()).sub(D.rest.Hips.p).multiplyScalar(T.hipScale);
    hip.position.copy(hip.parent.worldToLocal(T.hipRest.clone().add(d)));
    hip.updateMatrixWorld(true);
  }
  M.holder.updateMatrixWorld(true);
}

// The first-person arm from a capture: the camera at the captured body's eyes (following the head
// but always looking straight ahead, as the player's view does), and the right arm read off it in
// camera space and game units: shoulder, elbow, wrist, the fist's middle, which way the palm
// faces (from the finger bones) and the grip, which runs from the little finger to the index
// finger, tipped a little towards the fingertips, the way a handle crosses a closed fist.
const EYE_HEIGHT = 50; // the player's eye height in game units
// view: where the camera sits against the real eyes, as first-person games do to keep the arms in
// sight: drop and back in centimetres, pitch in degrees looking down.
function mocapArm(D, t, view = {}) {
  if (!D.eye) {
    // Eyes: between the head bone and the top of the head, a little in front.
    const h = D.rest.Head.p, top = D.rest.HeadTop_End ? D.rest.HeadTop_End.p : h.clone().add(new THREE.Vector3(0, 18, 0));
    const ground = Math.min(...['LeftToeBase', 'RightToeBase'].filter((n) => D.rest[n]).map((n) => D.rest[n].p.y), 0);
    D.eyeOffset = top.clone().sub(h).multiplyScalar(0.45).add(new THREE.Vector3(0, 0, 0.06 * (top.y - ground)));
    D.k = EYE_HEIGHT / (h.y + D.eyeOffset.y - ground);
    D.eye = true;
  }
  mocapAt(D, t);
  const eye = D.bone('Head').getWorldPosition(new THREE.Vector3()).add(D.eyeOffset).add(new THREE.Vector3(0, -(view.drop || 0), -(view.back || 0)));
  // Facing +z, the body's right is -x: camera space is the capture turned half round, scaled, and
  // tipped for a camera looking down.
  const th = (view.pitch || 0) * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
  const cam = (n) => { const p = D.bone(n).getWorldPosition(new THREE.Vector3()).sub(eye).multiplyScalar(D.k), y = p.y, z = -p.z; return new THREE.Vector3(-p.x, y * c - z * sn, y * sn + z * c); };
  const S = cam('RightArm'), E = cam('RightForeArm'), W = cam('RightHand'), I = cam('RightHandIndex1'), Mi = cam('RightHandMiddle1'), Pi = cam('RightHandPinky1');
  const f = Mi.clone().sub(W).normalize(), ip = I.clone().sub(Pi).normalize(); // directions turn with the camera too
  const palm = ip.clone().cross(f).normalize();
  const hand = W.clone().lerp(Mi, 0.7).addScaledVector(palm, 0.8);
  const weapon = ip.clone().multiplyScalar(Math.cos(0.26)).addScaledVector(f, Math.sin(0.26)).normalize();
  const arr = (v) => v.toArray();
  return { shoulder: arr(S), elbow: arr(E), hand: arr(hand), fore: arr(W.clone().sub(E).normalize()), palm: arr(palm), weapon: arr(weapon) };
}
// A captured attack's frames for the game's swing: phase 0 is the guard at `start`, the blow
// lands at phase 0.42 (the clip's `impact`, or when the fist moves fastest) and the swing is over
// at phase 1.15 (`end`). Times in seconds of the clip.
function mocapImpact(D, mv) {
  if (mv.impact != null) return mv.impact;
  let best = mv.start, fast = -1, prev = null;
  for (let t = mv.start; t <= mv.end; t += 1 / 60) {
    const h = V3(mocapArm(D, t, mv.view).hand);
    if (prev && h.distanceTo(prev) > fast) { fast = h.distanceTo(prev); best = t; }
    prev = h;
  }
  return best;
}
async function mocapMove(mv) {
  const D = await loadMocap(mv.mocap);
  const m = Object.assign({ start: 0, end: D.duration }, mv);
  m.impact = mocapImpact(D, m);
  m.at = (p) => (p <= 0.42 ? m.start + (m.impact - m.start) * Math.max(0, p) / 0.42 : m.impact + (m.end - m.impact) * Math.min(1, (p - 0.42) / 0.73));
  m.view = mv.view || {};
  m.pose = (p) => mocapArm(D, m.at(p), m.view);
  m.D = D;
  return m;
}

// ---- Animals ----------------------------------------------------------------------------------
// Tripo only animates a creature's walk. Its other moves are posed here over the rig's standing
// pose, moving the whole body: breathing at rest, a crouch and lunge, a flinch, and rolling over
// dead (a crab onto its back) with blood spreading beneath. The lowest point stays on the ground.
function bindPose(M) { M.model.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); }); M.holder.updateMatrixWorld(true); }
const easeIn = (t) => t * t;
// Values from a table spread evenly over the move, read at phase u (0..1).
const table = (vals, u) => { const x = Math.min(1, Math.max(0, u)) * (vals.length - 1), i = Math.min(vals.length - 2, Math.floor(x)); return vals[i] + (vals[i + 1] - vals[i]) * (x - i); };
function beastPose(M, kind, u, h, base, cfg) {
  M.holder.position.copy(base.p); M.holder.quaternion.copy(base.q);
  bindPose(M);
  const head = M.model.getObjectByName('tripoHead_0'), X = new THREE.Vector3(1, 0, 0);
  const tilt = (a) => M.holder.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(X, a));
  let headDip = 0, blood = 0;
  if (kind === 'rest') {
    const b = Math.sin(u * Math.PI * 2);
    M.holder.position.y += 0.012 * h * b; headDip = 0.05 * b;
  } else if (kind === 'lunge') {
    const k = table([0, 0.35, 1, 1, 0.5, 0], u), crouch = table([0, 1, 0, 0, 0, 0], u);
    M.holder.position.z += 0.32 * h * k - 0.1 * h * crouch;
    tilt(0.12 * k - 0.06 * crouch); headDip = 0.3 * k;
  } else if (kind === 'flinch') {
    const k = table([1, 0.55, 0], u);
    M.holder.position.z -= 0.16 * h * k; tilt(-0.2 * k); headDip = -0.3 * k;
  } else if (kind === 'die') {
    const e = easeIn(Math.min(1, u / 0.6));
    M.holder.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (cfg.flip ? Math.PI : 1.45) * e));
    blood = Math.max(0, (u - 0.55) / 0.45);
  }
  M.holder.updateMatrixWorld(true);
  if (head && headDip) turnBone(head, new THREE.Quaternion().setFromAxisAngle(X, headDip));
  // Back down onto the ground.
  M.holder.position.y -= worldBox(M).min.y;
  M.holder.updateMatrixWorld(true);
  if (!M.pool) {
    M.pool = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshLambertMaterial({ color: 0x5a0d0d }));
    M.pool.rotation.x = -Math.PI / 2; M.pool.receiveShadow = true;
  }
  M.extras = blood > 0 ? [M.pool] : [];
  if (blood > 0) { const c = worldBox(M).getCenter(new THREE.Vector3()); M.pool.position.set(c.x, 0.05, c.z); M.pool.scale.set(0.5 * h * blood, 0.35 * h * blood, 1); M.pool.updateMatrixWorld(true); }
}

// One of a villager's (or an animal's) actions, ready to pose: the model for it, scaled to the
// villager's height (scale.value, shared across actions, comes from the first one loaded) and
// stood at the origin, any pole they hold, and how long the move takes.
async function loadVillager(cfg, A, scale) {
  const script = A.clip.startsWith('@') ? SCRIPTS[A.clip.slice(1)] : null, beast = A.clip.startsWith('!') ? A.clip.slice(1) : null;
  const mocap = A.clip.startsWith('~') ? await loadMocap(A.clip.slice(1)) : null;
  const M = await loadModel(`/assets/tripo/${cfg.name}/anim-${script || mocap ? 'idle' : beast ? 'walk' : A.clip}.glb`);
  const pole = cfg.prop ? makePole(cfg.prop, cfg.height) : null;
  if (pole) M.extras = [pole.g];
  const rest = () => { poseAt(M, 0); if (beast) bindPose(M); };
  rest();
  if (scale.value == null) { const b = worldBox(M); scale.value = cfg.height / (b.max.y - b.min.y); }
  M.holder.scale.setScalar(scale.value);
  rest();
  const b0 = worldBox(M), c = b0.getCenter(new THREE.Vector3());
  M.holder.position.set(-c.x, -b0.min.y, -c.z);
  const base = { p: M.holder.position.clone(), q: M.holder.quaternion.clone() };
  // The pose scripted moves start from. (Re-posing the clip at the same time won't do: the mixer
  // only writes a bone whose value has changed, so a script's turns would pile up frame on frame.)
  M.holder.updateMatrixWorld(true);
  const rest0 = bones(M.model).map((b) => [b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  M.rest = () => { for (const [b, p, q, sc] of rest0) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(sc); } M.holder.updateMatrixWorld(true); };
  if (script) {
    // What the move needs to know of the rig, and what the right hand holds (bakes.mjs).
    M.rig = rigOf(M);
    if (cfg.regrip) M.hammer = regrip(M, cfg.regrip, cfg.height);
    M.item = cfg.hold || null;
    // Hands that hold a pole or tongs close round them (their fingers curled in the mesh).
    if (pole && script.keys[0].aim) for (const s of ['R', 'L']) curlHand(M, M.rig[s], s, cfg.height, 0.0095);
    if (script.tongs) { M.tongs = makeTongs(cfg.height); M.extras = (M.extras || []).concat(M.tongs.parts); curlHand(M, M.rig.L, 'L', cfg.height, 0.008); }
    if (script.hay && pole) { M.hay = makeHay(cfg.height, pole, script.hay); M.extras = (M.extras || []).concat(M.hay.mound); }
  }
  // A strike uses the first swing of a preset that may repeat it several times.
  const period = mocap ? mocap.duration : script ? script.period : beast ? { rest: 2, lunge: 0.6, flinch: 0.4, die: 0.9 }[beast] : A.cycle || A.once ? cyclePeriod(M) : M.clip.duration;
  const T = mocap ? retargetSetup(M, mocap) : null;
  // A hand holding something that should stay upright (Bram's mug): which way was up in it as
  // the model was made (its bind pose).
  let upright = null;
  if (cfg.upright) {
    bindPose(M);
    const hb = boneNamed(M, cfg.upright);
    upright = { bone: hb, up: new THREE.Vector3(0, 1, 0).applyQuaternion(hb.getWorldQuaternion(new THREE.Quaternion()).invert()) };
    if (mocap) bindPose(M); else if (script) M.rest(); else rest();
    // The arm holding it posed as people hold a mug (body.mjs), not left to the clip.
    if (!mocap && !script && !beast) upright.hold = holdSetup(M, cfg.upright[0], upright.up, cfg.height, () => bindPose(M), rest);
  }
  return { M, pole, base, period, script, beast, mocap, T, A, cfg, upright };
}
// Poses it at phase u (0..1 through the move); returns the IK targets of a scripted move.
function poseVillager(V, u) {
  const { M, pole, base, period, script, beast, mocap, T, A, cfg, upright } = V;
  let targets = null;
  if (mocap) retarget(M, mocap, T, u * period);
  else if (script) { M.rest(); targets = poseScript(M, script, u, cfg.height, pole); }
  else if (beast) beastPose(M, beast, u, cfg.height, base, cfg);
  else poseAt(M, A.once ? u * period * 0.92 : u * period);
  if (upright && upright.hold) { const bend = holdApply(upright.hold); M.holder.updateMatrixWorld(true); targets = { bend: { [cfg.upright[0]]: bend } }; }
  else if (upright) {
    // Turn the hand back so what it holds stands up again.
    const now = upright.up.clone().applyQuaternion(upright.bone.getWorldQuaternion(new THREE.Quaternion()));
    turnBone(upright.bone, new THREE.Quaternion().setFromUnitVectors(now.normalize(), new THREE.Vector3(0, 1, 0)));
    M.holder.updateMatrixWorld(true);
  }
  if (pole && mocap) {
    // A captured stab, with a pole in place of the knife: the shaft stays aimed ahead (tipped a
    // little down) and leans a quarter of the way with the forearm, while the arm drives it.
    const R = worldPos(boneNamed(M, 'R_Hand')), fore = R.clone().sub(worldPos(boneNamed(M, 'R_Forearm'))).normalize();
    placePole(M, pole, cfg.height, new THREE.Vector3(0, -0.08, 1).normalize().multiplyScalar(0.75).addScaledVector(fore, 0.25).normalize());
  } else if (pole && !script) placePole(M, pole, cfg.height, null);
  return targets;
}
// The phase of each baked frame of an action.
const framePhase = (A, f) => (A.once ? f / (A.frames - 1) : f / A.frames);

window.bake = async (cfg) => {
  const pitch = cfg.pitchDeg * Math.PI / 180;
  const out = { actions: {}, sprites: [], height: cfg.height };
  const scale = { value: null };
  for (const A of cfg.actions) {
    const V = await loadVillager(cfg, A, scale), { M, period, script, beast } = V;
    // A strike plays once, quicker than the preset, with its blow landing a little past halfway.
    const meta = A.once
      ? { frames: A.frames, fps: +(A.frames / Math.min(period, 0.8)).toFixed(3), loop: false, hit: Math.floor(A.frames * 0.55), clip: A.clip, period: +period.toFixed(3) }
      : { frames: A.frames, fps: +(A.frames / period * A.speed).toFixed(3), loop: true, clip: A.clip, period: +period.toFixed(3) };
    if (A.cycle && !script && !beast) {
      // Distance covered per loop: each foot sweeps back one step length while planted.
      const foot = M.model.getObjectByName(cfg.foot || 'L_Foot');
      let lo = Infinity, hi = -Infinity;
      for (let t = 0; t < period; t += 1 / 60) { poseAt(M, t); const p = foot.getWorldPosition(new THREE.Vector3()); lo = Math.min(lo, p.z); hi = Math.max(hi, p.z); }
      meta.travel = +(2 * (hi - lo)).toFixed(2);
    }
    out.actions[A.id] = meta;
    const R = cfg.height * (cfg.wide || 0.45); // animals are long, and poles stick out: a wider frame
    const frame = { left: -R, right: R, bottom: -cfg.height * 0.15, top: cfg.height * (cfg.top || 1.12) };
    for (let f = 0; f < A.frames; f++) {
      poseVillager(V, framePhase(A, f));
      for (let rot = 0; rot < 8; rot++) {
        const s = shoot(M, rot * Math.PI / 4, pitch, cfg.res, cfg.ss, frame, cfg.light);
        out.sprites.push(Object.assign({ action: A.id, frame: f, rot }, s));
      }
    }
    if (A.id === 'idle' && cfg.portrait) {
      poseAt(M, 0);
      const head = M.model.getObjectByName('Head').getWorldPosition(new THREE.Vector3());
      const P = cfg.portrait, py = P.pitchDeg * Math.PI / 180;
      const v = head.y * Math.cos(py) - head.z * Math.sin(py) * Math.cos(P.yaw) + head.x * Math.sin(P.yaw) * Math.sin(py);
      const pf = { left: -P.halfWidth, right: P.halfWidth, bottom: v - P.below, top: v + P.above };
      if (cfg.debugRaw) { cfg.light.raw = []; out.portrait = shoot(M, P.yaw, py, P.res, cfg.ss, pf, cfg.light); out.portraitRaw = cfg.light.raw[0]; delete cfg.light.raw; }
      else out.portrait = shoot(M, P.yaw, py, P.res, cfg.ss, pf, cfg.light);
    }
  }
  return out;
};
window.bakeReady = true;
// Dev aid: a model's bones, and which bones the vertices farthest from the body (a held spear or
// hammer) are skinned to.
window.boneInfo = async (url) => {
  const M = await loadModel(url);
  poseAt(M, 0);
  const names = bones(M.model).map((b) => b.name);
  const far = [];
  M.model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position, si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 7) {
      o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld);
      far.push([v.y, v.x, v.z, [0, 1, 2, 3].map((k) => sw.getComponent(i, k) > 0.05 ? `${o.skeleton.bones[si.getComponent(i, k)].name}:${sw.getComponent(i, k).toFixed(2)}` : '').filter(Boolean).join(' ')]);
    }
  });
  far.sort((a, b) => b[0] - a[0]);
  return { names, top: far.slice(0, 12).map((f) => f.map((x) => (typeof x === 'number' ? +x.toFixed(2) : x))) };
};

// ---- First-person arm and weapons ----------------------------------------------------------
// Rendered with a perspective camera matching the game's (90 degree horizontal field of view on
// a 320x200 frame), each arm-and-weapon model posed rigidly in camera space for every frame.
async function loadStatic(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  const pts = [];
  // Two cutting planes, moved by placeFused: where the forearm ends, and the wrist.
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6), clip2 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6), clip3 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const map = o.material.map;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    o.material = new THREE.MeshLambertMaterial({ map, clippingPlanes: [clip, clip2, clip3] });
    const pos = o.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
  });
  const holder = new THREE.Group();
  holder.add(model);
  return { holder, model, pts, clip, clip2, clip3 };
}
const avg = (ps) => ps.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, ps.length));
// Principal axes of a point cloud (Tripo poses props diagonally, so the bounding box won't do).
function principal(pts) {
  const c = avg(pts), m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] += d[i] * d[j];
  }
  const mul = (v) => new THREE.Vector3(m[0] * v.x + m[1] * v.y + m[2] * v.z, m[3] * v.x + m[4] * v.y + m[5] * v.z, m[6] * v.x + m[7] * v.y + m[8] * v.z);
  const power = (v, skip) => { for (let i = 0; i < 60; i++) { v = mul(v); if (skip) v.sub(skip.clone().multiplyScalar(v.dot(skip))); v.normalize(); } return v; };
  const a1 = power(new THREE.Vector3(0.3, 1, 0.2));
  const a2 = power(new THREE.Vector3(1, 0.1, 0.4).sub(a1.clone().multiplyScalar(0.5)), a1);
  return { c, a1, a2 };
}
// Rotation taking unit vector `from` to `to`, then turning about `to` so that `side` (a model
// direction roughly perpendicular to `from`) lines up as well as it can with `sideTo`.
function aim(from, to, side, sideTo) {
  const q = new THREE.Quaternion().setFromUnitVectors(from, to);
  if (side && sideTo) {
    const s = side.clone().applyQuaternion(q).projectOnPlane(to).normalize();
    const t = sideTo.clone().projectOnPlane(to).normalize();
    if (s.lengthSq() > 0.5 && t.lengthSq() > 0.5) {
      const ang = Math.atan2(s.clone().cross(t).dot(to), s.dot(t));
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(to, ang));
    }
  }
  return q;
}
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
// A model of the arm already holding its weapon (or an empty fist), posed rigidly: its forearm
// (elbow end to fist centre, both read off the model) laid along the frame's forearm direction,
// the fist at the frame's hand position, and the palm (a direction in the model) turned to face
// the frame's palm direction. Frames come from tools/bake-viewmodel.js's arm kinematics.
function placeFused(M, F, fr, cfg) {
  const e = V3(F.elbow), h = V3(F.hand);
  const fm = h.clone().sub(e).normalize(), pm = V3(F.palm).projectOnPlane(fm).normalize();
  const A = V3(fr.fore).normalize(), P = V3(fr.palm).projectOnPlane(A).normalize(), H = V3(fr.hand);
  const q = aim(fm, A, pm, P), k = F.k;
  M.holder.quaternion.copy(q);
  M.holder.scale.setScalar(k);
  M.holder.position.copy(H).sub(h.clone().multiplyScalar(k).applyQuaternion(q));
  M.holder.updateMatrixWorld(true);
  // Keep the model's forearm up to 80% of the way to its elbow (the open sleeve end); a plain
  // linen sleeve carries on from there to the arm's elbow and up the upper arm to the shoulder.
  const cut = h.distanceTo(e) * k * 0.8;
  M.clip.normal.copy(A);
  M.clip.constant = -H.dot(A) + cut;
  const C = H.clone().sub(A.clone().multiplyScalar(cut - 0.3)), E = V3(fr.elbow), S = V3(fr.shoulder || cfg.shoulder);
  const tube = (mesh, a, b, r0, r1) => {
    const d = b.clone().sub(a), l = d.length();
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    mesh.scale.set(r0, l, r0);
    mesh.userData.r1 = r1;
  };
  tube(M.sleeves[0], C, E, M.sleeveR * k * 0.85, 0);
  M.sleeves[1].position.copy(E); M.sleeves[1].scale.setScalar(M.sleeveR * k * 0.95);
  tube(M.sleeves[2], E, S, M.sleeveR * k, 0);
  // The wrist doesn't bend: the fist is a second copy of the model, the same way round as the
  // forearm, cut where the forearm copy is (the two are told apart for the sleeve's mask).
  const W = H.clone().addScaledVector(A, -cfg.fistWidth * 0.6), MH = M.hand;
  M.clip2.normal.copy(A).negate(); M.clip2.constant = A.dot(W);
  MH.holder.quaternion.copy(q);
  MH.holder.scale.setScalar(k);
  MH.holder.position.copy(M.holder.position);
  MH.holder.updateMatrixWorld(true);
  MH.clip.constant = 1e6; MH.clip.normal.set(0, 1, 0);
  MH.clip2.normal.copy(A); MH.clip2.constant = -A.dot(W);
  M.sleeves[3].position.copy(W); M.sleeves[3].scale.setScalar(M.sleeveR * k * 0.72);
  if (M.weapon && fr.weapon) {
    // The weapon through the fist: its handle along the frame's weapon direction, coming out of
    // the top of the fist where the grip line (loadFused) does, sunk a little into it; its flat
    // facing the palm's way.
    const MW = M.weapon, G = MW.grip, way = V3(fr.weapon).normalize(), flat = P.clone().projectOnPlane(way).normalize();
    const out = MH.holder.localToWorld(G.fist.at.clone()).addScaledVector(way, G.fist.top * k - (cfg.sink || 0.18) * cfg.fistWidth);
    const qw = aim(G.way, way, G.flat, flat);
    MW.holder.quaternion.copy(qw);
    MW.holder.scale.setScalar(G.k);
    MW.holder.position.copy(out).sub(G.root.clone().multiplyScalar(G.k).applyQuaternion(qw));
    MW.holder.updateMatrixWorld(true);
    for (const c of [MW.clip, MW.clip2, MW.clip3]) { c.constant = 1e6; c.normal.set(0, 1, 0); }
  }
}
// Render whatever is in `objs` from the eye; returns the sprite cropped, at screen coordinates.
function shootScreen(objs, cfg, rawOut, M) {
  const ss = cfg.ss, W = 320 * ss, H = 200 * ss;
  ensureRenderer(W, H);
  const cam = new THREE.PerspectiveCamera(2 * Math.atan(100 / 160) * 180 / Math.PI, 320 / 200, 0.5, 400);
  key.position.copy(LIGHT_VIEW).multiplyScalar(200);
  key.target.position.set(0, 0, -20);
  fill.position.set(0, 0, 200);
  fill.target.position.set(0, 0, -20);
  Object.assign(key.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 500 });
  key.shadow.camera.updateProjectionMatrix();
  ambient.intensity = cfg.light.ambient; key.intensity = cfg.light.key; fill.intensity = cfg.light.fill;
  for (const o of objs) scene.add(o);
  renderer.render(scene, cam);
  const gl = renderer.getContext(), px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const mask = M ? sleeveMask(M, cam, W, H) : null;
  for (const o of objs) scene.remove(o);
  if (rawOut && cfg.rawFull) {
    // Full supersampled resolution, for judging detail in previews.
    const rgb = new Array(W * H * 3), solid = new Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = ((H - 1 - y) * W + x) * 4, i = y * W + x; rgb[i * 3] = px[o]; rgb[i * 3 + 1] = px[o + 1]; rgb[i * 3 + 2] = px[o + 2]; solid[i] = px[o + 3] > 127 ? 1 : 0; }
    rawOut.push({ w: W, h: H, rgb, solid });
    return quantiseScreen(px, W, H, ss, cfg.light, null, mask);
  }
  return quantiseScreen(px, W, H, ss, cfg.light, rawOut, mask);
}
// Which pixels show the sleeve: the forearm copy of the model (cut off at the wrist) and the
// added linen pieces, drawn white, with the fist and weapon in black over the same depths.
function sleeveMask(M, cam, W, H) {
  const saved = [], white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), black = new THREE.MeshBasicMaterial({ color: 0, side: THREE.DoubleSide });
  const whiteArm = white.clone(); whiteArm.clippingPlanes = [M.clip, M.clip2];
  black.clippingPlanes = [M.hand.clip2];
  M.model.traverse((o) => { if (o.isMesh) { saved.push([o, o.material]); o.material = whiteArm; } });
  M.hand.model.traverse((o) => { if (o.isMesh) { saved.push([o, o.material]); o.material = black; } });
  if (M.weapon) { const bw = black.clone(); bw.clippingPlanes = []; M.weapon.holder.traverse((o) => { if (o.isMesh) { saved.push([o, o.material]); o.material = bw; } }); }
  for (const m of M.sleeves) { saved.push([m, m.material]); m.material = white; }
  renderer.shadowMap.enabled = false;
  renderer.render(scene, cam);
  renderer.shadowMap.enabled = true;
  for (const [o, mat] of saved) o.material = mat;
  const gl = renderer.getContext(), px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = px[i * 4] > 127 ? 1 : 0;
  return out;
}
function quantiseScreen(px, W, H, ss, light, rawOut, mask) {
  const w = W / ss, h = H / ss, n = ss * ss;
  const col = new Float32Array(w * h * 3), solid = new Uint8Array(w * h), sleeve = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = 0, r = 0, g = 0, b = 0, sl = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const o = ((H - 1 - (y * ss + j)) * W + x * ss + i) * 4;
      if (px[o + 3] > 127) { c++; r += px[o]; g += px[o + 1]; b += px[o + 2]; if (mask && mask[o >> 2]) sl++; }
    }
    if (c * 2 >= n) { const q = (y * w + x) * 3; col[q] = r / c; col[q + 1] = g / c; col[q + 2] = b / c; solid[y * w + x] = 1; sleeve[y * w + x] = sl * 2 > c ? 1 : 0; }
  }
  if (rawOut) rawOut.push({ w, h, rgb: Array.from(col, (v) => Math.round(v)), solid: Array.from(solid) });
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  const idx = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!solid[i]) continue;
    const edge = (x > 0 && !solid[i - 1]) || (x < w - 1 && !solid[i + 1]) || (y > 0 && !solid[i - w]) || (y < h - 1 && !solid[i + w]);
    const k = edge ? light.edge : 1, dith = (BAYER4[(x & 3) + ((y & 3) << 2)] / 16 - 0.47) * light.dither;
    idx[i] = nearest(col[i * 3] * k + dith, col[i * 3 + 1] * k + dith, col[i * 3 + 2] * k + dith, mask ? (sleeve[i] ? 1 : 2) : 0);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { w: 1, h: 1, x0: 0, y0: 0, data: [0] };
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = new Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out[y * cw + x] = idx[(y + y0) * w + x + x0];
  return { w: cw, h: ch, x0, y0, data: out };
}

// An arm-and-weapon model ready to pose: a forearm copy and a hand copy (split at the wrist by
// placeFused), scaled from the fist's width, with linen sleeve pieces for the forearm, elbow,
// upper arm and wrist. F (from tools/bake/arm.mjs) is copied, mirrored if the model needs it.
// Which of a fused model's points are the weapon and which the arm (sleeve, wrist and fist), so
// the weapon can be turned in the fist while the hand stays straight on the forearm. By colour
// (the sleeve's off-white, the skin's ruddy tones, anything else the weapon's) and by where a point
// is along the weapon's line (F.hand to F.tip): beyond the fist it's all weapon; within and behind
// the fist, only a thin core round the line is (the handle, the pommel, a haft's butt), and not
// skin-coloured where the forearm runs alongside it. Wooden handles and hafts share the skin's
// colour, so there the line alone decides. Returns, per mesh, 1 for a weapon vertex.
function fusedRgb(o) {
  const img = o.material.map && o.material.map.image;
  if (!img) return null;
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const g2 = cv.getContext('2d'); g2.drawImage(img, 0, 0);
  const px = g2.getImageData(0, 0, img.width, img.height).data, uv = o.geometry.attributes.uv;
  return (i) => {
    const u = uv.getX(i), w = uv.getY(i);
    const x = Math.min(img.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * img.width)));
    const y = Math.min(img.height - 1, Math.max(0, Math.floor((w - Math.floor(w)) * img.height)));
    const k = (y * img.width + x) * 4;
    return [px[k], px[k + 1], px[k + 2]];
  };
}
function weaponPoints(model, F, mirror) {
  const fore = V3(F.hand).sub(V3(F.elbow)).normalize();
  let h = V3(F.hand), w = V3(F.tip).sub(h).normalize();
  const inLine = w.dot(fore) > Math.cos(25 * Math.PI / 180), core = F.core || 0.055;
  const meshes = [];
  model.updateMatrixWorld(true);
  model.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const all = meshes.map((o) => {
    const look = fusedRgb(o), pos = o.geometry.attributes.position, n = pos.count, p = [], cls = new Uint8Array(n), rgb = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (mirror) v.x = -v.x;
      p.push(v);
      const c = look ? look(i) : [0, 0, 0], [hh, sat, val] = hsv(...c);
      rgb.set(c, i * 3);
      cls[i] = sat < 0.2 && val > 0.55 ? 0 : (hh < 32 || hh > 340) && sat > 0.22 && sat < 0.72 && val > 0.42 ? 1 : 2; // sleeve, skin, other
    }
    return { o, p, cls, rgb, n, s: new Float32Array(n), r: new Float32Array(n) };
  });
  const measure = () => { for (const m of all) for (let i = 0; i < m.n; i++) { const d = m.p[i].clone().sub(h), a = d.dot(w); m.s[i] = a; m.r[i] = d.addScaledVector(w, -a).length(); } };
  const fistReach = () => {
    // Its skin near the grip, off the line (a wooden handle on the line can be skin-coloured too).
    const fs = [];
    for (const m of all) for (let i = 0; i < m.n; i++) if (m.cls[i] === 1 && m.r[i] > 0.04 && Math.hypot(m.s[i], m.r[i]) < 0.3) fs.push(m.s[i]);
    fs.sort((x, y) => x - y);
    return [fs[Math.floor(fs.length * 0.02)] || -0.1, fs[Math.floor(fs.length * 0.98)] || 0.1];
  };
  measure();
  let [lo, hi] = fistReach();
  // The weapon's own line, from the middles of thin slices of it just past the fist (the fist's
  // middle, which the line was drawn from, is off to one side of the handle).
  const mids = [];
  for (let k = 0; k < 5; k++) {
    const s0 = hi + 0.02 + k * 0.03, pts = [];
    for (const m of all) for (let i = 0; i < m.n; i++) if (m.s[i] >= s0 && m.s[i] < s0 + 0.03 && m.r[i] < 0.1 && !(m.cls[i] === 1 && m.r[i] > 0.04)) pts.push(m.p[i]);
    if (pts.length >= 10) mids.push(pts.reduce((acc, q) => acc.add(q), new THREE.Vector3()).multiplyScalar(1 / pts.length));
  }
  if (mids.length >= 3 && !F.tipLine) {
    const c = mids.reduce((acc, q) => acc.add(q), new THREE.Vector3()).multiplyScalar(1 / mids.length), d = mids[mids.length - 1].clone().sub(mids[0]).normalize();
    if (d.dot(w) > 0.9) { w = d; h = c.clone().addScaledVector(d, V3(F.hand).sub(c).dot(d)); measure(); [lo, hi] = fistReach(); }
  }
  // How thick the handle (or the blade's root) is just past the fist.
  const rs = [];
  for (const m of all) for (let i = 0; i < m.n; i++) if (m.s[i] > hi + 0.02 && m.s[i] < hi + 0.08 && m.r[i] < 0.08 && m.cls[i] !== 1) rs.push(m.r[i]);
  rs.sort((x, y) => x - y);
  const rh = Math.min(core, rs.length ? rs[Math.floor(rs.length * 0.7)] : 0.03);
  const parts = all.map(({ o, cls, s, r, n }) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      // Past the fist, all weapon but for the knuckles; within it, the handle; behind it, the
      // pommel or a handle's end (not skin or sleeve, where the forearm runs alongside), or for a
      // handle crossing the fist, its butt, whatever its colour. 1 past, 2 within, 3 behind.
      if (s[i] > hi + 0.01) out[i] = cls[i] === 1 && r[i] > 1.25 * rh && s[i] < hi + 0.06 ? 0 : 1;
      else if (s[i] >= lo) out[i] = r[i] < 1.15 * rh || (cls[i] === 2 && r[i] < core) ? 2 : 0;
      else if (inLine) out[i] = cls[i] === 2 && r[i] < core && s[i] > lo - 0.35 ? 3 : 0;
      else out[i] = r[i] < Math.max(core, 2.2 * rh) ? 3 : 0;
    }
    return { o, weapon: out };
  });
  // The handle's colour: a grip of leather or wire inside the fist, or else (a wooden handle, the
  // colour of skin) the wood just past it.
  const avg = (want) => { let n = 0; const c = [0, 0, 0]; for (const m of all) for (let i = 0; i < m.n; i++) if (want(m, i)) { n++; for (let j = 0; j < 3; j++) c[j] += m.rgb[i * 3 + j]; } return n > 20 ? c.map((x) => x / n) : null; };
  const colour = avg((m, i) => m.s[i] >= lo && m.s[i] <= hi && m.r[i] < rh && m.cls[i] === 2)
    || avg((m, i) => m.s[i] > hi + 0.01 && m.s[i] < hi + 0.08 && m.r[i] < 1.2 * rh) || [110, 80, 50];
  return { parts, grip: h.clone().addScaledVector(w, (lo + hi) / 2), at: h, way: w, lo, hi, rh, colour };
}
// Keep only the triangles of a mesh with at least two corners among the codes wanted.
function keepPart(o, code, want) {
  const g = o.geometry, idx = g.index ? g.index.array : Array.from({ length: g.attributes.position.count }, (_, i) => i), keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const k = want.has(code[idx[t]]) + want.has(code[idx[t + 1]]) + want.has(code[idx[t + 2]]);
    if (k >= 2) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  o.geometry = g.clone();
  o.geometry.setIndex(keep);
}

// A model's points flipped for one generated as a left hand, and its scale: its fist cfg.fistWidth
// across.
function fistScale(F, pts, cfg) {
  const h = V3(F.hand), fore = h.clone().sub(V3(F.elbow)).normalize();
  const u = new THREE.Vector3(1, 0, 0).projectOnPlane(fore).normalize(), v = fore.clone().cross(u);
  const near = pts.filter((p) => p.distanceTo(h) < 0.15).map((p) => p.clone().sub(h));
  const range = (a) => Math.max(...near.map((p) => p.dot(a))) - Math.min(...near.map((p) => p.dot(a)));
  return cfg.fistWidth / Math.max(range(u), range(v));
}
function mirrored(F) {
  F = JSON.parse(JSON.stringify(F));
  if (F.mirror) for (const k of ['elbow', 'hand', 'palm', 'tip']) if (F[k]) F[k] = [-F[k][0], F[k][1], F[k][2]];
  return F;
}
// An arm holding a weapon. The arm is always the plain fist (cfg.fist), held straight on the
// forearm, so the hand never bends at the wrist; the weapon is cut out of its own model (which
// holds it in a fist of its own) and set through that fist, its handle crossing it at whatever
// angle the pose asks, the blade's flat (or an axe's head) facing the palm's way: F.palm in the
// weapon's model, turned half round for F.spin.
async function loadFused(F0, cfg) {
  const own = !F0.tip || !cfg.fist, F = mirrored(own ? F0 : cfg.fist), Wc = own ? null : mirrored(F0);
  const M = await loadStatic(F.url);
  M.hand = await loadStatic(F.url);
  if (F.mirror) { M.model.scale.x *= -1; M.hand.model.scale.x *= -1; for (const p of M.pts) p.x = -p.x; }
  if (Wc) {
    const W = M.weapon = await loadStatic(Wc.url);
    if (Wc.mirror) { W.model.scale.x *= -1; for (const p of W.pts) p.x = -p.x; }
    const cut = weaponPoints(W.model, Wc, false), keep = new Set([1, 3]);
    for (const { o, weapon } of cut.parts) keepPart(o, weapon, keep);
    // What was in its own fist goes (its fingers with it); a plain handle of the same colour runs
    // through the fist instead, from where the blade or head starts to the pommel or butt.
    const len = cut.hi - cut.lo + 0.03, col = new THREE.Color().setRGB(...cut.colour.map((x) => x / 255), THREE.SRGBColorSpace);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(cut.rh * 0.95, cut.rh * 0.95, len, 12), new THREE.MeshLambertMaterial({ color: col, clippingPlanes: [W.clip, W.clip2, W.clip3] }));
    handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cut.way);
    handle.position.copy(cut.at).addScaledVector(cut.way, (cut.lo + cut.hi) / 2);
    handle.castShadow = handle.receiveShadow = true;
    W.holder.add(handle);
    const n = V3(Wc.palm).projectOnPlane(cut.way).normalize();
    W.grip = { root: cut.at.clone().addScaledVector(cut.way, cut.hi), way: cut.way, flat: Wc.spin ? n.negate() : n, k: fistScale(Wc, W.pts, cfg) };
    M.W = Wc;
  }
  const h = V3(F.hand), fore = h.clone().sub(V3(F.elbow)).normalize();
  F.k = fistScale(F, M.pts, cfg);
  if (M.weapon) {
    // Where the handle comes out of the top of the fist (the thumb's side): along the line the
    // moves hold it at, through the grip, the farthest of the fist's points close to that line.
    const pm = V3(F.palm).projectOnPlane(fore).normalize(), tm = fore.clone().cross(pm), c = (cfg.cock || 35) * Math.PI / 180;
    const d = fore.clone().multiplyScalar(Math.cos(c)).addScaledVector(tm, Math.sin(c)), wd = cfg.fistWidth / F.k, [gf, gp, gt] = cfg.grip || [0, 0, 0];
    const g = h.clone().addScaledVector(fore, gf * wd).addScaledVector(pm, gp * wd).addScaledVector(tm, gt * wd);
    let top = 0;
    for (const p of M.pts) { const v = p.clone().sub(g), a = v.dot(d); if (a > top && v.addScaledVector(d, -a).length() < 0.2 * wd) top = a; }
    M.weapon.grip.fist = { at: g, top };
  }
  // The models stop a little below the elbow; carry the sleeve on past the cut (where the
  // clip plane trims them) so a reaching arm never ends in mid-air.
  const c = h.clone().add(V3(F.elbow).sub(h).multiplyScalar(0.8));
  const ring = M.pts.filter((p) => Math.abs(p.clone().sub(c).dot(fore)) < 0.03);
  // A typical radius (the frayed cuff makes the widest points misleading).
  const ds = ring.map((p) => p.clone().sub(c).projectOnPlane(fore).length()).sort((a, b) => a - b);
  M.sleeveR = ds[Math.floor(ds.length * 0.6)] || 0.1;
  // Coarse woven linen: a little noise and some lengthwise folds.
  const px = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) {
    const x = i % 64, y = i >> 6, shade = Math.sin(x / 64 * Math.PI * 6 + Math.sin(y * 0.15) * 1.5) * 12 + (Math.random() - 0.5) * 14;
    px.set([176 + shade, 168 + shade, 148 + shade, 255], i * 4);
  }
  const tex = new THREE.DataTexture(px, 64, 64);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 3); tex.needsUpdate = true;
  const linen = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  // Forearm and upper arm (unit tubes, sized each frame), balls at the elbow and the wrist.
  M.sleeves = [new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1, 1, 24, 1, true), linen), new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), linen), new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), linen), new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), linen)];
  for (const m of M.sleeves) m.castShadow = m.receiveShadow = true;
  M.parts = [M.holder, M.hand.holder, ...(M.weapon ? [M.weapon.holder] : []), ...M.sleeves];
  M.F = F;
  return M;
}

window.bakeViewmodel = async (cfg) => {
  const out = { fused: {}, previews: [] };
  for (const [id, F0] of Object.entries(cfg.fused || {})) {
    const M = await loadFused(F0, cfg), F = M.F;
    const fore = V3(F.hand).sub(V3(F.elbow)).normalize();
    if (cfg.calibrate) {
      // Four ways round the forearm for the palm, each at the ready pose: pick the one where the
      // palm faces left, and put it in the config.
      const p0 = new THREE.Vector3(1, 0, 0).projectOnPlane(fore).normalize();
      for (let r = 0; r < 4; r++) {
        F.palm = p0.clone().applyAxisAngle(fore, r * Math.PI / 2).toArray().map((x) => +x.toFixed(3));
        placeFused(M, F, cfg.moves[F.move][0], cfg);
        const raw = []; shootScreen(M.parts, cfg, raw); out.previews.push(Object.assign(raw[0], { label: `${id} palm ${F.palm.join(',')}` }));
      }
      continue;
    }
    // A captured move (tools/bake/arm.mjs MOCAP) is read off its clip here, at the move's phases.
    if (!cfg.moves[F.move] && cfg.mocap[F.move]) { const mv = await mocapMove(cfg.mocap[F.move]); cfg.moves[F.move] = mv.frames.map(mv.pose); }
    out.fused[id] = cfg.moves[F.move].map((fr) => {
      placeFused(M, F, fr, cfg);
      const raw = [];
      const s = shootScreen(M.parts, cfg, cfg.preview ? raw : null, M);
      if (cfg.preview) out.previews.push(raw[0]);
      return s;
    });
  }
  return out;
};

// ---- Key points of an arm-and-weapon model, from its colours --------------------------------
// Every vertex is classed by its texture colour: the off-white linen sleeve, the bare skin of the
// hand, or the weapon. The forearm runs along the sleeve; the elbow is the sleeve's far end, the
// fist the middle of the skin beyond its cuff, and the weapon's tip its point farthest from the fist.
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, mx ? d / mx : 0, mx / 255];
}
window.fusedInfo = async (url) => {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const sleeve = [], skin = [], other = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !o.material.map) return;
    const img = o.material.map.image, cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const g2 = cv.getContext('2d'); g2.drawImage(img, 0, 0);
    const px = g2.getImageData(0, 0, img.width, img.height).data;
    const pos = o.geometry.attributes.position, uv = o.geometry.attributes.uv, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 2) {
      const u = uv.getX(i), w = uv.getY(i);
      const x = Math.min(img.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * img.width)));
      const y = Math.min(img.height - 1, Math.max(0, Math.floor((w - Math.floor(w)) * img.height))); // glTF UVs: v down
      const k = (y * img.width + x) * 4, [h, s, val] = hsv(px[k], px[k + 1], px[k + 2]);
      const p = v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone();
      if (s < 0.2 && val > 0.55) sleeve.push(p);
      else if ((h < 32 || h > 340) && s > 0.22 && s < 0.72 && val > 0.42) skin.push(p);
      else other.push(p);
    }
  });
  const { c, a1 } = principal(sleeve);
  const skinC = avg(skin);
  // The forearm axis, pointing from the elbow towards the hand.
  const axis = a1.clone(); if (skinC.clone().sub(c).dot(axis) < 0) axis.negate();
  const ts = sleeve.map((p) => p.clone().sub(c).dot(axis));
  const lo = Math.min(...ts), hi = Math.max(...ts);
  const elbow = c.clone().add(axis.clone().multiplyScalar(lo + (hi - lo) * 0.04));
  const cuff = c.clone().add(axis.clone().multiplyScalar(hi));
  // The hand: skin past the cuff, within a fist's reach of it.
  const hand = skin.filter((p) => { const t = p.clone().sub(cuff).dot(axis); return t > -0.02 && t < 0.3 && p.clone().sub(cuff).projectOnPlane(axis).length() < 0.25; });
  const fist = avg(hand.length > 20 ? hand : skin);
  // (Only beyond the wrist: the dark inside of the sleeve counts as "other" too.)
  const ahead = other.filter((p) => p.clone().sub(fist).dot(axis) > -0.06 || p.distanceTo(fist) > 0.3 && p.clone().sub(cuff).dot(axis) > 0);
  const tip = ahead.length ? ahead.reduce((a, p) => (p.distanceTo(fist) > a.distanceTo(fist) ? p : a)) : fist.clone().add(axis.clone().multiplyScalar(0.1));
  // The handle runs through the curled fingers, in front of the palm: the weapon's points near
  // the fist, off the forearm's axis, show which way the palm faces.
  const near = other.filter((p) => p.distanceTo(fist) < 0.12);
  const off = near.length ? avg(near).sub(fist).projectOnPlane(axis) : new THREE.Vector3();
  const r = (p) => p.toArray().map((x) => +x.toFixed(3));
  return { counts: [sleeve.length, skin.length, other.length], elbow: r(elbow), hand: r(fist), tip: r(tip), cuff: r(cuff), palmGuess: r(off.lengthSq() > 1e-6 ? off.normalize() : off) };
};

// ---- Orthographic reference views (for reading off key points of a model) -------------------
// Front looks down -z (right = +x, up = +y); side looks down -x (right = -z, up = +y); top looks
// down -y (right = +x, down = +z). Each view frames the bounding box exactly.
window.orthoViews = async (url, px) => {
  const M = await loadStatic(url);
  const box = new THREE.Box3().setFromPoints(M.pts), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const views = [];
  for (const [name, dir, up, uAxis, vAxis] of [
    ['front', [0, 0, 1], [0, 1, 0], 'x', 'y'],
    ['side', [1, 0, 0], [0, 1, 0], 'z', 'y'],
    ['top', [0, 1, 0], [0, 0, -1], 'x', 'z'],
  ]) {
    const hw = size[uAxis] / 2, hh = size[vAxis] / 2;
    const W = Math.round(px * size[uAxis]), H = Math.round(px * size[vAxis]);
    ensureRenderer(W, H);
    const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.01, 100);
    cam.position.copy(c).add(new THREE.Vector3(...dir).multiplyScalar(10));
    cam.up.set(...up);
    cam.lookAt(c);
    key.position.copy(cam.position).add(new THREE.Vector3(...up).multiplyScalar(5));
    key.target.position.copy(c);
    fill.position.copy(cam.position); fill.target.position.copy(c);
    ambient.intensity = 1.2; key.intensity = 2; fill.intensity = 0.6;
    scene.add(M.holder);
    renderer.render(scene, cam);
    scene.remove(M.holder);
    const gl = renderer.getContext(), buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const rgba = new Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W * 4; x++) rgba[y * W * 4 + x] = buf[(H - 1 - y) * W * 4 + x];
    views.push({ name, W, H, uAxis, vAxis, rgba });
  }
  return { min: box.min.toArray(), max: box.max.toArray(), views };
};

// For the motion viewer (tools/viewer/), which poses the same models the same way.
export { weaponPoints, THREE, LIGHT_VIEW, loadModel, poseAt, bindPose, worldBox, bones, SCRIPTS, sampleScript, poleClearance, loadVillager, poseVillager, framePhase, loadFused, placeFused, loadMocap, mocapAt, mocapMove };
