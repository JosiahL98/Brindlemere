'use strict';
// The first-person weapon: a sleeved arm swinging whatever is equipped, drawn in screen space
// like Arena's. Baked from Tripo models posed by a real arm (tools/bake-viewmodel.js); the
// sculpted version below stands in until they load, with frames 0 ready, 1 wind-up, 2 strike,
// 3 follow-through, 4 recover.

const VM_FRAMES = [
  // wrist [x, y], elbow [x, y], weapon angle (degrees, 0 = pointing right)
  { w: [12, 6], e: [36, -26], a: 112 },
  { w: [26, 24], e: [44, -6], a: 70 },
  { w: [0, 12], e: [30, -16], a: 158 },
  { w: [-18, -4], e: [16, -30], a: 214 },
  { w: [6, 0], e: [30, -28], a: 140 },
];
const FIST_FRAMES = [
  { w: [14, 2], e: [36, -30], a: 100 },
  { w: [20, 8], e: [40, -24], a: 95 },
  { w: [-4, 16], e: [22, -10], a: 100 },
  { w: [-2, 12], e: [24, -14], a: 100 },
  { w: [8, 4], e: [32, -28], a: 100 },
];
const VM_RES = 2.1, VM_WEAPON_SCALE = 1.7;
const _vmCache = new Map();
// Merges two indexed sprites: `back` with its origin at pixel (bx, by) of `front`, under it.
function layerSprites(back, bx, by, front) {
  const ox = Math.round(bx - back.ax), oy = Math.round(by - back.ay);
  const x0 = Math.min(0, ox), y0 = Math.min(0, oy);
  const w = Math.max(front.w, ox + back.w) - x0, h = Math.max(front.h, oy + back.h) - y0;
  const data = new Uint16Array(w * h).fill(0xFFFF);
  const put = (spr, dx, dy) => {
    for (let j = 0; j < spr.h; j++) for (let i = 0; i < spr.w; i++) {
      const v = spr.data[j * spr.w + i];
      if (v !== 0xFFFF) data[(j + dy) * w + i + dx] = v;
    }
  };
  put(back, ox - x0, oy - y0);
  put(front, -x0, -y0);
  return { w, h, ax: front.ax - x0, ay: front.ay - y0, res: front.res, data };
}
// Which baked arm-and-weapon model each item uses (tools/bake-viewmodel.js).
const VM_BAKED_WEAPON = { fists: 'empty', wood_club: 'club', iron_dagger: 'dagger', rusty_dagger: 'rusty_dagger', fishing_knife: 'knife', smith_hammer: 'hammer',
  iron_sword: 'sword', bram_sword: 'sword', steel_longsword: 'longsword', iron_axe: 'axe', iron_mace: 'mace' };
