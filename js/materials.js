'use strict';
// Shared surface materials. Creatures can define their own with mat().

// A glowing eye with a pupil and a glint. Give the sphere a texture frame oriented like the head
// (tf: head.movedTo(centre)) so local +z is the direction it looks.
// pupil: 'slit' (cat/demon), 'round', or null.
function eyeMat(ramp, glow, pupil, pupilSize = 1) {
  const base = R[ramp];
  return mat(ramp, {
    emissive: true, glow, noise: 0.4, nf: 2, edge: 0, dither: 0.5,
    rampFn: (x, y, z, l) => {
      const r = Math.hypot(x, y, z) || 1;
      const nx = x / r, ny = y / r, nz = z / r;
      if (nz > 0.35 && nx < -0.2 && ny > 0.3 && nx > -0.62) return [base, 15];    // glint
      if (pupil === 'slit' && nz > 0.55 && Math.abs(nx) < 0.2 * pupilSize) return [R.GRAY, 0];
      if (pupil === 'round' && nz > 1 - 0.2 * pupilSize) return [R.GRAY, 0];
      return [base, l + (nz - 0.4) * 3];
    },
  });
}

// Distance from (x, y) to the segment (ax, ay)-(bx, by): used to paint scars, tattoos and seams.
function seg2(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}

// Teeth: a band with dark gaps every `pitch` units along local x.
function teethMat(pitch = 0.85, bias = 0.5) {
  return mat('BONE', { amb: 0.28, dif: 0.85, noise: 0.5, bias,
    pattern: (x) => ((((x / pitch) % 1) + 1) % 1 < 0.22 ? -6 : 0) });
}

const M = {
  bone: mat('BONE', { amb: 0.2, dif: 0.92, noise: 1.0, nf: 0.6, spec: 0.08, shin: 6 }),
  boneDark: mat('BONE', { amb: 0.12, dif: 0.7, noise: 1.3, bias: -2 }),
  socket: mat('GRAY', { amb: 0, dif: 0.05, fill: 0, noise: 0.4, bias: 0, edge: 0 }),
  hollow: mat('RED', { amb: 0, dif: 0.15, fill: 0, noise: 0.6, bias: 1, edge: 0 }),
  rust: mat('RUST', { amb: 0.15, dif: 0.85, spec: 0.35, shin: 10, noise: 2.0, nf: 0.9 }),
  iron: mat('STEEL', { amb: 0.12, dif: 0.75, spec: 0.9, shin: 22, noise: 0.7, nf: 0.5 }),
  ironDark: mat('STEEL', { amb: 0.08, dif: 0.6, spec: 0.5, shin: 14, noise: 0.9, bias: -2.5 }),
  wood: mat('BROWN', { amb: 0.16, dif: 0.85, noise: 1.6, nf: 0.35,
    pattern: (x, y, z) => Math.sin(y * 0.9 + vnoise(x * 0.6, y * 0.15, z * 0.6) * 5) * 0.9 }),
  leather: mat('BROWN', { amb: 0.15, dif: 0.85, noise: 1.2, nf: 0.6, bias: -1, spec: 0.12, shin: 6 }),
  cloth: mat('BROWN', { amb: 0.14, dif: 0.85, noise: 1.0, nf: 0.9, bias: -1.5 }),
  gold: mat('GOLD', { amb: 0.15, dif: 0.8, spec: 0.9, shin: 16, noise: 0.6 }),
  blood: mat('RED', { amb: 0.12, dif: 0.6, spec: 0.6, shin: 30, noise: 0.8, bias: -1.5, edge: 1 }),
  eyeRed: mat('FIRE', { emissive: true, glow: 9, noise: 1.2, nf: 1.5 }),
  eyeYellow: mat('FIRE', { emissive: true, glow: 13, noise: 0.8, nf: 1.5 }),
  eyeGhost: mat('GHOST', { emissive: true, glow: 13, noise: 0.8, nf: 1.5 }),
  fire: mat('FIRE', { emissive: true, glow: 12, noise: 3.2, nf: 0.55, dither: 1.4 }),
  magic: mat('GHOST', { emissive: true, glow: 11, noise: 3, nf: 0.6, dither: 1.4 }),
};
