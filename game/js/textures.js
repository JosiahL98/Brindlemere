'use strict';
// Procedural wall, floor and ceiling textures for Brindlemere, all indexed into the shared
// palette (texture value = palette index, | 0x100 for fullbright texels such as lit windows).
// Wall textures are 64 texels wide and one texel per world unit tall.

const hn = (x, y, s) => hash3(x | 0, y | 0, s);

// ---- Building pieces -------------------------------------------------------------------
function roofPixel(kind, x, y, roofH, seed) {
  if (kind === 'thatch') {
    const layer = Math.floor((y + (hn(x >> 2, 0, seed) * 3)) / 6);
    let l = 6.5 + (hn(x, layer, seed + 1) - 0.5) * 3 + Math.sin(x * 2.3 + layer * 1.7) * 0.8;
    if (((y + (hn(x >> 2, 0, seed) * 3)) % 6) > 4.5) l -= 2.5;
    if (y > roofH - 4) l -= (y - roofH + 4) * 0.9 + hn(x, y, 7) * 2;
    return lv('GOLD', l * 0.85 - 0.5);
  }
  const sh = kind === 'slate' ? 4 : 5, sw = kind === 'slate' ? 7 : 8;
  const row = Math.floor(y / sh);
  const off = (row & 1) * (sw >> 1);
  const col = Math.floor((x + off) / sw);
  const ramp = kind === 'slate' ? (hn(col, row, seed) > 0.5 ? 'STEEL' : 'GRAY') : (hn(col, row, seed) > 0.4 ? 'RED' : 'RUST');
  let l = (kind === 'slate' ? 4.5 : 5.2) + (hn(col, row, seed + 3) - 0.5) * 2.6;
  if (y % sh === sh - 1 || (x + off) % sw === 0) l -= 2.4;
  if (y % sh === 0) l += 0.8;
  if (y > roofH - 3) l -= 1.5;
  return lv(ramp, l);
}

function stonePixel(x, y, o) {
  // Ashlar: courses of bw x bh blocks with mortar, per-block tint, grime near the ground.
  const bw = o.bw || 16, bh = o.bh || 8;
  const row = Math.floor(y / bh), off = (row & 1) * (bw >> 1);
  const col = Math.floor((x + off) / bw);
  const ix = (x + off) % bw, iy = y % bh;
  const ramp = o.ramp || 'STONE';
  let l = (o.base || 7) + (hn(col, row, o.seed || 5) - 0.5) * 3 + (pnoise(x / 5, y / 5, 64, 9) - 0.5) * 2;
  if (ix === 0 || iy === bh - 1) return lv(ramp, (o.base || 7) - 4.5);
  if (iy === 0) l += 1.2;
  if (ix === bw - 1) l -= 1;
  if (o.rough) l += (hn(x, y, 3) - 0.5) * 2.2;
  return lv(ramp, l);
}

// Plaster. ramp may be "A/B" to dither two ramps together for in-between colours.
function plasterPixel(x, y, ramp, base) {
  const n = pfbm(x, y, 64, 4, 13, 3);
  let l = base + (n - 0.5) * 2.4 + (hn(x, y, 2) - 0.5) * 0.9;
  if (n > 0.66) l -= 1.2; // patches where the limewash wore thin
  if (ramp.includes('/')) {
    const [a, b] = ramp.split('/');
    ramp = ((x + y) & 1) ^ (hn(x >> 1, y >> 1, 21) > 0.7 ? 1 : 0) ? a : b;
  }
  return lv(ramp, l);
}