// The linen sleeve bakes to the STONE ramp, which nothing else in these sprites uses; it takes
// the colour of the tunic worn, shade for shade, or turns to riveted rings under a mail shirt.
const VM_SLEEVE_SHIFT = { OLIVE: -1, BONE: 1, BROWN: -3, RUST: -2 };
function bakedViewmodelFrames(weaponId, bodyId) {
  const S = BAKED_VM.sprites, body = bodyId ? ITEMS[bodyId] : null;
  const id = VM_BAKED_WEAPON[weaponId] || VM_BAKED_WEAPON.fists;
  if (!S[`${id}:0`]) return null;
  const mail = body && body.model === 'mail', tint = mail ? 'STEEL' : body ? body.tint || 'BONE' : 'OLIVE';
  const stone = R.STONE, shift = mail ? -5 : VM_SLEEVE_SHIFT[tint] || 0;
  const frames = [];
  for (let f = 0; S[`${id}:${f}`]; f++) {
    const s = S[`${id}:${f}`];
    const data = s.data.map((v, i) => {
      if (v === 0xFFFF || (v & 0xF0) !== stone) return v;
      // Mail: a little checker of light and dark rings.
      const ring = mail ? ((((s.x0 + i % s.w) >> 1) + ((s.y0 + Math.floor(i / s.w)) >> 1)) & 1 ? 2 : -1) : 0;
      return R[tint] + clamp((v & 0xF) + shift + ring, 0, 15);
    });
    frames.push({ w: s.w, h: s.h, ax: VM_ANCHOR_X - s.x0, ay: VM_ANCHOR_Y - s.y0, res: 1, data });
  }
  frames.phases = BAKED_VM.phases[BAKED_VM.moves[id]];
  return frames;
}
const VM_ANCHOR_X = 222, VM_ANCHOR_Y = 178; // drawViewmodel's anchor; baked sprites are in screen space
function viewmodelFrames(weaponId, bodyId) {
  const key = weaponId + '|' + (bodyId || '');
  if (_vmCache.has(key)) return _vmCache.get(key);
  const baked = typeof BAKED_VM === 'object' && BAKED_VM.sprites ? bakedViewmodelFrames(weaponId, bodyId) : null;
  if (baked) { _vmCache.set(key, baked); return baked; }
  const W = ITEMS[weaponId] || ITEMS.fists;
  const body = bodyId ? ITEMS[bodyId] : null;
  const sleeve = body && body.model === 'mail' ? mat('STEEL', { amb: 0.12, dif: 0.75, spec: 0.7, shin: 12, bias: -1, noise: 0.4, pattern: (x, y) => (((Math.floor(x * 1.5) + Math.floor(y * 1.5)) & 1) ? -2 : 0.5) })
    : mat(body ? body.tint || 'BROWN' : 'OLIVE', { amb: 0.14, dif: 0.86, bias: -1, noise: 0.8, nf: 1, pattern: (x, y, z) => Math.sin(y * 1.2 + Math.atan2(x, z) * 2) * 0.6 });
  const skin = mat('FLESH', { amb: 0.16, dif: 0.92, fill: 0.12, gain: 0.9, bias: -1.4, spec: 0.2, shin: 6, noise: 0.35, edge: 1.8 });
  const cuff = mat('BROWN', { amb: 0.12, dif: 0.85, bias: -2.2, spec: 0.25, noise: 0.6, edge: 1.4, pattern: (x, y) => Math.sin(y * 3.1) * 0.5 });
  const fists = W.model === 'fists';
  const frames = (fists ? FIST_FRAMES : VM_FRAMES).map((F) => {
    const s = new Shape();
    const a = F.a * DEG;
    const wr = [F.w[0], F.w[1], 0];
    // Grip frame: +y runs up the handle, +x is the back of the hand, +z faces the viewer.
    const g = Frame.along(wr, [Math.cos(a), Math.sin(a), 0], [0, 0, 1]);
    const wrist = g.point(3.6, -2.2, -0.6);
    const el = [F.e[0], F.e[1], -3], sh = [F.e[0] + 30, F.e[1] - 40, -6];
    const fore = V.norm(V.sub(wrist, el));
    const cuffAt = V.sub(wrist, V.scale(fore, 3.2));
    s.limb(sh, el, 8.2, 7.0, sleeve, { k: 2 });
    s.limb(el, V.sub(cuffAt, V.scale(fore, 2.2)), 6.8, 5.6, sleeve, { k: 1.5 });
    s.limb(V.sub(cuffAt, V.scale(fore, 2.6)), V.add(cuffAt, V.scale(fore, 0.6)), 5.3, 5.0, cuff, { k: 0.6 });
    s.limb(cuffAt, wrist, 3.9, 3.5, skin, { k: 1 });
    // Palm and back of the hand, wrapped around the grip
    s.ellipsoid(g.moved(2.0, -0.2, 0), [2.9, 4.4, 3.2], skin, { k: 1.4 });
    // Four fingers stacked up the handle, curling over its front; index at the top.
    const fy = [3.0, 1.0, -1.0, -2.9], fr = [1.32, 1.4, 1.34, 1.15];
    for (let i = 0; i < 4; i++) {
      const y = fy[i], r = fr[i];
      const k1 = g.point(3.6, y, 1.2), k2 = g.point(1.3, y, 3.1), k3 = g.point(-1.3, y, 2.6), tip = g.point(-2.2, y - 0.1, 0.6);
      s.sphere(k1, r * 1.12, skin, { k: 0.5 });
      s.limb(k1, k2, r * 1.08, r, skin, { k: 0.35 });
      s.limb(k2, k3, r, r * 0.92, skin, { k: 0.3 });
      s.limb(k3, tip, r * 0.92, r * 0.82, skin, { k: 0.3 });
    }
    // Thumb across the top of the grip, over the index finger
    s.limb(g.point(2.6, 1.6, -1.6), g.point(1.2, 4.6, 1.2), 1.7, 1.45, skin, { k: 0.8 });
    s.limb(g.point(1.2, 4.6, 1.2), g.point(-0.6, 4.4, 2.8), 1.45, 1.2, skin, { k: 0.4 });
    const arm = renderSprite(s, 0, { res: VM_RES, pitch: 0, ground: false });
    delete arm.depth;
    if (fists) return arm;
    // The item models are built at villager scale, so the weapon is rendered on its own,
    // larger, and laid behind the hand with its grip in the fist.
    const ws = new Shape();
    (GEAR[W.model] || GEAR.sword)(ws, Frame.along([0, 0, 0], g.y, [0, 0, 1]).moved(0, 0.9, 0), W.tint);
    const weapon = renderSprite(ws, 0, { res: VM_RES * VM_WEAPON_SCALE, pitch: 0, ground: false });
    return layerSprites(weapon, arm.ax + wr[0] * VM_RES, arm.ay - wr[1] * VM_RES, arm);
  });
  _vmCache.set(key, frames);
  return frames;
}
// Which frame to show for the swing progress (0..1.15), or 0 when idle. Baked arms carry the
// swing phase each frame was posed at; the sculpted stand-in has five frames.
function viewmodelFrame(swing, frames) {
  if (!swing) return 0;
  const t = swing.t / swing.dur, P = frames.phases;
  if (!P) return t < 0.22 ? 1 : t < 0.5 ? 2 : t < 0.8 ? 3 : 4;
  let f = 1;
  while (f < P.length - 1 && P[f + 1] <= t + 0.03) f++;
  return f;
}
function drawViewmodel(frames, swing, bobT, moving, lvl, cmaps) {
  const f = viewmodelFrame(swing, frames);
  const spr = frames[f];
  const bobX = Math.sin(bobT) * 5 * Math.min(1, moving / 140), bobY = Math.abs(Math.cos(bobT)) * 4 * Math.min(1, moving / 140);
  // Anchor the sprite's world origin a little right of centre, near the bottom of the screen.
  const ox = VM_ANCHOR_X + bobX - spr.ax, oy = VM_ANCHOR_Y + bobY - spr.ay;
  blitFlat(spr, ox, oy, 1, lvl, cmaps);
}
