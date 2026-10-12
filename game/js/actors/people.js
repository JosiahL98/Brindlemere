'use strict';
// Villagers: one parametric human covering anatomy, age, faces, hair, clothes, hats and tools.
// Sculpted for realism in the manner of Daggerfall's digitised figures: tapered torsos, muscle
// masses on the limbs, proper hands and shoes, and faces built from skull, brow, cheekbones,
// eyelids, nose, lips and jaw. makePerson(id, look) returns an actor definition.

const SKIN = [
  { ramp: 'FLESH', gain: 1.02, bias: 0.6 },  // fair
  { ramp: 'FLESH', gain: 0.96, bias: 0.1 },  // light
  { ramp: 'FLESH', gain: 0.84, bias: -0.5 }, // tan
  { ramp: 'BROWN', gain: 0.86, bias: -0.2 }, // dark
];
const HAIR = {
  black: { ramp: 'GRAY', bias: -1.2, gain: 0.42 }, brown: { ramp: 'BROWN', bias: -1.4, gain: 0.8 }, chestnut: { ramp: 'RUST', bias: -1.6, gain: 0.8 },
  blonde: { ramp: 'GOLD', bias: 0.4 }, red: { ramp: 'RUST', bias: 0.2 }, gray: { ramp: 'GRAY', bias: 1.6 }, white: { ramp: 'BONE', bias: 2.4 },
};

function personProportions(L) {
  const f = L.sex === 'f', child = L.age === 'child', old = L.age === 'old';
  const k = (L.height || 1) * (child ? 0.74 : old ? 0.97 : 1) * (f ? 0.95 : 1);
  const b = L.build === undefined ? 0.5 : L.build;
  return {
    k, b, f, child, old,
    P: {
      thigh: 14.4 * k, shin: 13.6 * k, ankle: 2.1 * k, foot: 4.6 * k, hipW: (f ? 3.3 : 3.0 + b * 0.5) * k, crouch: (old ? 1.4 : 0.5) * k,
      spine: (child ? 10.5 : 11.6) * k, shY: 3.9 * k, shW: (f ? 5.3 : 6.3 + b * 0.7) * k, neckY: 7.2 * k,
      headY: (child ? 4.6 : 4.0) * k, upper: 10.8 * k, fore: 9.8 * k,
    },
    head: child ? 1.28 : 1.05,
  };
}

