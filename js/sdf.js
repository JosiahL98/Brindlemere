'use strict';
// Sculpting + rasterising. Creatures are built each frame as a list of signed-distance
// primitives ("clay"), then ray-marched at sprite resolution, lit, and snapped to palette ramps.
// One world unit = one sprite pixel.

const T_SPHERE = 0, T_CONE = 1, T_ELLIPSOID = 2, T_BOX = 3, T_TORUS = 4;

// Material: which ramp a surface uses and how it responds to light.
function mat(ramp, o = {}) {
  return Object.assign({
    ramp: R[ramp],
    amb: 0.2,      // ambient light
    dif: 0.95,     // diffuse strength
    fill: 0.14,    // front fill light (from the viewer)
    spec: 0,       // specular strength (in "light" units)
    shin: 14,
    gain: 1,       // scales final brightness
    bias: 0,       // added ramp levels
    noise: 1.1,    // grit amplitude in ramp levels
    nf: 0.55,      // grit frequency
    ao: 1,         // ambient-occlusion strength
    dither: 1,     // ordered dither strength
    edge: 2,       // silhouette darkening in levels
    emissive: false,
    glow: 12,      // ramp level for emissive surfaces
    pattern: null, // (lx, ly, lz) => level offset
    rampFn: null,  // (lx, ly, lz, level) => [rampBase, level]
  }, o);
}

// Every primitive shares this one object layout, whatever its type, so the hot distance loops
// see a single hidden class and stay fast.
class Prim {
  constructor(src) {
    this.t = 0; this.cx = 0; this.cy = 0; this.cz = 0; this.r = 0;
    this.ax = 0; this.ay = 0; this.az = 0; this.bax = 0; this.bay = 0; this.baz = 0;
    this.l2 = 0; this.rr = 0; this.a2 = 0; this.il2 = 0; this.r1 = 0; this.r2 = 0;
    this.xx = 0; this.xy = 0; this.xz = 0; this.yx = 0; this.yy = 0; this.yz = 0; this.zx = 0; this.zy = 0; this.zz = 0;
    this.rx = 0; this.ry = 0; this.rz = 0; this.hx = 0; this.hy = 0; this.hz = 0; this.R = 0;
    this.bc = null; this.br = 0;
    this.mat = null; this.k = 0; this.sub = false; this.order = 0; this.clip = null;
    this.to = null; this.tx = null; this.ty = null; this.tz = null; this.toff = 0;
    this.bx = 0; this.by = 0; this.bz = 0;
    for (const key in src) this[key] = src[key];
  }
}

