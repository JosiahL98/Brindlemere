'use strict';
// Static props, sculpted like the creatures and built once as solid voxel models (voxel.js).
// Each prop: { variants, build(s, variant, frame, night), collide (radius), frames, nightVariant }

const PROPS = {};
function defProp(type, o) { PROPS[type] = Object.assign({ variants: 1, collide: 0, frames: 1, res: 1 }, o); }

// Materials
const PM = {
  bark: mat('BROWN', { amb: 0.1, dif: 0.8, gain: 0.62, bias: -1.2, noise: 1.8, nf: 0.9,
    rampFn: (x, y, z, l) => [Math.sin(Math.atan2(x, z) * 9 + y * 0.15) > 0.3 ? R.GRAY : R.BROWN, l + Math.sin(Math.atan2(x, z) * 9 + y * 0.15) * 1.2] }),
  birch: mat('BONE', { amb: 0.2, dif: 0.85, bias: 0, noise: 0.8, pattern: (x, y) => (hash3(Math.floor(y / 2.5), Math.floor(x * 2), 4) > 0.82 ? -8 : 0) }),
  pineLeaf: mat('GREEN', { amb: 0.1, dif: 0.9, gain: 0.62, bias: -0.8, noise: 2.6, nf: 0.8, pattern: (x, y) => (Math.sin(y * 1.7 + x) > 0.6 ? -1.6 : 0) }),
  oakLeaf: mat('GREEN', { amb: 0.12, dif: 0.95, gain: 0.72, bias: -0.4, noise: 2.8, nf: 0.42,
    rampFn: (x, y, z, l) => (vnoise(x * 0.18 + 3, y * 0.18, z * 0.18) > 0.62 ? [R.OLIVE, l + 0.5] : [R.GREEN, l]) }),
  birchLeaf: mat('GREEN', { amb: 0.14, dif: 0.95, gain: 0.82, bias: 0.4, noise: 2.6, nf: 0.5 }),
  bushLeaf: mat('GREEN', { amb: 0.12, dif: 0.9, gain: 0.7, bias: -0.8, noise: 2.6, nf: 0.6,
    rampFn: (x, y, z, l) => (hash3(Math.floor(x * 1.3), Math.floor(y * 1.3), Math.floor(z * 1.3)) > 0.96 ? [R.RED, 9] : [R.GREEN, l]) }),
  rock: mat('GRAY', { amb: 0.14, dif: 0.9, noise: 1.6, nf: 0.35,
    rampFn: (x, y, z, l) => (y > 3 && vnoise(x * 0.3, y * 0.3, z * 0.3) > 0.55 ? [R.OLIVE, l - 0.5] : [hash3(Math.floor(x / 4), Math.floor(y / 4), 2) > 0.5 ? R.GRAY : R.STONE, l]) }),
  stone: mat('STONE', { amb: 0.15, dif: 0.85, noise: 1.4, nf: 0.5, bias: -0.5 }),
  stoneBlocks: mat('STONE', { amb: 0.15, dif: 0.85, noise: 1.0, bias: -0.5,
    pattern: (x, y, z) => { const a = Math.atan2(x, z) * 4; return (Math.abs(y % 5) < 0.6 || Math.abs((a + Math.floor(y / 5) * 0.5) % 2) < 0.15) ? -3 : 0; } }),
  wood: mat('BROWN', { amb: 0.15, dif: 0.85, bias: -0.8, noise: 1.3, nf: 0.6, pattern: (x, y, z) => Math.sin((x + z) * 0.9 + vnoise(x * 0.3, y * 0.3, z) * 4) * 0.6 }),
  woodDark: mat('BROWN', { amb: 0.12, dif: 0.8, bias: -2.4, noise: 1.2, nf: 0.6 }),
  plank: mat('BROWN', { amb: 0.15, dif: 0.85, bias: -0.6, noise: 1.0, pattern: (x) => (Math.abs(((x % 4) + 4) % 4) < 0.35 ? -2.5 : 0) }),
  iron: mat('STEEL', { amb: 0.1, dif: 0.7, spec: 0.8, shin: 18, noise: 0.8, bias: -2.6 }),
  brass: mat('GOLD', { amb: 0.12, dif: 0.75, spec: 0.9, shin: 20, noise: 0.5, bias: -1.5 }),
  straw: mat('GOLD', { amb: 0.15, dif: 0.85, bias: -1.2, noise: 2.2, nf: 1.2, pattern: (x, y) => Math.sin(x * 2.1 + y * 0.6) * 0.9 }),
  sack: mat('BONE', { amb: 0.15, dif: 0.85, bias: -2.4, noise: 1.3, nf: 1.1, pattern: (x, y) => (((Math.floor(x * 1.5) + Math.floor(y * 1.5)) & 1) ? -0.7 : 0) }),
  cloth: (ramp, o) => mat(ramp, Object.assign({ amb: 0.14, dif: 0.85, bias: -1.2, noise: 1.0, nf: 0.9 }, o)),
  water: mat('BLUE', { amb: 0.05, dif: 0.3, spec: 1.2, shin: 30, bias: -2, noise: 0.8 }),
  dirt: mat('BROWN', { amb: 0.12, dif: 0.8, bias: -2.6, noise: 2, nf: 0.8 }),
  flame: mat('FIRE', { emissive: true, glow: 12, noise: 2.4, nf: 1.2 }),
  coals: mat('FIRE', { emissive: true, glow: 8, noise: 3, nf: 1.0 }),
  glow: mat('GOLD', { emissive: true, glow: 13, noise: 0.8, nf: 1.5 }),
  paper: mat('BONE', { amb: 0.25, dif: 0.8, bias: 1, noise: 0.6, pattern: (x, y) => (Math.abs((y * 2.2) % 2) < 0.4 ? -3 : 0) }),
};

