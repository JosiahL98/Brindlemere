// The motion viewer: the first-person arm and the baked villagers and animals moving live in 3D,
// posed by the same code the bakers use (tools/bake/), next to the frames the game shows.
// Started by tools/viewer.js.
import { THREE, LIGHT_VIEW, loadVillager, poseVillager, framePhase, loadFused, placeFused } from '/tools/bake/bake.mjs';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MOVES, FUSED, ARM, armPose, SHOULDER, armLength } from '/tools/bake/arm.mjs';
import { BAKES, bakeConfig } from '/tools/bake/bakes.mjs';

const $ = (s) => document.querySelector(s);
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const num = (x) => (x >= 0 ? ' ' : '') + x.toFixed(2);
const vec = (a) => (a ? `[${Array.from(a).map(num).join(',')}]` : '—');
const status = (s) => { $('#status').textContent = s; };
const OUT_LAYER = 1; // guides only the outside view shows

// ---- Renderers and cameras ------------------------------------------------------------------
function renderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.localClippingEnabled = true;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  return r;
}
const eyeR = renderer($('#eye')), outR = renderer($('#out'));
// The game's camera: 90 degrees across a 320x200 view, at the eye.
const eyeCam = new THREE.PerspectiveCamera(2 * Math.atan(100 / 160) * 180 / Math.PI, 1.6, 0.5, 3000);
const outCam = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
outCam.layers.enable(OUT_LAYER);
const controls = new OrbitControls(outCam, $('#out'));
controls.enableDamping = true;
const onLayer = (o) => { o.traverse((c) => c.layers.set(OUT_LAYER)); return o; };
const basic = (color, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color }, o));
const ball = (r, color) => new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), basic(color));
function lineTo(color) {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
}
const setLine = (l, a, b) => { const p = l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; l.geometry.computeBoundingSphere(); };

// ---- The first-person scene -------------------------------------------------------------------
// Camera space, as baked: the eye at the origin looking down -z, the ground 50 below.
const arm = { scene: new THREE.Scene() };
{
  const S = arm.scene;
  S.background = new THREE.Color(0x4a3f5c);
  const amb = new THREE.AmbientLight(0xffffff, ARM.light.ambient), key = new THREE.DirectionalLight(0xffffff, ARM.light.key), fill = new THREE.DirectionalLight(0xffffff, ARM.light.fill);
  key.position.copy(LIGHT_VIEW).multiplyScalar(200); key.target.position.set(0, 0, -20);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 500 });
  fill.position.set(0, 0, 200); fill.target.position.set(0, 0, -20);
  S.add(amb, key, key.target, fill, fill.target);
  // The ground and something a weapon's reach away to hit.
  arm.setting = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: 0x5a5a3e }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -50;
  const grid = new THREE.GridHelper(640, 20, 0x2f2f20, 0x46462f); grid.position.y = -49.9;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 56, 16), new THREE.MeshLambertMaterial({ color: 0x8a6a48 }));
  post.position.set(0, -22, -60);
  arm.setting.add(ground, grid, post);
  S.add(arm.setting);
  // Guides: the head, its view, the shoulder and upper arm, and arrows for the forearm, palm
  // and weapon; the hand's path through the move, with a dot at each baked frame.
  const g = arm.guides = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(5.5, 24, 14), basic(0x9db4ff, { wireframe: true, transparent: true, opacity: 0.35 }));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 12), basic(0x9db4ff)); nose.rotation.x = -Math.PI / 2; nose.position.z = -6.5;
  const view = eyeCam.clone(); view.far = 45; view.updateProjectionMatrix();
  const frustum = new THREE.CameraHelper(view);
  arm.shoulder = ball(1.3, 0xffd34d); arm.shoulder.position.copy(V3(SHOULDER));
  arm.elbow = ball(1.1, 0xffa04d);
  arm.upper = lineTo(0xffd34d);
  arm.foreArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 12, 0xff5a5a, 2, 1.2);
  arm.palmArrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 6, 0x58e070, 1.6, 1);
  arm.weaponArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 12, 0x5aa0ff, 2, 1.2);
  arm.path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  arm.dots = new THREE.Group();
  g.add(head, nose, frustum, arm.shoulder, arm.elbow, arm.upper, arm.foreArrow, arm.palmArrow, arm.weaponArrow, arm.path, arm.dots);
  S.add(onLayer(g));
}

