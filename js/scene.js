'use strict';
// The 320x200 indexed frame buffer: floor/ceiling flats (or sky), the creature, effects and
// the status bar. Lighting goes through colormaps, with distance falloff like the old engines.

const SCR_W = 320, SCR_H = 200, VIEW_H = 168, HORIZON = 84, FOCAL = 160, EYE_H = 32;

// makeTex, pnoise, pfbm and lv live in texgen.js.

// --- Textures --------------------------------------------------------------------------
function texFlagstone() {
  // Irregular slabs in three courses, beveled, with grit and the odd crack.
  const rows = [[0, 22, [0, 27, 47]], [22, 43, [12, 38]], [43, 64, [5, 30, 52]]];
  const slabAt = (x, y) => {
    for (let r = 0; r < rows.length; r++) {
      const [y0, y1, cuts] = rows[r];
      if (y >= y0 && y < y1) {
        let k = 0;
        for (let c = 0; c < cuts.length; c++) if (x >= cuts[c]) k = c;
        if (x < cuts[0]) k = cuts.length - 1;
        return r * 8 + k;
      }
    }
    return 0;
  };
  return makeTex(64, 64, (x, y) => {
    const id = slabAt(x, y);
    const up = slabAt(x, (y + 63) & 63), dn = slabAt(x, (y + 1) & 63), lf = slabAt((x + 63) & 63, y), rt = slabAt((x + 1) & 63, y);
    if (up !== id || lf !== id) return lv('STONE', 1 + hash3(x, y, 2) * 1.5);
    let l = 7.2 + (hash3(id, 3, 9) - 0.5) * 3 + (pfbm(x, y, 64, 8, 4) - 0.5) * 5 + (hash3(x, y, 5) - 0.5) * 1.6;
    if (slabAt(x, (y + 62) & 63) !== id || slabAt((x + 62) & 63, y) !== id) l += 1.6; // lit bevel
    if (dn !== id || rt !== id) l -= 2.2;
    const crack = Math.abs(pfbm(x, y, 64, 4, 77 + id, 3) - 0.5);
    if (crack < 0.018) l -= 3.5;
    return lv('STONE', l);
  });
}
function texPlanks() {
  return makeTex(64, 64, (x, y) => {
    const plank = x >> 3, px = x & 7;
    if (px === 0) return lv('BROWN', 1);
    const joint = (y + plank * 23) % 64 === 0;
    if (joint) return lv('BROWN', 1.5);
    let l = 5.5 + (hash3(plank, 1, 4) - 0.5) * 2.5;
    l += Math.sin(y * 0.55 + pnoise(x * 0.5, y * 0.08, 32, plank) * 6) * 0.9;
    if (px === 1) l += 1; if (px === 7) l -= 1.2;
    if ((x >> 5) !== ((x + 1) >> 5) || x % 32 === 0) l -= 1;
    return lv('BROWN', l + (hash3(x, y, 8) - 0.5));
  });
}
function texTechFloor() {
  return makeTex(64, 64, (x, y) => {
    const px = x & 31, py = y & 31;
    if (px === 0 || py === 0) return lv('GRAY', 1);
    let l = 6 + (pfbm(x, y, 64, 4, 21, 3) - 0.5) * 3;
    if (px === 1 || py === 1) l += 2.2;
    if (px === 31 || py === 31) l -= 2;
    const rx = px < 16 ? px - 4 : px - 27, ry = py < 16 ? py - 4 : py - 27;
    if (rx * rx + ry * ry <= 2) return lv('STEEL', rx + ry < 0 ? 11 : 4);
    if (px > 6 && px < 25 && py > 6 && py < 25 && ((px + py) % 4 === 0 || (px - py + 64) % 4 === 0)) l += 1.6;
    return lv((x >> 5) ^ (y >> 5) ? 'STEEL' : 'GRAY', l + (hash3(x, y, 3) - 0.5) * 1.4);
  });
}
function texTechCeil() {
  return makeTex(64, 64, (x, y) => {
    const dx = Math.abs(x - 31.5), dy = Math.abs(y - 31.5);
    const m = Math.max(dx, dy);
    if (m < 13) {
      if (m > 11.5) return lv('GRAY', 4);
      if ((x % 6 === 0) || (y % 6 === 0)) return lv('GRAY', 11) | 0x100;
      return lv('GRAY', 14.5 - m * 0.12) | 0x100;
    }
    let l = 4.5 + (pfbm(x, y, 64, 8, 41) - 0.5) * 3;
    if (m < 15) l += 1.5;
    if (x % 32 === 0 || y % 32 === 0) l -= 2;
    return lv('GRAY', l + (hash3(x, y, 6) - 0.5));
  });
}
function texHellFloor() {
  return makeTex(64, 64, (x, y) => {
    const n = pfbm(x, y, 64, 4, 51, 4);
    const ridge = Math.abs(pfbm(x, y, 64, 3, 91, 3) - 0.5);
    if (ridge < 0.022) return lv('FIRE', 12 - ridge * 300) | 0x100;
    if (ridge < 0.04) return lv('RED', 7 - ridge * 60);
    const l = 3.5 + (n - 0.5) * 6 + (hash3(x, y, 4) - 0.5) * 1.5;
    return lv(n > 0.55 ? 'RUST' : 'RED', l);
  });
}
function texHellSky() {
  const w = 256, h = HORIZON;
  return makeTex(w, h, (x, y) => {
    const m1 = h - 10 - pfbm(x, 0, 256, 6, 61, 4) * 34;
    const m2 = h - 2 - pfbm(x, 0, 256, 12, 62, 3) * 18;
    if (y > m2) return lv('RED', 1.2 + (hash3(x, y, 1) - 0.5)) | 0x100;
    if (y > m1) return lv('RED', 2.2 + (y - m1) * 0.03 + (pfbm(x, y, 256, 32, 63, 2) - 0.5) * 2) | 0x100;
    const g = y / h;
    const cloud = pfbm(x, y * 2.2, 256, 8, 64, 4);
    const l = 2 + g * 9 + (cloud - 0.5) * 6;
    return (g > 0.62 && cloud > 0.55 ? lv('FIRE', l - 3) : lv('RED', l)) | 0x100;
  });
}
function texStatusBar() {
  return makeTex(SCR_W, SCR_H - VIEW_H, (x, y) => {
    let l = 6.5 + (pfbm(x, y, 64, 8, 17, 3) - 0.5) * 4 + (hash3(x, y, 2) - 0.5) * 1.4;
    if (y === 0) l = 11; else if (y === 1) l = 9;
    if (y === 31) l = 1;
    return lv('STONE', l);
  });
}