// Timber-framed house wall. o: { h, plaster:[ramp, level], roof, shutter, window, door, brace, night }
function texHouse(o) {
  const H = o.h || 128, roofH = o.roofH || 20;
  const extra = H - 128;
  const plateY = roofH + 4, beamY = 66 + extra, groundY = 112 + extra;
  const upTop = plateY + 10, upBot = beamY - 9, loTop = beamY + 10, loBot = groundY - 12;
  const [pr, pl] = o.plaster;
  const seed = o.seed || 1;
  const shutter = o.shutter || 'GREEN';
  const win = (x, y, top, bot, night) => {
    // Window with frame, mullions and side shutters. Returns a texel or -1.
    if (x >= 22 && x <= 41 && y >= top && y <= bot) {
      if (x <= 23 || x >= 40 || y <= top + 1 || y >= bot - 1) return lv('BROWN', 3 + (hn(x, y, 4) - 0.5));
      if (x === 31 || x === 32 || y === ((top + bot) >> 1)) return lv('BROWN', 2.5);
      if (night) return lv('FIRE', 10 + (hn(x, y, 6) - 0.5) * 2 - (y - top) * 0.04) | 0x100;
      const glint = (x - top * 0.5 + y) % 9 < 2 ? 2.5 : 0;
      return lv('STEEL', 3 + glint + (hn(x, y, 5) - 0.5));
    }
    if (o.shutters !== false && y >= top && y <= bot && ((x >= 14 && x <= 21) || (x >= 42 && x <= 49))) {
      const edge = x === 14 || x === 21 || x === 42 || x === 49 || y === top || y === bot;
      const board = (x % 3) === 0 ? -1 : 0;
      return lv(shutter, (edge ? 3.5 : 6) + board + (hn(x, y, 8) - 0.5) * 1.2);
    }
    if (x >= 21 && x <= 42 && y === bot + 1) return lv('BROWN', 6); // sill
    return -1;
  };
  return makeTex(64, H, (x, y) => {
    if (y < roofH) return roofPixel(o.roof, x, y, roofH, seed);
    if (y < plateY) return lv('BROWN', 1.5 + (y - roofH) * 0.3 + hn(x, y, 3) * 0.8);
    const yb = H - y;
    // Door (lower storey, centred)
    if (o.door && x >= 17 && x <= 46 && yb <= 66) {
      const ax = (x - 31.5) / 14.5, ay = (yb - 50) / 16;
      const inArch = yb < 50 || ax * ax + ay * ay <= 1;
      if (inArch) {
        if (yb <= 2) return lv('STONE', 8 - (hn(x, y, 2)));
        const ax2 = (x - 31.5) / 12.5, ay2 = (yb - 50) / 13.5;
        const inner = x >= 19 && x <= 44 && (yb < 50 || ax2 * ax2 + ay2 * ay2 <= 1);
        if (!inner) return lv('STONE', 6.5 + (hn(x, y, 9) - 0.5) * 2);
        if (Math.abs(yb - 16) < 1.2 || Math.abs(yb - 44) < 1.2) return lv('GRAY', 5 + (x % 6 === 2 ? 3 : 0));
        if (Math.hypot(x - 39, yb - 30) < 2.2 && Math.hypot(x - 39, yb - 30) > 1.1) return lv('GRAY', 9);
        const plank = (x - 19) % 5 === 0;
        return lv('BROWN', (plank ? 2.5 : 5.2) + (hn(x, Math.floor(yb / 7), 12) - 0.5) * 1.5 + Math.sin(yb * 0.8 + x) * 0.4);
      }
    }
    if (y >= groundY) return stonePixel(x, y, { bw: 12, bh: 6, base: 6.5, seed: seed + 20 });
    // Timber frame
    if (x <= 2 || x >= 61) return lv('BROWN', 2.6 + (x === 1 || x === 62 ? 1 : 0) + hn(x, y >> 3, 11));
    if (y < plateY + 3) return lv('BROWN', 3 + hn(x >> 3, y, 11));
    if (y >= beamY && y <= beamY + 3) return lv('BROWN', 3 + (y === beamY ? 1.2 : 0) + hn(x >> 3, y, 12));
    const upper = y < beamY;
    const hasWin = upper ? (o.window === 'up' || o.window === 'both') : (o.window === 'both' || o.window === 'low');
    if (hasWin) {
      const w = upper ? win(x, y, upTop, upBot, o.night) : win(x, y, loTop, loBot, o.night);
      if (w >= 0) return w;
    } else if (o.brace) {
      const top = upper ? plateY + 3 : beamY + 4, bot = upper ? beamY - 1 : groundY - 1;
      const t = (y - top) / (bot - top);
      const bx = 4 + t * 26;
      if (Math.abs(x - bx) < 2 || Math.abs(x - (59 - t * 26)) < 2) return lv('BROWN', 3.2 + hn(x, y >> 2, 13));
    }
    // Plaster, a little grimier toward the bottom of each storey.
    const storeyBot = upper ? beamY : groundY;
    const grime = Math.max(0, 6 - (storeyBot - y)) * 0.35;
    return plasterPixel(x, y, pr, pl - grime);
  });
}

