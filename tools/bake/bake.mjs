// Runs inside headless Chrome (driven by tools/bake-mesh.js). Loads rigged, animated GLB models
// with three.js and renders them into the game's sprite format: 8 rotations per frame, an
// orthographic camera tilted down like renderSprite's, the same light direction, 4x
// supersampling, then palette quantisation with ordered dithering and darkened silhouettes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

// ---- Scripted poses and held poles -----------------------------------------------------------
// Some actions are posed here instead of coming from a Tripo preset: the idle clip's first frame
// with the arms moved by two-bone IK to hand positions given in the character's own terms (in
// heights: x to its left, y up, z ahead), elbows bending towards a pole, the upper body leant
// forward. Long poles (a spear, a pitchfork) are separate meshes held in the hands, since auto-
// rigging bends them along the legs.
const SCRIPTS = {
  // A blacksmith's blow with one arm: up past the shoulder, down onto the anvil, a small bounce.
  hammer: { period: 1.1, keys: [
    { at: 0, R: [-0.22, 0.88, 0.04], Rp: [-1, -0.2, -0.6] },
    { at: 0.3, R: [-0.2, 0.8, 0.16], Rp: [-1, -0.3, -0.5] },
    { at: 0.45, R: [-0.13, 0.55, 0.3], Rp: [-1, -0.4, -0.3], lean: 8 },
    { at: 0.6, R: [-0.14, 0.6, 0.29], Rp: [-1, -0.4, -0.3], lean: 7 },
    { at: 0.8, R: [-0.19, 0.76, 0.17], Rp: [-1, -0.3, -0.5], lean: 3 },
    { at: 1, R: [-0.22, 0.88, 0.04], Rp: [-1, -0.2, -0.6] },
  ] },
  // Both hands on the shaft: draw back, drive it straight ahead, recover.
  thrust: { period: 0.75, keys: [
    { at: 0, R: [-0.13, 0.5, 0.02], Rp: [-1, -0.6, -0.4], L: [0.03, 0.56, 0.24], Lp: [0.6, -0.8, 0] },
    { at: 0.25, R: [-0.15, 0.52, -0.1], Rp: [-1, -0.6, -0.5], L: [-0.01, 0.57, 0.13], Lp: [0.6, -0.8, 0], lean: -3 },
    { at: 0.5, R: [-0.07, 0.57, 0.26], Rp: [-1, -0.5, -0.2], L: [0.02, 0.6, 0.48], Lp: [0.5, -0.8, 0], lean: 12 },
    { at: 0.65, R: [-0.08, 0.56, 0.22], Rp: [-1, -0.5, -0.2], L: [0.02, 0.59, 0.44], Lp: [0.5, -0.8, 0], lean: 10 },
    { at: 1, R: [-0.13, 0.5, 0.02], Rp: [-1, -0.6, -0.4], L: [0.03, 0.56, 0.24], Lp: [0.6, -0.8, 0] },
  ] },
  // Forking hay: tines down to the ground ahead, then lifted and tossed.
  fork: { period: 1.6, keys: [
    { at: 0, R: [-0.12, 0.52, 0.04], Rp: [-1, -0.6, -0.4], L: [0.02, 0.5, 0.26], Lp: [0.6, -0.8, 0], lean: 15 },
    { at: 0.35, R: [-0.12, 0.46, 0.0], Rp: [-1, -0.6, -0.4], L: [0.03, 0.42, 0.24], Lp: [0.6, -0.8, 0], lean: 22 },
    { at: 0.65, R: [-0.14, 0.6, 0.02], Rp: [-1, -0.5, -0.4], L: [0.02, 0.7, 0.22], Lp: [0.6, -0.8, 0], lean: 2 },
    { at: 1, R: [-0.12, 0.52, 0.04], Rp: [-1, -0.6, -0.4], L: [0.02, 0.5, 0.26], Lp: [0.6, -0.8, 0], lean: 15 },
  ] },
};
const boneNamed = (M, n) => M.model.getObjectByName(n);
const worldPos = (o) => o.getWorldPosition(new THREE.Vector3());
// Turn bone b, in the world, by rotation q (its children follow).
function turnBone(b, q) {
  const pw = b.parent.getWorldQuaternion(new THREE.Quaternion()), bw = b.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.copy(pw.invert().multiply(q.clone().multiply(bw)));
  b.updateMatrixWorld(true);
}
const swingBone = (b, from, to) => turnBone(b, new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize()));
// Two-bone IK: the hand's wrist to `target`, the elbow bending towards `pole` (world space).
function ikArm(M, side, target, pole) {
  const up = boneNamed(M, side + '_Upperarm'), fo = boneNamed(M, side + '_Forearm'), ha = boneNamed(M, side + '_Hand');
  const S = worldPos(up), E = worldPos(fo), H = worldPos(ha);
  const L1 = S.distanceTo(E), L2 = E.distanceTo(H);
  const d = target.clone().sub(S), L = Math.min(d.length(), L1 + L2 - 1e-3), n = d.normalize();
  const a = (L1 * L1 - L2 * L2 + L * L) / (2 * L), r = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = pole.clone().projectOnPlane(n).normalize();
  swingBone(up, E.clone().sub(S), S.clone().addScaledVector(n, a).addScaledVector(p, r).sub(S));
  const E3 = worldPos(fo);
  swingBone(fo, worldPos(ha).sub(E3), S.clone().addScaledVector(n, L).sub(E3));
}
// The script's pose at phase u (0..1), applied over whatever pose the model is in.
function applyScript(M, S, u, h) {
  let i = 0;
  while (i < S.keys.length - 2 && u > S.keys[i + 1].at) i++;
  const k0 = S.keys[i], k1 = S.keys[i + 1], s = Math.min(1, Math.max(0, (u - k0.at) / (k1.at - k0.at))), e = s * s * (3 - 2 * s);
  const mix = (a, b) => a.map((v, j) => v + (b[j] - v) * e);
  const lean = ((k0.lean || 0) + ((k1.lean || 0) - (k0.lean || 0)) * e) * Math.PI / 180;
  if (lean) turnBone(boneNamed(M, 'Spine01'), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean));
  for (const side of ['R', 'L']) if (k0[side]) ikArm(M, side, new THREE.Vector3(...mix(k0[side], k1[side])).multiplyScalar(h), new THREE.Vector3(...mix(k0[side + 'p'], k1[side + 'p'])));
}
// A pole held in the hands: a shaft with an iron spearhead or a pitchfork's tines.
function makePole(kind, h) {
  const g = new THREE.Group(), wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2c }), iron = new THREE.MeshLambertMaterial({ color: 0x8c8f93 });
  const len = kind === 'spear' ? 1.3 * h : 1.05 * h, r = 0.0085 * h;
  const add = (geo, mat, y, rot) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; if (rot) m.rotation.z = rot; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(r, r * 1.1, len, 8), wood, len / 2);
  if (kind === 'spear') add(new THREE.ConeGeometry(r * 2.6, 0.1 * h, 6), iron, len + 0.05 * h);
  else {
    add(new THREE.BoxGeometry(0.1 * h, r * 1.6, r * 1.6), iron, len);
    for (const x of [-0.045, 0, 0.045]) { const t = add(new THREE.CylinderGeometry(r * 0.55, r * 0.25, 0.12 * h, 5), iron, len + 0.06 * h); t.position.x = x * h; }
  }
  return { g, len };
}
// Where a hand grips: a little past the wrist, along the forearm.
function gripOf(M, side, h) {
  const H = worldPos(boneNamed(M, side + '_Hand')), E = worldPos(boneNamed(M, side + '_Forearm'));
  return H.clone().addScaledVector(H.clone().sub(E).normalize(), 0.055 * h);
}
// Upright in the right hand, butt on the ground; or, in two hands, through both grips.
function placePole(M, P, h, twoHands) {
  const R = gripOf(M, 'R', h);
  let butt, axis;
  if (twoHands) { axis = gripOf(M, 'L', h).sub(R).normalize(); butt = R.clone().addScaledVector(axis, -0.32 * h); }
  else { axis = new THREE.Vector3(0, 1, 0); butt = new THREE.Vector3(R.x, 0.01 * h, R.z); }
  P.g.position.copy(butt);
  P.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  P.g.updateMatrixWorld(true);
}