const ENVS = {
  dungeon: { name: 'Dungeon', light: 176, fogK: 1 / 19, fog: null, ceilH: 112, make() { this.floor = texFlagstone(); this.ceil = texPlanks(); } },
  tech: { name: 'Tech Base', light: 200, fogK: 1 / 28, fog: null, ceilH: 128, make() { this.floor = texTechFloor(); this.ceil = texTechCeil(); } },
  hell: { name: 'Inferno', light: 192, fogK: 1 / 24, fog: [72, 8, 0], make() { this.floor = texHellFloor(); this.sky = texHellSky(); } },
};
function envReady(env) {
  if (!env.ready) { env.make(); env.cmaps = buildColormaps(env.fog); env.ready = true; }
  return env;
}
let STATUS_TEX = null;

// --- Rendering ------------------------------------------------------------------------
function renderView(fb, st) {
  const env = envReady(st.env), cm = env.cmaps;
  const base = (255 - st.light) / 8;
  const { camX, camZ } = st;
  const eye = st.eye || EYE_H;
  for (let y = 0; y < HORIZON; y++) {
    const row = y * SCR_W;
    if (env.sky) {
      const sk = env.sky, srow = y * sk.w;
      for (let x = 0; x < SCR_W; x++) {
        const v = sk.d[srow + ((x + 32) & 255)];
        fb[row + x] = v & 0xFF;
      }
    } else {
      const dist = (env.ceilH - eye) * FOCAL / (HORIZON - y - 0.5);
      const map = clamp(Math.round(base + dist * env.fogK), 0, 31) * 256;
      const step = dist / FOCAL;
      let wx = camX + (-SCR_W / 2 + 0.5) * step;
      const tz = (Math.floor(camZ - dist) & 63) * 64;
      for (let x = 0; x < SCR_W; x++, wx += step) {
        const v = env.ceil.d[tz + (Math.floor(wx) & 63)];
        fb[row + x] = v & 0x100 ? v & 0xFF : cm[map + v];
      }
    }
  }
  const sh = st.shadow;
  for (let y = HORIZON; y < VIEW_H; y++) {
    const row = y * SCR_W;
    const dist = eye * FOCAL / (y - HORIZON + 0.5);
    const lb = base + dist * env.fogK;
    const step = dist / FOCAL;
    let wx = camX + (-SCR_W / 2 + 0.5) * step;
    const wz = camZ - dist;
    const tz = (Math.floor(wz) & 63) * 64;
    const dz = sh ? (wz - sh.z) / sh.rz : 9;
    for (let x = 0; x < SCR_W; x++, wx += step) {
      let l = lb;
      if (sh && dz * dz < 1) {
        const dx = (wx - sh.x) / sh.rx;
        const e = dx * dx + dz * dz;
        if (e < 1) l += sh.k * (1 - e);
      }
      const v = env.floor.d[tz + (Math.floor(wx) & 63)];
      fb[row + x] = v & 0x100 ? v & 0xFF : cm[clamp(Math.round(l), 0, 31) * 256 + v];
    }
  }
}

// Light level (colormap index) for something at camera depth `depth`.
function depthMap(env, light, depth) {
  return clamp(Math.round((255 - light) / 8 + depth * env.fogK - 4), 0, 31);
}