// ---- Materials --------------------------------------------------------------------------------
// Rolls off the brightest skin shades: the top of the flesh ramp is nearly white and reads as
// a pale blotch once the room's lighting darkens everything else.
const skinTop = (l) => (l > 10.5 ? 10.5 + (l - 10.5) * 0.45 : l);
function skinMat(L) {
  const s = SKIN[L.skin || 0];
  const old = L.age === 'old', male = L.sex !== 'f';
  const base = R[s.ramp];
  return mat(s.ramp, {
    amb: 0.22, dif: 0.85, fill: 0.2, gain: s.gain, bias: s.bias, spec: 0.16, shin: 10, noise: 0.3, nf: 0.8, edge: 1.5,
    rampFn: (x, y, z, l) => {
      if (z > 1.0) {
        const ax = Math.abs(x);
        if (L.freckles && y < 0.1 && y > -1.1 && ax > 0.5 && ax < 2.0 && hash3(Math.floor(x * 7), Math.floor(y * 7), 7) > 0.84) return [base, l - 1.3];
        if (old && ((y > 1.6 && y < 2.8 && Math.abs(Math.sin(y * 6.5)) < 0.22) || (ax > 1.75 && y > 0 && y < 0.8 && Math.abs(Math.sin((y - ax * 0.5) * 8)) < 0.3) || (ax > 0.5 && ax < 1.4 && y < -0.9 && y > -1.8 && Math.abs((ax - 0.5) - (-0.9 - y) * 0.7) < 0.12))) return [base, l - 2.2];
        if (male && L.stubble && y < -1.1 && ax < 2.2 && !(y < -1.35 && y > -2.2 && ax < 0.9) && hash3(Math.floor(x * 6), Math.floor(y * 6), 3) > 0.62) return [base, l - 1.4];
        if (L.scar && seg2(x, y, -1.3, 1.5, -2.1, -1.3) < 0.16) return [R.PINK, l];
        if (!male && y < -0.1 && y > -1.2 && ax > 1.1 && ax < 2.2) return [base, skinTop(l) + 0.7]; // blush
      }
      return [base, skinTop(l)];
    },
  });
}
// Bare torso skin with painted definition: pectoral line, sternum, six abdominal panels.
function bareTorsoMat(L, k) {
  const s = SKIN[L.skin || 0], base = R[s.ramp];
  return mat(s.ramp, {
    amb: 0.16, dif: 0.95, fill: 0.15, gain: s.gain, bias: s.bias, spec: 0.3, shin: 12, noise: 0.3, nf: 0.8, edge: 1.5,
    rampFn: (x, y, z, l) => {
      l = skinTop(l);
      const ax = Math.abs(x) / k, yy = y / k;
      if (z > 0.6) {
        if (ax < 4.6 && Math.abs(yy - (1.0 + ax * 0.12 + ax * ax * 0.03)) < 0.32) return [base, l - 2.6];      // under the pecs
        if (ax < 0.2 && yy > 1.2 && yy < 5) return [base, l - 1.6];                                           // sternum
        if (yy < 0.6 && yy > -9.5) {
          if (ax < 0.24) return [base, l - 2.2];                                                              // linea alba
          if (ax < 2.4 && [-1.6, -3.7, -5.9].some((v) => Math.abs(yy - v) < 0.2)) return [base, l - 1.8];       // abdominal panels
          if (Math.abs(ax - 2.7 - (yy + 9) * 0.02) < 0.22 && yy < -1) return [base, l - 1.5];                  // obliques
          return [base, l + (Math.abs(((yy + 20) % 2.1) - 1.05) < 0.5 && ax < 2.2 ? 0.7 : 0)];
        }
        if (yy > 1.4 && yy < 4.4 && ax > 0.6 && ax < 4) return [base, l + 0.6];
      }
      return [base, l];
    },
  });
}
function lipMat(L) {
  const s = SKIN[L.skin || 0];
  if (s.ramp === 'BROWN') return mat('BROWN', { amb: 0.2, dif: 0.85, gain: 0.7, bias: 0, spec: 0.35, shin: 18, noise: 0.2, edge: 0.5 });
  return mat(L.sex === 'f' ? 'RED' : 'FLESH', { amb: 0.22, dif: 0.85, gain: L.sex === 'f' ? 0.78 : 0.8, bias: L.sex === 'f' ? 1.2 : -0.6, spec: 0.35, shin: 18, noise: 0.2, edge: 0.5 });
}
function hairMat(color) {
  const h = HAIR[color] || HAIR.brown;
  return mat(h.ramp, { amb: 0.14, dif: 0.82, bias: h.bias, gain: h.gain || 1, spec: 0.55, shin: 14, noise: 1.0, nf: 2.2,
    pattern: (x, y, z) => Math.sin(x * 2.6 + y * 0.8 + Math.sin(z * 1.7) * 1.4) * 1.0 + Math.sin(x * 7.1 - y * 1.3) * 0.4 });
}
// Cloth: soft folds. Torso cloth paints the neckline (skin showing) in chest-frame coordinates.
function clothTorso(ramp, bias, neck, skin, k, o = {}) {
  const sk = SKIN[skin || 0];
  return mat(ramp, Object.assign({
    amb: 0.14, dif: 0.86, bias, noise: 0.7, nf: 1.0, spec: o.spec || 0.05, shin: 10,
    rampFn: (x, y, z, l) => {
      const fold = Math.sin(x * 1.25 + y * 0.32) * 0.55 + Math.sin(y * 0.85 - x * 0.45) * 0.35;
      // The neck rises out of the shirt opening: skin all the way around above the collar line.
      if (neck !== 'none' && y / k > 6.0 - Math.max(0, z / k) * 0.3 && Math.abs(x) / k < 2.6) return [R[sk.ramp], l * sk.gain + sk.bias + 0.3];
      if (z > 0.5) {
        const ax = Math.abs(x) / k, yy = y / k;
        if (neck === 'v' && yy > 1.4 && ax < (yy - 1.4) * 0.48) return ax > (yy - 1.4) * 0.48 - 0.35 ? [R[ramp], l - 2.5] : [R[sk.ramp], l * sk.gain + sk.bias + 0.5];
        if (neck === 'laced' && yy > 3.2 && ax < (yy - 3.2) * 0.32) return [R[sk.ramp], l * sk.gain + sk.bias];
        if (neck === 'laced' && yy > 2.4 && yy < 5.2 && Math.abs(ax - Math.abs(((yy * 1.6) % 1.2) - 0.6) * 0.8) < 0.14) return [R.BONE, l - 1];
        if (neck === 'round' && yy > 4.6 + ax * ax * 0.05) return [R[sk.ramp], l * sk.gain + sk.bias + 0.4];
        if (neck === 'buttons' && ax < 0.25 && Math.abs(((yy + 20) % 1.5) - 0.75) < 0.3) return [R.GOLD, 10];
      }
      return [R[ramp], l + fold];
    },
  }, o));
}
function clothLimb(ramp, bias, o = {}) {
  return mat(ramp, Object.assign({ amb: 0.14, dif: 0.86, bias, noise: 0.6, nf: 1.1, spec: o.spec || 0.05, shin: o.shin || 10,
    pattern: (x, y, z) => Math.sin(y * 1.4 + Math.atan2(x, z) * 1.5) * 0.55 + (o.leather ? Math.sin(y * 0.5 + x * 2) * 0.4 : 0) }, o));
}
function personEyeMat(color) {
  const iris = { BLUE: R.BLUE, GREEN: R.GREEN, BROWN: R.BROWN, GRAY: R.STEEL, AMBER: R.GOLD }[color || 'BROWN'];
  return mat('BONE', {
    amb: 0.35, dif: 0.6, fill: 0.3, spec: 0.9, shin: 40, noise: 0.15, edge: 0, bias: 0.5,
    rampFn: (x, y, z, l) => {
      const r = Math.hypot(x, y, z) || 1, c = z / r;
      if (c > 0.94) return [R.GRAY, 1];
      if (c > 0.74) return [iris, 5.5 + (y > 0 ? 1.5 : 0) + (l > 13 ? 1.5 : 0)];
      return [R.BONE, Math.min(8.5, l - 1.5)]; // whites stay muted, or they read as glowing at a distance
    },
  });
}
const shoeM = mat('BROWN', { amb: 0.12, dif: 0.8, bias: -2.6, spec: 0.5, shin: 14, noise: 0.5 });
const beltM = mat('BROWN', { amb: 0.14, dif: 0.85, bias: -2.2, spec: 0.3, shin: 10, noise: 0.8 });
const leatherApronM = mat('BROWN', { amb: 0.14, dif: 0.85, bias: -1.8, spec: 0.35, shin: 10, noise: 1.0, pattern: (x, y) => Math.sin(y * 0.9 + x * 0.4) * 0.6 });
const mailM = mat('STEEL', { amb: 0.1, dif: 0.75, spec: 0.7, shin: 12, bias: -1.4, noise: 0.4,
  pattern: (x, y) => (((Math.floor(x * 1.7) + Math.floor(y * 1.7)) & 1) ? -2 : 0.5) });
const ironM = mat('STEEL', { amb: 0.1, dif: 0.75, spec: 1.1, shin: 22, bias: -0.8, noise: 0.4 });
const woodM = mat('BROWN', { amb: 0.15, dif: 0.85, bias: -1, noise: 1.0, nf: 0.8 });
const strawM = mat('GOLD', { amb: 0.16, dif: 0.85, bias: -0.8, noise: 1.8, nf: 1.4, pattern: (x, z) => Math.sin(Math.atan2(x, z) * 14) * 0.8 });

// ---- Body parts --------------------------------------------------------------------------------
// A muscle mass: an ellipsoid laid along a bone from a to b, centred at fraction t, pushed
// out by offset (in the bone's frame).
function muscle(s, a, b, t, radii, offset, m, up, k) {
  const c = V.lerp(a, b, t);
  const f = Frame.along(c, V.sub(b, a), up || [0, 0, 1]);
  s.ellipsoid(f.moved(offset[0], offset[1], offset[2]), radii, m, { k, tf: f });
}