window.bake = async (cfg) => {
  const dir = `/assets/tripo/${cfg.name}/`;
  const pitch = cfg.pitchDeg * Math.PI / 180;
  const out = { actions: {}, sprites: [], height: cfg.height };
  let scale = null;
  for (const A of cfg.actions) {
    const script = A.clip.startsWith('@') ? SCRIPTS[A.clip.slice(1)] : null;
    const M = await loadModel(`${dir}anim-${script ? 'idle' : A.clip}.glb`);
    const pole = cfg.prop ? makePole(cfg.prop, cfg.height) : null;
    if (pole) M.extras = [pole.g];
    poseAt(M, 0);
    if (scale === null) { const b = worldBox(M); scale = cfg.height / (b.max.y - b.min.y); }
    M.holder.scale.setScalar(scale);
    poseAt(M, 0);
    const b0 = worldBox(M), c = b0.getCenter(new THREE.Vector3());
    M.holder.position.set(-c.x, -b0.min.y, -c.z);
    // A strike uses the first swing of a preset that may repeat it several times.
    const period = script ? script.period : A.cycle || A.once ? cyclePeriod(M) : M.clip.duration;
    // A strike plays once, quicker than the preset, with its blow landing a little past halfway.
    const meta = A.once
      ? { frames: A.frames, fps: +(A.frames / Math.min(period, 0.8)).toFixed(3), loop: false, hit: Math.floor(A.frames * 0.55), clip: A.clip, period: +period.toFixed(3) }
      : { frames: A.frames, fps: +(A.frames / period * A.speed).toFixed(3), loop: true, clip: A.clip, period: +period.toFixed(3) };
    if (A.cycle && !script) {
      // Distance covered per loop: each foot sweeps back one step length while planted.
      const foot = M.model.getObjectByName('L_Foot');
      let lo = Infinity, hi = -Infinity;
      for (let t = 0; t < period; t += 1 / 60) { poseAt(M, t); const p = foot.getWorldPosition(new THREE.Vector3()); lo = Math.min(lo, p.z); hi = Math.max(hi, p.z); }
      meta.travel = +(2 * (hi - lo)).toFixed(2);
    }
    out.actions[A.id] = meta;
    const R = cfg.height * 0.45;
    const frame = { left: -R, right: R, bottom: -cfg.height * 0.15, top: cfg.height * 1.12 };
    for (let f = 0; f < A.frames; f++) {
      if (script) {
        poseAt(M, 0);
        applyScript(M, script, A.once ? f / (A.frames - 1) : f / A.frames, cfg.height);
      } else poseAt(M, A.once ? (f / (A.frames - 1)) * period * 0.92 : (f / A.frames) * period);
      if (pole) placePole(M, pole, cfg.height, !!(script && script.keys[0].L));
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
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6); // moved by placeArm
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const map = o.material.map;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    o.material = new THREE.MeshLambertMaterial({ map, clippingPlanes: [clip] });
    const pos = o.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
  });
  const holder = new THREE.Group();
  holder.add(model);
  return { holder, model, pts, clip };
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
  M.wrist = H.dot(A) - cfg.fistWidth * 0.6; // half a fist and a bit behind the knuckles' middle
  const C = H.clone().sub(A.clone().multiplyScalar(cut - 0.3)), E = V3(fr.elbow), S = V3(cfg.shoulder);
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
// Which pixels show the sleeve: everything behind the wrist (the model's own sleeve) and the
// added linen pieces, drawn white over the rest in black with the same depths.
function sleeveMask(M, cam, W, H) {
  const saved = [], black = new THREE.MeshBasicMaterial({ color: 0, side: THREE.DoubleSide }), white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const A = M.clip.normal, w = M.wrist; // wrist plane: A.p = w
  black.clippingPlanes = [M.clip, new THREE.Plane(A.clone(), -w)];
  const whiteModel = white.clone(); whiteModel.clippingPlanes = [M.clip, new THREE.Plane(A.clone().negate(), w)];
  M.model.traverse((o) => { if (o.isMesh) { saved.push([o, o.material]); o.material = black; } });
  for (const m of M.sleeves) { saved.push([m, m.material]); m.material = white; }
  const lights = [ambient, key, fill].map((l) => [l, l.intensity]);
  renderer.shadowMap.enabled = false;
  renderer.render(scene, cam);
  M.model.traverse((o) => { if (o.isMesh) o.material = whiteModel; });
  for (const m of M.sleeves) m.visible = false;
  const auto = renderer.autoClear; renderer.autoClear = false;
  renderer.render(scene, cam);
  renderer.autoClear = auto;
  for (const m of M.sleeves) m.visible = true;
  renderer.shadowMap.enabled = true;
  for (const [o, mat] of saved) o.material = mat;
  for (const [l, i] of lights) l.intensity = i;
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

window.bakeViewmodel = async (cfg) => {
  const out = { fused: {}, previews: [] };
  for (const [id, F] of Object.entries(cfg.fused || {})) {
    const M = await loadStatic(F.url);
    if (F.mirror) {
      // Generated as a left hand: flip it into a right one (points and all) before posing.
      M.model.scale.x *= -1;
      for (const p of M.pts) p.x = -p.x;
      for (const k of ['elbow', 'hand', 'palm']) if (F[k]) F[k] = [-F[k][0], F[k][1], F[k][2]];
    }
    const h = V3(F.hand), fore = h.clone().sub(V3(F.elbow)).normalize();
    {
      // Width of the fist across the forearm, from the points around its centre.
      const u = new THREE.Vector3(1, 0, 0).projectOnPlane(fore).normalize(), v = fore.clone().cross(u);
      const near = M.pts.filter((p) => p.distanceTo(h) < 0.15).map((p) => p.clone().sub(h));
      const range = (a) => Math.max(...near.map((p) => p.dot(a))) - Math.min(...near.map((p) => p.dot(a)));
      F.k = cfg.fistWidth / Math.max(range(u), range(v));
      // The models stop a little below the elbow; carry the sleeve on past the cut (where the
      // clip plane trims them) so a reaching arm never ends in mid-air.
      const c = h.clone().add(V3(F.elbow).sub(h).multiplyScalar(0.8));
      const ring = M.pts.filter((p) => Math.abs(p.clone().sub(c).dot(fore)) < 0.03);
      // A typical radius (the frayed cuff makes the widest points misleading).
      const ds = ring.map((p) => p.clone().sub(c).projectOnPlane(fore).length()).sort((a, b) => a - b);
      const radius = ds[Math.floor(ds.length * 0.6)] || 0.1;
      M.sleeveR = radius;
      // Coarse woven linen: a little noise and some lengthwise folds.
      const px = new Uint8Array(64 * 64 * 4);
      for (let i = 0; i < 64 * 64; i++) {
        const x = i % 64, y = i >> 6, shade = Math.sin(x / 64 * Math.PI * 6 + Math.sin(y * 0.15) * 1.5) * 12 + (Math.random() - 0.5) * 14;
        px.set([176 + shade, 168 + shade, 148 + shade, 255], i * 4);
      }
      const tex = new THREE.DataTexture(px, 64, 64);
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 3); tex.needsUpdate = true;
      const linen = new THREE.MeshLambertMaterial({ map: tex });
      // Forearm and upper arm (unit tubes, sized each frame) and a ball at the elbow.
      M.sleeves = [new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1, 1, 24, 1, true), linen), new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), linen), new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), linen)];
      for (const m of M.sleeves) { m.material.side = THREE.DoubleSide; m.castShadow = m.receiveShadow = true; }
    }
    if (cfg.calibrate) {
      // Four ways round the forearm for the palm, each at the ready pose: pick the one where the
      // palm faces left, and put it in the config.
      const p0 = new THREE.Vector3(1, 0, 0).projectOnPlane(fore).normalize();
      for (let r = 0; r < 4; r++) {
        F.palm = p0.clone().applyAxisAngle(fore, r * Math.PI / 2).toArray().map((x) => +x.toFixed(3));
        placeFused(M, F, cfg.moves[F.move][0], cfg);
        const raw = []; shootScreen([M.holder, ...M.sleeves], cfg, raw); out.previews.push(Object.assign(raw[0], { label: `${id} palm ${F.palm.join(',')}` }));
      }
      continue;
    }
    out.fused[id] = cfg.moves[F.move].map((fr) => {
      placeFused(M, F, fr, cfg);
      const raw = [];
      const s = shootScreen([M.holder, ...M.sleeves], cfg, cfg.preview ? raw : null, M);
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
  return { counts: [sleeve.length, skin.length, other.length], elbow: r(elbow), hand: r(fist), tip: r(tip), palmGuess: r(off.lengthSq() > 1e-6 ? off.normalize() : off) };
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
