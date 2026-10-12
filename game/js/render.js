'use strict';
// First-person renderer for a 320x200 indexed frame buffer, in the manner of Arena: sky (or a
// beamed ceiling), floor casting, a ray caster for walls of different heights (with the tops of
// low walls), and depth-tested billboard sprites. All lighting goes through colormaps.

const VW = 320, VH = 200, VF = 160; // focal length: 90 degree horizontal field of view

const Render = {
  fb: new Uint8Array(VW * VH),
  zb: new Float32Array(VW * VH),
};

// Jitter for outdoor ground tiles so grass, roads and sand meet along ragged edges.
const JIT = (() => {
  const j = new Int8Array(64 * 64 * 2);
  for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) {
    j[(z * 64 + x) * 2] = Math.round((pnoise(x / 4, z / 4, 16, 3) - 0.5) * 34);
    j[(z * 64 + x) * 2 + 1] = Math.round((pnoise(x / 4, z / 4, 16, 9) - 0.5) * 34);
  }
  return j;
})();

// Distant hills and clouds, indexed by view angle (1024 steps around the circle).
const SKY_N = 1024;
const HILLS_FAR = new Float32Array(SKY_N), HILLS_NEAR = new Float32Array(SKY_N);
const CLOUDS = new Float32Array(SKY_N * 64);
(function () {
  for (let i = 0; i < SKY_N; i++) {
    HILLS_FAR[i] = 10 + pfbm(i, 0, SKY_N, 6, 101, 4) * 30;
    HILLS_NEAR[i] = 1 + pfbm(i, 0, SKY_N, 14, 103, 3) * 14;
    for (let r = 0; r < 64; r++) CLOUDS[i * 64 + r] = pfbm(i, r * 4, SKY_N, 12, 107, 4);
  }
})();

// Per-hour sky colours. Returns palette indices for gradient, clouds, hills, sun, fog.
const SKY_KEYS = [
  // A bruised violet sky: deep purple overhead, mauve haze at the horizon, magenta dusks,
  // and heavy slate-grey clouds.
  // hour, zenith, horizon, cloud, hillFar, hillNear
  [0, [10, 4, 22], [34, 20, 52], [22, 18, 30], [28, 18, 40], [14, 9, 20]],
  [4.5, [14, 6, 30], [48, 28, 64], [30, 24, 40], [32, 22, 46], [16, 11, 24]],
  [6, [74, 40, 120], [214, 120, 150], [104, 84, 100], [116, 74, 112], [58, 38, 58]],
  [8, [86, 48, 148], [184, 150, 200], [92, 88, 104], [128, 106, 148], [86, 72, 98]],
  [16.5, [80, 42, 140], [186, 148, 198], [90, 86, 102], [128, 106, 148], [86, 72, 98]],
  [18.5, [70, 28, 104], [196, 90, 128], [96, 66, 86], [104, 56, 86], [48, 26, 44]],
  [20, [30, 12, 56], [96, 40, 88], [44, 32, 52], [48, 26, 58], [22, 12, 28]],
  [21.5, [10, 4, 22], [34, 20, 52], [22, 18, 30], [28, 18, 40], [14, 9, 20]],
  [24, [10, 4, 22], [34, 20, 52], [22, 18, 30], [28, 18, 40], [14, 9, 20]],
];
function skyAt(hour) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && hour > SKY_KEYS[i + 1][0]) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  const t = clamp((hour - a[0]) / (b[0] - a[0]), 0, 1);
  const mix = (k) => a[k].map((v, c) => lerp(v, b[k][c], t));
  return { zenith: mix(1), horizon: mix(2), cloud: mix(3), hillFar: mix(4), hillNear: mix(5) };
}
// Daylight level 0..255 for the hour.
function daylight(hour) {
  return keys(hour, [[0, 76], [4.5, 78], [6, 150], [8, 236], [16.5, 236], [18.5, 160], [20, 100], [21.5, 76], [24, 76]]);
}