// Scaled sprite blit. (sx, sy) is where the sprite's anchor lands on screen; scale is screen
// pixels per world unit.
// fuzz: DOOM's spectre effect (smear the background instead of drawing pixels).
function drawSprite(fb, spr, sx, sy, scale, map, cmaps, fuzz, seed) {
  const s = scale / (spr.res || 1); // screen pixels per sprite pixel
  const x0 = sx - spr.ax * s, y0 = sy - spr.ay * s;
  const xs = Math.max(0, Math.ceil(x0 - 0.5)), xe = Math.min(SCR_W, Math.ceil(x0 + spr.w * s - 0.5));
  const ys = Math.max(0, Math.ceil(y0 - 0.5)), ye = Math.min(VIEW_H, Math.ceil(y0 + spr.h * s - 0.5));
  const mapOff = map * 256;
  let fz = seed | 0;
  for (let y = ys; y < ye; y++) {
    const j = Math.floor((y + 0.5 - y0) / s);
    if (j < 0 || j >= spr.h) continue;
    const srow = j * spr.w, row = y * SCR_W;
    for (let x = xs; x < xe; x++) {
      const i = Math.floor((x + 0.5 - x0) / s);
      if (i < 0 || i >= spr.w) continue;
      const v = spr.data[srow + i];
      if (v === 0xFFFF) continue;
      if (fuzz) {
        fz = (fz * 1103515245 + 12345) & 0x7fffffff;
        const off = ((fz >> 16) & 1 ? 1 : -1) * SCR_W;
        const src = clamp(row + x + off, 0, VIEW_H * SCR_W - 1);
        fb[row + x] = cmaps[6 * 256 + fb[src]];
      } else {
        fb[row + x] = v & 0x100 ? v & 0xFF : cmaps[mapOff + v];
      }
    }
  }
}

// Project a world point (relative to nothing; camera at camX, EYE_H, camZ looking -z).
function project(st, wx, wy, wz) {
  const depth = st.camZ - wz;
  if (depth < 6) return null;
  const s = FOCAL / depth;
  return { x: SCR_W / 2 + (wx - st.camX) * s, y: HORIZON - (wy - (st.eye || EYE_H)) * s, s, depth };
}

function drawStatusBar(fb, info) {
  if (!STATUS_TEX) STATUS_TEX = texStatusBar();
  const top = VIEW_H;
  for (let i = 0; i < STATUS_TEX.d.length; i++) fb[top * SCR_W + i] = STATUS_TEX.d[i] & 0xFF;
  // Recessed panels
  const panel = (x0, x1) => {
    for (let y = top + 3; y < SCR_H - 3; y++) for (let x = x0; x < x1; x++) {
      const edgeT = y === top + 3 || x === x0, edgeB = y === SCR_H - 4 || x === x1 - 1;
      const l = edgeT ? 1 : edgeB ? 9 : 2 + (hash3(x, y, 12) < 0.12 ? 1 : 0);
      fb[y * SCR_W + x] = R.STONE + l;
    }
  };
  panel(3, 80); panel(84, 254); panel(258, 317);
  const gold = R.GOLD + 13, goldDim = R.GOLD + 8, red = R.RED + 12, parch = R.BONE + 12, shadow = R.GRAY + 0;
  drawText(fb, SCR_W, 7, top + 6, 'SPRITE', goldDim, shadow);
  drawText(fb, SCR_W, 7, top + 15, info.code, red, R.RED + 2, 2);
  drawText(fb, SCR_W, 89, top + 6, info.name, gold, shadow);
  drawText(fb, SCR_W, 89, top + 16, info.action, parch, shadow);
  const fr = `FRAME ${info.frame + 1}/${info.frames}`;
  drawText(fb, SCR_W, 249 - textWidth(fr), top + 16, fr, parch, shadow);
  const sub = info.sub || '';
  drawText(fb, SCR_W, 249 - textWidth(sub), top + 6, sub, goldDim, shadow);
  // Facing compass: down = toward the viewer.
  const cx = 287, cy = top + 16, r = 11;
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    const px = Math.round(cx + Math.sin(a) * r), py = Math.round(cy + Math.cos(a) * r * 0.85);
    fb[py * SCR_W + px] = k === 0 ? R.RED + 11 : R.STONE + 10;
  }
  const ex = cx + Math.sin(info.yaw) * (r - 2), ey = cy + Math.cos(info.yaw) * (r - 2) * 0.85;
  for (let t = 0; t <= 1; t += 0.05) {
    const x = Math.round(lerp(cx, ex, t)), y = Math.round(lerp(cy, ey, t));
    fb[y * SCR_W + x] = gold;
  }
  fb[Math.round(ey) * SCR_W + Math.round(ex)] = R.FIRE + 14;
  fb[cy * SCR_W + cx] = R.GOLD + 6;
}