function buildFace(s, H, hs, L, ps, cache) {
  const f = L.sex === 'f';
  const hp = (x, y, z) => H.point(x * hs, y * hs, z * hs);
  const hm = (x, y, z) => H.moved(x * hs, y * hs, z * hs);
  const skin = cache.skin;
  // Skull, face and jaw: an oval face narrowing to the chin.
  s.ellipsoid(hm(0, 0.95, -0.35), [3.0 * hs, 3.4 * hs, 3.55 * hs], skin, { tf: H });
  s.ellipsoid(hm(0, -0.5, 1.3), [2.2 * hs, 2.5 * hs, 2.15 * hs], skin, { k: 1.4 * hs, tf: H });
  const jawF = H.movedTo(hp(0, -0.9, -0.9)).rot(ps.jaw || 0, 0, 0);
  const jm = (x, y, z) => jawF.moved(x * hs, y * hs, z * hs);
  const jp = (x, y, z) => jawF.point(x * hs, y * hs, z * hs);
  s.ellipsoid(jm(0, -1.5, 1.75), [(f ? 1.6 : 1.9) * hs, 1.25 * hs, 1.9 * hs], skin, { k: 1.3 * hs, tf: H });
  s.sphere(jp(0, -2.3, 3.0), (f ? 0.68 : 0.82) * hs, skin, { k: 0.85 * hs, tf: H });
  for (const sd of [1, -1]) {
    s.ellipsoid(hm(sd * 1.62, -0.38, 2.12), [0.95 * hs, 0.58 * hs, 0.82 * hs], skin, { k: 0.8 * hs, tf: H });          // cheekbone
    s.ellipsoid(hm(sd * 2.95, 0.1, -0.25).rot(0, sd * 0.25, 0), [0.42 * hs, 1.05 * hs, 0.72 * hs], skin, { k: 0.4 * hs, tf: H }); // ear
    s.sphere(hp(sd * 3.2, 0.15, 0.0), 0.3 * hs, skin, { sub: true, k: 0.2 * hs });
  }
  s.limb(hp(-1.75, 1.08, 2.7), hp(1.75, 1.08, 2.7), (f ? 0.38 : 0.52) * hs, (f ? 0.38 : 0.52) * hs, skin, { k: 0.8 * hs, tf: H }); // brow ridge
  // Eyes: socket, eyeball, upper lid
  for (const sd of [1, -1]) {
    if (L.eyepatch && sd === 1) continue;
    s.sphere(hp(sd * 1.1, 0.35, 3.05), 0.64 * hs, skin, { sub: true, k: 0.32 * hs });
    const ec = hp(sd * 1.1, 0.32, 2.62);
    s.sphere(ec, 0.47 * hs, cache.eye, { after: true, tf: H.movedTo(ec) });
    s.ellipsoid(hm(sd * 1.1, 0.64, 2.86).rot(-0.25, 0, sd * -0.1), [0.66 * hs, 0.2 * hs, 0.44 * hs], f ? cache.lash : skin, { after: true, tf: H });
    s.ellipsoid(hm(sd * 1.12, 0.02, 2.88).rot(0.2, 0, 0), [0.5 * hs, 0.1 * hs, 0.35 * hs], skin, { after: true, tf: H });
  }
  // Brows
  for (const sd of [1, -1]) {
    if (L.eyepatch && sd === 1) continue;
    const lift = L.stern ? -0.12 : 0.05;
    s.limb(hp(sd * 0.42, 1.28, 3.12), hp(sd * 1.95, 1.3 + lift, 2.7), (f ? 0.17 : 0.26) * hs, (f ? 0.12 : 0.2) * hs, cache.brow, { after: true });
  }
  // Nose: bridge, tip, wings, nostrils
  const nz = L.nose || 1;
  s.limb(hp(0, 0.75, 3.05), hp(0, -0.7, 3.78 + 0.1 * nz), 0.3 * hs, 0.42 * hs * nz, skin, { k: 0.35 * hs, tf: H });
  s.sphere(hp(0, -0.78, 3.68 + 0.1 * nz), 0.5 * hs * nz, skin, { k: 0.3 * hs, tf: H });
  for (const sd of [1, -1]) {
    s.sphere(hp(sd * 0.48, -0.92, 3.32), 0.38 * hs, skin, { k: 0.3 * hs, tf: H });
    s.sphere(hp(sd * 0.28, -1.18, 3.55), 0.15 * hs, M.socket, { sub: true });
  }
  // Mouth: lips and the line between them
  s.ellipsoid(hm(0, -1.55, 3.32).rot(0.3, 0, 0), [(f ? 0.82 : 0.86) * hs, (f ? 0.24 : 0.18) * hs, 0.32 * hs], cache.lip, { k: 0.2 * hs });
  s.ellipsoid(jawF.moved(0, -0.98 * hs, 3.55 * hs).rot(-0.2, 0, 0), [(f ? 0.72 : 0.74) * hs, (f ? 0.27 : 0.2) * hs, 0.32 * hs], cache.lip, { k: 0.2 * hs });
  if ((ps.jaw || 0) > 0.06) s.limb(hp(-0.7, -1.74, 3.45), hp(0.7, -1.74, 3.45), (ps.jaw || 0) * 0.55 * hs, (ps.jaw || 0) * 0.55 * hs, mat('RED', { amb: 0.05, dif: 0.3, bias: -6, edge: 0 }), { sub: true });
  if (L.eyepatch) {
    s.ellipsoid(hm(1.12, 0.38, 3.0), [0.95 * hs, 0.82 * hs, 0.5 * hs], beltM, { after: true });
    s.torus(H.moved(0, 0.9 * hs, 0).rot(0.28, 0, 0.22), 3.3 * hs, 0.16 * hs, beltM, { after: true });
  }
  return { jawF, hp, hm, jp, jm };
}