// Builds everything that depends on the time of day: colormaps (fogging toward the horizon
// colour) and the sky's palette indices. Cached per quarter hour.
const _envCache = new Map();
function outdoorEnv(hour) {
  const key = Math.round(hour * 4) % 96;
  let e = _envCache.get(key);
  if (e) return e;
  const h = key / 4;
  const sky = skyAt(h);
  // Darkness and distance both fade toward the fog colour, so it dims with the daylight.
  const lf = clamp(daylight(h) / 236, 0.22, 1) ** 1.3;
  // The haze is a greyer version of the horizon, so distant walls don't take on the sky's full colour.
  const hl = 0.3 * sky.horizon[0] + 0.59 * sky.horizon[1] + 0.11 * sky.horizon[2];
  const fog = sky.horizon.map((v) => lerp(v, hl, 0.3) * 0.92 * lf);
  e = {
    cmaps: buildColormaps(fog),
    light: daylight(h),
    hour: h,
    fogK: 1 / 70 + clamp((150 - daylight(h)) / 80, 0, 1) / 160,
    night: clamp((150 - daylight(h)) / 80, 0, 1),
    grad: Array.from({ length: 24 }, (_, i) => {
      const t = i / 23;
      const c = sky.zenith.map((v, k) => lerp(v, sky.horizon[k], t ** 1.6));
      return nearestColor(c[0], c[1], c[2]);
    }),
    // Cloud shades: wispy edges, body, and darker storm-grey cores.
    cloud: [0.6, 0.85, 1.12].map((s) => nearestColor(...sky.cloud.map((v, k) => clamp(lerp(sky.zenith[k], v, s), 0, 255)))),
    hillFar: nearestColor(...sky.hillFar),
    hillNear: nearestColor(...sky.hillNear),
  };
  _envCache.set(key, e);
  if (_envCache.size > 24) _envCache.delete(_envCache.keys().next().value);
  return e;
}
const _indoorCmaps = buildColormaps([0, 0, 0]);
function indoorEnv(map) {
  return { cmaps: _indoorCmaps, light: map.light, fogK: 1 / 40, night: 0, indoor: true };
}

// Texture lookup tables refreshed each frame (night variants, animation frames).
function wallTexFor(style, x, z, side, night, t) {
  if (style.anim) return getTex(style.anim[Math.floor(t * 8) % style.anim.length]);
  const list = style.tex;
  const name = list.length === 1 ? list[0] : list[Math.floor(hash3(x, z, side + 3) * list.length)];
  return getTex(name, night);
}