// ---- The villager scene -----------------------------------------------------------------------
const vil = { scene: new THREE.Scene() };
{
  const S = vil.scene;
  S.background = new THREE.Color(0x4a3f5c);
  const amb = new THREE.AmbientLight(0xffffff, 1.1), key = new THREE.DirectionalLight(0xffffff, 2.4), fill = new THREE.DirectionalLight(0xffffff, 0.5);
  key.position.set(-110, 160, 130); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -90, right: 90, top: 120, bottom: -40, near: 1, far: 600 });
  fill.position.set(80, 60, -100);
  S.add(amb, key, fill);
  vil.setting = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: 0x5a5a3e }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  const grid = new THREE.GridHelper(256, 16, 0x2f2f20, 0x46462f); grid.position.y = 0.05; // lines a quarter-tile (16 units) apart
  vil.setting.add(ground, grid);
  // Tobin's anvil, where it stands in town: 28 units in front of him, its face 22.6 up.
  const iron = new THREE.MeshLambertMaterial({ color: 0x55585e }), wood = new THREE.MeshLambertMaterial({ color: 0x5c4630 });
  const anvil = vil.anvil = new THREE.Group();
  const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; anvil.add(m); return m; };
  part(new THREE.CylinderGeometry(5.5, 6, 12, 16), wood, 0, 6, 0);
  part(new THREE.BoxGeometry(10, 4, 7), iron, 0, 14, 0);
  part(new THREE.BoxGeometry(6, 4, 5), iron, 0, 17.5, 0);
  part(new THREE.BoxGeometry(14, 3.2, 6.4), iron, 1, 21, 0);
  const horn = part(new THREE.ConeGeometry(1.6, 5, 10), iron, -8.5, 21.6, 0); horn.rotation.z = Math.PI / 2;
  anvil.position.set(0, 0, 27.7);
  vil.setting.add(anvil);
  S.add(vil.setting);
  vil.extras = new THREE.Group(); S.add(vil.extras);
  // Guides: which way the model faces, and where a scripted move sends each wrist.
  const g = vil.guides = new THREE.Group();
  g.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), 30, 0xffd34d, 4, 2.5));
  vil.targetR = ball(1.4, 0xff5a5a); vil.targetL = ball(1.4, 0x5aa0ff);
  g.add(vil.targetR, vil.targetL);
  S.add(onLayer(g));
}