class Shape {
  constructor() {
    this.prims = [];
    this.points = {};          // named emit points (projectile spawns etc.)
    this.basis = Frame.at([0, 0, 0]); // default texture orientation for spheres
  }
  _add(src, m, o, frame) {
    const p = new Prim(src);
    p.mat = m;
    p.k = (o && o.k) || 0;
    p.sub = !!(o && o.sub);
    // Evaluation order: carvable unions, then subtractions, then "after" unions that subs don't touch.
    p.order = p.sub ? 1 : (o && o.after) ? 2 : 0;
    p.clip = (o && o.clip) || null;
    const tf = (o && o.tf) || frame;
    p.to = tf.o; p.tx = tf.x; p.ty = tf.y; p.tz = tf.z;
    p.toff = (o && o.toff) || 0;
    p.bx = p.bc[0]; p.by = p.bc[1]; p.bz = p.bc[2];
    this.prims.push(p);
    return p;
  }
  sphere(c, r, m, o) {
    return this._add({ t: T_SPHERE, cx: c[0], cy: c[1], cz: c[2], r, bc: c, br: r }, m, o, this.basis.movedTo(c));
  }
  // Tapered capsule from a (radius r1) to b (radius r2).
  limb(a, b, r1, r2, m, o) {
    if (r2 === undefined || r2 === null) r2 = r1;
    const ba = V.sub(b, a);
    const l2 = V.dot(ba, ba);
    const rr = r1 - r2;
    const a2 = l2 - rr * rr;
    if (l2 < 1e-6 || a2 <= 1e-6) return this.sphere(l2 < 1e-6 ? a : (r1 > r2 ? a : b), Math.max(r1, r2), m, o);
    const p = {
      t: T_CONE, ax: a[0], ay: a[1], az: a[2], bax: ba[0], bay: ba[1], baz: ba[2],
      l2, rr, a2, il2: 1 / l2, r1, r2,
      bc: V.lerp(a, b, 0.5), br: Math.sqrt(l2) / 2 + Math.max(r1, r2),
    };
    return this._add(p, m, o, Frame.along(a, ba, (o && o.up) || this.basis.z));
  }
  ellipsoid(f, radii, m, o) {
    const p = {
      t: T_ELLIPSOID, cx: f.o[0], cy: f.o[1], cz: f.o[2],
      xx: f.x[0], xy: f.x[1], xz: f.x[2], yx: f.y[0], yy: f.y[1], yz: f.y[2], zx: f.z[0], zy: f.z[1], zz: f.z[2],
      rx: radii[0], ry: radii[1], rz: radii[2],
      bc: f.o, br: Math.max(radii[0], radii[1], radii[2]),
    };
    return this._add(p, m, o, f);
  }
  box(f, half, round, m, o) {
    round = Math.min(round || 0, half[0], half[1], half[2]);
    const p = {
      t: T_BOX, cx: f.o[0], cy: f.o[1], cz: f.o[2],
      xx: f.x[0], xy: f.x[1], xz: f.x[2], yx: f.y[0], yy: f.y[1], yz: f.y[2], zx: f.z[0], zy: f.z[1], zz: f.z[2],
      hx: half[0] - round, hy: half[1] - round, hz: half[2] - round, rr: round,
      bc: f.o, br: Math.hypot(half[0], half[1], half[2]),
    };
    return this._add(p, m, o, f);
  }
  // Ring around the frame's local y axis.
  torus(f, big, small, m, o) {
    const p = {
      t: T_TORUS, cx: f.o[0], cy: f.o[1], cz: f.o[2],
      xx: f.x[0], xy: f.x[1], xz: f.x[2], yx: f.y[0], yy: f.y[1], yz: f.y[2], zx: f.z[0], zy: f.z[1], zz: f.z[2],
      R: big, r: small, bc: f.o, br: big + small,
    };
    return this._add(p, m, o, f);
  }
  point(name, p) { this.points[name] = p; }
}

// Half-space clip in a frame's local terms: keep where dot(localNormal, local p) <= offset.
function clipPlane(f, nx, ny, nz, offset) {
  const n = V.norm(f.dir(nx, ny, nz));
  return [n[0], n[1], n[2], V.dot(n, f.o) + offset];
}