// Renders the world with a real camera: one ray per pixel, so the view can tilt all the way up
// or down. Each ray walks the tile grid (DDA). It stops at the first wall face it meets below
// that wall's height, at the top of a low wall it drops onto, or at the floor, ceiling or sky.
// The ray length t is the depth along the view axis, which drives fog and the depth buffer.
// cam.pitch is in radians (up is positive).
const _texMemo = { map: null, stamp: 0, stamps: null, tex: null };
const COS_SUN = Math.cos(9 / VF), COS_MOON = Math.cos(6 / VF); // disc radii in pixels
function renderWorld(map, cam, env, sprites, t) {
  const fb = Render.fb, zb = Render.zb;
  const eye = cam.eye, cx = cam.x, cz = cam.z;
  const ca = Math.cos(cam.ang), sa = Math.sin(cam.ang);
  const pitch = cam.pitch || 0, cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Camera basis: forward, right, up.
  const fX = ca * cp, fY = sp, fZ = sa * cp;
  const rX = -sa, rZ = ca;
  const uX = -ca * sp, uY = cp, uZ = -sa * sp;
  const cm = env.cmaps;
  const base = (255 - env.light) / 8;
  const fogK = env.fogK;
  const night = env.night;
  const nightTex = night > 0.45;
  const MW = map.w, MH = map.h;
  const wall = map.wall, floorOf = map.floor;
  const lightmap = map.lightmap, nightmap = map.nightmap;
  const outdoor = map.outdoor;
  const tMax = (outdoor ? 30 : 20) * TILE;
  const floorTex = FLOORS.map((f) => f.tex.map((n) => getTex(n)));
  const waterFrame = ((Math.floor(t * 3) % 4) + 4) % 4;
  const ceilTex = outdoor ? null : getTex(map.ceil);
  const topH = outdoor ? MAX_WALL_H : map.ceilH; // nothing outdoors is taller than the cliffs
  const capTex = STYLES.map((s) => (s && s.cap ? getTex(s.cap) : null));
  // Wall textures picked per face, remembered for this frame.
  if (_texMemo.map !== map) { _texMemo.map = map; _texMemo.stamps = new Int32Array(MW * MH * 4); _texMemo.tex = new Array(MW * MH * 4); }
  const stamp = ++_texMemo.stamp, stamps = _texMemo.stamps, memo = _texMemo.tex;
  const faceTex = (style, mx, mz, face) => {
    const k = (mz * MW + mx) * 4 + face;
    if (stamps[k] !== stamp) { stamps[k] = stamp; memo[k] = wallTexFor(style, mx, mz, face, nightTex, t); }
    return memo[k];
  };

  // Sky: sun and moon directions, cloud drift.
  const grad = env.grad;
  const sunAng = (env.hour - 6) / 12 * Math.PI, sunEl = Math.sin(sunAng) * 1.05; // 0 = east (+x), PI/2 = south
  const moonAng = sunAng + Math.PI, moonEl = -sunEl;
  const sunX = Math.cos(sunEl) * Math.cos(sunAng), sunY = Math.sin(sunEl), sunZ = Math.cos(sunEl) * Math.sin(sunAng);
  const moonX = Math.cos(moonEl) * Math.cos(moonAng), moonY = Math.sin(moonEl), moonZ = Math.cos(moonEl) * Math.sin(moonAng);
  const drift = t * 3;
  const sky = (dx, dy, dz, col, y) => {
    const len = Math.hypot(dx, dz), el = Math.atan2(dy, len), above = len > 1e-6 ? VF * dy / len : 1e9;
    const az = Math.atan2(dz, dx);
    const ai = ((Math.floor(az / TAU * SKY_N) % SKY_N) + SKY_N) % SKY_N;
    if (above < HILLS_NEAR[ai] * 0.8) return env.hillNear;
    if (above < HILLS_FAR[ai] * 0.8) return env.hillFar;
    const gi = clamp(Math.floor(23 - above / 130 * 23 + (BAYER4[(col & 3) + ((y & 3) << 2)] / 16 - 0.5) * 1.6), 0, 23);
    let v = grad[gi];
    if (night > 0.3 && el < 1.3 && hash3(ai, Math.floor(el * 300), 9) > 0.996) v = R.GRAY + 14;
    // Sun and moon discs: angular distance, worked out only for pixels close to them.
    const dl = Math.hypot(len, dy);
    const cs = (dx * sunX + dy * sunY + dz * sunZ) / dl;
    if (sunEl > -0.1 && cs > COS_SUN) { const sd = Math.acos(Math.min(1, cs)) * VF; v = (sd < 6 ? R.FIRE + 15 : R.FIRE + 12) | 0; }
    const cm2 = (dx * moonX + dy * moonY + dz * moonZ) / dl;
    if (moonEl > -0.1 && cm2 > COS_MOON) { const md = Math.acos(Math.min(1, cm2)) * VF; v = md < 4.5 ? R.BONE + 14 - (md > 3 ? 2 : 0) : v; }
    // Clouds thin out toward the zenith, where their strips would otherwise pinch together.
    const ci = ((Math.floor(az / TAU * SKY_N + drift) % SKY_N) + SKY_N) % SKY_N;
    const c = CLOUDS[ci * 64 + Math.min(63, Math.floor(el * 90))] - 0.52 + el * 0.1 - Math.max(0, el - 0.85) * 1.4;
    if (c > 0) v = env.cloud[c > 0.12 ? 2 : c > 0.05 ? 1 : 0];
    return v;
  };

  const cmx = Math.floor(cx / TILE), cmz = Math.floor(cz / TILE);
  for (let y = 0; y < VH; y++) {
    const ky = (VH / 2 - y - 0.5) / VF;
    const bX = fX + uX * ky, dy = fY + uY * ky, bZ = fZ + uZ * ky;
    const row = y * VW;
    const tFloor = dy < 0 ? -eye / dy : Infinity;
    const tTop = dy > 0 ? (topH - eye) / dy : Infinity;
    const tEnd = Math.min(tFloor, tTop, tMax);
    for (let col = 0; col < VW; col++) {
      const kx = (col + 0.5 - VW / 2) / VF;
      const dx = bX + rX * kx, dz = bZ + rZ * kx;
      const p = row + col;
      // ---- walk the grid ----
      let mx = cmx, mz = cmz;
      const stepX = dx < 0 ? -1 : 1, stepZ = dz < 0 ? -1 : 1;
      const ddx = dx !== 0 ? Math.abs(TILE / dx) : Infinity, ddz = dz !== 0 ? Math.abs(TILE / dz) : Infinity;
      let sdx = dx < 0 ? (cx - mx * TILE) / -dx : dx > 0 ? ((mx + 1) * TILE - cx) / dx : Infinity;
      let sdz = dz < 0 ? (cz - mz * TILE) / -dz : dz > 0 ? ((mz + 1) * TILE - cz) / dz : Infinity;
      let hit = 0, tHit = 0, side = 0, si = 0, outside = false;
      for (;;) {
        const tExit = sdx < sdz ? sdx : sdz;
        if (tExit >= tEnd) break; // floor, ceiling, sky or the fog limit comes first
        if (sdx < sdz) { sdx += ddx; mx += stepX; side = 0; } else { sdz += ddz; mz += stepZ; side = 1; }
        if (mx < 0 || mz < 0 || mx >= MW || mz >= MH) { outside = true; break; }
        si = wall[mz * MW + mx];
        if (!si) continue;
        const h = STYLES[si].h;
        if (eye + dy * tExit <= h) { hit = 1; tHit = tExit; break; }
        // Passing over a low wall: does the ray drop onto its top before leaving the cell?
        if (dy < 0 && capTex[si]) {
          const tCap = (h - eye) / dy;
          if (tCap <= (sdx < sdz ? sdx : sdz)) { hit = 2; tHit = tCap; break; }
        }
      }
      if (hit === 1) {
        const style = STYLES[si];
        const fi = side === 0 ? mz * MW + (mx - stepX) : (mz - stepZ) * MW + mx;
        const lm = fi >= 0 && fi < MW * MH ? lightmap[fi] + nightmap[fi] * night : 0;
        let u = side === 0 ? (cz + dz * tHit) / TILE : (cx + dx * tHit) / TILE;
        u -= Math.floor(u);
        if ((side === 0 && dx < 0) || (side === 1 && dz > 0)) u = 1 - u;
        const tex = faceTex(style, mx, mz, side + (side === 0 ? (stepX > 0 ? 0 : 2) : (stepZ > 0 ? 0 : 2)));
        const tcol = Math.min(tex.w - 1, (u * tex.w) | 0);
        const trow = clamp(((style.h - eye - dy * tHit) * tex.h / style.h) | 0, 0, tex.h - 1);
        const tv = tex.d[trow * tex.w + tcol];
        fb[p] = tv & 0x100 ? tv & 0xFF : cm[clamp(Math.round(base + tHit * fogK + (side === 1 ? 1.5 : 0) - lm), 0, 31) * 256 + tv];
        zb[p] = tHit;
        continue;
      }
      if (hit === 2) {
        const wx = cx + dx * tHit, wz = cz + dz * tHit;
        const fi = side === 0 ? mz * MW + (mx - stepX) : (mz - stepZ) * MW + mx;
        const lm = fi >= 0 && fi < MW * MH ? lightmap[fi] + nightmap[fi] * night : 0;
        const tv = capTex[si].d[((wz & 63) << 6) | (wx & 63)];
        fb[p] = cm[clamp(Math.round(base + tHit * fogK - 1 - lm), 0, 31) * 256 + (tv & 0xFF)];
        zb[p] = tHit;
        continue;
      }
      if (dy < 0) {
        // ---- floor ----
        const wx = cx + dx * tFloor, wz = cz + dz * tFloor;
        let sx = wx, sz = wz;
        if (outdoor) {
          const ji = ((((wz >> 3) & 63) << 6) | ((wx >> 3) & 63)) << 1;
          sx += JIT[ji]; sz += JIT[ji + 1];
        }
        const tx = Math.floor(sx / TILE), tz = Math.floor(sz / TILE);
        let v, lm = 0;
        if (outside || tx < 0 || tz < 0 || tx >= MW || tz >= MH) v = floorTex[0][0].d[((wz & 63) << 6) | (wx & 63)];
        else {
          const ci = tz * MW + tx;
          const f = FLOORS[floorOf[ci]];
          const texs = floorTex[f.index];
          const tex = f.anim ? texs[waterFrame] : texs.length > 1 ? texs[(tx * 7 + tz * 13) % texs.length] : texs[0];
          v = tex.d[((wz & 63) << 6) | (wx & 63)];
          lm = lightmap[ci] + nightmap[ci] * night;
        }
        fb[p] = v & 0x100 ? v & 0xFF : cm[clamp(Math.round(base + tFloor * fogK - lm), 0, 31) * 256 + v];
        zb[p] = tFloor;
      } else if (outdoor) {
        fb[p] = sky(dx, dy, dz, col, y);
        zb[p] = 1e9;
      } else {
        // ---- ceiling ----
        const tc = dy > 0 ? tTop : tMax;
        const wx = cx + dx * tc, wz = cz + dz * tc;
        const tx = Math.floor(wx / TILE), tz = Math.floor(wz / TILE);
        const lm = tx >= 0 && tz >= 0 && tx < MW && tz < MH ? lightmap[tz * MW + tx] + nightmap[tz * MW + tx] * night : 0;
        const v = ceilTex.d[((wz & 63) << 6) | (wx & 63)];
        fb[p] = v & 0x100 ? v & 0xFF : cm[clamp(Math.round(base + tc * fogK - lm), 0, 31) * 256 + v];
        zb[p] = tc;
      }
    }
  }

  // ---- Sprites (far to near, depth tested) ----
  // Each sprite is a real upright card in the world, turned to face the camera across the
  // ground. Every pixel's ray is intersected with the card, exactly as the walls are cast, so
  // tilting the view changes nothing about where or how big things are.
  const list = [];
  for (const s of sprites) {
    const spr = s.spr, res = spr.res || 1;
    const hx = s.x - cx, hz = s.z - cz, hd = Math.hypot(hx, hz);
    if (hd < 4) continue;
    const nx = hx / hd, nz = hz / hd; // card normal, pointing away from the camera
    // Corners: across the card (u) from -ax to w-ax pixels, up it (v) from -(h-ay) to ay.
    const u0 = -spr.ax / res, u1 = (spr.w - spr.ax) / res, v0 = -(spr.h - spr.ay) / res, v1 = spr.ay / res;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, behind = false, depth = 0, near = 1e9;
    for (const [u, v] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) {
      const px = hx - nz * u, py = (s.y || 0) + v - eye, pz = hz + nx * u;
      const d = px * fX + py * fY + pz * fZ;
      if (d < 1) { behind = true; continue; }
      const sx = VW / 2 + (px * rX + pz * rZ) * VF / d, sy = VH / 2 - (px * uX + py * uY + pz * uZ) * VF / d;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      depth = Math.max(depth, d); near = Math.min(near, d);
    }
    if (behind) { if (depth === 0) continue; minX = 0; maxX = VW; minY = 0; maxY = VH; }
    if (maxX < 0 || minX > VW || maxY < 0 || minY > VH) continue;
    list.push({ s, hd, nx, nz, near: behind ? 0 : near, x0: Math.max(0, Math.floor(minX)), x1: Math.min(VW, Math.ceil(maxX)), y0: Math.max(0, Math.floor(minY)), y1: Math.min(VH, Math.ceil(maxY)) });
  }
  list.sort((a, b) => b.hd - a.hd);
  for (const it of list) {
    const s = it.s, spr = s.spr, res = spr.res || 1, data = spr.data, W = spr.w, H = spr.h;
    const tx = Math.floor(s.x / TILE), tz = Math.floor(s.z / TILE);
    const lm = tx >= 0 && tz >= 0 && tx < MW && tz < MH ? lightmap[tz * MW + tx] + nightmap[tz * MW + tx] * night : 0;
    const off = clamp(Math.round(base + it.hd * fogK - 1 - lm - (s.bright || 0)), 0, 31) * 256;
    const nx = it.nx, nz = it.nz, Rx = -nz, Rz = nx; // across the card
    const num = (s.x - cx) * nx + (s.z - cz) * nz; // plane distance along its normal
    const cu = (cx - s.x) * Rx + (cz - s.z) * Rz, cv = eye - (s.y || 0);
    // Along a row the ray is linear in kx: d = (bX + rX kx, dy, bZ + rZ kx).
    const dnR = rX * nx + rZ * nz, duR = rX * Rx + rZ * Rz;
    const near = it.near;
    for (let y = it.y0; y < it.y1; y++) {
      const ky = (VH / 2 - y - 0.5) / VF;
      const bX = fX + uX * ky, dy = fY + uY * ky, bZ = fZ + uZ * ky;
      const dn0 = bX * nx + bZ * nz, du0 = bX * Rx + bZ * Rz;
      const row = y * VW;
      for (let x = it.x0; x < it.x1; x++) {
        const p = row + x;
        if (zb[p] <= near) continue; // hidden behind something nearer than the whole card
        const kx = (x + 0.5 - VW / 2) / VF;
        const dn = dn0 + dnR * kx;
        if (dn <= 1e-6) continue;
        const t = num / dn; // also the depth along the view axis
        if (zb[p] <= t) continue;
        const i = Math.floor(spr.ax + (cu + t * (du0 + duR * kx)) * res);
        if (i < 0 || i >= W) continue;
        const j = Math.floor(spr.ay - (cv + t * dy) * res);
        if (j < 0 || j >= H) continue;
        const v = data[j * W + i];
        if (v === 0xFFFF) continue;
        if (s.ghost && ((x + y) & 1)) continue;
        fb[p] = v & 0x100 ? v & 0xFF : cm[off + v];
        zb[p] = t;
      }
    }
  }
}
// Screen position and depth of a world point for a camera, or null when it's behind the view.
function projectPoint(cam, x, y, z) {
  const ca = Math.cos(cam.ang), sa = Math.sin(cam.ang), pitch = cam.pitch || 0, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const dx = x - cam.x, dy = y - cam.eye, dz = z - cam.z;
  const depth = dx * ca * cp + dy * sp + dz * sa * cp;
  if (depth < 1) return null;
  const s = VF / depth;
  return [VW / 2 + (dx * -sa + dz * ca) * s, VH / 2 - (dx * -ca * sp + dy * cp + dz * -sa * sp) * s, depth, s];
}

