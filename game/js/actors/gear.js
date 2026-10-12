'use strict';
// Item models. Each draws into a Shape around a grip frame g (local +y = up the item).
// Used for inventory icons and for the weapon in the first-person view.

const GM = {
  steel: mat('STEEL', { amb: 0.14, dif: 0.75, spec: 1.2, shin: 24, noise: 0.5, bias: 0.4 }),
  rust: mat('RUST', { amb: 0.12, dif: 0.8, spec: 0.5, shin: 10, noise: 1.8, nf: 1.2 }),
  gold: mat('GOLD', { amb: 0.15, dif: 0.8, spec: 1, shin: 18, noise: 0.5, bias: 0 }),
  iron: mat('STEEL', { amb: 0.1, dif: 0.75, spec: 0.8, shin: 16, noise: 0.8, bias: -1.5 }),
  wood: mat('BROWN', { amb: 0.15, dif: 0.85, bias: -0.8, noise: 1.2, nf: 0.8, pattern: (x, y) => Math.sin(y * 1.2 + x * 3) * 0.6 }),
  leather: mat('BROWN', { amb: 0.14, dif: 0.85, bias: -2.4, spec: 0.2, noise: 1, pattern: (x, y) => (Math.abs(y % 1.2) < 0.25 ? -1.5 : 0) }),
  skin: mat('FLESH', { amb: 0.2, dif: 0.85, fill: 0.2, bias: -0.3, spec: 0.1, noise: 0.6, edge: 1.5 }),
  sleeve: mat('OLIVE', { amb: 0.14, dif: 0.85, bias: -1.2, noise: 1.2, nf: 1 }),
};
const gTint = (ramp, o) => mat(ramp, Object.assign({ amb: 0.16, dif: 0.85, noise: 0.9, nf: 0.9 }, o));

