'use strict';
// Vector and frame helpers. Vectors are plain [x, y, z] arrays.
// World axes: +x = creature's left, +y = up, +z = creature's forward (toward the viewer at rotation 0).

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  madd: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 2;
const easeIn = (t) => clamp(t, 0, 1) ** 2;
// Remap t from [a, b] to [0, 1], clamped.
const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
// Piecewise-linear keyframes: keys = [[t0, v0], [t1, v1], ...], eased with smoothstep.
function keys(t, ks) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const [t0, v0] = ks[i - 1], [t1, v1] = ks[i];
      return lerp(v0, v1, smooth((t - t0) / (t1 - t0)));
    }
  }
  return ks[ks.length - 1][1];
}

// An orthonormal frame: origin o and axes x, y, z expressed in world space.
class Frame {
  constructor(o, x, y, z) { this.o = o; this.x = x; this.y = y; this.z = z; }
  static at(o) { return new Frame(o.slice(), [1, 0, 0], [0, 1, 0], [0, 0, 1]); }
  // Build a frame whose +y axis points along dir; zHint picks the roll.
  static along(o, dir, zHint) {
    const y = V.norm(dir);
    let x = V.cross(y, zHint || [0, 0, 1]);
    if (V.len(x) < 1e-4) x = V.cross(y, [0, 1, 0.01]);
    x = V.norm(x);
    const z = V.cross(x, y);
    return new Frame(o.slice(), x, y, z);
  }
  point(lx, ly, lz) {
    const { o, x, y, z } = this;
    return [o[0] + x[0] * lx + y[0] * ly + z[0] * lz,
      o[1] + x[1] * lx + y[1] * ly + z[1] * lz,
      o[2] + x[2] * lx + y[2] * ly + z[2] * lz];
  }
  dir(lx, ly, lz) {
    const { x, y, z } = this;
    return [x[0] * lx + y[0] * ly + z[0] * lz, x[1] * lx + y[1] * ly + z[1] * lz, x[2] * lx + y[2] * ly + z[2] * lz];
  }
  local(p) {
    const d = V.sub(p, this.o);
    return [V.dot(d, this.x), V.dot(d, this.y), V.dot(d, this.z)];
  }
  moved(lx, ly, lz) { return new Frame(this.point(lx, ly, lz), this.x, this.y, this.z); }
  movedTo(p) { return new Frame(p.slice(), this.x, this.y, this.z); }
  // Rotate about the frame's own axes, applied yaw (y), then pitch (x), then roll (z).
  // +pitch tips +y toward +z, +yaw turns +z toward +x, +roll tips +y toward -x.
  rot(pitch, yaw, roll) {
    let { x, y, z } = this;
    if (yaw) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      [x, z] = [V.madd(V.scale(x, c), z, -s), V.madd(V.scale(z, c), x, s)];
    }
    if (pitch) {
      const c = Math.cos(pitch), s = Math.sin(pitch);
      [y, z] = [V.madd(V.scale(y, c), z, s), V.madd(V.scale(z, c), y, -s)];
    }
    if (roll) {
      const c = Math.cos(roll), s = Math.sin(roll);
      [x, y] = [V.madd(V.scale(x, c), y, s), V.madd(V.scale(y, c), x, -s)];
    }
    return new Frame(this.o, x, y, z);
  }
}

// Two-bone IK: returns the middle joint for a chain root -> mid -> end of lengths l1, l2,
// bending toward the pole direction.
function ik2(root, target, l1, l2, pole) {
  let d = V.sub(target, root);
  let dl = V.len(d);
  const maxL = (l1 + l2) * 0.999, minL = Math.abs(l1 - l2) + 0.01;
  if (dl > maxL) { d = V.scale(d, maxL / dl); dl = maxL; }
  if (dl < minL) { d = V.scale(d, minL / (dl || 1)); dl = minL; }
  const u = V.scale(d, 1 / dl);
  const cosA = clamp((l1 * l1 + dl * dl - l2 * l2) / (2 * l1 * dl), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  let w = V.sub(pole, V.scale(u, V.dot(pole, u)));
  if (V.len(w) < 1e-5) w = V.cross(u, [1, 0, 0]);
  w = V.norm(w);
  const mid = V.add(root, V.add(V.scale(u, l1 * cosA), V.scale(w, l1 * sinA)));
  return { mid, end: V.add(root, d) };
}

// Deterministic hash noise in [0, 1).
function hash3(i, j, k) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
  const a = hash3(xi, yi, zi), b = hash3(xi + 1, yi, zi), c = hash3(xi, yi + 1, zi), d = hash3(xi + 1, yi + 1, zi);
  const e = hash3(xi, yi, zi + 1), f = hash3(xi + 1, yi, zi + 1), g = hash3(xi, yi + 1, zi + 1), h = hash3(xi + 1, yi + 1, zi + 1);
  const x1 = a + (b - a) * xf, x2 = c + (d - c) * xf, x3 = e + (f - e) * xf, x4 = g + (h - g) * xf;
  const y1 = x1 + (x2 - x1) * yf, y2 = x3 + (x4 - x3) * yf;
  return y1 + (y2 - y1) * zf;
}
// Seeded PRNG for repeatable scatter (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