// Depth-tested scaled blit. (sx, sy): screen position of the sprite's anchor; scale: screen
// pixels per world unit.
function blitSprite(spr, sx, sy, scale, depth, lvl, cm, ghost, vscale) {
  const fb = Render.fb, zb = Render.zb;
  const s = scale / (spr.res || 1), t = (vscale || scale) / (spr.res || 1);
  const x0 = sx - spr.ax * s, y0 = sy - spr.ay * t;
  const xs = Math.max(0, Math.ceil(x0 - 0.5)), xe = Math.min(VW, Math.ceil(x0 + spr.w * s - 0.5));
  const ys = Math.max(0, Math.ceil(y0 - 0.5)), ye = Math.min(VH, Math.ceil(y0 + spr.h * t - 0.5));
  const off = lvl * 256;
  for (let y = ys; y < ye; y++) {
    const j = Math.floor((y + 0.5 - y0) / t);
    if (j < 0 || j >= spr.h) continue;
    const srow = j * spr.w, row = y * VW;
    for (let x = xs; x < xe; x++) {
      const p = row + x;
      if (zb[p] <= depth) continue;
      const i = Math.floor((x + 0.5 - x0) / s);
      if (i < 0 || i >= spr.w) continue;
      const v = spr.data[srow + i];
      if (v === 0xFFFF) continue;
      if (ghost && ((x + y) & 1)) continue;
      fb[p] = v & 0x100 ? v & 0xFF : cm[off + v];
    }
  }
}

// Overlay blit without depth (first-person weapon, HUD icons). Lit at a fixed colormap level.
function blitFlat(spr, x0, y0, s, lvl, cm) {
  const fb = Render.fb;
  const xs = Math.max(0, Math.ceil(x0 - 0.5)), xe = Math.min(VW, Math.ceil(x0 + spr.w * s - 0.5));
  const ys = Math.max(0, Math.ceil(y0 - 0.5)), ye = Math.min(VH, Math.ceil(y0 + spr.h * s - 0.5));
  const off = lvl * 256;
  for (let y = ys; y < ye; y++) {
    const j = Math.floor((y + 0.5 - y0) / s);
    if (j < 0 || j >= spr.h) continue;
    for (let x = xs; x < xe; x++) {
      const i = Math.floor((x + 0.5 - x0) / s);
      if (i < 0 || i >= spr.w) continue;
      const v = spr.data[j * spr.w + i];
      if (v === 0xFFFF) continue;
      fb[y * VW + x] = v & 0x100 ? v & 0xFF : cm[off + v];
    }
  }
}