function buildHair(s, H, hs, L, C, k, cache, face) {
  const hm_ = cache.hair;
  const hp = face.hp, hm = face.hm;
  const style = (L.hair && L.hair.style) || 'short';
  const capClip = (front) => clipPlane(H, 0, -1, 0.42, -front * hs);
  if (L.hat === 'hood') return;
  if (style === 'short' || style === 'messy' || style === 'long' || style === 'bun' || style === 'pony' || style === 'braid' || style === 'curly') {
    s.ellipsoid(hm(0, 1.25, -0.5), [3.28 * hs, 3.5 * hs, 3.85 * hs], hm_, { clip: capClip(style === 'messy' ? 1.1 : 1.45), tf: H });
    for (const sd of [1, -1]) {
      s.ellipsoid(hm(sd * 2.55, 1.2, 0.6), [0.9 * hs, 1.9 * hs, 2.0 * hs], hm_, { k: 0.5 * hs, tf: H });             // hair over the temples
      s.limb(hp(sd * 2.9, 0.9, 1.1), hp(sd * 2.9, -0.3, 1.0), 0.32 * hs, 0.24 * hs, hm_, { k: 0.3 * hs });          // sideburns
    }
    if (L.sex === 'f' || style === 'long' || style === 'curly') s.ellipsoid(hm(0.7, 3.05, 2.0).rot(0.5, 0.2, -0.35), [2.5 * hs, 0.8 * hs, 1.6 * hs], hm_, { k: 0.6 * hs, tf: H }); // side-swept fringe
  }
  if (style === 'short' || style === 'messy') s.ellipsoid(hm(0, 3.1, 0.5).rot(0.25, 0, 0), [2.6 * hs, 1.2 * hs, 2.4 * hs], hm_, { k: 1 * hs, tf: H });
  if (style === 'messy') for (let i = 0; i < 6; i++) s.sphere(hp(-2.2 + i * 0.9, 3.4 + (i % 2) * 0.4, 1.4 - (i % 3) * 0.9), 0.95 * hs, hm_, { k: 0.4 * hs });
  if (style === 'long') {
    s.ellipsoid(H.moved(0, -2.3 * hs, -2.4 * hs).rot(-0.12, 0, 0), [3.3 * hs, 4.6 * hs, 1.7 * hs], hm_, { k: 1.4 * hs, tf: H });
    for (const sd of [1, -1]) {
      s.limb(hp(sd * 2.85, 1.0, 1.2), hp(sd * 3.05, -2.4, 0.3), 1.0 * hs, 0.9 * hs, hm_, { k: 0.6 * hs });
      s.limb(hp(sd * 3.05, -2.4, 0.3), V.add(hp(sd * 2.6, -3.4, 0), C.dir(0, -3 * k, 0.4 * k)), 0.9 * hs, 0.6 * hs, hm_, { k: 0.6 * hs });
    }
  }
  if (style === 'curly') {
    const r = rng(17);
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, e = -0.6 + r() * 1.7;
      const rr = 3.5 + r() * 0.6;
      const p = hp(Math.sin(a) * Math.cos(e) * rr, 1.0 + Math.sin(e) * rr, -0.5 + Math.cos(a) * Math.cos(e) * rr * 1.05);
      if ((Math.cos(a) > 0.55 && e < 0.55)) continue; // keep the face clear
      s.sphere(p, (0.95 + r() * 0.4) * hs, hm_, { k: 0.5 * hs });
    }
    for (const sd of [1, -1]) for (let i = 0; i < 4; i++) s.sphere(hp(sd * (2.9 + i * 0.15), -1.2 - i * 1.4, -0.4 - i * 0.3), (1.1 - i * 0.1) * hs, hm_, { k: 0.5 * hs });
  }
  if (style === 'bun') s.sphere(hp(0, 2.3, -3.9), 1.6 * hs, hm_, { k: 0.4 * hs });
  if (style === 'pony') {
    let p = hp(0, 1.4, -3.9), d = H.dir(0, -0.5, -0.8);
    for (let i = 0; i < 3; i++) { const q = V.madd(p, V.norm(V.add(d, H.dir(0, -0.6 * i, 0))), 2.6 * hs); s.limb(p, q, (1.0 - i * 0.18) * hs, (0.85 - i * 0.18) * hs, hm_); p = q; }
  }
  if (style === 'braid') {
    for (const sd of [1, -1]) {
      let p = hp(sd * 2.7, -0.8, 0.5);
      for (let i = 0; i < 3; i++) { const q = V.add(p, C.dir(sd * 0.2, -3.0 * k, 0.5 * k)); s.limb(p, q, 0.8 * hs, 0.7 * hs, hm_); s.sphere(q, 0.88 * hs, hm_); p = q; }
    }
  }
  if (style === 'tonsure') s.torus(H.moved(0, 1.1 * hs, -0.35 * hs).rot(-0.18, 0, 0), 3.0 * hs, 0.72 * hs, hm_);
  if (style === 'bald' && L.age === 'old') s.ellipsoid(H.moved(0, -0.1 * hs, -1.5 * hs), [3.25 * hs, 1.45 * hs, 2.6 * hs], hm_, { k: 0.4 * hs, tf: H });
  // Beards
  const beard = L.beard || 'none';
  const jp = face.jp, jm = face.jm;
  if (beard === 'full' || beard === 'long') {
    // A full beard wraps the jaw from ear to ear, leaving the lips clear.
    const clipLips = clipPlane(H, 0, 1, 0.05, -1.25 * hs);
    s.ellipsoid(jm(0, -1.6, 1.9), [2.45 * hs, 1.85 * hs, 2.45 * hs], hm_, { clip: clipLips, tf: H });
    s.sphere(jp(0, -2.65, 3.1), 1.2 * hs, hm_, { k: 0.8 * hs });
    for (const sd of [1, -1]) s.ellipsoid(hm(sd * 2.05, -0.9, 1.25).rot(0, sd * 0.4, 0), [0.95 * hs, 1.9 * hs, 1.55 * hs], hm_, { k: 0.7 * hs, clip: clipPlane(H, 0, 1, 0, -0.3 * hs) });
    if (beard === 'long') s.ellipsoid(jawF_(face).moved(0, -4.0 * hs, 2.4 * hs).rot(0.25, 0, 0), [1.8 * hs, 2.8 * hs, 1.2 * hs], hm_, { k: 1 * hs, tf: H });
  }
  if (beard === 'full' || beard === 'long' || beard === 'moustache') {
    for (const sd of [1, -1]) s.limb(hp(sd * 0.1, -1.3, 3.62), hp(sd * 1.05, -1.9, 3.2), 0.33 * hs, 0.24 * hs, hm_, { after: true });
  }
}
const jawF_ = (face) => face.jawF;