// ---- What the game shows: the baked sprites ---------------------------------------------------
const gameC = $('#game'), gctx = gameC.getContext('2d');
let vmSprites = null;
async function unpackViewmodel() {
  const raw = await bakedData(BAKED_VM);
  const out = {};
  let off = 0;
  for (const [id, f, w, h, x0, y0] of BAKED_VM.index) { out[`${id}:${f}`] = { w, h, x0, y0, data: raw.subarray(off, off + w * h) }; off += w * h; }
  return out;
}
const villSprites = new Map(); // name -> { meta, sprites: { 'action:frame:rot': sprite } }
async function unpackVillager(name) {
  if (villSprites.has(name)) return villSprites.get(name);
  if (!BAKED[name]) {
    await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = `/game/js/data/baked/${name}.js`; s.onload = ok; s.onerror = fail; document.head.appendChild(s); }).catch(() => null);
  }
  const B = BAKED[name];
  if (!B) { villSprites.set(name, null); return null; }
  const raw = await bakedData(B), sprites = {};
  let off = 0;
  for (const [action, frame, rot, w, h, ax, ay] of B.index) { sprites[`${action}:${frame}:${rot}`] = { w, h, ax, ay, data: raw.subarray(off, off + w * h) }; off += w * h; }
  const v = { meta: B, sprites };
  villSprites.set(name, v);
  return v;
}
// Palette index -> RGB, the sleeve's STONE ramp shown in the starting farm clothes' olive.
function blit(img, s, ox, oy, scale, sleeve) {
  const W = img.width;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    let v = s.data[y * s.w + x];
    if (!v) continue;
    if (sleeve && (v & 0xF0) === R.STONE) v = R.OLIVE + clamp((v & 0xF) - 1, 0, 15);
    for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) {
      const X = ox + x * scale + i, Y = oy + y * scale + j;
      if (X < 0 || Y < 0 || X >= W || Y >= img.height) continue;
      const o = (Y * W + X) * 4;
      img.data[o] = PAL[v * 3]; img.data[o + 1] = PAL[v * 3 + 1]; img.data[o + 2] = PAL[v * 3 + 2]; img.data[o + 3] = 255;
    }
  }
}
function drawGameArm(id, f) {
  gameC.width = 320; gameC.height = 200;
  const img = gctx.createImageData(320, 200);
  for (let y = 0; y < 200; y++) for (let x = 0; x < 320; x++) {
    const o = (y * 320 + x) * 4, sky = y < 100, k = sky ? y / 100 : (y - 100) / 100;
    img.data.set(sky ? [120 - 40 * k, 90 - 20 * k, 140 - 30 * k, 255] : [70 + 20 * k, 70 + 20 * k, 48 + 10 * k, 255], o);
  }
  const s = vmSprites && vmSprites[`${id}:${f}`];
  if (s) blit(img, s, s.x0, s.y0, 1, true);
  gctx.putImageData(img, 0, 0);
  gctx.fillStyle = '#ff0'; gctx.fillRect(159, 99, 2, 2);
}
function drawGameVillager(v, action, f, rot) {
  const sprites = v && v.sprites, s = sprites && sprites[`${action}:${f}:${rot}`];
  const scale = 3, W = s ? s.w * scale + 40 : 200, H = s ? s.h * scale + 40 : 120;
  gameC.width = W; gameC.height = H;
  const img = gctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) img.data.set([46, 40, 54, 255], i * 4);
  if (s) blit(img, s, 20, 20, scale, false);
  gctx.putImageData(img, 0, 0);
  if (s) { gctx.fillStyle = 'rgba(255,211,77,.7)'; gctx.fillRect(0, 20 + s.ay * scale, W, 1); }
  else { gctx.fillStyle = '#9a9188'; gctx.font = '12px sans-serif'; gctx.fillText('not baked yet', 60, 64); }
}

// ---- Subjects ---------------------------------------------------------------------------------
const itemByName = (n) => Object.values(ITEMS).find((it) => it.name.toLowerCase() === n.toLowerCase());
const state = { kind: null, id: null, action: null, t: 0, playing: true, speed: 1, rot: 0, hold: 0 };
let cur = null; // the loaded subject
const fusedCache = new Map(), villCache = new Map();

