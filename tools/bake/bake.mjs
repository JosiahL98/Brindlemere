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
function nearest(r, g, b) {
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  const k = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
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
    if (SKIP_RAMPS.has(i >> 4)) continue;
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
  scene.add(M.holder);
  renderer.render(scene, cam);
  scene.remove(M.holder);
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

window.bake = async (cfg) => {
  const dir = `/assets/tripo/${cfg.name}/`;
  const pitch = cfg.pitchDeg * Math.PI / 180;
  const out = { actions: {}, sprites: [], height: cfg.height };
  let scale = null;
  for (const A of cfg.actions) {
    const M = await loadModel(`${dir}anim-${A.clip}.glb`);
    poseAt(M, 0);
    if (scale === null) { const b = worldBox(M); scale = cfg.height / (b.max.y - b.min.y); }
    M.holder.scale.setScalar(scale);
    poseAt(M, 0);
    const b0 = worldBox(M), c = b0.getCenter(new THREE.Vector3());
    M.holder.position.set(-c.x, -b0.min.y, -c.z);
    // A strike uses the first swing of a preset that may repeat it several times.
    const period = A.cycle || A.once ? cyclePeriod(M) : M.clip.duration;
    // A strike plays once, quicker than the preset, with its blow landing a little past halfway.
    const meta = A.once
      ? { frames: A.frames, fps: +(A.frames / Math.min(period, 0.8)).toFixed(3), loop: false, hit: Math.floor(A.frames * 0.55), clip: A.clip, period: +period.toFixed(3) }
      : { frames: A.frames, fps: +(A.frames / period * A.speed).toFixed(3), loop: true, clip: A.clip, period: +period.toFixed(3) };
    if (A.cycle) {
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
      poseAt(M, A.once ? (f / (A.frames - 1)) * period * 0.92 : (f / A.frames) * period);
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

// ---- First-person arm and weapons ----------------------------------------------------------
// Rendered with a perspective camera matching the game's (90 degree horizontal field of view on
// a 320x200 frame), the arm posed rigidly in camera space for each swing frame. Arms and
// weapons are separate sprites, laid over each other in the game.
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
// Points along the axis from the lower end (Tripo stands things handle- or fist-down).
function along(pts, c, axis) {
  if (avg(pts.filter((p) => p.clone().sub(c).dot(axis) < 0)).y > avg(pts.filter((p) => p.clone().sub(c).dot(axis) >= 0)).y) axis.negate();
  const ts = pts.map((p) => p.clone().sub(c).dot(axis));
  return { axis, lo: Math.min(...ts), hi: Math.max(...ts), ts };
}
// The arm: fist at the lower end, elbow at the upper.
function armAxes(pts) {
  const { c, a1 } = principal(pts);
  const { axis, lo, hi, ts } = along(pts, c, a1.clone().negate()); // axis runs from the fist end up
  const span = hi - lo;
  const fistPts = pts.filter((p, i) => ts[i] < lo + span * 0.14);
  const fist = avg(fistPts), elbow = avg(pts.filter((p, i) => ts[i] > hi - span * 0.08));
  const fore = fist.clone().sub(elbow).normalize();
  // The grip runs along the knuckles: the fist's widest direction across the forearm.
  const flat = fistPts.map((p) => p.clone().sub(fist).projectOnPlane(fore).add(fist));
  const grip = principal(flat).a1.projectOnPlane(fore).normalize();
  return { fist, elbow, axis: fore, length: fist.distanceTo(elbow), grip };
}
// A weapon: handle at the lower end; `flip` if a model is the other way up.
function weaponAxes(pts, W) {
  const { c, a1, a2 } = principal(pts);
  const { axis, lo, hi } = along(pts, c, a1.clone());
  if (W.flip) axis.negate();
  const len = hi - lo, handleT = W.flip ? -hi : lo;
  const grip = c.clone().add(axis.clone().multiplyScalar(handleT + len * W.grip));
  return { axis, grip, width: a2, length: len };
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
// The weapon is held rigidly along the fist's grip axis, so the whole arm turns to aim it.
// `sign` picks which way along the grip the blade leaves the fist (thumb side).
function placeArm(M, ax, pose, armLen, sign) {
  const H = V3(pose.hand), A = H.clone().sub(V3(pose.elbow)).normalize();
  const k = armLen / ax.length;
  const q = aim(ax.axis, A, ax.grip.clone().multiplyScalar(sign), V3(pose.blade));
  M.holder.quaternion.copy(q);
  M.gripWorld = ax.grip.clone().multiplyScalar(sign).applyQuaternion(q).normalize();
  // Keep the forearm only up to 80% of the way to the elbow (loose plates and the open sleeve end).
  M.clip.normal.copy(A);
  M.clip.constant = -H.dot(A) + armLen * 0.8;
  M.holder.scale.setScalar(k);
  M.holder.position.copy(H).sub(ax.fist.clone().multiplyScalar(k).applyQuaternion(q));
  M.holder.updateMatrixWorld(true);
}
function placeWeapon(M, wx, pose, W, D) {
  const H = V3(pose.hand);
  const k = W.length / wx.length;
  const view = H.clone().normalize(); // camera at the origin
  const q = aim(wx.axis, D, wx.width, D.clone().cross(view).normalize());
  M.holder.quaternion.copy(q);
  M.holder.scale.setScalar(k);
  M.holder.position.copy(H).sub(wx.grip.clone().multiplyScalar(k).applyQuaternion(q));
  M.holder.updateMatrixWorld(true);
}
// A model of the arm already holding its weapon (or an empty fist), posed by three points read
// off it: the elbow end, the centre of the fist and the weapon's tip (for the empty fist, a point
// on the thumb side). The forearm runs elbow to fist; it rolls so the tip points the pose's way.
function placeFused(M, F, pose, armLen) {
  const e = V3(F.elbow), h = V3(F.hand), tip = V3(F.tip);
  const fore = h.clone().sub(e).normalize(), wdir = tip.clone().sub(h).normalize();
  // Each model holds its weapon at its own angle to the forearm. Point the weapon where the
  // pose says, and bring the forearm round to that angle, as near the pose's elbow as it goes.
  const H = V3(pose.hand), D = V3(pose.blade).normalize(), pref = H.clone().sub(V3(pose.elbow)).normalize();
  const c = fore.dot(wdir), n = pref.clone().sub(D.clone().multiplyScalar(pref.dot(D))).normalize();
  const A = F.free ? pref : D.clone().multiplyScalar(c).add(n.multiplyScalar(Math.sqrt(Math.max(0, 1 - c * c)))).normalize();
  // Scale from the fist's width: these models cut the forearm short, so its length misleads.
  const k = F.k;
  armLen = h.distanceTo(e) * k;
  const q = aim(fore, A, wdir, D);
  // Extra turn about the forearm (degrees) so the palm faces the way it should: inward, to the
  // left, for a right hand. The weapon swings round with it, staying within its grip angle.
  if (F.roll) q.premultiply(new THREE.Quaternion().setFromAxisAngle(A, F.roll * Math.PI / 180));
  M.holder.quaternion.copy(q);
  M.holder.scale.setScalar(k);
  M.holder.position.copy(H).sub(h.clone().multiplyScalar(k).applyQuaternion(q));
  M.holder.updateMatrixWorld(true);
  M.clip.normal.copy(A);
  M.clip.constant = -H.dot(A) + armLen * 0.8;
}
// Render whatever is in `objs` from the eye; returns the sprite cropped, at screen coordinates.
function shootScreen(objs, cfg, rawOut) {
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
  for (const o of objs) scene.remove(o);
  const gl = renderer.getContext(), px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  if (rawOut && cfg.rawFull) {
    // Full supersampled resolution, for judging detail in previews.
    const rgb = new Array(W * H * 3), solid = new Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = ((H - 1 - y) * W + x) * 4, i = y * W + x; rgb[i * 3] = px[o]; rgb[i * 3 + 1] = px[o + 1]; rgb[i * 3 + 2] = px[o + 2]; solid[i] = px[o + 3] > 127 ? 1 : 0; }
    rawOut.push({ w: W, h: H, rgb, solid });
    return quantiseScreen(px, W, H, ss, cfg.light, null);
  }
  return quantiseScreen(px, W, H, ss, cfg.light, rawOut);
}
function quantiseScreen(px, W, H, ss, light, rawOut) {
  const w = W / ss, h = H / ss, n = ss * ss;
  const col = new Float32Array(w * h * 3), solid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = 0, r = 0, g = 0, b = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const o = ((H - 1 - (y * ss + j)) * W + x * ss + i) * 4;
      if (px[o + 3] > 127) { c++; r += px[o]; g += px[o + 1]; b += px[o + 2]; }
    }
    if (c * 2 >= n) { const q = (y * w + x) * 3; col[q] = r / c; col[q + 1] = g / c; col[q + 2] = b / c; solid[y * w + x] = 1; }
  }
  if (rawOut) rawOut.push({ w, h, rgb: Array.from(col, (v) => Math.round(v)), solid: Array.from(solid) });
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  const idx = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!solid[i]) continue;
    const edge = (x > 0 && !solid[i - 1]) || (x < w - 1 && !solid[i + 1]) || (y > 0 && !solid[i - w]) || (y < h - 1 && !solid[i + w]);
    const k = edge ? light.edge : 1, dith = (BAYER4[(x & 3) + ((y & 3) << 2)] / 16 - 0.47) * light.dither;
    idx[i] = nearest(col[i * 3] * k + dith, col[i * 3 + 1] * k + dith, col[i * 3 + 2] * k + dith);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { w: 1, h: 1, x0: 0, y0: 0, data: [0] };
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = new Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out[y * cw + x] = idx[(y + y0) * w + x + x0];
  return { w: cw, h: ch, x0, y0, data: out };
}

window.bakeViewmodel = async (cfg) => {
  const out = { arms: {}, weapons: {}, fused: {}, previews: [] };
  for (const [id, F] of Object.entries(cfg.fused || {})) {
    const M = await loadStatic(F.url);
    if (F.mirror) {
      // Generated as a left hand: flip it into a right one (points and all) before posing.
      M.model.scale.x *= -1;
      for (const p of M.pts) p.x = -p.x;
      for (const k of ['elbow', 'hand', 'tip']) F[k] = [-F[k][0], F[k][1], F[k][2]];
    }
    {
      // Width of the fist across the forearm, from the points around its centre.
      const h = V3(F.hand), fore = h.clone().sub(V3(F.elbow)).normalize();
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
      const len = 0.6, dir = fore.clone().negate();
      // Coarse woven linen: a little noise and some lengthwise folds.
      const px = new Uint8Array(64 * 64 * 4);
      for (let i = 0; i < 64 * 64; i++) {
        const x = i % 64, y = i >> 6, shade = Math.sin(x / 64 * Math.PI * 6 + Math.sin(y * 0.15) * 1.5) * 12 + (Math.random() - 0.5) * 14;
        px.set([176 + shade, 168 + shade, 148 + shade, 255], i * 4);
      }
      const tex = new THREE.DataTexture(px, 64, 64);
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 6); tex.needsUpdate = true;
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.06, radius, len, 24, 1, true),
        new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
      sleeve.position.copy(c).add(dir.clone().multiplyScalar(len / 2 - 0.01));
      sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      sleeve.castShadow = sleeve.receiveShadow = true;
      M.model.add(sleeve);
    }
    const poses = cfg[F.poses || (F.set === 'fist' ? 'fist' : 'swing')];
    out.fused[id] = poses.map((p) => { placeFused(M, F, p, cfg.armLength); const raw = []; const s = shootScreen([M.holder], cfg, cfg.preview ? raw : null); if (cfg.preview) out.previews.push(raw[0]); return s; });
  }
  if (cfg.fusedOnly) return out;
  const arms = {};
  for (const [id, a] of Object.entries(cfg.arms)) { const M = await loadStatic(a.url); arms[id] = { M, ax: armAxes(M.pts), sign: a.sign || 1 }; }
  const weapons = {};
  for (const [id, W] of Object.entries(cfg.weapons)) { const M = await loadStatic(W.url); weapons[id] = { M, wx: weaponAxes(M.pts, W), W }; }
  if (!cfg.previewOnly) {
    for (const [id, A] of Object.entries(arms)) {
      out.arms[id] = {
        swing: cfg.swing.map((p) => { placeArm(A.M, A.ax, p, cfg.armLength, A.sign); return shootScreen([A.M.holder], cfg); }),
        fist: cfg.fist.map((p) => { placeArm(A.M, A.ax, p, cfg.armLength, A.sign); return shootScreen([A.M.holder], cfg); }),
      };
    }
    for (const [id, Wp] of Object.entries(weapons)) {
      // Posed with the first arm's grip, which every arm shares closely enough.
      const A = arms[Object.keys(arms)[0]];
      out.weapons[id] = cfg.swing.map((p) => { placeArm(A.M, A.ax, p, cfg.armLength, A.sign); placeWeapon(Wp.M, Wp.wx, p, Wp.W, A.M.gripWorld); return shootScreen([Wp.M.holder], cfg); });
    }
  }
  // Raw previews: every swing frame with the first arm and each weapon, plus the punches.
  if (cfg.preview) {
    const A = arms[Object.keys(arms)[0]];
    const ids = Object.keys(weapons).length ? Object.keys(weapons) : [null];
    for (const id of ids) {
      for (const p of cfg.swing) {
        placeArm(A.M, A.ax, p, cfg.armLength, A.sign);
        const objs = [A.M.holder];
        if (id) { placeWeapon(weapons[id].M, weapons[id].wx, p, weapons[id].W, A.M.gripWorld); objs.push(weapons[id].M.holder); }
        const raw = []; shootScreen(objs, cfg, raw);
        out.previews.push(raw[0]);
      }
    }
    for (const p of cfg.fist) { placeArm(A.M, A.ax, p, cfg.armLength, A.sign); const raw = []; shootScreen([A.M.holder], cfg, raw); out.previews.push(raw[0]); }
  }
  return out;
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