// Dressed-stone building (chapel, smithy). o: { h, roof, window: 'arch'|'small'|'none', door, night, ramp, base }
function texStoneBuilding(o) {
  const H = o.h || 160, roofH = o.roofH || 20;
  return makeTex(64, H, (x, y) => {
    if (y < roofH) return roofPixel(o.roof || 'slate', x, y, roofH, o.seed || 3);
    if (y < roofH + 3) return lv('GRAY', 2 + hn(x, y, 2));
    const yb = H - y;
    if (o.door && x >= 17 && x <= 46 && yb <= 72) {
      const ax = (x - 31.5) / 14.5, ay = (yb - 56) / 16;
      if (yb < 56 || ax * ax + ay * ay <= 1) {
        const ax2 = (x - 31.5) / 12, ay2 = (yb - 56) / 13;
        const inner = x >= 20 && x <= 43 && (yb < 56 || ax2 * ax2 + ay2 * ay2 <= 1);
        if (!inner) return lv(o.ramp || 'STONE', (o.base || 7) + 1.5 + (hn(x, yb >> 2, 3) - 0.5) * 2);
        if (yb <= 2) return lv('STONE', 9);
        if (Math.abs(yb - 18) < 1.2 || Math.abs(yb - 48) < 1.2) return lv('GRAY', 5 + (x % 7 === 3 ? 3 : 0));
        return lv('BROWN', ((x - 20) % 6 === 0 ? 2 : 4.6) + (hn(x, yb >> 3, 4) - 0.5) * 1.4);
      }
    }
    if (o.window === 'arch') {
      const top = roofH + 14, bot = H - 44;
      const cy = top + 10;
      const ax = (x - 31.5) / 10.5, ay = (y - cy) / 10.5;
      const inside = x >= 21 && x <= 42 && y <= bot && (y >= cy || ax * ax + ay * ay <= 1);
      const insideG = x >= 23 && x <= 40 && y <= bot - 2 && (y >= cy || ((x - 31.5) / 8.5) ** 2 + ((y - cy) / 8.5) ** 2 <= 1);
      if (inside && !insideG) return lv('STONE', 10 + (hn(x, y, 6) - 0.5) * 1.5);
      if (insideG) {
        // Leaded diamonds of coloured glass
        const u = x + y, v = x - y;
        if (((u % 7) + 7) % 7 === 0 || ((v % 7) + 7) % 7 === 0) return lv('GRAY', 1.5);
        const cell = hn(Math.floor(u / 7), Math.floor(v / 7), 31);
        const ramp = cell < 0.25 ? 'BLUE' : cell < 0.5 ? 'RED' : cell < 0.75 ? 'GOLD' : 'GREEN';
        return o.night ? lv(ramp, 11 + (hn(x, y, 2) - 0.5) * 2) | 0x100 : lv(ramp, 5.5 + (hn(x, y, 2) - 0.5) * 1.5);
      }
    }
    if (o.window === 'small') {
      const top = roofH + 16, bot = top + 18;
      if (x >= 25 && x <= 38 && y >= top && y <= bot) {
        if (x <= 26 || x >= 37 || y <= top + 1 || y >= bot - 1) return lv('STONE', 9);
        if (x === 31 || x === 32) return lv('GRAY', 2);
        return o.night ? lv('FIRE', 9 + hn(x, y, 3) * 2) | 0x100 : lv('STEEL', 2.5 + ((x + y) % 8 < 2 ? 2 : 0));
      }
    }
    let px = stonePixel(x, y, { bw: 16, bh: 8, ramp: o.ramp || 'STONE', base: o.base || 7, seed: o.seed || 2, rough: true });
    if (yb < 10 && hn(x, y, 41) < 0.35 + (10 - yb) * 0.05) px = lv('OLIVE', 4 + hn(x, y, 9) * 3); // moss at the base
    if (o.soot && y < roofH + 26 && hn(x, y, 51) < (roofH + 26 - y) / 30) px = lv('GRAY', 1.5 + hn(x, y, 5) * 2);
    return px;
  });
}

// Vertical-plank wall (barn, mill upper). o: { h, ramp, roof, door, stoneBase }
function texPlanks(o) {
  const H = o.h || 128, roofH = o.roofH || 20;
  return makeTex(64, H, (x, y) => {
    if (y < roofH) return roofPixel(o.roof || 'shingle', x, y, roofH, o.seed || 4);
    if (y < roofH + 3) return lv('BROWN', 2);
    const yb = H - y;
    if (o.stoneBase && yb <= o.stoneBase) return stonePixel(x, y, { bw: 14, bh: 7, base: 6.5, seed: 8, rough: true });
    if (o.door && x >= 10 && x <= 53 && yb <= 80) {
      if (x <= 12 || x >= 51 || yb >= 78) return lv('BONE', 9);
      const t = (yb - 2) / 74;
      if (Math.abs((x - 12) / 39 - t) < 0.06 || Math.abs((x - 12) / 39 - (1 - t)) < 0.06 || Math.abs(yb - 40) < 1.5) return lv('BONE', 8.5);
    }
    const plank = Math.floor(x / 8);
    if (x % 8 === 0) return lv(o.ramp || 'RED', 1.5);
    let l = 5.4 + (hn(plank, 0, o.seed || 6) - 0.5) * 1.8 + Math.sin(y * 0.35 + plank * 4 + pnoise(x / 2, y / 9, 32, plank) * 5) * 0.7;
    if (x % 8 === 1) l += 0.9;
    if (hn(plank, Math.floor(y / 30), 61) < 0.06 && Math.abs(y % 30 - 15) < 1) l = 2; // nail line
    return lv(o.ramp || 'RED', l);
  });
}

function texCliff(H) {
  return makeTex(64, H, (x, y) => {
    const edge = 10 + pnoise(x / 6, 0, 16, 77) * 8;
    if (y < edge) {
      // Grassy brow with the occasional dark shrub
      const shrub = pnoise(x / 4, 1, 16, 70) > 0.62;
      return lv(shrub ? 'GREEN' : 'OLIVE', (shrub ? 3 : 5) + (hn(x, y, 3) - 0.5) * 2.5 - (y > edge - 3 ? 2 : 0));
    }
    const strata = Math.sin(y * 0.22 + pnoise(x / 9, y / 30, 64, 5) * 4) * 0.9;
    const crack = Math.abs(pfbm(x, y, 64, 4, 19, 3) - 0.5) < 0.025;
    let l = 5.2 + strata + (pfbm(x, y, 64, 8, 23, 4) - 0.5) * 4.5 + (hn(x, y, 6) - 0.5) * 1.2;
    if (crack) l -= 3.5;
    l -= Math.max(0, (y - H + 40) / 40) * 1.5;
    const moss = pfbm(x, y, 64, 6, 33, 3) > 0.62 && y < H * 0.6;
    return lv(moss ? 'OLIVE' : (pnoise(x / 16, y / 16, 64, 4) > 0.5 ? 'STONE' : 'GRAY'), l);
  });
}

