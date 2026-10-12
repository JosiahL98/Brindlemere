'use strict';
// Procedural effect sprites (projectiles and explosions), stored like creature sprites:
// palette indices with the 0x100 fullbright bit. Anchored at their centre.

function fxSprite(size, fn) {
  const data = new Uint16Array(size * size).fill(0xFFFF);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = fn(x - size / 2 + 0.5, y - size / 2 + 0.5);
    if (v >= 0) data[y * size + x] = v;
  }
  return { w: size, h: size, ax: size / 2, ay: size / 2, data };
}

// A flickering orb of `ramp`, radius r.
function orbFrames(ramp, r, n, seed) {
  const out = [];
  for (let f = 0; f < n; f++) {
    out.push(fxSprite(Math.ceil(r * 2.6), (x, y) => {
      const d = Math.hypot(x, y);
      const nz = vnoise(x * 0.38 + f * 3.1 + seed, y * 0.38 - f * 2.3, f * 1.7 + seed);
      const v = 1 - d / r + (nz - 0.5) * 0.75;
      if (v <= 0) return -1;
      return (ramp + clamp(Math.round(v * 19 + 3), 3, 15)) | 0x100;
    }));
  }
  return out;
}

// Expanding burst: fire at the rim, smoke and holes as it ages.
function burstFrames(ramp, r, n, seed) {
  const out = [];
  for (let f = 0; f < n; f++) {
    const age = f / (n - 1);
    const rad = r * (0.45 + 0.7 * age);
    out.push(fxSprite(Math.ceil(r * 2.8), (x, y) => {
      const d = Math.hypot(x, y * 1.1);
      const nz = vnoise(x * 0.3 + seed + f, y * 0.3 + f * 1.3, seed);
      const nz2 = vnoise(x * 0.8 - f, y * 0.8 + seed, f * 2.1);
      let v = 1 - d / rad + (nz - 0.5) * 0.9;
      if (v <= 0) return -1;
      if (nz2 < age * 0.75 - 0.05) return -1; // break up
      v = v * (1.15 - age * 0.9);
      if (v < 0.12 && age > 0.3) return R.GRAY + clamp(Math.round(3 + nz * 4), 1, 7); // smoke
      return (ramp + clamp(Math.round(v * 18 + 4 - age * 3), 2, 15)) | 0x100;
    }));
  }
  return out;
}

const FX = {
  fireball: { fly: orbFrames(R.FIRE, 6.5, 3, 1), boom: burstFrames(R.FIRE, 13, 5, 3), speed: 150, light: 8 },
  magic: { fly: orbFrames(R.GHOST, 5.5, 3, 7), boom: burstFrames(R.GHOST, 12, 5, 9), speed: 190, light: 6 },
  plasma: { fly: orbFrames(R.PINK, 5.5, 3, 11), boom: burstFrames(R.PINK, 11, 5, 13), speed: 170, light: 6 },
};