const GEAR = {
  dagger(s, g, tint) {
    const blade = tint === 'RUST' ? GM.rust : GM.steel;
    s.limb(g.point(0, -3, 0), g.point(0, 1.5, 0), 0.7, 0.7, GM.leather);
    s.sphere(g.point(0, -3.4, 0), 0.9, GM.iron);
    s.box(g.moved(0, 2, 0), [2.6, 0.5, 0.6], 0.25, GM.iron);
    s.box(g.moved(0, 7, 0), [0.9, 5, 0.25], 0.15, blade, { clip: clipPlane(g.moved(0, 11, 0), 0.6, 1, 0, 0) });
  },
  sword(s, g, tint) {
    const fit = tint === 'GOLD' ? GM.gold : GM.iron;
    s.limb(g.point(0, -4, 0), g.point(0, 1.5, 0), 0.75, 0.75, GM.leather);
    s.sphere(g.point(0, -4.6, 0), 1.1, fit);
    s.box(g.moved(0, 2.1, 0), [4, 0.6, 0.8], 0.3, fit);
    s.box(g.moved(0, 13, 0), [1.25, 10.5, 0.3], 0.15, GM.steel, { clip: clipPlane(g.moved(0, 22.5, 0), 0.45, 1, 0, 0) });
    s.box(g.moved(0, 23, 0), [1.25, 1.5, 0.3], 0.15, GM.steel, { clip: clipPlane(g.moved(0, 22.5, 0), -0.45, 1, 0, 0) });
  },
  longsword(s, g) {
    s.limb(g.point(0, -6, 0), g.point(0, 1.5, 0), 0.75, 0.75, GM.leather);
    s.sphere(g.point(0, -6.6, 0), 1.2, GM.gold);
    s.box(g.moved(0, 2.2, 0), [5, 0.65, 0.9], 0.3, GM.gold);
    s.box(g.moved(0, 17, 0), [1.4, 14.5, 0.32], 0.15, GM.steel);
    s.limb(g.point(0, 31, 0), g.point(0, 33.5, 0), 1.3, 0.1, GM.steel);
  },
  axe(s, g) {
    s.limb(g.point(0, -6, 0), g.point(0, 20, 0), 0.8, 0.7, GM.wood);
    const head = g.moved(-2.5, 16.5, 0);
    s.box(head, [3, 2.6, 0.6], 0.3, GM.iron);
    s.ellipsoid(g.moved(-5.6, 16.5, 0), [2.4, 5.2, 0.45], GM.steel, { clip: clipPlane(g.moved(-4.2, 16.5, 0), 1, 0, 0, 0) });
  },
  mace(s, g) {
    s.limb(g.point(0, -6, 0), g.point(0, 14, 0), 0.8, 0.8, GM.wood);
    s.sphere(g.point(0, 15.5, 0), 2.4, GM.iron);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; s.box(g.moved(Math.cos(a) * 2.2, 15.5, Math.sin(a) * 2.2).rot(0, a, 0), [1.3, 2.6, 0.35], 0.2, GM.iron); }
    s.limb(g.point(0, -6, 0), g.point(0, -2, 0), 0.95, 0.95, GM.leather);
  },
  hammer(s, g) {
    s.limb(g.point(0, -5, 0), g.point(0, 12, 0), 0.75, 0.7, GM.wood);
    s.box(g.moved(0, 13, 0), [3.2, 1.6, 1.6], 0.4, GM.iron);
  },
  club(s, g) {
    s.limb(g.point(0, -5, 0), g.point(0, 17, 0), 0.9, 2.4, GM.wood);
    s.sphere(g.point(1.5, 12, 0.6), 0.9, GM.wood, { k: 0.6 });
    s.sphere(g.point(-1.8, 16, -0.5), 0.9, GM.wood, { k: 0.6 });
  },
  tunic(s, g, tint) {
    const m = gTint(tint || 'BROWN', { bias: -0.6, pattern: (x, y) => (Math.abs(x) < 0.3 && y > 2 ? -2 : 0) });
    s.ellipsoid(g.moved(0, 2, 0), [5.5, 6.5, 2.4], m, { tf: g });
    for (const sd of [1, -1]) s.limb(g.point(sd * 5, 6, 0), g.point(sd * 8.5, 0, 0), 2, 1.6, m);
    s.torus(g.moved(0, 8, 0.4).rot(0.3, 0, 0), 1.8, 0.5, m);
  },
  mail(s, g) {
    const m = mat('STEEL', { amb: 0.12, dif: 0.75, spec: 0.7, shin: 12, noise: 0.4, pattern: (x, y) => (((Math.floor(x * 1.6) + Math.floor(y * 1.6)) & 1) ? -2.2 : 0.4) });
    s.ellipsoid(g.moved(0, 2, 0), [5.5, 6.5, 2.4], m, { tf: g });
    for (const sd of [1, -1]) s.limb(g.point(sd * 5, 6, 0), g.point(sd * 8, 2, 0), 2, 1.7, m);
  },
  cap(s, g) { s.ellipsoid(g.moved(0, 0, 0), [5, 3.6, 5], GM.leather, { clip: clipPlane(g, 0, -1, 0, 0) }); s.torus(g.moved(0, 0.3, 0), 4.8, 0.5, GM.leather); },
  helm(s, g) { s.ellipsoid(g, [5, 4.4, 5], GM.iron, { clip: clipPlane(g, 0, -1, 0, 0) }); s.ellipsoid(g.moved(0, 0.2, 0), [7.4, 0.5, 7.4], GM.iron); },
  apple(s, g) {
    s.sphere(g.point(0, 0, 0), 3.4, gTint('RED', { spec: 0.6, shin: 14, bias: 0.5 }));
    s.limb(g.point(0, 3, 0), g.point(0.4, 4.6, 0), 0.3, 0.25, GM.wood);
    s.ellipsoid(g.moved(1.3, 4.2, 0).rot(0, 0, -0.6), [1.2, 0.5, 0.3], gTint('GREEN'));
  },
  bread(s, g) {
    s.ellipsoid(g, [5.2, 2.6, 3], gTint('GOLD', { bias: -1.5, pattern: (x, y) => (y > 1.5 && Math.abs(((x + 10) % 2.4) - 1.2) < 0.25 ? -3 : 0) }), { tf: g });
  },
  cheese(s, g) {
    s.box(g, [4, 2.4, 3], 0.3, gTint('GOLD', { bias: 1 }), { clip: clipPlane(g, 0.5, 1, 0, 1.2) });
    for (const [x, y] of [[-1.5, 0.5], [1, -1], [-2.4, -1.2]]) s.sphere(g.point(x, y, 3), 0.6, gTint('GOLD', { bias: -2 }), { sub: true });
  },
  sweetroll(s, g) {
    s.ellipsoid(g, [4, 2.2, 4], gTint('GOLD', { bias: -2 }));
    s.ellipsoid(g.moved(0, 1.3, 0), [3.2, 1.2, 3.2], gTint('BONE', { bias: 2.5 }));
  },
  pie(s, g) {
    s.ellipsoid(g, [5.4, 1.8, 5.4], gTint('GOLD', { bias: -1.6, pattern: (x, y, z) => (Math.abs(((x + 20) % 2) - 1) < 0.3 || Math.abs(((z + 20) % 2) - 1) < 0.3 ? 1.5 : -0.5) }), { clip: clipPlane(g, 0, -1, 0, 0.6), tf: g });
  },
  stew(s, g) {
    s.ellipsoid(g, [5, 3, 5], GM.wood, { clip: clipPlane(g, 0, 1, 0, 1) });
    s.ellipsoid(g.moved(0, 0.6, 0), [4.4, 0.6, 4.4], gTint('RUST', { bias: -1.5 }));
    s.limb(g.point(1, 1, 0), g.point(3, 4, 0), 0.8, 0.5, gTint('RED', { bias: 0 }));
  },
  fish(s, g) {
    const m = gTint('STEEL', { spec: 0.8, shin: 20, rampFn: (x, y, z, l) => (y < -0.5 ? [R.BONE, l + 1] : [R.STEEL, l]) });
    s.ellipsoid(g, [5.5, 2, 1.4], m, { tf: g });
    s.box(g.moved(-6.4, 0, 0), [1.4, 2.2, 0.3], 0.3, m);
    s.sphere(g.point(4, 0.4, 1), 0.4, M.socket, { after: true });
  },
  ale(s, g) {
    s.limb(g.point(0, -3, 0), g.point(0, 3, 0), 3, 3, GM.wood);
    s.ellipsoid(g.moved(0, 3.2, 0), [3, 1.1, 3], gTint('BONE', { bias: 2 }));
    s.torus(Frame.along(g.point(3.6, 0, 0), g.z, g.x), 2, 0.6, GM.wood);
  },
  potion(s, g, tint) {
    s.sphere(g.point(0, -1, 0), 3.2, mat(tint || 'RED', { amb: 0.2, dif: 0.6, spec: 1.4, shin: 30, bias: 0.5, noise: 0.3 }));
    s.limb(g.point(0, 1.5, 0), g.point(0, 4.5, 0), 1.1, 0.9, mat('STEEL', { amb: 0.3, dif: 0.5, spec: 1.2, shin: 30, bias: 2 }));
    s.limb(g.point(0, 4.4, 0), g.point(0, 5.6, 0), 1.0, 1.0, GM.wood);
  },
  flower(s, g) {
    s.limb(g.point(0, -5, 0), g.point(0.6, 4, 0), 0.3, 0.25, gTint('GREEN'));
    for (let i = 0; i < 4; i++) s.sphere(g.point(0.9 + i * 0.5, 3.5 - i * 1.8, 0.4), 1.0, gTint('BLUE', { bias: 2.5 }));
  },
  tail(s, g) {
    let p = g.point(-4, -3, 0);
    for (let i = 0; i < 4; i++) { const q = g.point(-4 + i * 2.6, -3 + Math.sin(i) * 3, 0); s.limb(p, q, 0.9 - i * 0.15, 0.75 - i * 0.15, gTint('PINK', { bias: -0.5 })); p = q; }
  },
  meat(s, g) { s.ellipsoid(g.rot(0, 0, 0.3), [4.4, 2.6, 3], gTint('PINK', { bias: 0.5, pattern: (x) => Math.sin(x * 2) })); },
  shell(s, g) { s.ellipsoid(g, [5.4, 2.8, 4.4], gTint('OLIVE', { spec: 0.5, rampFn: (x, y, z, l) => [vnoise(x * 0.4, y * 0.4, z * 0.4) > 0.55 ? R.BROWN : R.OLIVE, l] }), { clip: clipPlane(g, 0, -1, 0, 0.5) }); },
  pelt(s, g) {
    const fur = gTint('GRAY', { noise: 2.4, nf: 1.6, rampFn: (x, y, z, l) => [y > 0.5 ? R.GRAY : R.STONE, l + (y > 0.5 ? -1.5 : 0)] });
    s.ellipsoid(g.rot(0.3, 0, 0), [6, 1.4, 4.5], fur, { tf: g });
    for (const [x, z] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) s.ellipsoid(g.moved(x, 0, z), [1.6, 0.9, 1.2], fur, { k: 1 });
  },
  fang(s, g) { s.limb(g.point(0, -3, 0), g.point(1.2, 4, 0), 1.2, 0.15, gTint('BONE', { bias: 0.5 })); },
  candlei(s, g) { s.limb(g.point(0, -3, 0), g.point(0, 3, 0), 1.2, 1.2, gTint('BONE', { bias: 1.5 })); s.ellipsoid(g.moved(0, 4.2, 0), [0.6, 1.1, 0.6], PM.flame); },
  sack(s, g) {
    s.ellipsoid(g, [4.4, 5, 3.6], PM.sack, { tf: g });
    s.limb(g.point(0, 4.5, 0), g.point(0, 6.4, 0), 1.1, 1.6, PM.sack);
    s.torus(g.moved(0, 4.9, 0), 1.2, 0.35, GM.leather);
  },
  cat(s, g) {
    const fur = gTint('RUST', { bias: 0.8, pattern: (x, y) => (Math.sin(y * 1.8) > 0.4 ? -2 : 0) });
    s.sphere(g.point(0, 0, 0), 3.6, fur, { tf: g });
    for (const sd of [1, -1]) {
      s.limb(g.point(sd * 2, 2.4, 0), g.point(sd * 2.8, 5.5, 0), 1.4, 0.2, fur);
      s.sphere(g.point(sd * 1.3, 0.4, 3), 0.65, eyeMat('GREEN', 10, 'slit'), { after: true, tf: g.movedTo(g.point(sd * 1.3, 0.4, 3)) });
    }
    s.sphere(g.point(0, -0.6, 3.4), 0.45, gTint('PINK', { bias: 1 }), { after: true });
  },
  book(s, g, tint) {
    s.box(g, [4, 5, 1.3], 0.3, gTint(tint || 'RED', { bias: -1.2 }));
    s.box(g.moved(0.5, 0, 0), [3.7, 4.7, 1.1], 0.1, gTint('BONE', { bias: 1, pattern: (x, y, z) => (Math.abs(z % 0.4) < 0.1 ? -2 : 0) }), { after: true, clip: clipPlane(g, 1, 0, 0, 4.5) });
    s.box(g.moved(0, 0, 1.25), [3.2, 0.5, 0.1], 0.05, GM.gold, { after: true });
  },
};