async function showArm(id) {
  status(`Loading ${id}…`);
  const F = FUSED[id];
  if (!fusedCache.has(id)) fusedCache.set(id, await loadFused(F, ARM));
  if (cur && cur.dispose) cur.dispose();
  const M = fusedCache.get(id), objs = [M.holder, M.hand.holder, ...M.sleeves];
  for (const o of objs) arm.scene.add(o);
  const move = MOVES[F.move], it = itemByName(F.items[0]);
  const dur = it ? it.swing : 0.5;
  // The hand's path through the whole move, and the baked frames along it.
  const pts = [];
  for (let i = 0; i <= 120; i++) pts.push(V3(armPose(move.keys, i / 120 * 1.15).hand));
  arm.path.geometry.dispose(); arm.path.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  arm.dots.clear();
  move.frames.forEach((p, n) => { const d = ball(0.55, new THREE.Color().setHSL(n / move.frames.length * 0.8, 0.9, 0.6).getHex()); d.position.copy(V3(armPose(move.keys, p).hand)); arm.dots.add(onLayer(d)); });
  cur = {
    kind: 'arm', id, M, move, dur, span: 1.15,
    frames: move.frames, // phases
    keys: move.keys.map((k) => k.at),
    dispose() { for (const o of objs) arm.scene.remove(o); },
    describe: `${F.items.join(' / ')}: the ${F.move} (a swing takes ${dur.toFixed(2)} s in the game; the blow lands at phase 0.42)`,
  };
  outCam.position.set(38, 14, 22); controls.target.set(3, -4, -12); controls.update();
  status('');
}
async function showVillager(name, actionId) {
  const cfg = bakeConfig(name);
  const A = cfg.actions.find((a) => a.id === actionId) || cfg.actions[0];
  status(`Loading ${name} ${A.id}…`);
  const key = `${name}:${A.id}`;
  if (!villCache.has(key)) {
    // The first action sets the scale for all of them, as in the baker.
    const scale = villCache.get(`${name}:scale`) || { value: null };
    if (scale.value == null) await loadVillager(cfg, cfg.actions[0], scale);
    villCache.set(`${name}:scale`, scale);
    villCache.set(key, await loadVillager(cfg, A, scale));
  }
  if (cur && cur.dispose) cur.dispose();
  const Vl = villCache.get(key), M = Vl.M;
  vil.scene.add(M.holder);
  let skel = null;
  const baked = await unpackVillager(name);
  const meta = baked && baked.meta.actions[A.id];
  cur = {
    kind: 'villager', id: name, action: A.id, V: Vl, A, cfg, baked,
    span: 1, dur: Vl.period,
    frames: Array.from({ length: A.frames }, (_, f) => framePhase(A, f)),
    keys: Vl.script ? Vl.script.keys.map((k) => k.at) : [],
    dispose() { vil.scene.remove(M.holder); if (skel) vil.scene.remove(skel); vil.extras.clear(); },
    setSkeleton(on) {
      if (on && !skel) { skel = new THREE.SkeletonHelper(M.model); vil.scene.add(skel); }
      if (!on && skel) { vil.scene.remove(skel); skel = null; }
    },
    describe: `${name}, ${A.id}: ${A.clip.startsWith('@') ? `scripted (${A.clip.slice(1)}) over the idle pose` : A.clip.startsWith('!') ? `scripted (${A.clip.slice(1)}) over the standing pose` : `Tripo's "${A.clip}" animation`}, ${A.frames} baked frames${A.once ? ', plays once' : ', loops'}; ${Vl.period.toFixed(2)} s${meta ? ` (in game ${(A.frames / meta.fps).toFixed(2)} s)` : ''}`,
  };
  cur.setSkeleton($('#skeleton').checked);
  vil.anvil.visible = name === 'tobin';
  const h = cfg.height;
  if (state.id !== name || state.kind !== 'villager') { outCam.position.set(h * 1.7, h * 0.9, h * 1.5); controls.target.set(0, h * 0.5, h * 0.15); controls.update(); }
  status('');
}