function primDist(p, x, y, z) {
  let d;
  switch (p.t) {
    case T_SPHERE: {
      const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz) - p.r;
      break;
    }
    case T_CONE: { // Inigo Quilez's round cone
      const pax = x - p.ax, pay = y - p.ay, paz = z - p.az;
      const yy = pax * p.bax + pay * p.bay + paz * p.baz;
      const zz = yy - p.l2;
      const qx = pax * p.l2 - p.bax * yy, qy = pay * p.l2 - p.bay * yy, qz = paz * p.l2 - p.baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * p.l2, z2 = zz * zz * p.l2;
      const k = Math.sign(p.rr) * p.rr * p.rr * x2;
      if (Math.sign(zz) * p.a2 * z2 > k) d = Math.sqrt(x2 + z2) * p.il2 - p.r2;
      else if (Math.sign(yy) * p.a2 * y2 < k) d = Math.sqrt(x2 + y2) * p.il2 - p.r1;
      else d = (Math.sqrt(x2 * p.a2 * p.il2) + yy * p.rr) * p.il2 - p.r1;
      break;
    }
    case T_ELLIPSOID: {
      const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz;
      const lx = (dx * p.xx + dy * p.xy + dz * p.xz) / p.rx;
      const ly = (dx * p.yx + dy * p.yy + dz * p.yz) / p.ry;
      const lz = (dx * p.zx + dy * p.zy + dz * p.zz) / p.rz;
      const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz);
      const k1 = Math.sqrt((lx / p.rx) ** 2 + (ly / p.ry) ** 2 + (lz / p.rz) ** 2);
      d = k1 < 1e-9 ? -Math.min(p.rx, p.ry, p.rz) : (k0 * (k0 - 1)) / k1;
      break;
    }
    case T_BOX: {
      const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz;
      const qx = Math.abs(dx * p.xx + dy * p.xy + dz * p.xz) - p.hx;
      const qy = Math.abs(dx * p.yx + dy * p.yy + dz * p.yz) - p.hy;
      const qz = Math.abs(dx * p.zx + dy * p.zy + dz * p.zz) - p.hz;
      const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
      const inner = Math.min(Math.max(qx, qy, qz), 0);
      d = Math.sqrt(ox * ox + oy * oy + oz * oz) + inner - p.rr;
      break;
    }
    case T_TORUS: {
      const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz;
      const lx = dx * p.xx + dy * p.xy + dz * p.xz;
      const ly = dx * p.yx + dy * p.yy + dz * p.yz;
      const lz = dx * p.zx + dy * p.zy + dz * p.zz;
      const q = Math.sqrt(lx * lx + lz * lz) - p.R;
      d = Math.sqrt(q * q + ly * ly) - p.r;
      break;
    }
  }
  if (p.clip) {
    const c = p.clip;
    const pd = x * c[0] + y * c[1] + z * c[2] - c[3];
    if (pd > d) d = pd;
  }
  return d;
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