function texDryStone(H) {
  return makeTex(64, H, (x, y) => {
    // Rounded field stones: nearest jittered cell centre.
    let best = 1e9, second = 1e9, id = 0;
    for (let cy = -1; cy <= Math.ceil(H / 8); cy++) for (let cx = -1; cx <= 8; cx++) {
      const px = cx * 8 + hn(cx & 7, cy, 3) * 7, py = cy * 8 + hn(cx & 7, cy, 4) * 7;
      const dx = Math.min(Math.abs(x - px), 64 - Math.abs(x - px)), dy = y - py;
      const d = dx * dx * 0.7 + dy * dy;
      if (d < best) { second = best; best = d; id = (cx & 7) * 31 + cy; } else if (d < second) second = d;
    }
    const gap = Math.sqrt(second) - Math.sqrt(best);
    if (gap < 1.1) return lv('GRAY', 1.5);
    const l = 6 + (hn(id, 0, 5) - 0.5) * 3.5 + Math.min(gap, 4) * 0.35 + (hn(x, y, 2) - 0.5);
    return lv(hn(id, 1, 6) > 0.5 ? 'STONE' : 'GRAY', l);
  });
}

function texFence(H) {
  return makeTex(64, H, (x, y) => {
    if (x % 32 < 4) return lv('BROWN', 3 + (x % 32 === 1 ? 1.5 : 0) + hn(x, y >> 2, 3));
    const board = Math.floor(y / 8);
    if (y % 8 === 7) return lv('BROWN', 1.5);
    return lv('BROWN', 5 + (hn(board, x >> 5, 4) - 0.5) * 2 + Math.sin(x * 0.4 + board * 3) * 0.6 + (y % 8 === 0 ? 1 : 0));
  });
}

// ---- Interiors --------------------------------------------------------------------------
function texIntPlaster(o = {}) {
  const H = o.h || 96;
  return makeTex(64, H, (x, y) => {
    const yb = H - y;
    if (y < 5) return lv('BROWN', 2.5 + (y === 4 ? -1 : 0) + hn(x >> 3, y, 1));
    if (yb <= 30) {
      if (yb >= 28) return lv('BROWN', 6.5 - (yb - 28));
      if (yb <= 2) return lv('BROWN', 2);
      const panel = x % 32;
      if (panel < 2 || panel > 29 || yb < 5 || yb > 25) return lv('BROWN', 4 + hn(x, y, 3) * 0.8);
      return lv('BROWN', 5.6 + Math.sin(x * 0.6 + yb * 0.1) * 0.4 + (hn(x, y, 4) - 0.5));
    }
    return plasterPixel(x, y, o.ramp || 'BONE', (o.base || 9) - (yb < 36 ? 1.5 : 0));
  });
}

function texIntStone(o = {}) {
  const H = o.h || 96;
  return makeTex(64, H, (x, y) => stonePixel(x, y, { bw: 14, bh: 9, ramp: o.ramp || 'GRAY', base: o.base || 5.5, seed: o.seed || 17, rough: true }));
}