// ---- The list ---------------------------------------------------------------------------------
function buildList() {
  const nav = $('#list');
  const section = (title, items) => {
    nav.insertAdjacentHTML('beforeend', `<h2>${title}</h2>`);
    for (const [kind, id, label, note] of items) {
      const b = document.createElement('button');
      b.innerHTML = `${label}${note ? ` <small>${note}</small>` : ''}`;
      b.dataset.kind = kind; b.dataset.id = id;
      b.addEventListener('click', () => select(kind, id));
      nav.appendChild(b);
    }
  };
  section('Your arm', Object.entries(FUSED).map(([id, F]) => ['arm', id, F.items[0], F.move]));
  const cast = Object.entries(BAKES).filter(([, b]) => !b.beast), beasts = Object.entries(BAKES).filter(([, b]) => b.beast);
  const note = (b) => (b.actions.includes('@') ? b.actions.match(/@(\w+)/g).join(' ').replace(/@/g, '') : '');
  section('Villagers', cast.map(([id, b]) => ['villager', id, id[0].toUpperCase() + id.slice(1), note(b)]));
  section('Animals', beasts.map(([id]) => ['villager', id, id[0].toUpperCase() + id.slice(1), '']));
}
async function select(kind, id, actionId) {
  for (const b of document.querySelectorAll('nav button')) b.classList.toggle('on', b.dataset.kind === kind && b.dataset.id === id);
  $('#views').classList.toggle('villager', kind === 'villager');
  for (const e of document.querySelectorAll('.arm-only')) e.style.display = kind === 'arm' ? '' : 'none';
  for (const e of document.querySelectorAll('.vill-only')) e.style.display = kind === 'villager' ? '' : 'none';
  const sel = $('#action');
  if (kind === 'arm') {
    $('#action-wrap').style.display = 'none';
    await showArm(id);
  } else {
    const cfg = bakeConfig(id);
    // Scripted moves first: they're the ones to look at.
    const acts = cfg.actions.slice().sort((a, b) => (/[@!]/.test(b.clip) && b.clip !== '!rest') - (/[@!]/.test(a.clip) && a.clip !== '!rest'));
    const pick = actionId || (state.id === id && state.action) || acts[0].id;
    sel.innerHTML = acts.map((a) => `<option value="${a.id}"${a.id === pick ? ' selected' : ''}>${a.id} (${a.clip})</option>`).join('');
    $('#action-wrap').style.display = '';
    await showVillager(id, pick);
  }
  Object.assign(state, { kind, id, action: kind === 'villager' ? $('#action').value : null, t: 0, hold: 0 });
  $('#out-title').textContent = kind === 'arm' ? 'From outside: the head, its view (blue), shoulder and upper arm (yellow), forearm (red), palm (green), weapon (blue). Drag to turn, right-drag to pan, scroll to zoom'
    : 'Live 3D: drag to turn, right-drag to pan, scroll to zoom. Red and blue balls: where a scripted move sends the right and left wrists';
  $('#game-title').textContent = kind === 'arm' ? 'In the game: the baked frame shown at this point of the swing' : 'In the game: the baked frame, from the chosen side';
  $('#rots').style.display = kind === 'villager' ? '' : 'none';
  drawTicks();
  const hash = `#${kind}/${id}${kind === 'villager' ? '/' + state.action : ''}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}
$('#action').addEventListener('change', async () => { state.action = $('#action').value; await showVillager(state.id, state.action); state.t = 0; drawTicks(); history.replaceState(null, '', `#villager/${state.id}/${state.action}`); });

// Eight sides to view the baked sprite from.
{
  const names = ['front', 'front-left', 'left', 'back-left', 'back', 'back-right', 'right', 'front-right'];
  const box = $('#rots');
  names.forEach((n, r) => {
    const b = document.createElement('button'); b.className = 'b' + (r === 0 ? ' on' : ''); b.textContent = n;
    b.addEventListener('click', () => { state.rot = r; for (const x of box.children) x.classList.toggle('on', x === b); });
    box.appendChild(b);
  });
}

// ---- Timeline ---------------------------------------------------------------------------------
const ticks = $('#ticks'), tctx = ticks.getContext('2d');
function drawTicks() {
  const w = ticks.clientWidth, h = 16;
  ticks.width = w; ticks.height = h;
  tctx.clearRect(0, 0, w, h);
  ticks.dataset.w = w;
  if (!cur) return;
  const x = (p) => 8 + (w - 16) * p / cur.span;
  tctx.fillStyle = '#9a9188';
  for (const k of cur.keys) tctx.fillRect(Math.round(x(k)), 0, 1, 6);
  tctx.font = '10px ui-monospace, monospace';
  cur.frames.forEach((p, n) => { tctx.fillStyle = '#d8b25a'; tctx.fillRect(Math.round(x(p)) - 1, 6, 3, 4); if (cur.frames.length < 16 || n % 2 === 0) tctx.fillText(n, Math.round(x(p)) - 3, 16); });
  if (cur.kind === 'arm') { tctx.fillStyle = '#ff5a5a'; tctx.fillRect(Math.round(x(0.42)), 0, 2, 10); }
}
// Which baked frame the game shows at this point.
function bakedFrame(t) {
  const P = cur.frames;
  if (cur.kind === 'arm') {
    if (t <= 0) return 0;
    let f = 1;
    while (f < P.length - 1 && P[f + 1] <= t + 0.03) f++;
    return f;
  }
  const A = cur.A;
  return A.once ? Math.round(t * (A.frames - 1)) : Math.floor(t * A.frames) % A.frames;
}
$('#play').addEventListener('click', () => { state.playing = !state.playing; $('#play').textContent = state.playing ? 'Pause' : 'Play'; });
$('#speed').addEventListener('change', () => { state.speed = +$('#speed').value; });
$('#t').addEventListener('input', () => { state.t = +$('#t').value / 1000 * cur.span; state.playing = false; $('#play').textContent = 'Play'; });
const step = (d) => {
  if (!cur) return;
  state.playing = false; $('#play').textContent = 'Play';
  const f = Math.max(0, Math.min(cur.frames.length - 1, bakedFrame(state.t) + d));
  state.t = cur.frames[f];
};
$('#prev').addEventListener('click', () => step(-1));
$('#next').addEventListener('click', () => step(1));
document.addEventListener('keydown', (e) => {
  if (e.target.closest('select, input[type=text]')) return;
  if (e.key === ' ') { e.preventDefault(); $('#play').click(); }
  if (e.key === ',') step(-1);
  if (e.key === '.') step(1);
});

// ---- Each frame -------------------------------------------------------------------------------
function sizeTo(r, cam, canvas, pixel) {
  const w = pixel ? 320 : canvas.clientWidth, h = pixel ? 200 : canvas.clientHeight;
  if (!w || !h) return;
  if (r.domElement.width !== Math.round(w * (pixel ? 1 : devicePixelRatio)) || r.domElement.height !== Math.round(h * (pixel ? 1 : devicePixelRatio))) {
    r.setPixelRatio(pixel ? 1 : devicePixelRatio);
    r.setSize(w, h, false);
  }
  cam.aspect = w / h; cam.updateProjectionMatrix();
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  controls.update();
  if (!cur) return;
  if (+ticks.dataset.w !== ticks.clientWidth) drawTicks();
  // Advance: a move plays through, holds a moment, and starts again.
  if (state.playing) {
    if (state.hold > 0) { state.hold -= dt; if (state.hold <= 0) state.t = 0; }
    else {
      state.t += dt * state.speed / cur.dur;
      if (state.t >= cur.span) { if (cur.kind === 'arm' || cur.A.once) { state.t = cur.span; state.hold = 0.6; } else state.t -= cur.span; }
    }
  }
  const f = bakedFrame(Math.min(state.t, cur.span - 1e-6));
  const t = $('#snap').checked ? cur.frames[f] : state.t;
  $('#t').value = Math.round(state.t / cur.span * 1000);
  const guides = $('#guides').checked, setting = $('#setting').checked;
  let read = `<b>${cur.describe}</b>\n`;
  if (cur.kind === 'arm') {
    const fr = armPose(cur.move.keys, Math.min(t, 1.15));
    placeFused(cur.M, cur.M.F, fr, ARM);
    // Guides
    const E = V3(fr.elbow), H = V3(fr.hand);
    arm.elbow.position.copy(E); setLine(arm.upper, V3(SHOULDER), E);
    arm.foreArrow.position.copy(E); arm.foreArrow.setDirection(V3(fr.fore));
    arm.palmArrow.position.copy(H); arm.palmArrow.setDirection(V3(fr.palm).projectOnPlane(V3(fr.fore)).normalize());
    arm.weaponArrow.visible = !!fr.weapon;
    if (fr.weapon) { arm.weaponArrow.position.copy(H); arm.weaponArrow.setDirection(V3(fr.weapon)); }
    arm.guides.visible = guides; arm.setting.visible = setting;
    sizeTo(eyeR, eyeCam, $('#eye'), $('#pixel').checked);
    $('#eye').classList.toggle('pixel', $('#pixel').checked);
    eyeR.render(arm.scene, eyeCam);
    sizeTo(outR, outCam, $('#out'), false);
    outR.render(arm.scene, outCam);
    drawGameArm(cur.id, f);
    $('#phase').textContent = `phase ${t.toFixed(3)} / 1.15 · frame ${f}`;
    read += `keyframe ${fr.key} → ${fr.key + 1} (at ${cur.keys[fr.key]} → ${cur.keys[fr.key + 1]})\n`
      + `elbow ${vec(fr.elbow)}   forearm ${vec(fr.fore)}   upper arm ${armLength(fr).toFixed(1)} long (real 11)\n`
      + `hand  ${vec(fr.hand)}   palm ${vec(fr.palm)}   weapon ${vec(fr.weapon)}\n`
      + `camera space, game units: x right, y up, -z ahead; the eye at the origin, the shoulder at ${vec(SHOULDER)}`;
  } else {
    const targets = poseVillager(cur.V, Math.min(t, 1));
    vil.extras.clear();
    for (const e of cur.V.M.extras || []) vil.extras.add(e);
    const h = cur.cfg.height;
    vil.targetR.visible = !!(targets && targets.R); vil.targetL.visible = !!(targets && targets.L);
    if (targets && targets.R) vil.targetR.position.copy(targets.R);
    if (targets && targets.L) vil.targetL.position.copy(targets.L);
    vil.guides.visible = guides; vil.setting.visible = setting;
    sizeTo(outR, outCam, $('#out'), false);
    outR.render(vil.scene, outCam);
    drawGameVillager(cur.baked, cur.A.id, f, state.rot);
    $('#phase').textContent = `phase ${t.toFixed(3)} / 1 · frame ${f} of ${cur.A.frames}`;
    const H = (v) => (v ? vec(v.toArray().map((x) => x / h)) : '—');
    if (targets) read += `wrist targets, in heights (x to their left, y up, z ahead): right ${H(targets.R)}   left ${H(targets.L)}\n`;
    const hand = (side) => { const b = cur.V.M.model.getObjectByName(side + '_Hand'); return b ? b.getWorldPosition(new THREE.Vector3()) : null; };
    if (cur.V.M.model.getObjectByName('R_Hand')) read += `wrists reached: right ${H(hand('R'))}   left ${H(hand('L'))}   (height ${h} units)\n`;
    if (cur.id === 'tobin') read += `the anvil's face is 22.6 units up (${(22.6 / h).toFixed(2)} of his height), 27.7 ahead (${(27.7 / h).toFixed(2)})`;
  }
  $('#readout').innerHTML = read;
}

// ---- Legend and start ---------------------------------------------------------------------------
$('#legend').innerHTML = '';
for (const id of ['#guides', '#setting', '#skeleton']) $(id).addEventListener('change', () => { if (id === '#skeleton' && cur && cur.setSkeleton) cur.setSkeleton($(id).checked); });
window.addEventListener('resize', drawTicks);
buildList();
unpackViewmodel().then((s) => { vmSprites = s; }).catch((e) => console.error(e));
// The address names what's shown (#arm/hammer, #villager/tobin/work), so a view can be linked to.
function fromHash() {
  const [kind, id, action] = (location.hash.slice(1) || 'arm/hammer').split('/');
  if (kind === state.kind && id === state.id && (!action || action === state.action)) return Promise.resolve();
  return select(kind === 'villager' ? 'villager' : 'arm', id || 'hammer', action);
}
window.addEventListener('hashchange', fromHash);
fromHash().then(() => requestAnimationFrame(frame));
