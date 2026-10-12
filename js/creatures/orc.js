'use strict';
// Orc Brute: hulking green brawler with a spiked club. Swings two-handed; falls on its face.
(function () {
  const P = { thigh: 14, shin: 13, ankle: 2.8, foot: 5.5, hipW: 4.8, crouch: 2.4,
    spine: 13, shY: 5.5, shW: 10.5, neckY: 5.6, headY: 5.0, upper: 12.5, fore: 11.5 };

  const skin = mat('GREEN', { amb: 0.13, dif: 0.9, gain: 0.8, bias: -0.6, spec: 0.16, shin: 8, noise: 1.0, nf: 0.42,
    pattern: (x, y, z) => (vnoise(x * 0.18 + 5, y * 0.18, z * 0.18) - 0.5) * 2.2 });
  const lip = mat('GREEN', { amb: 0.1, dif: 0.7, bias: -2.5, noise: 0.6 });
  const hair = mat('GRAY', { amb: 0.08, dif: 0.55, spec: 0.25, shin: 10, noise: 2.2, nf: 1.4, bias: -1.5 });
  const strap = mat('BROWN', { amb: 0.14, dif: 0.85, noise: 1.3, nf: 0.8, bias: -1.8, spec: 0.1 });
  const cloth = mat('RUST', { amb: 0.12, dif: 0.8, noise: 1.6, nf: 0.7, bias: -2,
    pattern: (x, y) => (Math.abs((y * 0.9) % 3) < 0.8 ? -1.2 : 0) });
  const tusk = mat('BONE', { amb: 0.3, dif: 0.85, noise: 0.5, bias: 1 });
  const orcTeeth = teethMat(0.9, 0);
  const orcEye = eyeMat('FIRE', 12, 'slit', 1.4);
  // Head skin, painted: black war paint across the eyes, a scar over its left eye, forehead creases.
  const face = mat('GREEN', { amb: 0.13, dif: 0.9, gain: 0.8, bias: -0.6, spec: 0.16, shin: 8, noise: 0.9, nf: 0.5,
    rampFn: (x, y, z, l) => {
      if (z > 1.8) {
        if (seg2(x, y, 1.1, 3.8, 3.1, -1.6) < 0.3) return [R.FLESH, l - 0.5];
        const ex = Math.abs(x) - 1.75, ey = y - 0.5;
        const patch = Math.hypot(ex / 1.3, ey / (ey > 0 ? 0.95 : 1.3)) < 1 + vnoise(x * 1.3, y * 1.3, 3) * 0.2;
        const drip = Math.abs(ex + 0.25 * (ey + 1)) < 0.32 && ey < 0 && ey > -2.6 + Math.abs(x) * 0.2;
        if (patch || drip) return [R.GRAY, 1 + l * 0.3];
        if (y > 2.6 && Math.abs(Math.sin(y * 3.3)) < 0.25) return [R.GREEN, l - 2.4];
      }
      return [R.GREEN, l + (vnoise(x * 0.18 + 5, y * 0.18, z * 0.18) - 0.5) * 2.2];
    } });

  const stance = () => pose({
    root: { y: -0.5 },
    spine: { pitch: 0.24 },
    head: { pitch: -0.3 },
    arms: {
      R: { pitch: 0.15, out: 0.32, elbow: 0.55, wrist: -0.7, twist: 0 },
      L: { pitch: 0.15, out: 0.35, elbow: 0.45 },
    },
    legs: { L: { ik: [6, 0, 2.5] }, R: { ik: [-6, 0, -1.5] } },
  });

  function build(s, ps) {
    let J = rigHumanoid(P, ps);
    let club = null;
    if (ps.club) {
      // Two-handed: the club is placed directly (grip + angle in the body's ground frame)
      // and both fists reach for the shaft with IK, so the swing arcs over the top.
      const G = J.G, k = ps.club;
      const dir = V.norm(G.dir(k.side || 0, Math.sin(k.ang), Math.cos(k.ang)));
      const grip = G.point(k.grip[0], k.grip[1], k.grip[2]);
      const grip2 = V.madd(grip, dir, 4.2);
      const wrist = (g, sh) => V.madd(g, V.norm(V.sub(sh, g)), 1.6);
      ps = merge(ps, { arms: {
        R: { ik: wrist(grip, J.R.sh), pole: J.chest.dir(-1, -0.7, -0.2) },
        L: { ik: wrist(grip2, J.L.sh), pole: J.chest.dir(1, -0.7, -0.2) },
      } });
      J = rigHumanoid(P, ps);
      club = { base: grip, dir };
    }
    const cd = club ? club.dir : J.R.hand.dir(0, 0, 1);
    const cBase = club ? club.base : J.R.hand.point(0, -1.7, 0.2);
    const clubAt = (d) => V.madd(cBase, cd, d);
    const H = J.head, C = J.chest, Pv = J.pelvis;
    s.basis = Pv;

    // Torso
    s.ellipsoid(C.moved(0, 1.2, 0.2), [9.5, 7.6, 6.6], skin, { tf: C });
    s.ellipsoid(C.moved(0, 5.6, -2.6), [7.4, 3.6, 4.2], skin, { k: 3, tf: C });
    for (const sd of [1, -1]) s.ellipsoid(C.moved(sd * 4.3, 1.8, 4.4).rot(0, sd * 0.25, 0), [4.4, 3.3, 2.6], skin, { k: 2.6, tf: C });
    s.ellipsoid(Pv.moved(0, 5.5, 1.6), [8.2, 7.2, 7.0], skin, { k: 4, tf: Pv });
    s.sphere(C.point(0, -1.5, 6.2), 0.6, lip, { sub: true }); // breastbone notch
    // Belt, buckle, loincloth
    s.ellipsoid(Pv.moved(0, 1.6, 1.0), [8.9, 1.9, 7.6], strap, { tf: Pv });
    s.box(Pv.moved(0, 1.6, 8.4), [1.8, 1.6, 0.7], 0.4, M.gold);
    const sway = (ps.flap || 0);
    const flapF = Pv.moved(0, 0.6, 7.6).rot(-0.05 + sway, 0, 0);
    s.box(flapF.moved(0, -5, 0), [3.6, 5, 0.55], 0.4, cloth, { tf: flapF });
    const flapB = Pv.moved(0, 0.6, -6.6).rot(0.08 + sway * 0.5, 0, 0);
    s.box(flapB.moved(0, -4.5, 0), [4.2, 4.5, 0.55], 0.4, cloth, { tf: flapB });
    // Bandolier strap across the chest
    const strapPts = [C.point(7, 6.2, 2.4), C.point(3, 3.6, 6.3), C.point(-2.5, -1.2, 6.6), C.point(-6.8, -5.5, 4.6)];
    for (let i = 0; i < 3; i++) s.limb(strapPts[i], strapPts[i + 1], 1.05, 1.05, strap);
    s.limb(C.point(7, 6.2, 2.4), C.point(7.4, 4, -5.6), 1.05, 1.05, strap);

    // Head
    s.limb(J.neck, H.point(0, -1, 0), 3.0, 2.8, skin, { k: 1.5 });
    s.ellipsoid(H.moved(0, 0.8, -0.4), [5.0, 4.5, 5.0], face, { k: 1.2, tf: H });
    for (const sd of [1, -1]) s.ellipsoid(H.moved(sd * 2.9, -0.5, 3.0), [1.7, 1.3, 1.5], face, { k: 1.2, tf: H }); // cheekbones
    // Scowling V-shaped brow with a furrow between
    for (const sd of [1, -1]) s.limb(H.point(sd * 0.3, 1.2, 4.5), H.point(sd * 3.5, 2.3, 3.2), 1.25, 1.05, face, { k: 0.9, tf: H });
    s.sphere(H.point(0, 1.95, 5.05), 0.5, lip, { sub: true });
    // Broad snout and upper lip
    s.ellipsoid(H.moved(0, -0.5, 4.4).rot(-0.25, 0, 0), [2.0, 1.5, 1.6], face, { k: 1.0, tf: H });
    s.ellipsoid(H.moved(0, -1.9, 3.7), [3.0, 1.1, 1.6], face, { k: 1.0, tf: H });
    // Jaw (opens), lower lip
    const jawF = H.movedTo(H.point(0, -1.2, -1.2)).rot(ps.jaw, 0, 0);
    s.ellipsoid(jawF.moved(0, -2.0, 2.9), [4.1, 2.1, 3.5], face, { k: 1.2, tf: H });
    s.ellipsoid(jawF.moved(0, -1.0, 5.75), [2.6, 0.75, 0.8], lip, { tf: jawF });
    // Mouth line, then teeth set inside it
    s.limb(H.point(-2.9, -2.65, 4.9), H.point(2.9, -2.65, 4.9), 0.6, 0.6, M.hollow, { sub: true, k: 0.3 });
    s.box(H.moved(0, -2.55, 4.15), [2.3, 0.45, 0.6], 0.2, orcTeeth, { after: true, tf: H });
    s.box(jawF.moved(0, -0.75, 5.0), [2.0, 0.4, 0.6], 0.2, orcTeeth, { after: true, tf: jawF });
    for (const sd of [1, -1]) {
      s.sphere(H.point(sd * 0.8, -1.05, 5.75), 0.62, M.socket, { sub: true });                // nostrils
      s.sphere(H.point(sd * 1.75, 0.55, 3.95), 1.2, M.socket, { sub: true, k: 0.4 });          // sockets
      const ec = H.point(sd * 1.7, 0.5, 3.35);
      s.sphere(ec, 0.9, orcEye, { after: true, tf: H.movedTo(ec) });
      s.limb(jawF.point(sd * 2.2, -0.9, 4.9), jawF.point(sd * 3.4, 1.5, 5.3), 1.0, 0.3, tusk, { after: true });
      s.limb(H.point(sd * 3.9, 0.9, -0.6), H.point(sd * 7.6, 2.6, -2.3), 1.4, 0.3, face, { k: 1, tf: H });
    }
    const ring = H.point(4.7, 0.0, -0.5);
    s.torus(Frame.along(ring, H.x, H.z), 1.05, 0.32, M.gold, { after: true });
    // Top-knot
    const knot = H.point(0, 4.4, -2.2);
    s.sphere(knot, 1.7, hair);
    const tail = (ps.hair || 0);
    const t1 = V.add(knot, H.dir(0, -2, -3.2 - tail)), t2 = V.add(t1, H.dir(0, -4.5, -1.2 - tail * 1.5));
    s.limb(knot, t1, 1.2, 1.0, hair);
    s.limb(t1, t2, 1.0, 0.5, hair);

    // Arms
    for (const Sd of ['L', 'R']) {
      const A = J[Sd], sd = A.sd;
      s.sphere(V.add(A.sh, C.dir(0, 0.6, 0)), 4.1, skin, { k: 2.5 });
      s.limb(A.sh, A.el, 3.3, 2.7, skin, { k: 2 });
      s.limb(A.el, A.wr, 2.9, 2.2, skin, { k: 1.6 });
      s.limb(V.lerp(A.el, A.wr, 0.42), V.lerp(A.el, A.wr, 0.98), 2.75, 2.5, strap);
      s.ellipsoid(A.hand.moved(0, -1.7, 0.3), [2.3, 2.3, 2.5], skin, { k: 1.2, tf: A.hand });

      s.limb(A.hip, A.knee, 4.3, 3.2, skin, { k: 2.2 });
      s.limb(A.knee, A.ankle, 3.2, 2.4, skin, { k: 1.5 });
      s.limb(V.lerp(A.knee, A.ankle, 0.4), A.ankle, 3.0, 2.7, strap);
      s.ellipsoid(A.foot.moved(0, -P.ankle + 1.5, 1.8), [2.7, 1.6, 4.1], strap, { tf: A.foot });
    }
    // Spiked iron pauldron on the left shoulder
    const pad = Frame.along(V.add(J.L.sh, C.dir(0.6, 2.2, 0)), V.sub(J.L.sh, J.L.el), C.z).rot(0, 0, -0.5);
    s.ellipsoid(pad, [4.6, 2.6, 4.8], M.iron, { tf: pad });
    for (const [a, b] of [[0, 0], [-1.6, 1.2], [1.6, -1.2]]) {
      const base = pad.point(1 + a * 0.5, 1.6, b * 1.6);
      s.limb(base, V.add(base, pad.dir(0.8, 3.4, b * 0.3)), 0.9, 0.12, M.ironDark, { after: true });
    }

    // Spiked club
    s.limb(clubAt(-3), clubAt(12), 1.0, 1.8, M.wood);
    const headF = Frame.along(clubAt(15.2), cd, J.chest.x);
    s.ellipsoid(headF, [3.4, 5.4, 3.4], M.wood, { k: 1.2, tf: headF });
    s.torus(headF.moved(0, -3.6, 0), 3.0, 0.75, M.iron, { after: true });
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, h = -3 + (i % 3) * 2.8;
      const base = headF.point(Math.cos(a) * 2.6, h, Math.sin(a) * 2.6);
      s.limb(base, headF.point(Math.cos(a) * 5.4, h + 0.6, Math.sin(a) * 5.4), 0.85, 0.15, M.iron, { after: true });
    }
    s.point('chest', C.point(0, 2, 5));

    // Blood pool (death)
    if (ps.pool > 0) {
      const at = ps.poolAt || [0, 0, 14];
      s.ellipsoid(Frame.at([at[0], 0, at[2]]), [ps.pool * 1.15, 0.7, ps.pool], M.blood);
    }
  }

  const act = {};
  act.idle = {
    frames: 6, fps: 5, loop: true,
    pose: (t) => {
      const b = Math.sin(t * TAU), b2 = Math.cos(t * TAU);
      return merge(stance(), {
        root: { y: -0.5 + 0.45 * b },
        spine: { pitch: 0.24 - 0.04 * b, yaw: 0.06 * b2 },
        head: { pitch: -0.3 + 0.05 * b, yaw: 0.28 * Math.sin(t * TAU - 1) },
        arms: { L: { pitch: 0.15 + 0.05 * b, out: 0.35 + 0.04 * b, elbow: 0.45 + 0.12 * b } },
        jaw: 0.12 + 0.1 * Math.max(0, b),
        hair: 0.3 * b2,
      });
    },
  };
  act.walk = {
    frames: 8, fps: 7, loop: true, travel: 30,
    pose: (t) => {
      const sw = Math.cos(t * TAU), s2 = Math.sin(t * TAU);
      return merge(stance(), {
        root: { y: -1.6 + 1.1 * -Math.cos(t * TAU * 2), roll: 0.08 * s2, yaw: 0.1 * sw },
        spine: { pitch: 0.3, yaw: -0.18 * sw, roll: -0.05 * s2 },
        head: { pitch: -0.36, roll: 0.06 * s2 },
        arms: { L: { pitch: -0.55 * sw + 0.15, out: 0.38, elbow: 0.5 + 0.4 * Math.max(0, -sw) }, R: { pitch: 0.2 + 0.3 * sw, elbow: 0.75 + 0.15 * sw } },
        legs: gait(t, { stride: 15, lift: 3.6, width: 5.6 }),
        hair: 0.6 + 0.4 * s2, flap: 0.18 * sw, jaw: 0.15,
      });
    },
  };
  act.attack = {
    frames: 8, fps: 9, loop: false,
    pose: (t) => {
      // club: grip position (x = its left, y = up, z = forward) and shaft angle
      // (0 = pointing forward, PI/2 = straight up, PI = straight back).
      const ready = merge(stance(), {
        root: { y: -1 }, spine: { pitch: 0.3 },
        club: { grip: [-6, 24, 9], ang: 0.35, side: 0.25 }, jaw: 0.2,
      });
      const raise = merge(stance(), {
        root: { y: 0.8, z: -1 },
        spine: { pitch: -0.2 },
        head: { pitch: -0.1 },
        legs: { L: { ik: [6, 0, 3] }, R: { ik: [-6, 0, -3] } },
        club: { grip: [-1.5, 64, 1], ang: 2.8, side: 0.05 }, jaw: 0.55, hair: 1.2,
      });
      const swing = merge(stance(), {
        root: { y: -1.5, z: 1.5 },
        spine: { pitch: 0.35 },
        head: { pitch: -0.45 },
        legs: { L: { ik: [6.2, 0, 7] }, R: { ik: [-6, 0, -4] } },
        club: { grip: [-1, 47, 14], ang: 1.05, side: 0 }, jaw: 0.8, hair: 0.4,
      });
      const smash = merge(stance(), {
        root: { y: -3.5, z: 3 },
        spine: { pitch: 0.8 },
        head: { pitch: -0.75 },
        legs: { L: { ik: [6.5, 0, 9] }, R: { ik: [-6, 0, -5] } },
        club: { grip: [-1, 19, 17], ang: -1.0, side: 0 }, jaw: 0.7, hair: -0.6, flap: 0.3,
      });
      // Keys sit exactly on frame times (k / 7) so every pose is actually shown.
      return poseKeys(t, [[0, ready], [2 / 7, raise], [3 / 7, swing], [4 / 7, smash], [5 / 7, smash], [1, ready]]);
    },
  };
  act.pain = {
    frames: 4, fps: 8, loop: false,
    pose: (t) => {
      const hit = merge(stance(), {
        root: { z: -2, y: -1.2, roll: -0.12 },
        spine: { pitch: -0.15, roll: -0.18, yaw: 0.25 },
        head: { pitch: -0.75, yaw: -0.4, roll: -0.25 },
        arms: { L: { pitch: 0.35, out: 0.55, elbow: 1.5 }, R: { pitch: 0.5, out: 0.45, elbow: 1.1 } },
        jaw: 0.75, hair: 1.4,
      });
      return poseKeys(t, [[0, hit], [0.35, hit], [1, stance()]]);
    },
  };
  act.death = {
    frames: 10, fps: 8, loop: false,
    pose: (t) => {
      const fk = (o) => merge(pose(), merge({
        legs: { L: { pitch: 0, out: 0.12, knee: 0.15 }, R: { pitch: 0, out: 0.12, knee: 0.15 } },
      }, o));
      const stand = fk({ root: { y: -1 }, spine: { pitch: 0.25 }, head: { pitch: -0.3 },
        arms: { R: { pitch: 0.15, out: 0.32, elbow: 0.55, wrist: -0.7 }, L: { pitch: 0.15, out: 0.35, elbow: 0.45 } } });
      const reel = fk({ root: { y: -1.5, z: -1.5, roll: 0.1 }, spine: { pitch: -0.35, roll: 0.2 }, head: { pitch: -0.8, yaw: 0.5 },
        arms: { R: { pitch: 0.9, out: 0.6, elbow: 1.3, wrist: 0.5 }, L: { pitch: 0.7, out: 0.6, elbow: 1.6 } }, jaw: 0.8, hair: 1.5 });
      const knees = fk({ root: { y: -13.5, z: 3, pitch: 0.25 }, spine: { pitch: 0.4 }, head: { pitch: -0.2 },
        arms: { R: { pitch: 0.5, out: 0.5, elbow: 0.4 }, L: { pitch: 0.4, out: 0.6, elbow: 0.3 } },
        legs: { L: { pitch: 0.3, knee: 1.9 }, R: { pitch: 0.25, knee: 1.95 } }, jaw: 0.7, hair: 0.6 });
      const down = fk({ root: { y: -20.5, z: 16, pitch: 1.5 }, spine: { pitch: 0.12 }, head: { pitch: 0.1, yaw: 0.7 },
        arms: { R: { pitch: 2.3, out: 0.75, elbow: 0.5 }, L: { pitch: 1.4, out: 1.1, elbow: 1.0 } },
        legs: { L: { pitch: -0.05, knee: 0.3, out: 0.2 }, R: { pitch: 0.05, knee: 0.5, out: 0.15 } }, jaw: 0.5, hair: -0.4 });
      const p = poseKeys(t, [[0, stand], [0.15, reel], [0.42, knees], [0.68, down], [1, down]]);
      p.pool = 13 * span(t, 0.66, 1);
      p.poolAt = [1, 0, 29];
      return p;
    },
  };

  defineCreature({
    id: 'orc', name: 'Orc Brute', code: 'ORCB',
    lore: 'Raised in the war-pits beneath the mountains. It cannot count past the number of skulls on its belt, and it is always looking to add one.',
    stats: { hp: 110, dmg: '4-24', speed: 'Slow' },
    shadow: [17, 10], blood: 'red', height: 56,
    build, actions: act,
  });
})();