// Shelves stocked with goods. kind: 'store' | 'bakery' | 'herbs' | 'bar' | 'books'
function texShelves(kind, H = 96) {
  const shelfYs = [26, 50, 74];
  return makeTex(64, H, (x, y) => {
    if (x < 3 || x > 60) return lv('BROWN', 3 + (x === 1 || x === 62 ? 1.4 : 0));
    for (const sy of shelfYs) if (y >= sy && y <= sy + 2) return lv('BROWN', y === sy ? 7 : 4);
    if (y < 6 || y > H - 8) return lv('BROWN', y > H - 8 ? 3.5 : 2.5);
    // Back board
    const back = lv('BROWN', 2.2 + (x % 9 === 0 ? -1 : 0) + hn(x, y, 5) * 0.6);
    const shelf = shelfYs.find((sy) => y < sy && y >= sy - 18);
    if (shelf === undefined) return back;
    const h = shelf - y; // height above the shelf board
    const slot = Math.floor((x - 3) / (kind === 'books' ? 3 : 8));
    const r = hn(slot, shelf, kind.length * 7);
    if (kind === 'books') {
      const bh = 10 + r * 7;
      if (h > bh || (x - 3) % 3 === 2 && r < 0.2) return back;
      const ramp = ['RED', 'BLUE', 'GREEN', 'BROWN', 'PURPLE', 'RUST'][Math.floor(r * 6)];
      if (Math.abs(h - bh * 0.7) < 0.6) return lv('GOLD', 9);
      return lv(ramp, 4.5 + ((x - 3) % 3 === 0 ? 1.5 : 0));
    }
    const cx = 3 + slot * 8 + 4, dx = x - cx;
    if (kind === 'herbs' || kind === 'bar') {
      // Bottles and jars
      const tall = kind === 'bar' ? 14 : 9 + r * 5;
      const wide = kind === 'bar' ? 2.2 : 2.8;
      const neck = h > tall - 4 && Math.abs(dx) <= 0.8;
      if (h <= tall && (Math.abs(dx) <= wide && h < tall - 4 || neck)) {
        const ramp = ['GREEN', 'BLUE', 'RED', 'GHOST', 'GOLD', 'BROWN'][Math.floor(hn(slot, shelf, 3) * 6)];
        return lv(ramp, 5 + (dx < -wide * 0.3 ? 3 : 0) - (dx > wide * 0.5 ? 1.5 : 0));
      }
      return back;
    }
    if (kind === 'bakery') {
      // Loaves
      const e = (dx / 3.6) ** 2 + ((h - 3) / 3.2) ** 2;
      if (e < 1) return lv('GOLD', 6.5 + (1 - e) * 3 - (h < 2 ? 2 : 0) + (Math.abs(dx - 1) < 0.5 && h > 4 ? -2 : 0));
      return back;
    }
    // General store: sacks, crates, cheese wheels, pots
    const what = Math.floor(r * 4);
    if (what === 0 && Math.abs(dx) < 3.5 && h < 12) return lv('BONE', 5 + (dx < 0 ? 1.5 : 0) + (h > 9 ? -1.5 : 0));            // sack
    if (what === 1 && Math.abs(dx) < 3.6 && h < 8) return lv('BROWN', (Math.abs(dx) > 3 || h > 6.5 ? 3 : 5.5));                 // crate
    if (what === 2 && Math.abs(dx) < 3.4 && h < 5) return lv('GOLD', 8 + (h > 3.5 ? 2 : 0));                                     // cheese
    if (what === 3 && (dx * dx) / 9 + ((h - 5) * (h - 5)) / 25 < 1) return lv('RUST', 5.5 + (dx < 0 ? 1.5 : 0));                // clay pot
    return back;
  });
}

function texFireplace(frame, H = 96) {
  return makeTex(64, H, (x, y) => {
    const yb = H - y;
    if (yb > 46 && yb < 52) return lv('BROWN', yb === 51 ? 7 : 4.5); // mantel
    if (x >= 12 && x <= 51 && yb <= 40) {
      if (x <= 15 || x >= 48 || yb >= 37) return stonePixel(x, y, { bw: 8, bh: 5, base: 6, seed: 4 });
      // Fire in the hearth
      const fx = x - 31.5;
      const n = vnoise(x * 0.35, yb * 0.3 - frame * 1.7, frame * 2.3);
      const flame = 1 - yb / (20 + n * 14) - Math.abs(fx) / 18 + (n - 0.5) * 0.5;
      if (yb < 4) return lv('GRAY', 1 + hn(x, frame, 3) * 2);                          // ash and logs
      if (yb < 7 && Math.abs(fx) < 13) return lv('BROWN', 2 + (hn(x, 0, 2) > 0.5 ? 2 : 0));
      if (flame > 0) return lv('FIRE', 6 + flame * 12) | 0x100;
      return lv('GRAY', 0.5 + (yb < 14 ? 1 : 0));
    }
    return stonePixel(x, y, { bw: 12, bh: 7, base: 6, seed: 6, rough: true });
  });
}

function texIntWindow(night, H = 96) {
  const base = texIntPlaster({ h: H });
  return makeTex(64, H, (x, y) => {
    if (x >= 18 && x <= 45 && y >= 22 && y <= 58) {
      if (x <= 20 || x >= 43 || y <= 24 || y >= 56) return lv('BROWN', 4);
      if (x === 31 || x === 32 || y === 40) return lv('BROWN', 3);
      return night ? lv('BLUE', 1.5 + hn(x, y, 3)) : lv('BLUE', 12 + (y - 24) * 0.05 + hn(x, y, 2)) | 0x100;
    }
    return base.d[y * 64 + x];
  });
}

function texIntDoor(H = 96) {
  const base = texIntPlaster({ h: H });
  return makeTex(64, H, (x, y) => {
    const yb = H - y;
    if (x >= 16 && x <= 47 && yb <= 70) {
      if (x <= 18 || x >= 45 || yb >= 68) return lv('BROWN', 3);
      if (Math.abs(yb - 18) < 1.2 || Math.abs(yb - 50) < 1.2) return lv('GRAY', 5);
      if (Math.hypot(x - 41, yb - 34) < 1.8) return lv('GOLD', 9);
      return lv('BROWN', ((x - 19) % 6 === 0 ? 2.5 : 5) + (hn(x, yb >> 3, 3) - 0.5));
    }
    return base.d[y * 64 + x];
  });
}

