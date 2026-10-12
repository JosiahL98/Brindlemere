'use strict';
// Gazer: a floating mass of flesh with one great eye, a toothed maw and dangling tentacles.
(function () {
  const flesh = mat('PURPLE', { amb: 0.1, dif: 0.95, gain: 0.82, spec: 0.2, shin: 12, noise: 1.0, nf: 0.35,
    rampFn: (x, y, z, l) => {
      const vein = Math.abs(vnoise(x * 0.22, y * 0.22, z * 0.22) - 0.5);
      if (vein < 0.022) return [R.RED, l - 2];
      const blotch = vnoise(x * 0.12 + 4, y * 0.12, z * 0.12);
      return blotch > 0.62 ? [R.PINK, l - 2] : [R.PURPLE, l];
    } });
  const tent = mat('PURPLE', { amb: 0.1, dif: 0.9, gain: 0.8, spec: 0.3, shin: 10, noise: 0.9,
    pattern: (x, y) => (Math.sin(y * 2.2) > 0.55 ? -2 : 0) });
  const eyeMat = (charge, dead) => mat('BONE', { amb: 0.25, dif: 0.8, spec: 0.9, shin: 30, noise: 0.5, nf: 0.8, edge: 1,
    rampFn: (x, y, z, l) => {
      const r = Math.hypot(x, y, z) || 1;
      const c = z / r;
      if (!dead && !charge && c > 0.86 && Math.abs(x / r) < 0.13) return [R.GRAY, 1 + (l > 14 ? 10 : 0)];
      if (c > 0.8) {
        const streak = Math.sin(Math.atan2(y, x) * 9) * 1.2;
        return charge ? [R.GHOST, 12 + streak] : [R.GOLD, l - 1 + streak];
      }
      const vein = Math.abs(vnoise(x * 0.5, y * 0.5, z * 0.5) - 0.5) < 0.04 && c < 0.6;
      return vein ? [R.RED, l - 2] : [R.BONE, l + 0.5];
    } });
  const eyeGlow = mat('GHOST', { emissive: true, glow: 12, noise: 1.6, nf: 0.9 });
  const tooth = mat('BONE', { amb: 0.3, dif: 0.8, bias: 0.5, noise: 0.6 });
  const spike = mat('BONE', { amb: 0.12, dif: 0.85, bias: -2.5, noise: 1.2, spec: 0.2 });

  function base() {
    return { y: 34, bob: 0, pitch: 0, yaw: 0, roll: 0, look: [0, 0], lid: 0, maw: 0.15, sway: 0, trail: 0,
      deflate: 0, charge: 0, dead: 0, flail: 0, pool: 0 };
  }

  function build(s, ps) {
    const B = Frame.at([0, ps.y + ps.bob, 0]).rot(ps.pitch, ps.yaw, ps.roll);
    s.basis = B;
    const sq = 1 - ps.deflate * 0.42;
    s.ellipsoid(B, [13, 12.5 * sq, 13], flesh, { tf: B });
    // lumps
    for (const [x, y, z, r] of [[-7, 7, -5, 5], [6, 8, -6, 5.5], [0, 10, -2, 5], [-9, -3, -6, 4.5], [9, -2, -5, 4.5]]) {
      s.sphere(B.point(x, y * sq, z), r, flesh, { k: 4 });
    }
    // Brow ridge over the eye
    s.ellipsoid(B.moved(0, 7 * sq, 8.2).rot(-0.35, 0, 0), [8, 2.6, 4], flesh, { k: 3, tf: B });
    // Spines along the crown
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.45;
      const bp = B.point(Math.sin(a) * 9, 10.5 * sq, -1.5 - Math.cos(a) * 3);
      s.limb(bp, V.add(bp, B.dir(Math.sin(a) * 4, 5 * sq + 1, -3)), 1.4, 0.15, spike);
    }

    // Maw
    const open = ps.maw;
    const my = -7.4 * sq;
    const mc = B.point(0, my, 8.5);
    s.ellipsoid(B.movedTo(mc), [8.2, 1.4 + open * 3.4, 6], M.hollow, { sub: true, k: 0.8 });
    for (let i = -3; i <= 3; i++) {
      const x = i * 2.15;
      const zf = Math.sqrt(Math.max(0, 169 - x * x - my * my)) - 0.8;
      const top = B.point(x, my + 1.1 + open * 3.0, zf - 0.6);
      const bot = B.point(x * 0.95, my - 1.1 - open * 3.2, zf - 1.2);
      s.limb(top, V.add(top, B.dir(0, -2.4, 0.2)), 0.75, 0.1, tooth, { after: true });
      if (i !== 0) s.limb(bot, V.add(bot, B.dir(0, 2.2, 0.2)), 0.7, 0.1, tooth, { after: true });
    }

    // Eye with lids
    const E = B.movedTo(B.point(0, 2.6, 8.2)).rot(ps.look[0], ps.look[1], 0);
    s.sphere(E.o, 7.5, eyeMat(ps.charge > 0.5, ps.dead), { tf: E, after: true });
    if (ps.charge > 0.5) s.sphere(E.o, 7.62, eyeGlow, { after: true, clip: clipPlane(E, 0, 0, -1, -5.6) });
    const L = B.movedTo(E.o);
    const lidTop = 4.4 - ps.lid * 6.8; // lower edge of the upper lid, relative to the eye centre
    s.sphere(L.o, 8.3, flesh, { after: true, clip: clipPlane(L, 0, -1, 0, -lidTop), tf: L });
    const lidBot = -4.8 + ps.lid * 2.2;
    s.sphere(L.o, 7.85, flesh, { after: true, clip: clipPlane(L, 0, 1, 0, lidBot), tf: L });

    // Tentacles
    const roots = [[-6, -9, 3], [6, -9, 3], [-3, -10.5, -3], [3, -10.5, -3], [0, -9.5, -8], [-9, -6, -5], [9, -6, -5]];
    roots.forEach(([x, y, z], k) => {
      let p = B.point(x, y * sq, z);
      let d = V.norm(B.dir(x * 0.05, -1, z * 0.04));
      const n = 6;
      for (let i = 0; i < n; i++) {
        const ph = ps.sway + k * 1.3 + i * 0.6;
        const wig = [Math.sin(ph) * 0.35 * (1 + ps.flail), 0, Math.cos(ph * 0.8) * 0.25 * (1 + ps.flail) - ps.trail * 0.22];
        d = V.norm(V.add(d, V.scale(wig, 0.6)));
        if (ps.dead) d = V.norm(V.add(d, [x * 0.04, 0.35 * ps.dead, z * 0.04]));
        let q = V.madd(p, d, 3.4 - i * 0.2);
        if (q[1] < 0.8) q = [q[0] + d[0] * 2, 0.8, q[2] + d[2] * 2]; // rest on the floor
        s.limb(p, q, 2.0 - i * 0.28, 1.75 - i * 0.28, tent, { k: i === 0 ? 2 : 0.5 });
        p = q;
      }
    });

    s.point('mouth', B.point(0, -3, 14));
    s.point('chest', B.point(0, 0, 10));
    if (ps.pool > 0) s.ellipsoid(Frame.at([0, 0, 2]), [ps.pool * 1.2, 0.7, ps.pool], mat('PURPLE', { amb: 0.1, dif: 0.6, spec: 0.7, shin: 30, bias: -2, noise: 0.8 }));
  }

  const act = {};
  act.idle = {
    frames: 8, fps: 6, loop: true,
    pose: (t, f) => Object.assign(base(), {
      bob: 1.6 * Math.sin(t * TAU), roll: 0.05 * Math.sin(t * TAU + 1), pitch: 0.04 * Math.cos(t * TAU),
      look: [0.12 * Math.sin(t * TAU * 2), 0.35 * Math.sin(t * TAU)], sway: t * TAU, lid: f === 6 ? 1 : f === 5 || f === 7 ? 0.5 : 0,
      maw: 0.2 + 0.12 * Math.sin(t * TAU),
    }),
  };
  act.walk = {
    frames: 8, fps: 8, loop: true, travel: 22,
    pose: (t) => Object.assign(base(), {
      bob: 2.2 * Math.sin(t * TAU * 2), pitch: 0.22, roll: 0.06 * Math.sin(t * TAU),
      look: [-0.15, 0.1 * Math.sin(t * TAU)], sway: t * TAU * 2, trail: 1.6, maw: 0.25,
    }),
  };
  act.attack = {
    frames: 8, fps: 9, loop: false, emit: { frame: 4, fx: 'plasma', point: 'mouth' },
    pose: (t, f) => {
      const k = [0, 0.3, 0.6, 1, 1, 0.7, 0.3, 0][f];
      return Object.assign(base(), {
        bob: 1.2 * Math.sin(t * TAU), pitch: -0.12 * k + (f >= 4 && f <= 5 ? 0.18 : 0),
        y: 34 + (f === 4 ? -2 : 0),
        look: [0, 0], lid: -0.4 * k, maw: 0.15 + 0.9 * k, charge: f >= 2 && f <= 4 ? 1 : 0,
        sway: t * TAU, flail: k,
      });
    },
  };
  act.pain = {
    frames: 4, fps: 8, loop: false,
    pose: (t, f) => Object.assign(base(), {
      pitch: [-0.35, -0.3, -0.12, 0][f], roll: [0.25, 0.2, 0.08, 0][f], y: 34 + [3, 2, 1, 0][f],
      lid: [1, 1, 0.5, 0][f], maw: [0.9, 0.8, 0.4, 0.15][f], flail: [2, 1.6, 0.8, 0][f], sway: f * 1.4,
      look: [[0.3, -0.2], [0.2, 0.1], [0, 0], [0, 0]][f],
    }),
  };
  act.death = {
    frames: 10, fps: 8, loop: false,
    pose: (t, f) => {
      const fall = easeIn(span(t, 0.2, 0.75));
      return Object.assign(base(), {
        y: lerp(34, 9.5, fall) + (f === 8 ? 1 : 0), bob: f < 2 ? 2 : 0,
        pitch: lerp(-0.3, 0.35, span(t, 0, 0.8)), roll: lerp(0.2, -0.3, span(t, 0.1, 0.9)),
        look: [-0.45 * span(t, 0, 0.5), 0.2], lid: f < 2 ? 0.2 : lerp(0.2, 0.6, span(t, 0.5, 1)),
        maw: f < 3 ? 1 : lerp(1, 0.55, span(t, 0.3, 0.8)), deflate: span(t, 0.55, 1) * 0.9,
        flail: f < 4 ? 2.5 : 0, sway: f * 0.9, dead: span(t, 0.35, 0.8), pool: 13 * span(t, 0.7, 1),
      });
    },
  };

  defineCreature({
    id: 'gazer', name: 'Gazer', code: 'GAZR',
    lore: 'Drifts through flooded crypts on gas it brews in its own gut. Scholars argue over whether it sees with that eye or simply hates with it.',
    stats: { hp: 90, dmg: '5-30 (bolt)', speed: 'Slow' },
    shadow: [12, 9], blood: 'purple', height: 50, float: true,
    labels: { walk: 'Float', attack: 'Spit bolt' },
    build, actions: act,
  });
})();