function buildPerson(s, L, ps, cache) {
  const pr = cache.pr;
  const J = rigHumanoid(pr.P, ps);
  const H = J.head, C = J.chest, Pv = J.pelvis;
  const k = pr.k, hs = pr.head * k, b = pr.b, f = pr.f;
  s.basis = Pv;
  const skin = cache.skin;
  const outfit = L.outfit || 'tunic';
  const dress = outfit === 'dress' || outfit === 'robe' || (outfit === 'apron' && f);
  const torsoM = outfit === 'guard' ? mailM : outfit === 'smith' ? cache.bareTorso : cache.torso;
  const sleeveM = outfit === 'guard' ? mailM : cache.sleeve;
  const legM = cache.legs;
  const Cm = (x, y, z) => C.moved(x * k, y * k, z * k);
  const Pm = (x, y, z) => Pv.moved(x * k, y * k, z * k);
  const Cp = (x, y, z) => C.point(x * k, y * k, z * k);

  // ---- Torso: ribcage, chest, back, shoulders, waist, hips ----
  const sw = f ? 0.84 : 0.92 + b * 0.1;
  s.ellipsoid(Cm(0, 1.0, -0.2), [5.3 * sw * k, 6.3 * k, (3.7 + b * 0.6) * k], torsoM, { tf: C });
  s.ellipsoid(Cm(0, 1.6, -1.8), [5.6 * sw * k, 5.2 * k, 2.4 * k], torsoM, { k: 2 * k, tf: C });                  // back / lats
  if (!f) for (const sd of [1, -1]) s.ellipsoid(Cm(sd * 2.4, 2.7, 2.3).rot(0, sd * 0.2, sd * 0.1), [2.8 * k, 1.9 * k, 1.5 * k], torsoM, { k: 1.8 * k, tf: C });
  if (f && !pr.child) for (const sd of [1, -1]) s.sphere(Cp(sd * 1.95, 1.7, 2.45), 2.05 * k, torsoM, { k: 1.6 * k, tf: C });
  for (const sd of [1, -1]) {
    // trapezius slope from neck to shoulder, and the deltoid cap
    s.limb(Cp(sd * (f ? 1.4 : 1.0), f ? 5.6 : 6.3, -0.8), Cp(sd * (5.6 * sw), 4.0, -0.4), (f ? 1.3 : 1.7) * k, (f ? 1.1 : 1.35) * k, torsoM, { k: 2.2 * k, tf: C });
    s.ellipsoid(Frame.along(V.lerp(J[sd > 0 ? 'L' : 'R'].sh, J[sd > 0 ? 'L' : 'R'].el, 0.12), V.sub(J[sd > 0 ? 'L' : 'R'].el, J[sd > 0 ? 'L' : 'R'].sh), C.z),
      [(1.8 + b * 0.3) * k, 2.5 * k, (1.95 + b * 0.3) * k], outfit === 'smith' ? cache.skin : sleeveM, { k: 1.6 * k });
  }
  const fat = L.fat !== undefined ? L.fat : b;
  s.ellipsoid(Pm(0, 5.6, 0.3), [(f ? 3.6 : 4.0 + fat * 2) * k, 4.8 * k, (f ? 2.9 : 2.9 + fat * 2.4) * k], torsoM, { k: 3 * k, tf: C }); // waist / belly
  const hipM = dress ? cache.torso : legM;
  s.ellipsoid(Pm(0, 0.9, 0), [(f ? 5.3 : 4.6 + b * 0.8) * k, 3.6 * k, (3.5 + b * 0.8) * k], hipM, { k: 2.4 * k, tf: Pv });
  for (const sd of [1, -1]) s.ellipsoid(Pm(sd * 2.0, -0.2, -2.0), [2.5 * k, 3 * k, 2.2 * k], hipM, { k: 2 * k, tf: Pv }); // glutes
  // Tunic skirt below the belt
  if (outfit === 'tunic' || outfit === 'merchant' || outfit === 'guard' || (outfit === 'apron' && !f)) {
    const hem = Pv.point(0, -7 * k, 0.2 * k), top = Pv.point(0, 2.8 * k, 0.2 * k);
    s.limb(hem, top, (5.3 + b * 0.8) * k, (4.6 + b * 2) * k, outfit === 'guard' ? mailM : cache.torso, { clip: [0, -1, 0, -hem[1]], tf: C });
  }
  // Belt
  if (outfit !== 'robe' && outfit !== 'dress') {
    s.ellipsoid(Pm(0, 3.0, 0.3), [(4.75 + b * 1.4) * k, 0.85 * k, (3.6 + b * 1.6) * k], beltM, { tf: Pv });
    s.box(Pm(0, 3.0, 3.95 + b * 1.6), [0.85 * k, 0.75 * k, 0.35 * k], 0.15, M.gold);
  } else if (outfit === 'robe') {
    s.torus(Pm(0, 3.6, 0.3), (4.3 + b) * k, 0.4 * k, mat('BONE', { bias: -1.5, noise: 1.4, nf: 2 }));
  }
  // Skirt or robe to the ankles
  if (dress) {
    const hemY = 1.5 * k;
    const hem = [Pv.o[0], hemY, Pv.o[2] + (ps.skirt || 0) * k];
    const waist = Pv.point(0, 2.4 * k, 0);
    s.limb(hem, waist, (outfit === 'robe' ? 7.4 : 7.2 + b * 1.4) * k, 4.6 * k, cache.skirt, { clip: [0, -1, 0, -hemY], tf: Frame.along(hem, V.sub(waist, hem), [0, 0, 1]) });
  }
  // Aprons, tabards, shawls
  if (outfit === 'apron' || outfit === 'smith') {
    const ap = outfit === 'smith' ? leatherApronM : clothLimb('BONE', 0.6);
    const af = Cm(0, -3.2, 3.55 + b * 0.6);
    s.box(af, [2.8 * k, 4.2 * k, 0.35 * k], 0.3, ap, { tf: af });
    const af2 = Pm(0, -5.5, 4.0 + b * 2).rot(-0.08 + (ps.skirt || 0) * 0.03, 0, 0);
    s.box(af2, [4.0 * k, 7 * k, 0.35 * k], 0.3, ap, { tf: af2 });
    s.limb(Cp(-2.2, 1.0, 3.6), Cp(-1.4, 6.0, 1.8), 0.25 * k, 0.25 * k, ap); s.limb(Cp(2.2, 1.0, 3.6), Cp(1.4, 6.0, 1.8), 0.25 * k, 0.25 * k, ap);
  }
  if (outfit === 'guard') {
    const tab = mat('BLUE', { amb: 0.14, dif: 0.85, bias: -1.2, noise: 0.8,
      rampFn: (x, y, z, l) => (Math.abs(x) > 3.1 * k ? [R.GOLD, l] : (Math.abs(x) < 0.45 * k && y > -3 * k) || (Math.abs(y - 1.5 * k) < 0.45 * k && Math.abs(x) < 1.8 * k) ? [R.GOLD, l + 2] : [R.BLUE, l + Math.sin(x * 1.2) * 0.4]) });
    const tf = Cm(0, -3.5, 4.0), tb = Cm(0, -3.5, -2.9);
    s.box(tf, [3.6 * k, 10 * k, 0.35 * k], 0.3, tab, { tf }); s.box(tb, [3.6 * k, 10 * k, 0.35 * k], 0.3, tab, { tf: tb });
  }
  if (L.shawl) s.ellipsoid(Cm(0, 4.3, -0.4), [6.6 * k, 3.4 * k, 4.8 * k], clothLimb(L.shawl, -1.6), { k: 1.4 * k, tf: C });

  // ---- Neck and head ----
  s.limb(Cp(0, 5.4, -0.5), H.point(0, -2.2 * hs, -0.8 * hs), (f ? 1.05 : 1.35 + b * 0.2) * k, (f ? 0.95 : 1.2) * k, skin, { k: 0.9 * k });
  if (outfit === 'tunic' || outfit === 'merchant' || outfit === 'guard') s.torus(Cm(0, 6.3, 0.1).rot(0.18, 0, 0), (f ? 1.9 : 2.1) * k, 0.5 * k, outfit === 'guard' ? mailM : cache.collar);
  else if (outfit === 'robe') s.torus(Cm(0, 6.0, -0.2).rot(0.1, 0, 0), 2.6 * k, 1.2 * k, cache.sleeve); // cowl
  const face = buildFace(s, H, hs, L, ps, cache);
  buildHair(s, H, hs, L, C, k, cache, face);
  const hp = face.hp, hm = face.hm;

  // ---- Hats ----
  const hat = L.hat || 'none';
  if (hat === 'straw') {
    s.ellipsoid(hm(0, 2.55, -0.25), [6.6 * hs, 0.42 * hs, 6.3 * hs], strawM, { tf: H });
    s.ellipsoid(hm(0, 3.4, -0.35), [3.4 * hs, 2.1 * hs, 3.5 * hs], strawM, { tf: H });
    s.torus(hm(0, 2.95, -0.3), 3.35 * hs, 0.38 * hs, clothLimb(L.accentColor || 'RED', -0.5));
  } else if (hat === 'cap') {
    s.ellipsoid(hm(0, 2.55, -0.65).rot(-0.2, 0, 0.12), [3.8 * hs, 1.8 * hs, 4.0 * hs], clothLimb(L.hatColor || 'RED', -0.6), { tf: H });
  } else if (hat === 'kerchief') {
    s.ellipsoid(hm(0, 1.15, -0.6), [3.45 * hs, 3.55 * hs, 3.85 * hs], clothLimb(L.hatColor || 'RED', -0.4), { clip: clipPlane(H, 0, -1, 0.42, -1.55 * hs), tf: H });
    s.sphere(hp(0, -0.4, -3.7), 0.85 * hs, clothLimb(L.hatColor || 'RED', -0.6));
  } else if (hat === 'hood') {
    s.sphere(hp(0, 0.9, -0.7), 4.4 * hs, clothLimb(L.hatColor || 'GREEN', -1.4), { tf: H });
    s.ellipsoid(hm(0, -0.3, 3.5), [2.8 * hs, 3.6 * hs, 3.0 * hs], mat('GRAY', { amb: 0, dif: 0.1, bias: -6, edge: 0 }), { sub: true, k: 0.6 * hs });
  } else if (hat === 'helmet') {
    s.ellipsoid(hm(0, 1.5, -0.3), [3.75 * hs, 3.3 * hs, 3.95 * hs], ironM, { clip: clipPlane(H, 0, -1, 0, -1.25 * hs), tf: H });
    s.ellipsoid(hm(0, 1.45, -0.3), [5.2 * hs, 0.32 * hs, 5.4 * hs], ironM, { tf: H });
  }

  // ---- Arms: sleeve or skin, bicep and forearm masses, hands with thumbs ----
  const bare = outfit === 'smith';
  const armSkinM = bare ? skin : sleeveM;
  const delt = bare ? skin : sleeveM;
  for (const Sd of ['L', 'R']) {
    const A = J[Sd], sd = A.sd;
    const ar = 1 + b * 0.45;
    s.limb(A.sh, A.el, 1.75 * ar * k, 1.25 * ar * k, armSkinM, { k: 0.8 * k });
    muscle(s, A.sh, A.el, 0.5, [1.35 * ar * k, 3.0 * k, 1.4 * ar * k], [0, 0, 0.45 * k], armSkinM, C.z, 0.9 * k);   // biceps
    const foreM = bare ? skin : (outfit === 'robe' ? cache.sleeve : sleeveM);
    s.limb(A.el, A.wr, 1.4 * ar * k, 0.95 * k, foreM, { k: 0.7 * k });
    muscle(s, A.el, A.wr, 0.28, [1.45 * ar * k, 2.8 * k, 1.25 * ar * k], [0, 0, 0], foreM, C.z, 0.8 * k);
    if (outfit === 'robe') s.limb(V.lerp(A.el, A.wr, 0.25), A.wr, 1.6 * k, 2.4 * k, cache.sleeve);
    else if (!bare) s.torus(Frame.along(V.lerp(A.el, A.wr, 0.92), V.sub(A.el, A.wr), C.z), 1.0 * k, 0.3 * k, sleeveM); // cuff
    const hf = A.hand;
    s.ellipsoid(hf.moved(0, -1.3 * k, 0.1 * k), [0.58 * k, 1.35 * k, 1.08 * k], skin, { k: 0.45 * k, tf: hf });   // palm
    s.limb(hf.point(0, -2.1 * k, 0.1 * k), hf.point(-sd * 0.15 * k, -3.5 * k, 0.6 * k), 0.58 * k, 0.45 * k, skin, { k: 0.35 * k }); // fingers
    s.limb(hf.point(0, -0.85 * k, 0.75 * k), hf.point(-sd * 0.25 * k, -1.85 * k, 1.15 * k), 0.34 * k, 0.28 * k, skin, { k: 0.3 * k }); // thumb
  }
  // ---- Legs: thigh and calf masses, knees, shoes ----
  for (const Sd of ['L', 'R']) {
    const A = J[Sd];
    const lr = 1 + b * 0.25;
    if (!dress) {
      s.limb(A.hip, A.knee, 2.55 * lr * k, 1.55 * k, legM, { k: 1.4 * k });
      muscle(s, A.hip, A.knee, 0.42, [1.9 * lr * k, 4.2 * k, 1.8 * lr * k], [0, 0, 0.45 * k], legM, C.z, 1.2 * k);    // quadriceps
      s.sphere(V.add(A.knee, A.foot.dir(0, 0, 0.5 * k)), 1.5 * k, legM, { k: 0.8 * k });
      s.limb(A.knee, A.ankle, 1.5 * k, 0.88 * k, legM, { k: 0.8 * k });
      muscle(s, A.knee, A.ankle, 0.3, [1.4 * lr * k, 3.0 * k, 1.5 * lr * k], [0, 0, -0.55 * k], legM, C.z, 0.9 * k); // calf
      if (L.boots !== false) s.limb(V.lerp(A.knee, A.ankle, 0.55), A.ankle, 1.45 * k, 1.12 * k, shoeM, { k: 0.3 * k });
    } else {
      s.limb(V.lerp(A.knee, A.ankle, 0.6), A.ankle, 1.05 * k, 0.9 * k, cache.stocking);
    }
    // Shoe: heel, instep and toe
    const F_ = A.foot;
    s.ellipsoid(F_.moved(0, -pr.P.ankle + 0.95 * k, 1.1 * k), [1.3 * k, 1.0 * k, 2.6 * k], shoeM, { k: 0.5 * k, tf: F_ });
    s.ellipsoid(F_.moved(0, -pr.P.ankle + 0.7 * k, 3.1 * k), [1.15 * k, 0.75 * k, 1.4 * k], shoeM, { k: 0.6 * k, tf: F_ });
  }

  // ---- Held items ----
  const held = L.held || 'none';
  const hR = J.R.hand, gR = hR.point(0, -1.9 * k, 0.5 * k), dR = hR.dir(0, 0, 1);
  const hL = J.L.hand, gL = hL.point(0, -1.9 * k, 0.5 * k);
  if (held === 'spear') {
    s.limb(V.madd(gR, dR, -26 * k), V.madd(gR, dR, 32 * k), 0.5 * k, 0.5 * k, woodM);
    s.limb(V.madd(gR, dR, 32 * k), V.madd(gR, dR, 38 * k), 1.0 * k, 0.1, ironM);
  } else if (held === 'pitchfork' || held === 'broom' || held === 'staff' || held === 'rake') {
    const len = held === 'staff' ? 18 : 22;
    s.limb(V.madd(gR, dR, -len * k), V.madd(gR, dR, (held === 'staff' ? 26 : 16) * k), 0.5 * k, 0.45 * k, woodM);
    const end = V.madd(gR, dR, -len * k);
    if (held === 'pitchfork') for (const o of [-1.3, 0, 1.3]) { const side = hR.dir(o, 0, 0); s.limb(V.add(end, side), V.add(V.madd(end, dR, -6 * k), V.scale(side, 1.2)), 0.28 * k, 0.12 * k, ironM); }
    if (held === 'broom') s.limb(end, V.madd(end, dR, -7 * k), 1.2 * k, 3.0 * k, strawM);
  } else if (held === 'hammer') {
    s.limb(V.madd(gR, dR, -2 * k), V.madd(gR, dR, 9 * k), 0.45 * k, 0.45 * k, woodM);
    s.box(Frame.along(V.madd(gR, dR, 9.5 * k), hR.y, dR), [1.1 * k, 2.4 * k, 1.1 * k], 0.3, ironM);
  } else if (held === 'mug') {
    s.limb(V.add(gR, hR.dir(0, 0.4 * k, 0.6 * k)), V.add(gR, hR.dir(0, 3.4 * k, 0.6 * k)), 1.2 * k, 1.2 * k, woodM);
    s.ellipsoid(Frame.at(V.add(gR, hR.dir(0, 3.5 * k, 0.6 * k))), [1.1 * k, 0.4 * k, 1.1 * k], mat('BONE', { bias: 2 }));
  } else if (held === 'rod') {
    s.limb(V.madd(gR, dR, -3 * k), V.madd(gR, dR, 34 * k), 0.38 * k, 0.18 * k, woodM);
  }
  if (L.book) {
    const bk = Frame.along(gL, hL.dir(0, 0, 1), hL.y);
    s.box(bk, [2.3 * k, 3.1 * k, 0.85 * k], 0.25, clothLimb('RED', -1.5), { tf: bk });
  }
  if (L.basket) {
    const bp = V.add(gL, hL.dir(0, -2.6 * k, 0));
    s.limb(V.add(bp, [0, -1.5 * k, 0]), V.add(bp, [0, 2 * k, 0]), 3.0 * k, 3.8 * k, strawM);
    s.limb(V.add(bp, [0, 0.5 * k, 0]), V.add(bp, [0, 4 * k, 0]), 2.8 * k, 2.4 * k, strawM, { sub: true });
    s.ellipsoid(Frame.at(V.add(bp, [0, 2.3 * k, 0])), [2.2 * k, 1.1 * k, 1.5 * k], mat('GOLD', { amb: 0.2, bias: -1 }), { after: true });
  }
  s.point('head', H.point(0, 0, 0));
}

