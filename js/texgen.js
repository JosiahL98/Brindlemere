'use strict';
// Procedural texture helpers shared by the bestiary and the game.
// Textures are { w, h, d } with d = palette index | 0x100 for fullbright texels.

function makeTex(w, h, fn) {
  const d = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = fn(x, y);
  return { w, h, d };
}
// Tileable value noise: lattice of `p` cells across the texture.
function pnoise(x, y, p, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let xf = x - xi, yf = y - yi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
  const w = (i) => ((i % p) + p) % p;
  const a = hash3(w(xi), w(yi), seed), b = hash3(w(xi + 1), w(yi), seed);
  const c = hash3(w(xi), w(yi + 1), seed), d = hash3(w(xi + 1), w(yi + 1), seed);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
}
function pfbm(x, y, size, p, seed, oct = 3) {
  let s = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) {
    const q = p << o;
    s += pnoise(x / size * q, y / size * q, q, seed + o * 31) * amp;
    tot += amp; amp *= 0.5;
  }
  return s / tot;
}
const lv = (ramp, l) => R[ramp] + clamp(Math.round(l), 0, 15);