// Shop counter front (a low wall), 40 units tall.
function texCounter(H = 40) {
  return makeTex(64, H, (x, y) => {
    if (y < 4) return lv('BROWN', 7 - y * 0.5);
    if (y > H - 3) return lv('BROWN', 2);
    const panel = x % 16;
    if (panel < 2 || y < 7 || y > H - 7) return lv('BROWN', 3.6 + hn(x, y, 2) * 0.6);
    return lv('BROWN', 5.2 + Math.sin(x * 0.5) * 0.3 + (hn(x, y, 3) - 0.5) * 0.8);
  });
}

// ---- Floors and ceilings (64x64, sampled in world space) -------------------------------
function texGrass(seed) {
  return makeTex(64, 64, (x, y) => {
    const n = pfbm(x, y, 64, 4, seed, 3);
    const blade = hn(x, y, seed + 1);
    let l = 4.6 + (n - 0.5) * 3.2 + (blade - 0.5) * 2;
    if (blade > 0.93) l += 1.8;
    return lv(n > 0.6 ? 'OLIVE' : 'GREEN', l);
  });
}
function texMeadow() {
  const g = texGrass(41);
  return makeTex(64, 64, (x, y) => {
    const f = hn(x >> 1, y >> 1, 77);
    if (f > 0.965 && ((x + y) & 1)) return lv(f > 0.985 ? 'GOLD' : f > 0.975 ? 'BLUE' : 'PINK', 10);
    return g.d[y * 64 + x];
  });
}
function texDirt() {
  return makeTex(64, 64, (x, y) => {
    const n = pfbm(x, y, 64, 4, 51, 3);
    let l = 5.2 + (n - 0.5) * 3 + (hn(x, y, 2) - 0.5) * 1.2;
    if (hn(x >> 1, y >> 1, 9) > 0.95) l += 2.5; // pebbles
    if (Math.abs(((x + 64) % 32) - 10) < 1.5 && n > 0.45) l -= 1.2; // cart ruts
    return lv('BROWN', l * 0.9 + 0.4);
  });
}
function texCobble() {
  // Seamless Voronoi stones: one jittered centre per 8x8 cell, distances measured on a torus.
  const pts = [];
  for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) pts.push([cx * 8 + 1.5 + hn(cx, cy, 3) * 5, cy * 8 + 1.5 + hn(cx, cy, 4) * 5]);
  return makeTex(64, 64, (x, y) => {
    let best = 1e9, second = 1e9, id = 0;
    const gx = x >> 3, gy = y >> 3;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = (gx + ox + 8) & 7, cy = (gy + oy + 8) & 7;
      const [px, py] = pts[cy * 8 + cx];
      let dx = Math.abs(x - px); dx = Math.min(dx, 64 - dx);
      let dy = Math.abs(y - py); dy = Math.min(dy, 64 - dy);
      const d = dx * dx + dy * dy;
      if (d < best) { second = best; best = d; id = cy * 8 + cx; } else if (d < second) second = d;
    }
    const gap = Math.sqrt(second) - Math.sqrt(best);
    if (gap < 0.9) return lv('GRAY', 3 + hn(x, y, 5));
    const l = 7 + (hn(id, 0, 7) - 0.5) * 2.6 + Math.min(gap, 3) * 0.3 - Math.sqrt(best) * 0.1 + (hn(x, y, 8) - 0.5) * 0.8;
    return lv(hn(id, 1, 9) > 0.4 ? 'STONE' : 'GRAY', l);
  });
}
function texFarmland() {
  return makeTex(64, 64, (x, y) => {
    const row = y % 8;
    if (row >= 2 && row <= 4) {
      const sprout = hn(x >> 1, y >> 3, 3) > 0.35 && (x & 1);
      if (sprout) return lv(hn(x, y, 5) > 0.5 ? 'GOLD' : 'OLIVE', 6.5 + hn(x, y, 6) * 2.5);
    }
    return lv('BROWN', (row < 2 || row > 5 ? 3 : 4.4) + (hn(x, y, 7) - 0.5) * 1.5);
  });
}
function texGarden() {
  return makeTex(64, 64, (x, y) => {
    const cx = (x % 16) - 8, cy = (y % 16) - 8;
    const d = Math.hypot(cx, cy);
    if (d < 5.2) return lv(d < 2.5 ? 'OLIVE' : 'GREEN', 8 - d * 0.6 + (hn(x, y, 3) - 0.5) * 2);
    return lv('BROWN', 3.2 + (hn(x, y, 2) - 0.5) * 1.6);
  });
}
function texSand() {
  return makeTex(64, 64, (x, y) => {
    const n = pfbm(x, y, 64, 4, 61, 3);
    return lv(n > 0.55 ? 'BONE' : 'STONE', 7 + (n - 0.5) * 3 + (hn(x, y, 2) - 0.5) * 1.4 + Math.sin(x * 0.3 + n * 6) * 0.4);
  });
}
function texWater(frame) {
  return makeTex(64, 64, (x, y) => {
    const t = frame * TAU / 4;
    const a = Math.sin(x * 0.2 + y * 0.1 + t) + Math.sin(x * 0.07 - y * 0.23 + t * 2) * 0.7;
    const n = pfbm(x + frame * 4, y, 64, 4, 71, 2);
    let l = 4.4 + a * 0.9 + (n - 0.5) * 2;
    if (a > 1.35) l += 2.5; // glints
    return lv(n > 0.62 ? 'STEEL' : 'BLUE', l);
  });
}
function texBoards() {
  return makeTex(64, 64, (x, y) => {
    const board = Math.floor(y / 8);
    if (y % 8 === 0) return lv('BROWN', 2);
    const joint = (x + board * 23) % 64 === 0;
    if (joint) return lv('BROWN', 2.5);
    let l = 5.4 + (hn(board, (x + board * 23) >> 6, 4) - 0.5) * 1.8 + Math.sin(x * 0.45 + board * 2 + pnoise(x / 4, y / 2, 16, board) * 4) * 0.6;
    if (((x + board * 23) % 64 === 3 || (x + board * 23) % 64 === 60) && y % 8 === 4) l = 8.5; // nails
    return lv('BROWN', l);
  });
}
function texFlagstone2() {
  return makeTex(64, 64, (x, y) => stonePixel(x, y, { bw: 21, bh: 16, base: 6.5, seed: 22, rough: true, ramp: 'STONE' }));
}
function texStraw() {
  return makeTex(64, 64, (x, y) => {
    const s = Math.sin(x * 1.3 + Math.sin(y * 0.4) * 3) + Math.sin(x * 0.4 - y * 0.9);
    return lv('GOLD', 5 + s * 0.8 + (hn(x, y, 3) - 0.5) * 2.5);
  });
}
function texBeams() {
  return makeTex(64, 64, (x, y) => {
    if (y % 32 < 8) return lv('BROWN', 2.6 + (y % 32 === 1 ? 1 : 0) + hn(x >> 2, y, 1) * 0.6);
    if (x % 8 === 0) return lv('BROWN', 1.2);
    return lv('BROWN', 3.6 + (hn(x >> 3, y >> 5, 2) - 0.5) * 1.2 + Math.sin(y * 0.3 + x) * 0.3);
  });
}
function texVault() {
  return makeTex(64, 64, (x, y) => stonePixel(x, y, { bw: 16, bh: 10, base: 4.2, seed: 33, ramp: 'GRAY', rough: true }));
}