// ---- Animation -------------------------------------------------------------------------------
function personStance(L) {
  const old = L.age === 'old';
  const held = L.held || 'none';
  // Contrapposto: weight on the right leg, hips tilted, shoulders counter-tilted, soft elbows.
  const p = pose({
    root: { y: -0.2, roll: 0.035 },
    spine: { pitch: old ? 0.2 : 0.03, roll: -0.05 },
    head: { pitch: old ? -0.12 : -0.03, roll: 0.03 },
    arms: {
      L: { pitch: 0.05, out: 0.1, elbow: L.book || L.basket ? 1.45 : 0.3, twist: 0.35 },
      R: { pitch: 0.02, out: 0.09, elbow: 0.22, twist: 0.35 },
    },
    legs: { L: { ik: [3.7, 0, 1.2], toe: 0.05 }, R: { ik: [-3.0, 0, -0.5] } },
  });
  if (held === 'spear' || held === 'staff' || held === 'pitchfork' || held === 'broom' || held === 'rake') merge(p, { arms: { R: { pitch: 0.42, out: 0.24, elbow: 1.05, wrist: -0.15, twist: 0 } } });
  if (held === 'mug') merge(p, { arms: { R: { pitch: 0.3, out: 0.15, elbow: 1.4, twist: 0 } } });
  if (held === 'rod') merge(p, { arms: { R: { pitch: 0.7, out: 0.15, elbow: 0.8, wrist: 0.6, twist: 0 } } });
  return p;
}
function scaleLegs(p, k) {
  for (const s of ['L', 'R']) if (p.legs[s].ik) p.legs[s].ik = p.legs[s].ik.map((v) => v * k);
  return p;
}

