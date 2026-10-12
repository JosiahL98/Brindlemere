'use strict';
// A 256-colour palette built from 16 ramps of 16 shades (dark -> light), in the spirit of
// DOOM's PLAYPAL. Sprites and textures are stored as palette indices; light levels are applied
// through 32 colormaps exactly the way the old engines did it.

const RAMP_LEN = 16;
const RAMPS = {
  GRAY:   ['#050506', '#232326', '#5e5d5c', '#a9a7a2', '#efede6'],
  STONE:  ['#0a0806', '#352d24', '#71644f', '#ad9f84', '#e9dcbc'],
  BROWN:  ['#0b0603', '#311b0b', '#6b411c', '#a9763a', '#e6b673'],
  BONE:   ['#0d0a05', '#3f3420', '#8b7a55', '#cfc098', '#fff7dd'],
  FLESH:  ['#100605', '#4b2216', '#99583a', '#d69772', '#ffe2c6'],
  RED:    ['#0c0101', '#420605', '#8f1510', '#d4331d', '#ff9a6c'],
  FIRE:   ['#240300', '#8a1c00', '#e85d00', '#ffb526', '#fffbe2'],
  GOLD:   ['#0d0802', '#402b06', '#8d6614', '#d9aa32', '#fff3a4'],
  GREEN:  ['#030802', '#16290c', '#3d5b1c', '#7e9c3b', '#d4eb94'],
  OLIVE:  ['#070805', '#23271b', '#4b5135', '#868c60', '#cfd3a8'],
  BLUE:   ['#02030d', '#0d1b42', '#2949a2', '#6292e2', '#dbefff'],
  STEEL:  ['#05040a', '#252230', '#58546a', '#a29cb6', '#f7f3ff'],
  PURPLE: ['#080211', '#2b0d3e', '#5e257a', '#a35aba', '#f3cbff'],
  RUST:   ['#0b0402', '#3b1708', '#7c3511', '#ba682b', '#f2b37b'],
  PINK:   ['#0f0306', '#4c1526', '#9c3a5a', '#e27a9a', '#ffd3e2'],
  GHOST:  ['#000b08', '#034b3b', '#12a283', '#55f2c4', '#eafff9'],
};
const RAMP_NAMES = Object.keys(RAMPS);
const R = {}; // ramp name -> base palette index
RAMP_NAMES.forEach((n, i) => { R[n] = i * RAMP_LEN; });

const PAL = new Uint8Array(256 * 3);
(function buildPalette() {
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  RAMP_NAMES.forEach((name, ri) => {
    const stops = RAMPS[name].map(hex);
    for (let i = 0; i < RAMP_LEN; i++) {
      const t = (i / (RAMP_LEN - 1)) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(t));
      const f = t - k;
      for (let c = 0; c < 3; c++) {
        PAL[(ri * RAMP_LEN + i) * 3 + c] = Math.round(stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f);
      }
    }
  });
})();

// Palette as 32-bit little-endian RGBA words for fast ImageData writes.
const PAL32 = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  PAL32[i] = (255 << 24) | (PAL[i * 3 + 2] << 16) | (PAL[i * 3 + 1] << 8) | PAL[i * 3];
}

const NUM_COLORMAPS = 32;
function nearestColor(r, g, b) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < 256; i++) {
    const pr = PAL[i * 3], pg = PAL[i * 3 + 1], pb = PAL[i * 3 + 2];
    const rm = (pr + r) * 0.5;
    const dr = pr - r, dg = pg - g, db = pb - b;
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// colormaps[level * 256 + index]: level 0 = full light, 31 = nearly black (or fully fogged).
function buildColormaps(fog) {
  const fr = fog ? fog[0] : 0, fg = fog ? fog[1] : 0, fb = fog ? fog[2] : 0;
  const maps = new Uint8Array(NUM_COLORMAPS * 256);
  for (let l = 0; l < NUM_COLORMAPS; l++) {
    const f = 1 - l / NUM_COLORMAPS;
    const g = 1 - f;
    for (let i = 0; i < 256; i++) {
      maps[l * 256 + i] = nearestColor(PAL[i * 3] * f + fr * g, PAL[i * 3 + 1] * f + fg * g, PAL[i * 3 + 2] * f + fb * g);
    }
  }
  return maps;
}