const P0 = [0, 0, 0];
const at = (x, y, z) => [x, y, z];
const F = (x, y, z) => Frame.at([x, y, z]);

// ---- Trees -------------------------------------------------------------------------------
defProp('pine', {
  variants: 3, collide: 12,
  build(s, v) {
    const k = [1, 1.15, 0.9][v], r = rng(11 + v);
    s.limb(P0, at(0, 46 * k, 0), 2.4 * k, 1.2, PM.bark);
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const y = (16 + i * 12) * k, rad = (19 - i * 3.2) * k;
      s.limb(at((r() - 0.5) * 2, y, (r() - 0.5) * 2), at(0, y + 17 * k, 0), rad, 0.8, PM.pineLeaf, { k: 2.5 });
    }
  },
});
defProp('oak', {
  variants: 3, collide: 13,
  build(s, v) {
    const k = [1, 1.2, 0.85][v], r = rng(21 + v);
    s.limb(P0, at(0, 30 * k, 0), 4.2 * k, 2.8 * k, PM.bark, { k: 2 });
    s.limb(P0, at(5, 2, 2), 3, 1, PM.bark, { k: 2 });
    s.limb(P0, at(-4, 2, -3), 3, 1, PM.bark, { k: 2 });
    // Boughs fanning out, each carrying a clump of leaves; the crown is wide and uneven.
    const clumps = [];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + r() * 0.8;
      const end = [Math.cos(a) * (14 + r() * 8) * k, (40 + r() * 12) * k, Math.sin(a) * (8 + r() * 5) * k];
      s.limb(at(0, 26 * k, 0), end, 2.0 * k, 1.0, PM.bark);
      clumps.push(end);
    }
    clumps.push([0, 56 * k, 0], [6 * k, 62 * k, 2], [-7 * k, 58 * k, -2]);
    for (const c of clumps) {
      s.sphere(c, (9 + r() * 4) * k, PM.oakLeaf, { k: 5 });
      s.sphere([c[0] + (r() - 0.5) * 10, c[1] + (r() - 0.3) * 8, c[2] + (r() - 0.5) * 6], (6 + r() * 3) * k, PM.oakLeaf, { k: 5 });
    }
  },
});
defProp('birch', {
  variants: 2, collide: 8,
  build(s, v) {
    const k = [1, 1.15][v], r = rng(31 + v);
    s.limb(P0, at(1, 58 * k, 0), 2.0, 1.0, PM.birch);
    for (let i = 0; i < 6; i++) {
      const y = (32 + r() * 30) * k;
      s.ellipsoid(F((r() - 0.5) * 12, y, (r() - 0.5) * 6), [7 + r() * 3, 10 + r() * 4, 6], PM.birchLeaf, { k: 5 });
    }
  },
});
defProp('bush', {
  variants: 3, collide: 0,
  build(s, v) {
    const r = rng(41 + v);
    for (let i = 0; i < 4; i++) s.sphere([(r() - 0.5) * 12, 4 + r() * 6, (r() - 0.5) * 6], 5 + r() * 4, PM.bushLeaf, { k: 4 });
  },
});
defProp('fern', {
  variants: 2,
  build(s, v) {
    const r = rng(51 + v);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + r() * 0.4;
      const tip = [Math.cos(a) * 9, 3 + r() * 5, Math.sin(a) * 5];
      s.limb(at(0, 1, 0), tip, 1.4, 0.4, PM.birchLeaf);
    }
  },
});
defProp('rock', {
  variants: 3, collide: 14,
  build(s, v) {
    const r = rng(61 + v);
    s.ellipsoid(F(0, 4, 0).rot(r() * 0.4, r() * 3, r() * 0.3), [13 + r() * 4, 9 + r() * 4, 11], PM.rock, { k: 3 });
    s.ellipsoid(F(8, 3, 3).rot(0, r() * 3, 0.3), [7, 6, 7], PM.rock, { k: 3 });
  },
});
defProp('bones', {
  build(s) {
    s.sphere(at(0, 2.2, 0), 2.6, M.bone);
    s.sphere(at(0.9, 1.9, 2.0), 0.7, M.socket, { sub: true }); s.sphere(at(-0.9, 1.9, 2.0), 0.7, M.socket, { sub: true });
    s.limb(at(4, 0.8, -2), at(12, 0.8, 1), 0.8, 0.7, M.bone);
    s.limb(at(-3, 0.7, 2), at(-11, 0.9, -1), 0.7, 0.6, M.bone);
    s.limb(at(-6, 0.7, -3), at(1, 0.7, -5), 0.6, 0.6, M.bone);
  },
});
defProp('bluebell', {
  variants: 2,
  build(s, v) {
    const r = rng(71 + v);
    const petal = mat('BLUE', { amb: 0.25, dif: 0.8, bias: 2.5, noise: 0.8 });
    for (let i = 0; i < 5; i++) {
      const bx = (r() - 0.5) * 6, bz = (r() - 0.5) * 4, h = 6 + r() * 4;
      s.limb(at(bx, 0, bz), at(bx + 1, h, bz), 0.35, 0.3, PM.birchLeaf);
      for (let j = 0; j < 3; j++) s.sphere(at(bx + 1 + j * 0.6, h - j * 1.6, bz + 0.3), 0.9, petal);
    }
    s.ellipsoid(F(0, 0.5, 0), [5, 1, 3], PM.bushLeaf);
  },
});
defProp('reeds', {
  variants: 2,
  build(s, v) {
    const r = rng(81 + v);
    const reed = mat('OLIVE', { amb: 0.15, dif: 0.85, noise: 1, bias: 0.5 });
    for (let i = 0; i < 9; i++) {
      const bx = (r() - 0.5) * 12, bz = (r() - 0.5) * 5, h = 14 + r() * 10;
      s.limb(at(bx, 0, bz), at(bx + (r() - 0.5) * 4, h, bz), 0.45, 0.25, reed);
      if (r() < 0.5) s.limb(at(bx + 0.5, h - 1, bz), at(bx + 0.8, h - 5, bz), 0.9, 0.9, PM.woodDark);
    }
  },
});