// Scene distance over a list of primitive indices (sorted by p.order).
// With track=true, _hitPrim is set to the primitive that owns the surface at this point.
let _hitPrim = -1;
function sceneDist(prims, list, n, x, y, z, track) {
  let d = 1e9;
  for (let i = 0; i < n; i++) {
    const p = prims[list[i]];
    const bx = x - p.bx, by = y - p.by, bz = z - p.bz;
    const b2 = bx * bx + by * by + bz * bz;
    if (!p.sub) {
      const lim = d + p.k + p.br; // the bounding sphere is farther than the current surface
      if (lim < 0 || b2 > lim * lim) continue;
      const di = primDist(p, x, y, z);
      if (track && di < d) _hitPrim = list[i];
      d = p.k > 0 ? smin(d, di, p.k) : (di < d ? di : d);
    } else {
      const lim = p.k + p.br - d; // can't carve here
      if (lim < 0 || b2 > lim * lim) continue;
      const di = -primDist(p, x, y, z);
      if (track && di > d - 0.3 && p.mat) _hitPrim = list[i];
      d = p.k > 0 ? smax(d, di, p.k) : (di > d ? di : d);
    }
  }
  return d;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Sprite pixels per world unit. At the default viewing distance one sprite pixel lands on
// exactly one pixel of the 320x200 frame buffer.
const SPRITE_RES = 2;
const LIGHT_VIEW = V.norm([-0.6, 0.62, 0.62]);

// Rasterise a Shape seen from rotation `yaw` (radians, creature turned toward +x) and a slight
// downward `pitch`. Returns an indexed sprite: data[i] = palette index | 0x100 if fullbright,
// 0xFFFF if transparent. (ax, ay) is the pixel position of the creature's ground origin and
// res is pixels per world unit.
function renderSprite(shape, yaw, opt) {
  const job = spriteJob(shape, yaw, opt);
  let r = job.next();
  while (!r.done) r = job.next();
  return r.value;
}

// The same, as a generator that yields after every row so callers can spread the work out.
function* spriteJob(shape, yaw, opt = {}) {
  const pitch = opt.pitch !== undefined ? opt.pitch : 9 * DEG;
  const res = opt.res || SPRITE_RES;
  const useShadow = opt.shadows !== false;
  const groundY = opt.ground === false ? -1e9 : -0.4; // first-person arms hang below y = 0
  const all = shape.prims.slice().sort((a, b) => a.order - b.order);
  const N = all.length;

  const ct = Math.cos(yaw), st = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const m0 = [ct, 0, st], m1 = [st * sp, cp, -ct * sp], m2 = [-st * cp, sp, ct * cp];
  const toWorld = (q) => [q[0] * m0[0] + q[1] * m1[0] + q[2] * m2[0], q[0] * m0[1] + q[1] * m1[1] + q[2] * m2[1], q[0] * m0[2] + q[1] * m1[2] + q[2] * m2[2]];
  const L = toWorld(LIGHT_VIEW);
  const Vw = m2; // toward the viewer
  const H = V.norm(V.add(L, Vw));
  const dirW = [-m2[0], -m2[1], -m2[2]];

  // Bounding spheres in view space.
  const bcx = new Float32Array(N), bcy = new Float32Array(N), bcz = new Float32Array(N), brr = new Float32Array(N);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < N; i++) {
    const p = all[i], c = p.bc;
    bcx[i] = V.dot(m0, c); bcy[i] = V.dot(m1, c); bcz[i] = V.dot(m2, c);
    brr[i] = p.br + p.k;
    if (!p.sub) {
      minX = Math.min(minX, bcx[i] - brr[i]); maxX = Math.max(maxX, bcx[i] + brr[i]);
      minY = Math.min(minY, bcy[i] - brr[i]); maxY = Math.max(maxY, bcy[i] + brr[i]);
    }
  }
  if (!N) return { w: 1, h: 1, ax: 0, ay: 0, res, data: new Uint16Array([0xFFFF]), depth: new Float32Array(1) };
  const x0 = Math.floor(minX * res) - 2, yTop = Math.ceil(maxY * res) + 2;
  const W = Math.ceil(maxX * res) + 2 - x0, Hh = yTop - (Math.floor(minY * res) - 2);

  const levels = new Float32Array(W * Hh);
  const ramps = new Uint16Array(W * Hh).fill(0xFFFF);
  const depth = new Float32Array(W * Hh).fill(-1e9);
  const mats = new Array(W * Hh);
  const cand = new Int32Array(N);
  const near = new Int32Array(N), shad = new Int32Array(N), rowNear = new Int32Array(N);
  // Flat copies of the bounds for the per-pixel culling loops: world centre, radius, sub flag,
  // and the centre expressed along / across the light direction (for shadow-ray culling).
  const wbx = new Float64Array(N), wby = new Float64Array(N), wbz = new Float64Array(N), wr = new Float64Array(N);
  const isSub = new Uint8Array(N);
  const LA = V.norm(V.cross(L, [0, 1, 0.01])), LB = V.cross(L, LA);
  const la = new Float64Array(N), lb = new Float64Array(N), ll = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const p = all[k];
    wbx[k] = p.bc[0]; wby[k] = p.bc[1]; wbz[k] = p.bc[2]; wr[k] = p.br + p.k; isSub[k] = p.sub ? 1 : 0;
    la[k] = V.dot(p.bc, LA); lb[k] = V.dot(p.bc, LB); ll[k] = V.dot(p.bc, L);
  }
  const NEAR = 4.6; // AO samples reach 3.6 units off the surface

  for (let j = 0; j < Hh; j++) {
    if (j) yield;
    const v = (yTop - j - 0.5) / res;
    // prims overlapping this row
    const rowList = [];
    let nrn = 0;
    for (let i = 0; i < N; i++) {
      const dv = Math.abs(v - bcy[i]);
      if (dv <= brr[i]) rowList.push(i);
      if (dv <= brr[i] + NEAR) rowNear[nrn++] = i;
    }
    if (!rowList.length) continue;
    for (let i = 0; i < W; i++) {
      const u = (x0 + i + 0.5) / res;
      let nc = 0, zs = -1e9, ze = 1e9, anyUnion = false;
      for (let r = 0; r < rowList.length; r++) {
        const k = rowList[r];
        const dx = u - bcx[k], dy = v - bcy[k];
        const d2 = dx * dx + dy * dy, rr2 = brr[k] * brr[k];
        if (d2 > rr2) continue;
        cand[nc++] = k;
        if (!isSub[k]) {
          anyUnion = true;
          const h = Math.sqrt(rr2 - d2);
          if (bcz[k] + h > zs) zs = bcz[k] + h;
          if (bcz[k] - h < ze) ze = bcz[k] - h;
        }
      }
      if (!anyUnion) continue;
      const ox = u * m0[0] + v * m1[0] + zs * m2[0];
      const oy = u * m0[1] + v * m1[1] + zs * m2[1];
      const oz = u * m0[2] + v * m1[2] + zs * m2[2];
      const tMax = zs - ze;
      let t = 0, hit = false, px = 0, py = 0, pz = 0;
      for (let s = 0; s < 110; s++) {
        px = ox + dirW[0] * t; py = oy + dirW[1] * t; pz = oz + dirW[2] * t;
        if (py < groundY) break; // below the ground plane
        const d = sceneDist(all, cand, nc, px, py, pz, false);
        if (d < 0.03) { hit = true; break; }
        t += Math.max(d * 0.85, 0.03);
        if (t > tMax) break;
      }
      if (!hit) continue;

      _hitPrim = -1;
      sceneDist(all, cand, nc, px, py, pz, true);
      const prim = all[_hitPrim >= 0 ? _hitPrim : cand[0]];
      const m = prim.mat;
      const idx = j * W + i;

      // Primitives close enough to matter for the normal and ambient occlusion.
      let nn = 0;
      for (let q = 0; q < nrn; q++) {
        const k = rowNear[q], r = wr[k] + NEAR;
        const dx = px - wbx[k], dy = py - wby[k], dz = pz - wbz[k];
        if (dx * dx + dy * dy + dz * dz <= r * r) near[nn++] = k;
      }

      // Normal (tetrahedron technique).
      const e = 0.25;
      const f1 = sceneDist(all, near, nn, px + e, py - e, pz - e, false);
      const f2 = sceneDist(all, near, nn, px - e, py - e, pz + e, false);
      const f3 = sceneDist(all, near, nn, px - e, py + e, pz - e, false);
      const f4 = sceneDist(all, near, nn, px + e, py + e, pz + e, false);
      let nx = f1 - f2 - f3 + f4, ny = -f1 - f2 + f3 + f4, nz = -f1 + f2 - f3 + f4;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;

      // Local texture coordinates.
      const tdx = px - prim.to[0], tdy = py - prim.to[1], tdz = pz - prim.to[2];
      const lx = tdx * prim.tx[0] + tdy * prim.tx[1] + tdz * prim.tx[2] + prim.toff;
      const ly = tdx * prim.ty[0] + tdy * prim.ty[1] + tdz * prim.ty[2];
      const lz = tdx * prim.tz[0] + tdy * prim.tz[1] + tdz * prim.tz[2];

      let level;
      if (m.emissive) {
        level = m.glow;
      } else {
        const ndl = nx * L[0] + ny * L[1] + nz * L[2];
        let sh = 1;
        if (useShadow && ndl > 0) {
          let res = 1, tt = 0.9;
          const sx = px + nx * 0.4, sy = py + ny * 0.4, sz = pz + nz * 0.4;
          // Only primitives whose bounds touch the shadow ray.
          let ns = 0;
          const sa = sx * LA[0] + sy * LA[1] + sz * LA[2], sb = sx * LB[0] + sy * LB[1] + sz * LB[2];
          const sl = sx * L[0] + sy * L[1] + sz * L[2];
          let tEnd = 0; // past this, nothing can block the ray
          for (let k = 0; k < N; k++) {
            const r = wr[k] + 0.6, along = ll[k] - sl;
            if (along < -r || along > 46 + r) continue;
            const da = la[k] - sa, db = lb[k] - sb;
            if (da * da + db * db <= r * r) { shad[ns++] = k; if (along + r > tEnd) tEnd = along + r; }
          }
          tEnd = Math.min(tEnd, 46);
          for (let s = 0; s < 28 && tt < tEnd && ns; s++) {
            const d = sceneDist(all, shad, ns, sx + L[0] * tt, sy + L[1] * tt, sz + L[2] * tt, false);
            if (d < 0.05) { res = 0; break; }
            res = Math.min(res, 5 * d / tt);
            tt += clamp(d, 0.35, 6);
          }
          sh = 0.25 + 0.75 * res;
        }
        let occ = 0, sca = 1;
        for (let s = 1; s <= 4; s++) {
          const hh = 0.9 * s;
          const d = sceneDist(all, near, nn, px + nx * hh, py + ny * hh, pz + nz * hh, false);
          occ += (hh - d) * sca;
          sca *= 0.65;
        }
        const ao = clamp(1 - occ * 0.13, 0, 1);
        const ndv = nx * Vw[0] + ny * Vw[1] + nz * Vw[2];
        let I = m.amb + m.dif * Math.max(ndl, 0) * sh + m.fill * Math.max(ndv, 0);
        I *= 1 - m.ao * (1 - ao);
        let spec = 0;
        if (m.spec > 0) {
          const ndh = Math.max(0, nx * H[0] + ny * H[1] + nz * H[2]);
          spec = m.spec * Math.pow(ndh, m.shin) * sh;
        }
        level = (I * m.gain + spec) * (RAMP_LEN - 1) + m.bias;
      }
      if (m.noise) {
        const f = m.nf;
        level += ((vnoise(lx * f, ly * f, lz * f) * 2 - 1) + (vnoise(lx * f * 2.9 + 7, ly * f * 2.9, lz * f * 2.9) * 2 - 1) * 0.6
          + (vnoise(lx * 3.1 + 11, ly * 3.1, lz * 3.1) * 2 - 1) * 0.45) * m.noise;
      }
      if (m.pattern) level += m.pattern(lx, ly, lz);
      let ramp = m.ramp;
      if (m.rampFn) { const rr = m.rampFn(lx, ly, lz, level); ramp = rr[0]; level = rr[1]; }
      levels[idx] = level;
      ramps[idx] = ramp | (m.emissive ? 0x100 : 0);
      depth[idx] = zs - t;
      mats[idx] = m;
    }
  }

  // Post pass: silhouette + occlusion-edge darkening, dithering, palette snap.
  const out = new Uint16Array(W * Hh).fill(0xFFFF);
  let cx0 = W, cx1 = -1, cy0 = Hh, cy1 = -1;
  for (let j = 0; j < Hh; j++) {
    for (let i = 0; i < W; i++) {
      const idx = j * W + i;
      if (ramps[idx] === 0xFFFF) continue;
      const m = mats[idx];
      let level = levels[idx];
      const fb = ramps[idx] & 0x100;
      if (!fb) {
        const z = depth[idx];
        let edge = 0, crease = 0;
        const nb = [i > 0 ? idx - 1 : -1, i < W - 1 ? idx + 1 : -1, j > 0 ? idx - W : -1, j < Hh - 1 ? idx + W : -1];
        for (const q of nb) {
          if (q < 0 || ramps[q] === 0xFFFF) { edge = 1; continue; }
          if (depth[q] - z > 3.2) crease = 1;
        }
        if (edge) level -= m.edge;
        else if (crease) level -= 2.5;
      }
      level += (BAYER4[(i & 3) + ((j & 3) << 2)] / 16 - 0.47) * m.dither;
      const li = clamp(Math.round(level), 0, RAMP_LEN - 1);
      out[idx] = ((ramps[idx] & 0xFF) + li) | fb;
      if (i < cx0) cx0 = i; if (i > cx1) cx1 = i;
      if (j < cy0) cy0 = j; if (j > cy1) cy1 = j;
    }
  }
  if (cx1 < 0) return { w: 1, h: 1, ax: 0, ay: 0, res, data: new Uint16Array([0xFFFF]), depth: new Float32Array(1) };
  const w = cx1 - cx0 + 1, h = cy1 - cy0 + 1;
  const data = new Uint16Array(w * h);
  const dep = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      data[j * w + i] = out[(j + cy0) * W + i + cx0];
      dep[j * w + i] = depth[(j + cy0) * W + i + cx0];
    }
  }
  return { w, h, ax: -x0 - cx0, ay: yTop - cy0, res, data, depth: dep };
}
