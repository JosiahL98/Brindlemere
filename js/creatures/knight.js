'use strict';
// Fallen Knight: oath-broken paladin in blackened plate, red tabard, plumed great helm,
// heraldic shield and longsword.
(function () {
  const P = { thigh: 14.5, shin: 14, ankle: 2.6, foot: 5, hipW: 3.9, crouch: 1.6,
    spine: 12.5, shY: 5.2, shW: 8.6, neckY: 6.4, headY: 4.4, upper: 11.5, fore: 10.5 };

  const plate = mat('STEEL', { amb: 0.1, dif: 0.78, spec: 1.1, shin: 18, noise: 0.55, nf: 0.5, bias: -1.4 });
  const plateDark = mat('STEEL', { amb: 0.06, dif: 0.65, spec: 0.7, shin: 14, noise: 0.7, bias: -3.4 });
  const mail = mat('STEEL', { amb: 0.08, dif: 0.7, spec: 0.5, shin: 10, noise: 0.4, bias: -2.5,
    pattern: (x, y) => (((Math.floor(x * 1.4) + Math.floor(y * 1.4)) & 1) ? -2.2 : 0.6) });
  const tabard = mat('RED', { amb: 0.12, dif: 0.82, noise: 0.9, nf: 0.8, bias: -1.2,
    rampFn: (x, y, z, l) => {
      if (Math.abs(x) > 4.6) return [R.GOLD, l - 1.5];          // gold hem
      const cy = y - 3.2;                                        // gold sun emblem
      if (cy * cy + x * x < 3.2) return [R.GOLD, l + 1];
      if (Math.abs(x) < 0.55 && Math.abs(cy) < 4) return [R.GOLD, l];
      if (Math.abs(cy) < 0.55 && Math.abs(x) < 3.3) return [R.GOLD, l];
      return [R.RED, l];
    } });
  const cape = mat('RED', { amb: 0.08, dif: 0.75, noise: 1.0, nf: 0.6, bias: -3.5,
    pattern: (x) => Math.sin(x * 1.3) * 1.2 });
  const shieldMat = mat('RED', { amb: 0.12, dif: 0.85, spec: 0.3, shin: 10, noise: 0.8, bias: -0.8,
    rampFn: (x, y, z, l) => {
      const e = (x / 6) ** 2 + (y / 8.6) ** 2;
      if (e > 0.72) return [R.STEEL, l + 0.5];                   // iron rim
      if (z < 0) return [R.BROWN, l - 1];                        // wooden back
      const chev = y + Math.abs(x) * 1.1;                        // gold chevron
      if (chev > -0.6 && chev < 1.9) return [R.GOLD, l + 1];
      return (x < 0) !== (y > 0) ? [R.RED, l] : [R.RED, l - 2.2];
    } });
  const knightEye = mat('RED', { emissive: true, glow: 13, noise: 0.6, nf: 2, edge: 0 });
  const plume = mat('RED', { amb: 0.15, dif: 0.85, noise: 2.2, nf: 1.3, bias: 0.5 });

  const stance = () => pose({
    root: { y: -0.4 },
    spine: { pitch: 0.06 },
    head: { pitch: -0.04 },
    arms: {
      R: { pitch: 0.55, out: 0.28, elbow: 1.15, wrist: -0.2, twist: 0.2 },
      L: { pitch: 0.75, out: 0.15, elbow: 1.35, twist: -0.4 },
    },
    legs: { L: { ik: [4.4, 0, 3] }, R: { ik: [-4.4, 0, -2.5] } },
    shield: { pitch: 0, yaw: 0.25 }, cape: 0.1, plume: 0,
  });

  function build(s, ps) {
    const J = rigHumanoid(P, ps);
    const H = J.head, C = J.chest, Pv = J.pelvis;
    s.basis = Pv;

    // Cuirass, fauld and tabard
    s.ellipsoid(C.moved(0, 1.2, 0.3), [7.9, 7.6, 5.6], plate, { tf: C });
    s.ellipsoid(C.moved(0, -4.5, 0.6), [6.6, 4.5, 5.0], plate, { k: 1.5, tf: C });
    s.ellipsoid(Pv.moved(0, 1.5, 0.4), [7.2, 3.2, 5.6], mail, { tf: Pv });
    s.ellipsoid(Pv.moved(0, 3.2, 0.5), [7.0, 1.3, 5.9], mat('BROWN', { bias: -1.5, spec: 0.2 }), { tf: Pv });
    s.box(Pv.moved(0, 3.2, 6.2), [1.4, 1.3, 0.6], 0.4, M.gold);
    const front = C.moved(0, -2.5, 5.5);
    s.box(front.moved(0, 2.5, 0.2), [5.2, 6.4, 0.45], 0.4, tabard, { tf: front.moved(0, 0.3, 0) });
    const flapF = Pv.moved(0, 2, 6).rot(-0.06 + (ps.flap || 0), 0, 0);
    s.box(flapF.moved(0, -6.5, 0), [4.4, 6.5, 0.45], 0.4, tabard, { tf: flapF.moved(0, 9, 0) });
    const flapB = Pv.moved(0, 2, -5.6).rot(0.06 + (ps.flap || 0) * 0.6, 0, 0);
    s.box(flapB.moved(0, -6, 0), [4.4, 6, 0.45], 0.4, tabard, { tf: flapB.moved(0, 9, 0) });

    // Cape: three panels hanging from the shoulders, trailing with motion.
    let cf = C.moved(0, 5.2, -5.6).rot(0.12 + ps.cape * 0.5, 0, 0);
    for (let i = 0; i < 3; i++) {
      const len = 6.5;
      s.box(cf.moved(0, -len / 2, 0), [7.4 + i * 0.9, len / 2 + 0.4, 0.5], 0.4, cape, { tf: cf });
      cf = cf.moved(0, -len, 0).rot(ps.cape * (0.3 + i * 0.15), 0, 0);
    }

    // Gorget and great helm
    s.limb(J.neck, H.point(0, -3, 0), 3.4, 3.0, plateDark);
    s.box(H.moved(0, 0.4, 0.3), [4.3, 5.2, 4.6], 2.2, plate, { tf: H });
    s.box(H.moved(0, 0.5, 3.6), [3.9, 0.75, 1.9], 0.15, M.socket, { sub: true });
    s.limb(H.point(0, 4.6, 3.6), H.point(0, -3.6, 4.7), 0.55, 0.55, plate, { k: 0.6 });
    for (const sd of [1, -1]) {
      s.sphere(H.point(sd * 1.6, 0.45, 3.55), 0.62, knightEye, { after: true });
      for (let k = 0; k < 3; k++) s.sphere(H.point(sd * (1.6 + k * 0.9), -1.7 - (k % 2) * 0.9, 4.6), 0.36, M.socket, { sub: true });
      for (const y of [2.6, 0.4, -1.8]) s.sphere(H.point(sd * 3.95, y, 3.0), 0.42, M.gold, { after: true }); // rivets
    }
    // Gilded brow band and a cross on the faceplate
    s.box(H.moved(0, 1.75, 4.62), [3.7, 0.38, 0.32], 0.15, M.gold, { after: true });
    s.box(H.moved(0, -2.0, 4.78), [0.4, 1.9, 0.3], 0.15, M.gold, { after: true });
    s.box(H.moved(0, -1.4, 4.78), [1.2, 0.36, 0.3], 0.15, M.gold, { after: true });
    // Plume
    let pb = H.point(0, 5.4, -0.5);
    let pdir = H.dir(0, 1.4, -1 - ps.plume * 0.5);
    for (let i = 0; i < 4; i++) {
      const nb = V.add(pb, V.scale(V.norm(pdir), 3.2));
      s.limb(pb, nb, 1.7 - i * 0.25, 1.4 - i * 0.3, plume);
      pb = nb;
      pdir = V.add(pdir, H.dir(0, -1.1, -0.35 - ps.plume * 0.3));
    }

    // Arms
    for (const Sd of ['L', 'R']) {
      const A = J[Sd], sd = A.sd;
      const pf = C.movedTo(V.add(A.sh, C.dir(sd * 1.2, 1.4, 0))).rot(0, 0, sd * -0.35);
      s.ellipsoid(pf, [4.6, 2.8, 4.6], plate, { tf: pf });
      s.ellipsoid(pf.moved(sd * 1.3, -2.4, 0), [4.0, 2.2, 4.1], plateDark, { tf: pf });
      s.limb(A.sh, A.el, 2.5, 2.2, plate);
      s.sphere(A.el, 2.5, plateDark);
      s.limb(A.el, A.wr, 2.3, 1.9, plate);
      s.box(A.hand.moved(0, -1.6, 0.2), [1.9, 1.9, 1.5], 0.8, plateDark, { tf: A.hand });

      s.limb(A.hip, A.knee, 3.2, 2.6, plate);
      s.sphere(V.add(A.knee, A.foot.dir(0, 0, 0.8)), 2.6, plateDark);
      s.limb(A.knee, A.ankle, 2.6, 2.0, plate);
      s.ellipsoid(A.foot.moved(0, -P.ankle + 1.3, 1.9), [2.3, 1.4, 3.8], plateDark, { tf: A.foot });
    }

    // Shield on the left forearm
    const mid = V.lerp(J.L.el, J.L.wr, 0.55);
    const sf = C.movedTo(V.add(mid, C.dir(0.6, 0.5, 2.0))).rot(ps.shield.pitch, ps.shield.yaw, -0.08);
    s.ellipsoid(sf, [6, 8.6, 1.15], shieldMat, { tf: sf });
    s.sphere(sf.point(0, 1, 1.0), 1.3, M.gold, { after: true });

    // Longsword
    const hR = J.R.hand, grip = hR.point(0, -1.6, 0.2), bd = hR.dir(0, 0, 1);
    const at = (d) => V.madd(grip, bd, d);
    const sw = Frame.along(grip, bd, hR.y);
    s.sphere(at(-3.4), 1.05, M.gold);
    s.limb(at(-3), at(1.4), 0.65, 0.65, M.leather);
    s.box(sw.movedTo(at(1.8)), [4.0, 0.55, 0.7], 0.3, M.gold);
    s.box(sw.movedTo(at(12.8)), [1.25, 10.6, 0.36], 0.2, M.iron);
    s.point('chest', C.point(0, 1, 5));

    if (ps.pool > 0) s.ellipsoid(Frame.at(ps.poolAt), [ps.pool * 1.1, 0.7, ps.pool], M.blood);
  }

  const act = {};
  act.idle = {
    frames: 6, fps: 5, loop: true,
    pose: (t) => {
      const b = Math.sin(t * TAU), c = Math.cos(t * TAU);
      return merge(stance(), {
        root: { y: -0.4 + 0.3 * b },
        spine: { pitch: 0.06 - 0.025 * b, yaw: 0.04 * c },
        head: { yaw: 0.18 * Math.sin(t * TAU - 0.8), pitch: -0.04 + 0.03 * b },
        arms: { R: { pitch: 0.55 + 0.05 * b } },
        cape: 0.12 + 0.06 * c, plume: 0.25 * c,
      });
    },
  };
  act.walk = {
    frames: 8, fps: 8, loop: true, travel: 28,
    pose: (t) => {
      const sw = Math.cos(t * TAU), s2 = Math.sin(t * TAU);
      return merge(stance(), {
        root: { y: -0.9 + 0.8 * -Math.cos(t * TAU * 2), roll: 0.035 * s2, yaw: 0.06 * sw },
        spine: { pitch: 0.12, yaw: -0.1 * sw },
        head: { pitch: -0.08, roll: 0.03 * s2 },
        arms: { R: { pitch: 0.5 + 0.18 * sw, elbow: 1.1 - 0.1 * sw }, L: { pitch: 0.8 - 0.08 * sw } },
        legs: gait(t, { stride: 14, lift: 3.6, width: 4.2 }),
        cape: 0.45 + 0.12 * Math.abs(s2), plume: 0.6 + 0.2 * s2, flap: 0.15 * sw,
      });
    },
  };
  act.attack = {
    frames: 8, fps: 10, loop: false,
    pose: (t) => {
      const wind = merge(stance(), {
        root: { y: 0, z: -1 },
        spine: { pitch: -0.12, yaw: -0.65, roll: 0.08 },
        head: { yaw: 0.45 },
        arms: { R: { pitch: 2.5, out: 0.75, elbow: 1.7, wrist: 0.4, twist: 0.5 }, L: { pitch: 0.95, elbow: 1.3 } },
        legs: { L: { ik: [4.4, 0, 2] }, R: { ik: [-4.6, 0, -4] } },
        shield: { yaw: 0.6 }, cape: 0.3, plume: 0.4,
      });
      const slash = merge(stance(), {
        root: { y: -2.4, z: 3 },
        spine: { pitch: 0.38, yaw: 0.6, roll: -0.05 },
        head: { pitch: -0.15, yaw: -0.4 },
        arms: { R: { pitch: 0.65, out: -0.45, elbow: 0.25, wrist: -0.5, twist: -0.2 }, L: { pitch: 0.5, out: 0.5, elbow: 1.0 } },
        legs: { L: { ik: [4.6, 0, 9] }, R: { ik: [-4.4, 0, -4.5] } },
        shield: { yaw: -0.2 }, cape: 0.7, plume: 1.0, flap: 0.3,
      });
      return poseKeys(t, [[0, stance()], [0.36, wind], [0.55, slash], [0.72, slash], [1, stance()]]);
    },
  };
  act.pain = {
    frames: 4, fps: 8, loop: false,
    pose: (t) => {
      const hit = merge(stance(), {
        root: { z: -2, y: -0.8, roll: 0.06 },
        spine: { pitch: -0.28, roll: 0.12, yaw: 0.3 },
        head: { pitch: -0.45, yaw: 0.3, roll: 0.15 },
        arms: { R: { pitch: 0.2, out: 0.6, elbow: 0.6 }, L: { pitch: 0.3, out: 0.55, elbow: 1.2 } },
        shield: { yaw: 0.9, pitch: -0.3 }, cape: 0.5, plume: -0.5,
      });
      return poseKeys(t, [[0, hit], [0.35, hit], [1, stance()]]);
    },
  };
  act.death = {
    frames: 10, fps: 8, loop: false,
    pose: (t) => {
      const fk = (o) => merge(pose({ shield: { pitch: 0, yaw: 0.25 }, cape: 0.1, plume: 0,
        legs: { L: { pitch: 0, out: 0.08, knee: 0.1 }, R: { pitch: 0, out: 0.08, knee: 0.1 } } }), o);
      const stand = fk({ arms: { R: { pitch: 0.55, out: 0.28, elbow: 1.15, wrist: -0.2 }, L: { pitch: 0.75, out: 0.15, elbow: 1.35, twist: -0.4 } } });
      const reel = fk({ root: { z: -1.5, y: -1 }, spine: { pitch: -0.35, roll: -0.12 }, head: { pitch: -0.6, roll: -0.2 },
        arms: { R: { pitch: 0.4, out: 0.8, elbow: 0.4, wrist: 0.6 }, L: { pitch: 0.3, out: 0.6, elbow: 0.8 } },
        shield: { yaw: 0.8, pitch: -0.4 }, cape: 0.6, plume: -0.8 });
      const kneel = fk({ root: { y: -13, z: 1, pitch: 0.05, roll: -0.1 }, spine: { pitch: 0.35, roll: -0.15 }, head: { pitch: 0.55 },
        arms: { R: { pitch: 0.15, out: 0.45, elbow: 0.2, wrist: 0.9 }, L: { pitch: 0.2, out: 0.35, elbow: 0.4 } },
        legs: { L: { pitch: 0.55, knee: 2.0 }, R: { pitch: 0.4, knee: 2.05 } }, shield: { yaw: 0.4, pitch: 0.4 }, cape: 0.05, plume: 0.4 });
      const down = fk({ root: { y: -24.8, z: -1, x: -6, roll: -1.5, pitch: 0.1 }, spine: { pitch: 0.2, roll: -0.08 }, head: { pitch: 0.2, roll: 0.3 },
        arms: { R: { pitch: 1.1, out: -0.25, elbow: 0.5, wrist: 0.2 }, L: { pitch: 1.4, out: 0.2, elbow: 0.6 } },
        legs: { L: { pitch: 0.8, knee: 1.3 }, R: { pitch: 0.35, knee: 0.9 } }, shield: { yaw: 0.3, pitch: 0.2 }, cape: 0.0, plume: 0.6 });
      const p = poseKeys(t, [[0, stand], [0.14, reel], [0.42, kneel], [0.7, down], [1, down]]);
      p.pool = 11 * span(t, 0.7, 1);
      p.poolAt = [10, 0, 1];
      return p;
    },
  };

  defineCreature({
    id: 'knight', name: 'Fallen Knight', code: 'KNGT',
    lore: 'Once a sworn paladin of the Emperor, now bound to the vault it failed to defend. Its oath is broken, but its armour still holds.',
    stats: { hp: 160, dmg: '6-20', speed: 'Average' },
    shadow: [14, 9], blood: 'red', height: 60,
    build, actions: act,
  });
})();