// ---- Town ----------------------------------------------------------------------------------
defProp('well', {
  collide: 24,
  build(s) {
    s.limb(at(0, 0, 0), at(0, 14, 0), 15, 15, PM.stoneBlocks);
    s.limb(at(0, 2, 0), at(0, 30, 0), 11.5, 11.5, mat('BLUE', { amb: 0, dif: 0.2, bias: -4, noise: 0.5, edge: 0 }), { sub: true });
    for (const x of [-12, 12]) s.limb(at(x, 14, 0), at(x, 44, 0), 1.6, 1.4, PM.wood);
    s.limb(at(-13, 40, 0), at(13, 40, 0), 1.2, 1.2, PM.wood);
    const roof = mat('RED', { amb: 0.12, dif: 0.85, bias: -1.6, noise: 1.2, pattern: (x, y) => (Math.abs(y % 3) < 0.5 ? -2 : 0) });
    s.box(F(0, 48, 5).rot(-0.75, 0, 0), [16, 9, 0.8], 0.4, roof);
    s.box(F(0, 48, -5).rot(0.75, 0, 0), [16, 9, 0.8], 0.4, roof);
    s.limb(at(0, 40, 0), at(0, 26, 0), 0.3, 0.3, PM.sack);
    s.limb(at(0, 21, 0), at(0, 26, 0), 2.6, 3.0, PM.wood);
  },
});
defProp('stall', {
  variants: 3, collide: 22,
  build(s, v) {
    const variant = ['apples', 'cloth', 'pots'][v];
    s.box(F(0, 16, 0), [20, 1.5, 9], 0.5, PM.plank);
    s.box(F(0, 8, 8), [20, 8, 0.8], 0.3, PM.plank);
    for (const x of [-19, 19]) for (const z of [-8, 8]) s.limb(at(x, 0, z), at(x, z < 0 ? 44 : 36, z), 1.1, 1.0, PM.wood);
    const stripe = mat('RED', { amb: 0.14, dif: 0.85, bias: -0.5, noise: 0.6,
      rampFn: (x, y, z, l) => (((x + 40) % 8) < 4 ? [R.BONE, l + 1] : [[R.RED, R.BLUE, R.GREEN][v], l]) });
    s.box(F(0, 41, 0).rot(-0.32, 0, 0), [22, 0.8, 11], 0.3, stripe, { tf: F(0, 0, 0) });
    const r = rng(91 + v);
    if (variant === 'apples') {
      s.box(F(-8, 20, 0), [8, 3, 6], 0.4, PM.plank); s.box(F(8, 20, 0), [8, 3, 6], 0.4, PM.plank);
      for (let i = 0; i < 18; i++) s.sphere(at((i < 9 ? -8 : 8) + (r() - 0.5) * 12, 23 + r() * 1.5, (r() - 0.5) * 9), 1.6, mat(i % 3 ? 'RED' : 'GREEN', { amb: 0.2, dif: 0.85, spec: 0.5, noise: 0.5 }));
    } else if (variant === 'cloth') {
      ['BLUE', 'RED', 'GOLD', 'PURPLE', 'GREEN'].forEach((c, i) => s.box(F(-15 + i * 7.5, 19 + (i % 2), 0), [3.4, 2 + (i % 2), 6], 1, PM.cloth(c, { bias: 0 })));
    } else {
      for (let i = 0; i < 6; i++) s.limb(at(-15 + i * 6, 17.5, (i % 2) * 3 - 1.5), at(-15 + i * 6, 24 + r() * 4, (i % 2) * 3 - 1.5), 2.6, 1.6, mat('RUST', { amb: 0.15, dif: 0.85, spec: 0.3, noise: 0.8 }));
    }
  },
});
defProp('bench', {
  collide: 10,
  build(s) {
    s.box(F(0, 11, 0), [16, 1.2, 4.5], 0.4, PM.plank);
    for (const x of [-12, 12]) s.box(F(x, 5, 0), [1.4, 5, 3.6], 0.3, PM.woodDark);
  },
});
defProp('noticeboard', {
  collide: 10,
  build(s) {
    for (const x of [-12, 12]) s.limb(at(x, 0, 0), at(x, 50, 0), 1.3, 1.1, PM.wood);
    s.box(F(0, 34, 0), [13, 11, 1], 0.4, PM.plank);
    const r = rng(7);
    for (let i = 0; i < 5; i++) s.box(F(-8 + i * 4 + r() * 2, 32 + r() * 6, 1.2).rot(0, 0, (r() - 0.5) * 0.3), [2.4, 3.2, 0.2], 0.1, PM.paper, { tf: F(0, 0, 0) });
    s.box(F(0, 49, 0).rot(-0.4, 0, 0), [15, 0.8, 4], 0.3, mat('RED', { bias: -2, noise: 1 }));
  },
});
defProp('lamppost', {
  collide: 5, nightVariant: true,
  build(s, v, f, night) {
    s.limb(P0, at(0, 54, 0), 1.3, 0.9, PM.iron);
    s.limb(at(0, 0, 0), at(0, 4, 0), 2.6, 1.6, PM.iron);
    s.box(F(0, 58, 0), [3, 4, 3], 0.6, PM.iron);
    s.box(F(0, 58, 0), [2.2, 3.2, 3.4], 0.3, night ? PM.glow : mat('STEEL', { amb: 0.2, dif: 0.5, spec: 1, bias: 0 }), { after: true });
    s.limb(at(0, 62, 0), at(0, 64.5, 0), 2.2, 0.4, PM.iron);
  },
});
defProp('sign', {
  variants: 5, collide: 0,
  build(s, v) {
    const kind = ['inn', 'store', 'bakery', 'smithy', 'herbs'][v];
    s.limb(P0, at(0, 56, 0), 1.2, 1.0, PM.woodDark);
    s.limb(at(0, 52, 0), at(13, 52, 0), 0.8, 0.8, PM.iron);
    s.limb(at(4, 52, 0), at(4, 48, 0), 0.25, 0.25, PM.iron); s.limb(at(11, 52, 0), at(11, 48, 0), 0.25, 0.25, PM.iron);
    const paint = mat('BROWN', { amb: 0.2, dif: 0.8, bias: 0, noise: 0.6,
      rampFn: (x, y, z, l) => {
        const sym = {
          inn: () => (Math.abs(x + 1) < 2.6 && y > -3 && y < 2.5) || (Math.abs(x - 2.6) < 0.6 && y > -1.5 && y < 1.5) ? [R.GOLD, 11] : null,
          store: () => (Math.abs(y - 2) < 0.4 && Math.abs(x) < 4) || (Math.abs(x) < 0.4 && y > -3 && y < 2) || (Math.hypot(Math.abs(x) - 3, y + 0.5) < 1.4 && y < -0.5) ? [R.GOLD, 11] : null,
          bakery: () => ((x / 4) ** 2 + (y / 2.4) ** 2 < 1 ? [R.GOLD, 9 + (y > 0 ? 2 : 0)] : null),
          smithy: () => ((Math.abs(y - 1) < 1 && Math.abs(x) < 4) || (Math.abs(x) < 1.4 && y < 0 && y > -3) || (y > -3.6 && y < -2.6 && Math.abs(x) < 3) ? [R.STEEL, 11] : null),
          herbs: () => (Math.hypot(x, y) < 3 && Math.abs(Math.atan2(y, x) - 0.8) < 1.2 ? [R.GREEN, 9] : Math.abs(x + y * 0.3) < 0.4 && y < 1 ? [R.GREEN, 6] : null),
        }[kind]();
        if (sym) return sym;
        if (Math.abs(x) > 5.6 || Math.abs(y) > 4.2) return [R.BROWN, l - 2];
        return [R.BROWN, l - 1];
      } });
    s.box(F(7.5, 43.5, 0), [6.4, 5, 0.7], 0.3, paint, { tf: F(7.5, 43.5, 0) });
  },
});
defProp('forge', {
  collide: 18,
  build(s) {
    s.box(F(0, 10, 0), [14, 10, 10], 1, PM.stone);
    s.box(F(0, 20.5, 0), [10, 1, 7], 0.5, PM.coals, { after: true });
    s.box(F(0, 34, -4), [9, 10, 6], 1.5, PM.stone);
    s.limb(at(0, 44, -4), at(0, 70, -4), 4, 3.4, PM.stone);
    s.ellipsoid(F(14, 16, 4).rot(0, 0, 0.4), [3, 6, 4], PM.cloth('BROWN', { bias: -2 }));
  },
});
defProp('anvil', {
  collide: 9,
  build(s) {
    s.limb(P0, at(0, 12, 0), 6, 5.5, PM.bark);
    s.box(F(0, 14, 0), [5, 2, 3.5], 0.5, PM.iron);
    s.box(F(0, 17.5, 0), [3, 2, 2.5], 0.5, PM.iron);
    s.box(F(1, 21, 0), [7, 1.6, 3.2], 0.6, PM.iron);
    s.limb(at(-6, 21.4, 0), at(-11, 21.8, 0), 1.6, 0.3, PM.iron);
  },
});
defProp('weaponrack', {
  collide: 12,
  build(s) {
    s.box(F(0, 2, 0), [14, 1.2, 4], 0.4, PM.wood);
    s.box(F(0, 30, -2), [14, 1, 1.4], 0.4, PM.wood);
    for (const x of [-13, 13]) s.limb(at(x, 0, -2), at(x, 34, -2), 1.1, 1.0, PM.wood);
    // Leaning weapons
    s.box(F(-8, 18, 0.5).rot(0, 0, 0.08), [1, 15, 0.3], 0.2, PM.iron);
    s.box(F(-8, 4, 0.5), [2.5, 0.6, 0.6], 0.2, PM.brass);
    s.limb(at(-1, 3, 0.5), at(0, 34, 0.5), 0.6, 0.6, PM.wood);
    s.box(F(1.4, 29, 0.5), [3.5, 4, 0.4], 0.5, PM.iron);
    s.limb(at(7, 3, 0.5), at(8, 30, 0.5), 0.7, 0.7, PM.wood);
    s.sphere(at(8, 31, 0.5), 2.8, PM.iron);
  },
});
defProp('barrel', {
  collide: 10,
  build(s) {
    const staves = mat('BROWN', { amb: 0.15, dif: 0.85, bias: -0.8, noise: 1.0, pattern: (x, y, z) => (Math.abs(Math.sin(Math.atan2(x, z) * 8)) < 0.15 ? -2.5 : 0) });
    s.ellipsoid(F(0, 11, 0), [9, 12, 9], staves, { clip: [0, 1, 0, 21], tf: F(0, 11, 0) });
    s.ellipsoid(F(0, 11, 0), [9, 12, 9], staves, { clip: [0, -1, 0, -1] });
    for (const y of [4, 18]) s.torus(F(0, y, 0), 8.4, 0.7, PM.iron);
    // A flat lid, set just inside the top of the staves.
    s.cylinder(F(0, 20.6, 0), 7.8, 0.6, 0.3, PM.woodDark);
  },
});
defProp('crate', {
  collide: 11, variants: 2,
  build(s, v) {
    const crate = mat('BROWN', { amb: 0.15, dif: 0.85, bias: -0.4, noise: 1.1,
      pattern: (x, y, z) => { const e = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)); const m = Math.min(9 - Math.abs(x), 9 - Math.abs(y), 9 - Math.abs(z)); return e > 8.4 && m < 1.6 ? -2 : (Math.abs(y % 4) < 0.4 ? -1.5 : 0); } });
    s.box(F(0, 9, 0), [9, 9, 9], 0.5, crate, { tf: F(0, 9, 0) });
    if (v) s.box(F(2, 23, 1).rot(0, 0.4, 0), [6, 5, 6], 0.4, crate, { tf: F(2, 23, 1) });
  },
});
defProp('sacks', {
  collide: 10,
  build(s) {
    s.ellipsoid(F(-4, 6, 0), [6, 7, 5], PM.sack, { k: 1 });
    s.ellipsoid(F(4, 5.5, 1), [6, 6, 5], PM.sack, { k: 1 });
    s.ellipsoid(F(0, 14, 0).rot(0.2, 0, 0.3), [5.5, 6, 4.5], PM.sack, { k: 1 });
  },
});
defProp('cart', {
  collide: 24,
  build(s) {
    s.box(F(0, 18, 0), [20, 2, 11], 0.6, PM.plank);
    s.box(F(0, 23, 10.5), [20, 4, 0.8], 0.4, PM.plank); s.box(F(0, 23, -10.5), [20, 4, 0.8], 0.4, PM.plank);
    for (const z of [-12.5, 12.5]) {
      s.torus(Frame.along(at(-4, 11, z), [0, 0, 1], [1, 0, 0]), 10, 1.4, PM.woodDark);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; s.limb(at(-4 - Math.cos(a) * 10, 11 - Math.sin(a) * 10, z), at(-4 + Math.cos(a) * 10, 11 + Math.sin(a) * 10, z), 0.7, 0.7, PM.wood); }
    }
    s.limb(at(20, 18, 4), at(38, 12, 4), 1.1, 1.0, PM.wood); s.limb(at(20, 18, -4), at(38, 12, -4), 1.1, 1.0, PM.wood);
    s.ellipsoid(F(-6, 25, 0), [7, 6, 6], PM.sack, { k: 1 }); s.ellipsoid(F(6, 24, 2), [6, 5, 5], PM.sack, { k: 1 });
  },
});
defProp('dummy', {
  collide: 9,
  build(s) {
    s.limb(P0, at(0, 60, 0), 1.6, 1.3, PM.wood);
    s.limb(at(-14, 40, 0), at(14, 40, 0), 1.2, 1.2, PM.wood);
    s.ellipsoid(F(0, 36, 0), [9, 12, 6], PM.sack, { k: 1 });
    s.limb(at(-14, 40, 0), at(-10, 40, 0), 3, 3, PM.straw); s.limb(at(10, 40, 0), at(14, 40, 0), 3, 3, PM.straw);
    const face = mat('BONE', { amb: 0.15, dif: 0.85, bias: -2.4, noise: 1,
      rampFn: (x, y, z, l) => (z > 3 && (Math.hypot(x, y) < 1.4 || Math.abs(Math.hypot(x, y) - 3) < 0.6) ? [R.RED, 7] : [R.BONE, l]) });
    s.sphere(at(0, 54, 0), 5.5, face, { tf: F(0, 54, 0) });
    s.limb(at(0, 58, 0), at(0, 62, 0), 5.8, 5.2, PM.iron);
    s.limb(P0, at(6, 0, 3), 2, 1, PM.wood); s.limb(P0, at(-6, 0, 3), 2, 1, PM.wood);
  },
});
defProp('haystack', {
  collide: 20,
  build(s) {
    s.ellipsoid(F(0, 10, 0), [20, 16, 16], PM.straw, { k: 4 });
    s.ellipsoid(F(4, 22, 0), [12, 10, 10], PM.straw, { k: 4 });
    s.limb(at(-6, 18, 4), at(10, 40, 6), 0.6, 0.6, PM.wood);
    s.box(F(10.5, 40.5, 6).rot(0, 0, -0.6), [2.5, 0.4, 0.4], 0.2, PM.iron);
  },
});
defProp('signpost', {
  collide: 5,
  build(s) {
    s.limb(P0, at(0, 54, 0), 1.4, 1.2, PM.wood);
    const board = mat('BROWN', { amb: 0.15, dif: 0.85, bias: -0.2, noise: 0.8, pattern: (x, y) => (Math.abs(y) < 0.4 && Math.abs(x) < 6 ? -4 : 0) });
    s.box(F(7, 46, 0).rot(0, 0, 0.05), [8, 2.6, 0.7], 0.3, board, { tf: F(7, 46, 0) });
    s.box(F(-6, 39, 0).rot(0, 0.6, -0.04), [7, 2.4, 0.7], 0.3, board, { tf: F(-6, 39, 0) });
    s.limb(at(14, 46, 0), at(16.5, 46, 0), 2.4, 0.2, PM.wood);
  },
});
defProp('grave', {
  variants: 2, collide: 8,
  build(s, v) {
    const st = mat('GRAY', { amb: 0.14, dif: 0.85, noise: 1.4, bias: 0.5,
      rampFn: (x, y, z, l) => (z > 1 && ((Math.abs(x) < 0.5 && y > -2 && y < 6) || (Math.abs(y - 3) < 0.5 && Math.abs(x) < 2.5)) ? [R.GRAY, l - 4] : [y < -8 && vnoise(x, y, z) > 0.5 ? R.OLIVE : R.GRAY, l]) });
    if (v === 0) {
      s.box(F(0, 10, 0), [7, 10, 1.8], 0.6, st, { tf: F(0, 10, 0) });
      s.limb(at(0, 20, 0), at(0, 20, 0.01), 7, 7, st, { clip: [0, -1, 0, -20], tf: F(0, 10, 0) });
    } else {
      s.box(F(0, 14, 0), [1.6, 14, 1.6], 0.4, st, { tf: F(0, 10, 0) });
      s.box(F(0, 22, 0), [6, 1.6, 1.6], 0.4, st, { tf: F(0, 10, 0) });
    }
    s.ellipsoid(F(0, 0, 8), [7, 2.5, 9], PM.dirt);
  },
});
defProp('waterwheel', {
  frames: 4, collide: 0,
  build(s, v, f) {
    const c = [0, 24, 0];
    const wheel = Frame.along(c, [0, 0, 1], [1, 0, 0]);
    s.torus(wheel, 22, 1.5, PM.woodDark);
    s.torus(wheel, 12, 1.2, PM.woodDark);
    s.limb(at(0, 24, -4), at(0, 24, 4), 3.2, 3.2, PM.iron);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + f * Math.PI / 16;
      const dx = Math.cos(a), dy = Math.sin(a);
      s.limb(at(dx * 3, 24 + dy * 3, 0), at(dx * 22, 24 + dy * 22, 0), 0.9, 0.9, PM.wood);
      const pf = Frame.along(at(dx * 23, 24 + dy * 23, 0), [dx, dy, 0], [0, 0, 1]);
      s.box(pf, [0.8, 3.2, 3.5], 0.3, PM.plank);
    }
  },
});
defProp('boat', {
  collide: 0,
  build(s) {
    const hull = mat('BROWN', { amb: 0.14, dif: 0.85, bias: -1, noise: 1.2, pattern: (x, y) => (Math.abs(y % 2.2) < 0.4 ? -2 : 0) });
    s.ellipsoid(F(0, 2, 0), [24, 7, 9], hull, { clip: [0, 1, 0, 6] });
    s.ellipsoid(F(0, 3, 0), [22, 6, 7.5], PM.woodDark, { sub: true, clip: [0, 1, 0, 9] });
    s.box(F(0, 4, 0), [1.6, 0.6, 8], 0.2, PM.plank, { after: true });
    s.limb(at(-6, 6, 6), at(10, 2, 13), 0.6, 0.6, PM.wood, { after: true });
  },
});
defProp('scarecrow', {
  collide: 7,
  build(s) {
    s.limb(P0, at(0, 58, 0), 1.3, 1.1, PM.wood);
    s.limb(at(-16, 44, 0), at(16, 44, 0), 1, 1, PM.wood);
    s.ellipsoid(F(0, 38, 0), [8, 11, 5], PM.cloth('BLUE', { bias: -2.5, noise: 2 }), { k: 1 });
    for (const x of [-15, 15]) s.limb(at(x * 0.6, 44, 0), at(x, 42, 0), 3, 2.5, PM.cloth('BLUE', { bias: -2.5, noise: 2 }));
    for (const x of [-16.5, 16.5]) s.sphere(at(x, 41, 0), 2.2, PM.straw);
    s.sphere(at(0, 55, 0), 5, PM.sack);
    s.limb(at(0, 58.5, 0), at(0, 59, 0), 9, 9, PM.straw);
    s.limb(at(0, 59, 0), at(0, 65, 0), 4.6, 3.6, PM.straw);
  },
});
defProp('woodpile', {
  collide: 16,
  build(s) {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) {
      const x = -9 + i * 6 + r * 3, y = 3 + r * 5.2;
      s.limb(at(x, y, -9), at(x, y, 9), 2.8, 2.8, PM.bark);
    }
    s.limb(at(18, 0, 0), at(18, 9, 0), 5, 5, PM.bark);
    s.limb(at(18, 9, 0), at(22, 20, 0), 0.6, 0.6, PM.wood);
    s.box(F(18.6, 10.5, 0).rot(0, 0, 0.5), [2.6, 1.6, 0.4], 0.2, PM.iron);
  },
});