// ---- Registry ---------------------------------------------------------------------------
// Each texture may have a night version (lit windows). Built lazily on first use.
const TEXDEF = {
  // walls
  houseA: () => texHouse({ plaster: ['BONE', 11], roof: 'thatch', shutter: 'GREEN', window: 'up', brace: true, seed: 1 }),
  houseA2: () => texHouse({ plaster: ['BONE', 11], roof: 'thatch', shutter: 'GREEN', window: 'both', seed: 2 }),
  houseA3: () => texHouse({ plaster: ['BONE', 11], roof: 'thatch', window: 'none', brace: true, seed: 3 }),
  houseAdoor: () => texHouse({ plaster: ['BONE', 11], roof: 'thatch', shutter: 'GREEN', window: 'up', door: true, seed: 1 }),
  houseB: () => texHouse({ plaster: ['STONE/RUST', 11.5], roof: 'shingle', shutter: 'BLUE', window: 'up', brace: true, seed: 4 }),
  houseB2: () => texHouse({ plaster: ['STONE/RUST', 11.5], roof: 'shingle', shutter: 'BLUE', window: 'both', seed: 5 }),
  houseB3: () => texHouse({ plaster: ['STONE/RUST', 11.5], roof: 'shingle', window: 'none', brace: true, seed: 6 }),
  houseBdoor: () => texHouse({ plaster: ['STONE/RUST', 11.5], roof: 'shingle', shutter: 'BLUE', window: 'up', door: true, seed: 4 }),
  houseC: () => texHouse({ plaster: ['GRAY', 12.5], roof: 'slate', shutter: 'RED', window: 'up', brace: true, seed: 7 }),
  houseC2: () => texHouse({ plaster: ['GRAY', 12.5], roof: 'slate', shutter: 'RED', window: 'both', seed: 8 }),
  houseCdoor: () => texHouse({ plaster: ['GRAY', 12.5], roof: 'slate', shutter: 'RED', window: 'up', door: true, seed: 7 }),
  inn: () => texHouse({ h: 144, roofH: 26, plaster: ['BONE', 10.5], roof: 'thatch', shutter: 'RED', window: 'both', seed: 9 }),
  inn2: () => texHouse({ h: 144, roofH: 26, plaster: ['BONE', 10.5], roof: 'thatch', window: 'none', brace: true, seed: 10 }),
  innDoor: () => texHouse({ h: 144, roofH: 26, plaster: ['BONE', 10.5], roof: 'thatch', shutter: 'RED', window: 'up', door: true, seed: 9 }),
  chapel: () => texStoneBuilding({ h: 160, window: 'arch', seed: 2 }),
  chapel2: () => texStoneBuilding({ h: 160, window: 'none', seed: 3 }),
  chapelDoor: () => texStoneBuilding({ h: 160, window: 'none', door: true, seed: 2 }),
  smithy: () => texStoneBuilding({ h: 112, roofH: 18, ramp: 'GRAY', base: 5, window: 'small', soot: true, seed: 5 }),
  smithy2: () => texStoneBuilding({ h: 112, roofH: 18, ramp: 'GRAY', base: 5, window: 'none', soot: true, seed: 6 }),
  smithyDoor: () => texStoneBuilding({ h: 112, roofH: 18, ramp: 'GRAY', base: 5, door: true, soot: true, seed: 5 }),
  barn: () => texPlanks({ h: 128, ramp: 'RED', roof: 'shingle', seed: 3 }),
  barnDoor: () => texPlanks({ h: 128, ramp: 'RED', roof: 'shingle', door: true, seed: 3 }),
  mill: () => texPlanks({ h: 144, roofH: 24, ramp: 'BROWN', roof: 'thatch', stoneBase: 60, seed: 5 }),
  millDoor: () => texPlanks({ h: 144, roofH: 24, ramp: 'BROWN', roof: 'thatch', stoneBase: 60, door: true, seed: 5 }),
  cliff: () => texCliff(192),
  drystone: () => texDryStone(28),
  fence: () => texFence(32),
  // interiors
  intPlaster: () => texIntPlaster(),
  intStone: () => texIntStone(),
  intStoneTall: () => texIntStone({ h: 160, ramp: 'STONE', base: 6.5, seed: 9 }),
  intWindow: () => texIntWindow(false),
  intDoor: () => texIntDoor(),
  shelvesStore: () => texShelves('store'),
  shelvesBakery: () => texShelves('bakery'),
  shelvesHerbs: () => texShelves('herbs'),
  shelvesBar: () => texShelves('bar'),
  shelvesBooks: () => texShelves('books'),
  shelvesBooksTall: () => texShelves('books', 160),
  fireplace0: () => texFireplace(0), fireplace1: () => texFireplace(1), fireplace2: () => texFireplace(2),
  counter: () => texCounter(),
  // floors / ceilings
  grass: () => texGrass(11), grass2: () => texGrass(23), meadow: () => texMeadow(),
  dirt: () => texDirt(), cobble: () => texCobble(), farmland: () => texFarmland(), garden: () => texGarden(),
  sand: () => texSand(), boards: () => texBoards(), flagstone: () => texFlagstone2(), straw: () => texStraw(),
  water0: () => texWater(0), water1: () => texWater(1), water2: () => texWater(2), water3: () => texWater(3),
  beams: () => texBeams(), vault: () => texVault(),
};
// Night variants: same recipe with lit windows.
const TEXNIGHT = {
  houseA: () => texHouse({ plaster: ['BONE', 11], roof: 'thatch', shutter: 'GREEN', window: 'up', brace: true, seed: 1, night: true }),
  houseA2: () => texHouse({ plaster: ['BONE', 11], roof: 'thatch', shutter: 'GREEN', window: 'both', seed: 2, night: true }),
  houseAdoor: () => texHouse({ plaster: ['BONE', 11], roof: 'thatch', shutter: 'GREEN', window: 'up', door: true, seed: 1, night: true }),
  houseB: () => texHouse({ plaster: ['STONE/RUST', 11.5], roof: 'shingle', shutter: 'BLUE', window: 'up', brace: true, seed: 4, night: true }),
  houseB2: () => texHouse({ plaster: ['STONE/RUST', 11.5], roof: 'shingle', shutter: 'BLUE', window: 'both', seed: 5, night: true }),
  houseBdoor: () => texHouse({ plaster: ['STONE/RUST', 11.5], roof: 'shingle', shutter: 'BLUE', window: 'up', door: true, seed: 4, night: true }),
  houseC: () => texHouse({ plaster: ['GRAY', 12.5], roof: 'slate', shutter: 'RED', window: 'up', brace: true, seed: 7, night: true }),
  houseC2: () => texHouse({ plaster: ['GRAY', 12.5], roof: 'slate', shutter: 'RED', window: 'both', seed: 8, night: true }),
  houseCdoor: () => texHouse({ plaster: ['GRAY', 12.5], roof: 'slate', shutter: 'RED', window: 'up', door: true, seed: 7, night: true }),
  inn: () => texHouse({ h: 144, roofH: 26, plaster: ['BONE', 10.5], roof: 'thatch', shutter: 'RED', window: 'both', seed: 9, night: true }),
  innDoor: () => texHouse({ h: 144, roofH: 26, plaster: ['BONE', 10.5], roof: 'thatch', shutter: 'RED', window: 'up', door: true, seed: 9, night: true }),
  chapel: () => texStoneBuilding({ h: 160, window: 'arch', seed: 2, night: true }),
  smithy: () => texStoneBuilding({ h: 112, roofH: 18, ramp: 'GRAY', base: 5, window: 'small', soot: true, seed: 5, night: true }),
  intWindow: () => texIntWindow(true),
};
const _texCache = {}, _texNightCache = {};
function getTex(name, night) {
  if (night && TEXNIGHT[name]) return _texNightCache[name] || (_texNightCache[name] = TEXNIGHT[name]());
  return _texCache[name] || (_texCache[name] = TEXDEF[name]());
}