const PERSON_RES = 1.5;
function makePerson(id, L) {
  const pr = personProportions(L);
  const k = pr.k;
  const outfit = L.outfit || 'tunic';
  const neck = L.neck || { shirt: 'v', tunic: 'laced', dress: 'round', apron: L.sex === 'f' ? 'round' : 'laced', merchant: 'buttons', smith: 'v', robe: 'none', guard: 'none' }[outfit] || 'laced';
  const topR = L.top || 'BROWN', botR = L.bottom || 'BROWN';
  const topB = L.topBias !== undefined ? L.topBias : -1, botB = L.bottomBias !== undefined ? L.bottomBias : -1.8;
  const cache = {
    pr,
    skin: skinMat(L), lip: lipMat(L), bareTorso: bareTorsoMat(L, k),
    torso: clothTorso(topR, topB, neck, L.skin, k),
    sleeve: clothLimb(topR, topB),
    skirt: clothLimb(botR, botB, { pattern: (x, y, z) => Math.sin(Math.atan2(x, z) * 7 + y * 0.1) * 1.1 }),
    legs: clothLimb(botR, botB, L.leatherLegs ? { spec: 0.9, shin: 16, leather: true } : {}),
    stocking: clothLimb('GRAY', -2.5),
    collar: clothLimb(L.accent || topR, L.accent ? 0 : topB - 1),
    hair: hairMat((L.hair && L.hair.color) || 'brown'),
    brow: (() => { const m = hairMat(L.brow || (L.hair && L.hair.color) || 'brown'); m.bias -= 2.5; return m; })(),
    lash: mat('GRAY', { amb: 0.1, dif: 0.6, bias: -4, noise: 0.3, edge: 0 }),
    eye: personEyeMat(L.eyes),
  };
  const stance = () => scaleLegs(personStance(L), k);
  const heldTool = L.held && L.held !== 'none';
  const polearm = ['spear', 'pitchfork', 'staff', 'broom', 'rake'].includes(L.held);
  const actions = {
    idle: {
      frames: 6, fps: 4, loop: true,
      pose: (t) => {
        const w = Math.sin(t * TAU), c = Math.cos(t * TAU);
        return merge(stance(), {
          root: { y: (-0.2 + 0.18 * w) * k },
          spine: { pitch: (L.age === 'old' ? 0.2 : 0.03) + 0.015 * w },
          head: { yaw: 0.22 * Math.sin(t * TAU + 0.8), roll: 0.03 + 0.02 * w },
          arms: { L: { elbow: (L.book || L.basket ? 1.45 : 0.32) + 0.05 * w }, R: heldTool ? {} : { elbow: 0.24 + 0.05 * c } },
          skirt: 0.3 * c,
        });
      },
    },
    walk: {
      frames: 8, fps: 8, loop: true, travel: 26 * k,
      pose: (t) => {
        const sw = Math.cos(t * TAU), s2 = Math.sin(t * TAU);
        return merge(stance(), {
          root: { y: (-0.5 + 0.6 * -Math.cos(t * TAU * 2)) * k, yaw: 0.05 * sw, roll: 0.025 * s2 },
          spine: { yaw: -0.08 * sw, roll: 0 },
          head: { roll: 0.02 * s2, yaw: 0 },
          arms: { L: L.book || L.basket ? {} : { pitch: -0.35 * sw, elbow: 0.3 + 0.15 * Math.max(0, sw) }, R: heldTool ? {} : { pitch: 0.35 * sw, elbow: 0.3 + 0.15 * Math.max(0, -sw) } },
          legs: gait(t, { stride: 13 * k, lift: 3 * k, width: 3.3 * k }),
          skirt: 1.2 * sw,
        });
      },
    },
    talk: {
      frames: 4, fps: 4, loop: true,
      pose: (t, f) => {
        const g = [0, 1, 0.4, 0.8][f];
        return merge(stance(), {
          head: { pitch: -0.03 + 0.05 * Math.sin(t * TAU), yaw: 0.08 * Math.cos(t * TAU), roll: 0.04 * Math.sin(t * TAU) },
          arms: heldTool || L.book || L.basket ? {} : { R: { pitch: 0.35 + 0.35 * g, out: 0.2, elbow: 1.0 + 0.4 * g, wrist: -0.3, twist: 0 } },
          jaw: [0.04, 0.18, 0.08, 0.14][f],
        });
      },
    },
    // Fighting off wild animals: an overhead blow, or a lunge with a spear or pitchfork.
    attack: {
      frames: 5, fps: 9, loop: false, hit: 3,
      pose: (t, f) => {
        if (polearm) {
          const i = f;
          return merge(stance(), {
            spine: { pitch: [0.05, -0.04, -0.08, 0.3, 0.15][i], yaw: [0, 0.25, 0.3, -0.25, -0.05][i] },
            arms: {
              R: { pitch: [0.42, 0.2, 0.1, 1.3, 0.8][i], out: 0.2, elbow: [1.05, 1.35, 1.45, 0.25, 0.7][i], wrist: [-0.15, -1.0, -1.25, -0.9, -0.5][i], twist: 0 },
              L: { pitch: [0.3, 0.35, 0.35, 1.1, 0.7][i], out: -0.15, elbow: [1.1, 1.3, 1.35, 0.5, 0.85][i], twist: 0 },
            },
            legs: { L: { ik: [3.7 * k, 0, (1.2 + [0, -1, -1.5, 4, 2][i]) * k], toe: 0.05 } },
          });
        }
        const up = [0.4, 1.0, 1.2, -0.25, 0.2][f];
        return merge(stance(), {
          spine: { pitch: [0.1, -0.05, -0.08, 0.35, 0.2][f] }, head: { pitch: 0.1 },
          arms: { R: { pitch: 0.6 + up * 1.6, out: 0.2, elbow: 0.8 + up * 0.4, wrist: 0.4 - up * 0.8, twist: 0 } },
          legs: { L: { ik: [3.7 * k, 0, (1.2 + [0, 0, 0.5, 3, 1.5][f]) * k], toe: 0.05 } },
        });
      },
    },
    work: {
      frames: 6, fps: 6, loop: true,
      pose: (t) => {
        const kind = L.work || 'none';
        const w = Math.sin(t * TAU);
        if (kind === 'hammer') {
          const up = Math.max(0, w);
          return merge(stance(), { spine: { pitch: 0.25 }, head: { pitch: 0.3 }, arms: { R: { pitch: 0.6 + up * 1.6, out: 0.2, elbow: 0.8 + up * 0.4, wrist: 0.4 - up * 0.8, twist: 0 } } });
        }
        if (kind === 'sweep' || kind === 'rake') {
          return merge(stance(), { spine: { pitch: 0.25, yaw: 0.25 * w }, arms: { R: { pitch: 0.7 + 0.25 * w, out: 0.1, elbow: 0.6, wrist: -0.9, twist: 0 }, L: { pitch: 0.9 + 0.25 * w, out: -0.2, elbow: 0.7, twist: 0 } } });
        }
        if (kind === 'fish') return merge(stance(), { arms: { R: { pitch: 0.8 + 0.05 * w, out: 0.15, elbow: 0.6, wrist: 0.7, twist: 0 } } });
        if (kind === 'pray') return merge(stance(), { head: { pitch: 0.35 }, arms: { L: { pitch: 0.55, out: -0.25, elbow: 1.7, twist: 0 }, R: { pitch: 0.55, out: -0.25, elbow: 1.7, twist: 0 } }, root: { y: 0.2 * w } });
        return actions.idle.pose(t);
      },
    },
  };
  return { id, look: L, actions, res: PERSON_RES, build: (s, ps) => buildPerson(s, L, ps, cache), height: 62 * k };
}

// Dialogue portrait: head and shoulders only, rendered large from eye level.
const _portraits = new Map();
function renderPortrait(def, res = 7) {
  if (def.baked) return def.portrait || { w: 1, h: 1, ax: 0, ay: 0, res, data: new Uint16Array([0xFFFF]) };
  const key = def.id + '|' + res;
  if (_portraits.has(key)) return _portraits.get(key);
  const s = new Shape();
  def.build(s, def.actions.idle.pose(0, 0));
  const head = s.points.head;
  const cut = head[1] - 12.5 * (def.look.age === 'child' ? 0.74 : 1);
  s.prims = s.prims.filter((p) => p.bc[1] + p.br * 0.3 > cut);
  for (const p of s.prims) if (!p.sub && !p.clip) p.clip = [0, -1, 0, -cut];
  const spr = renderSprite(s, 0.22, { res, pitch: 2 * DEG });
  delete spr.depth;
  _portraits.set(key, spr);
  return spr;
}