// Inventory icons: each model rendered once at a jaunty angle.
const _iconCache = new Map();
function itemIcon(id) {
  let spr = _iconCache.get(id);
  if (spr) return spr;
  const it = ITEMS[id];
  const s = new Shape();
  // Viewing angle per kind of item: weapons lie diagonally, food is seen from above, clothes face front.
  const upright = ['tunic', 'mail', 'fish', 'cat', 'potion', 'ale', 'sack', 'book', 'candlei'].includes(it.model);
  const flat = !upright && ['bread', 'cheese', 'sweetroll', 'pie', 'stew', 'meat', 'shell', 'pelt', 'apple', 'cap', 'helm'].includes(it.model);
  const g = flat || upright ? Frame.at([0, 0, 0]) : Frame.at([0, 0, 0]).rot(0, 0, -0.75);
  (GEAR[it.model] || GEAR.sack)(s, g, it.tint);
  // Scale the render so the icon fits about 26 pixels.
  let lo = [1e9, 1e9], hi = [-1e9, -1e9];
  for (const p of s.prims) { lo = [Math.min(lo[0], p.bc[0] - p.br), Math.min(lo[1], p.bc[1] - p.br)]; hi = [Math.max(hi[0], p.bc[0] + p.br), Math.max(hi[1], p.bc[1] + p.br)]; }
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], 1);
  spr = renderSprite(s, upright ? 0.25 : flat ? 0.5 : 0.3, { res: clamp(30 / size, 0.6, 3), pitch: flat ? 30 * DEG : upright ? 6 * DEG : 10 * DEG, shadows: false });
  delete spr.depth;
  _iconCache.set(id, spr);
  return spr;
}