// ---- Interiors ------------------------------------------------------------------------------
defProp('bed', {
  collide: 18,
  build(s) {
    s.box(F(0, 6, 0), [12, 6, 20], 0.8, PM.woodDark);
    s.box(F(0, 13.5, 0), [11, 2, 19], 1.2, PM.cloth('BONE', { bias: 0 }));
    s.box(F(0, 16, 4), [11.6, 1.6, 15], 1.2, PM.cloth('RED', { bias: -1.2, pattern: (x, y, z) => (Math.abs(z % 6) < 0.6 ? -2 : 0) }));
    s.ellipsoid(F(0, 17, -15), [8, 2.6, 3.6], PM.cloth('BONE', { bias: 1 }));
    s.box(F(0, 18, -20.5), [12, 12, 1.4], 0.6, PM.woodDark);
  },
});
defProp('table', {
  collide: 16, variants: 1,
  build(s) {
    s.box(F(0, 27, 0), [14, 1.6, 10], 0.5, PM.plank);
    for (const x of [-12, 12]) for (const z of [-8, 8]) s.limb(at(x, 0, z), at(x, 26, z), 1.2, 1.2, PM.woodDark);
    // A loaf and a mug on top
    s.ellipsoid(F(-5, 30.5, 0), [4, 2.2, 2.6], mat('GOLD', { amb: 0.2, dif: 0.85, bias: -1, noise: 0.8 }));
    s.limb(at(5, 28.6, 2), at(5, 33, 2), 1.8, 1.8, PM.woodDark);
  },
});
defProp('stool', {
  collide: 6,
  build(s) {
    // A flat round seat on three splayed legs.
    s.cylinder(F(0, 16, 0), 5.8, 1.1, 0.5, PM.plank);
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; s.limb(at(Math.cos(a) * 3, 15, Math.sin(a) * 3), at(Math.cos(a) * 5, 0, Math.sin(a) * 5), 0.8, 0.8, PM.woodDark); }
  },
});
defProp('chest', {
  collide: 12,
  build(s) {
    s.box(F(0, 7, 0), [12, 7, 8], 0.6, PM.plank);
    s.limb(at(-12, 14, 0), at(12, 14, 0), 8, 8, PM.plank, { clip: [0, -1, 0, -14] });
    for (const x of [-8, 8]) { s.box(F(x, 7.5, 0), [1, 7.6, 8.3], 0.2, PM.iron); }
    s.box(F(0, 13, 8.4), [1.8, 2.2, 0.6], 0.3, PM.brass);
  },
});
defProp('candle', {
  collide: 0,
  build(s) {
    s.limb(P0, at(0, 2, 0), 4, 3, PM.brass);
    s.limb(at(0, 2, 0), at(0, 34, 0), 1, 0.8, PM.brass);
    s.limb(at(0, 34, 0), at(0, 35, 0), 3, 3, PM.brass);
    s.limb(at(0, 35, 0), at(0, 41, 0), 1.2, 1.2, mat('BONE', { amb: 0.3, dif: 0.7, bias: 2 }));
    s.ellipsoid(F(0, 43, 0), [1.1, 2, 1.1], PM.flame);
  },
});
defProp('cauldron', {
  collide: 14,
  build(s) {
    s.ellipsoid(F(0, 10, 0), [11, 9, 11], PM.iron, { clip: [0, 1, 0, 16] });
    s.limb(at(0, 15.5, 0), at(0, 16, 0), 9.5, 9.5, mat('GHOST', { emissive: true, glow: 8, noise: 2.5, nf: 0.8 }));
    s.torus(F(0, 16, 0), 10, 1, PM.iron);
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.5; s.limb(at(Math.cos(a) * 8, 4, Math.sin(a) * 8), at(Math.cos(a) * 9, 0, Math.sin(a) * 9), 1.2, 1, PM.iron); }
    s.ellipsoid(F(0, 1, 0), [6, 1.5, 6], PM.coals);
  },
});
defProp('herbs', {
  collide: 8,
  build(s) {
    s.limb(at(0, 0, 0), at(0, 9, 0), 6, 7.5, mat('RUST', { amb: 0.15, dif: 0.85, noise: 0.8 }));
    for (let i = 0; i < 7; i++) {
      const a = i * TAU / 7;
      s.limb(at(0, 9, 0), at(Math.cos(a) * 6, 18 + (i % 3) * 3, Math.sin(a) * 4), 0.7, 0.4, PM.birchLeaf);
      s.sphere(at(Math.cos(a) * 6, 18 + (i % 3) * 3, Math.sin(a) * 4), 1.6, i % 2 ? PM.bushLeaf : mat('PURPLE', { amb: 0.2, bias: 1.5 }));
    }
  },
});
defProp('altar', {
  collide: 20,
  build(s) {
    s.box(F(0, 13, 0), [18, 13, 8], 0.8, PM.stone);
    const cloth = mat('RED', { amb: 0.15, dif: 0.85, bias: -0.6, noise: 0.8,
      rampFn: (x, y, z, l) => (Math.abs(y + 9) < 1.2 || (z > 0 && Math.hypot(x, y + 2) < 3.2 && (Math.abs(x) < 0.6 || Math.abs(y + 2) < 0.6 || Math.abs(Math.abs(x) - Math.abs(y + 2)) < 0.6)) ? [R.GOLD, 10] : [R.RED, l]) });
    s.box(F(0, 22, 0.5), [16, 4.5, 8.4], 0.4, cloth, { tf: F(0, 26, 0) });
    s.box(F(0, 26.8, 0), [18.5, 0.8, 8.6], 0.3, PM.stone);
    // Star of the Eight in gold
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; s.limb(at(Math.cos(a) * 7, 42 + Math.sin(a) * 7, 0), at(-Math.cos(a) * 7, 42 - Math.sin(a) * 7, 0), 0.8, 0.8, PM.brass); }
    s.limb(at(0, 28, 0), at(0, 35, 0), 0.9, 0.9, PM.brass);
  },
});
defProp('pew', {
  collide: 16,
  build(s) {
    s.box(F(0, 12, 0), [24, 1.2, 5], 0.4, PM.plank);
    s.box(F(0, 20, -5), [24, 8, 0.9], 0.4, PM.plank);
    for (const x of [-23, 23]) s.box(F(x, 11, -1), [1.2, 11, 6], 0.4, PM.woodDark);
  },
});

// ---- Rendering and placement ----------------------------------------------------------------
// Props that look different from each side are drawn from eight directions and keep a fixed
// facing in the world; round ones (trees, barrels, wells, lamps) use a single view.
const TURNING_PROPS = new Set(['stall', 'bench', 'noticeboard', 'sign', 'forge', 'anvil', 'weaponrack', 'crate', 'cart', 'dummy',
  'signpost', 'grave', 'waterwheel', 'boat', 'scarecrow', 'woodpile', 'bed', 'table', 'chest', 'altar', 'pew']);
// Turning props are drawn from 16 directions, each on a card that keeps the orientation it was
// rendered from, so a cart stays put in the world and only changes view as you walk round it.
const PROP_ROTS = 16, PROP_STEP = Math.PI * 2 / PROP_ROTS;
const _propCache = new Map(), _propQueue = new Map();
let _propSyncUsed = false;
function propBeginFrame() { _propSyncUsed = false; }
function renderProp(type, v, f, n, rot) {
  const P = PROPS[type];
  const s = new Shape();
  P.build(s, v, f, !!n);
  const spr = renderSprite(s, rot * PROP_STEP, { res: P.res });
  delete spr.depth;
  return spr;
}
function propSprite(type, variant, frame, night, rot = 0) {
  const P = PROPS[type];
  const v = Math.min(variant || 0, P.variants - 1), f = (frame || 0) % P.frames, n = P.nightVariant && night ? 1 : 0;
  if (!TURNING_PROPS.has(type)) rot = 0;
  const key = `${type}|${v}|${f}|${n}|${rot}`;
  let spr = _propCache.get(key);
  if (spr) return spr;
  // One new view per frame is rendered on the spot; others show the nearest finished angle
  // while they wait their turn in idle time.
  for (const d of [1, -1, 2, -2, 3, -3, 4, -4]) {
    const near = !_propSyncUsed ? null : _propCache.get(`${type}|${v}|${f}|${n}|${(rot + d + PROP_ROTS) % PROP_ROTS}`);
    if (near) { _propQueue.set(key, [type, v, f, n, rot]); return near; }
  }
  _propSyncUsed = true;
  spr = renderProp(type, v, f, n, rot);
  _propCache.set(key, spr);
  return spr;
}
function pumpProps(ms) {
  const t0 = performance.now();
  // Voxel models first, nearest first.
  while (_voxJobs.size && performance.now() - t0 < ms) {
    let best = null;
    for (const [key, j] of _voxJobs) if (!best || j.d < best[1].d) best = [key, j];
    const [key, j] = best;
    for (;;) {
      const r = j.gen.next();
      if (r.done) { _voxCache.set(key, r.value); _voxJobs.delete(key); break; }
      if (performance.now() - t0 > ms) break;
    }
  }
  for (const [key, args] of _propQueue) {
    if (performance.now() - t0 > ms) break;
    _propQueue.delete(key);
    if (!_propCache.has(key)) _propCache.set(key, renderProp(...args));
  }
}
// Every prop becomes a solid voxel model (voxel.js) once it has been built in idle time; until
// then it shows as a card. d: how far away it is, so the nearest are built first.
const _voxCache = new Map(), _voxJobs = new Map();
function propVoxels(type, v, f, n, d) {
  const key = `${type}|${v}|${f}|${n}`;
  const M = _voxCache.get(key);
  if (M !== undefined) return M;
  const j = _voxJobs.get(key);
  if (j) { if (d < j.d) j.d = d; return null; }
  const P = PROPS[type], s = new Shape();
  P.build(s, v, f, !!n);
  _voxJobs.set(key, { gen: voxelJob(s, { size: P.voxel || 1 }), d });
  return null;
}
// Queues every prop model a map needs (on loading it, behind the fade).
function warmProps(map, night) {
  for (const p of map.props) {
    const P = PROPS[p.type];
    if (!P || p.taken) continue;
    for (let f = 0; f < P.frames; f++) propVoxels(p.type, Math.min(propVariant(p), P.variants - 1), f, P.nightVariant && night ? 1 : 0, 1e6);
  }
}
// Which way a prop faces: away from a wall it stands against, otherwise a fixed random way.
// Round things (trees, rocks, barrels) just get any angle, so no two look quite alike.
function propFacing(map, p) {
  if (p.ang !== undefined) return p.ang;
  if (!TURNING_PROPS.has(p.type)) return (p.ang = hash3(Math.floor(p.x), Math.floor(p.z), 11) * TAU);
  const tx = Math.floor(p.x / TILE), tz = Math.floor(p.z / TILE);
  const open = [[1, 0, 0], [0, 1, Math.PI / 2], [-1, 0, Math.PI], [0, -1, -Math.PI / 2]].filter(([dx, dz]) => !map.wallAt(tx + dx, tz + dz));
  if (open.length && open.length < 4) {
    const back = [[1, 0], [0, 1], [-1, 0], [0, -1]].find(([dx, dz]) => map.wallAt(tx + dx, tz + dz));
    const away = open.find(([dx, dz]) => dx === -back[0] && dz === -back[1]) || open[0];
    p.ang = away[2];
  } else p.ang = Math.floor(hash3(Math.floor(p.x), Math.floor(p.z), 11) * 8) * Math.PI / 4;
  return p.ang;
}
const PROP_VARIANT = { inn: 0, store: 1, bakery: 2, smithy: 3, herbs: 4, apples: 0, cloth: 1, pots: 2 };
function propVariant(p) {
  if (p.variant !== undefined) return PROP_VARIANT[p.variant] !== undefined ? PROP_VARIANT[p.variant] : p.variant;
  return Math.floor(hash3(Math.floor(p.x), Math.floor(p.z), 5) * PROPS[p.type].variants);
}
function gatherPropSprites(map, t = 0, night = 0, camX, camZ) {
  const out = [];
  for (const p of map.props) {
    if (p.taken) continue;
    const P = PROPS[p.type];
    if (!P) continue;
    const v = Math.min(propVariant(p), P.variants - 1), f = Math.floor(t * 6) % P.frames, n = P.nightVariant && night > 0.45 ? 1 : 0;
    const facing = propFacing(map, p);
    if (camX !== undefined) {
      const vox = propVoxels(p.type, v, f, n, Math.hypot(camX - p.x, camZ - p.z));
      if (vox) { out.push({ vox, x: p.x, z: p.z, ang: facing, prop: p }); continue; }
    }
    let rot = 0, face;
    if (camX !== undefined && TURNING_PROPS.has(p.type)) {
      const d = Math.atan2(camZ - p.z, camX - p.x) - facing;
      const k = Math.round(Math.atan2(Math.sin(d), Math.cos(d)) / PROP_STEP);
      rot = ((k % PROP_ROTS) + PROP_ROTS) % PROP_ROTS;
      face = facing + k * PROP_STEP; // the way this view looks at the prop from: the card's fixed orientation
    }
    out.push({ spr: propSprite(p.type, v, f, n, rot), x: p.x, z: p.z, prop: p, face });
  }
  return out;
}
