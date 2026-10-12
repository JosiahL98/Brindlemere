'use strict';
// Dark Elf: ash-skinned duelist in lacquered chitin, fighting with two curved blades.
(function () {
  const P = { thigh: 15, shin: 14.5, ankle: 2.4, foot: 4.6, hipW: 3.2, crouch: 2.6,
    spine: 12, shY: 5, shW: 7.0, neckY: 6.6, headY: 4.4, upper: 11.5, fore: 11 };

  const skin = mat('STEEL', { amb: 0.2, dif: 0.7, gain: 0.82, bias: -1.6, spec: 0.12, shin: 8, noise: 0.7, nf: 0.5 });
  const hair = mat('BONE', { amb: 0.2, dif: 0.85, bias: 0.6, spec: 0.35, shin: 12, noise: 1.8, nf: 1.6,
    pattern: (x) => Math.sin(x * 3.1) * 1.2 });
  const leather = mat('GRAY', { amb: 0.06, dif: 0.75, gain: 0.55, bias: -1.4, spec: 0.25, shin: 10, noise: 1.0, nf: 0.8 });
  const chitin = mat('RUST', { amb: 0.06, dif: 0.85, gain: 0.62, bias: -1.8, spec: 0.85, shin: 18, noise: 0.8, nf: 0.6,
    pattern: (x, y) => (Math.abs(Math.sin(y * 0.85)) < 0.16 ? -3 : 0) });
  const sash = mat('RED', { amb: 0.1, dif: 0.85, bias: -1.2, noise: 1.1, nf: 0.9, pattern: (x, y) => Math.sin(y * 1.6 + x) * 0.8 });
  const blade = mat('STEEL', { amb: 0.12, dif: 0.7, spec: 1.3, shin: 26, noise: 0.4, bias: 0.6, edge: 1 });
  const elfEye = eyeMat('RED', 12, 'round', 1.1);
  // Face skin: kohl around the eyes, dark lips, and thin tattoo lines on the cheeks and chin.
  const face = mat('STEEL', { amb: 0.24, dif: 0.62, fill: 0.22, gain: 0.82, bias: -1.6, spec: 0.15, shin: 8, noise: 0.6, nf: 0.5,
    rampFn: (x, y, z, l) => {
      if (z > 1.2) {
        const ax = Math.abs(x);
        if (seg2(ax, y, 1.35, -0.5, 1.6, -2.4) < 0.2 || seg2(ax, y, 0, -3.1, 0, -4.2) < 0.2) return [R.BLUE, 1.5 + l * 0.2];
        if (Math.abs(x) + Math.abs(y - 2.55) < 0.5) return [R.BLUE, 2 + l * 0.2];
        if (Math.hypot((ax - 1.35) / 1.45, (y - 0.5 - (ax - 1.35) * 0.3) / 0.82) < 1) return [R.PURPLE, l * 0.45];
        if (y < -2.2 && y > -2.95 && ax < 1.05 - (y + 2.55) * (y + 2.55)) return [R.PURPLE, l * 0.6];
      }
      return [R.STEEL, l];
    } });

  const stance = () => pose({
    root: { y: -0.8, yaw: 0.25 },
    spine: { pitch: 0.12, yaw: -0.2 },
    head: { pitch: -0.05, yaw: -0.12 },
    arms: {
      R: { pitch: 0.7, out: 0.4, elbow: 1.0, wrist: -0.35, twist: 0.2 },
      L: { pitch: 0.95, out: 0.2, elbow: 1.55, wrist: 0.15, twist: -0.3 },
    },
    legs: { L: { ik: [4.6, 0, 5] }, R: { ik: [-4.2, 0, -4] } },
    hair: 0.3, sashSwing: 0,
  });

  function build(s, ps) {
    const J = rigHumanoid(P, ps);
    const H = J.head, C = J.chest, Pv = J.pelvis;
    s.basis = Pv;

    // Torso: lean body in black leather, a lacquered chitin breastplate and spaulders.
    s.ellipsoid(C.moved(0, 0.8, 0), [6.6, 7.4, 4.7], leather, { tf: C });
    s.ellipsoid(Pv.moved(0, 4.2, 0.2), [4.6, 5.2, 3.6], leather, { k: 3, tf: Pv });
    s.ellipsoid(Pv.moved(0, 0.6, 0), [5.4, 3.0, 4.0], leather, { k: 2, tf: Pv });
    s.ellipsoid(C.moved(0, 1.6, 1.2), [6.0, 5.6, 3.9], chitin, { tf: C });
    for (const Sd of ['L', 'R']) {
      const A = J[Sd], sd = A.sd;
      const pf = C.movedTo(V.add(A.sh, C.dir(sd * 0.8, 1.3, 0))).rot(0, 0, sd * -0.55);
      s.ellipsoid(pf, [3.7, 2.0, 3.8], chitin, { tf: pf });
      s.ellipsoid(pf.moved(sd * 1.0, -1.9, 0), [3.3, 1.7, 3.4], chitin, { tf: pf.moved(0, 3, 0) });
    }
    // Crimson sash with hanging tails
    s.ellipsoid(Pv.moved(0, 2.4, 0.2), [5.6, 1.5, 4.3], sash, { tf: Pv });
    const tail = Pv.moved(-3, 2.0, 3.4).rot(-0.1 + ps.sashSwing, 0, 0.15);
    s.box(tail.moved(0, -4.5, 0), [1.3, 4.5, 0.35], 0.3, sash, { tf: tail });
    const tail2 = Pv.moved(-4.2, 2.0, 2.2).rot(-0.05 + ps.sashSwing * 0.7, 0, 0.3);
    s.box(tail2.moved(0, -3.6, 0), [1.1, 3.6, 0.35], 0.3, sash, { tf: tail2 });

    // Head: narrow face, high cheekbones, almond eyes with a red glow, tattooed cheeks, long ears.
    s.limb(J.neck, H.point(0, -2, -0.4), 1.7, 1.5, skin, { k: 1 });
    s.ellipsoid(H.moved(0, 0.6, -0.3), [3.5, 3.9, 4.0], face, { tf: H });
    s.ellipsoid(H.moved(0, -1.8, 1.3), [2.4, 2.5, 2.6], face, { k: 1.6, tf: H });
    for (const sd of [1, -1]) s.ellipsoid(H.moved(sd * 2.0, -0.6, 2.75), [1.15, 0.8, 1.0], face, { k: 0.8, tf: H });
    s.limb(H.point(0, 0.5, 3.75), H.point(0, -1.0, 4.45), 0.45, 0.55, face, { k: 0.5, tf: H });
    s.limb(H.point(-0.85, -2.45, 3.55), H.point(0.85, -2.45, 3.55), 0.24, 0.24, M.socket, { sub: true }); // mouth
    for (const sd of [1, -1]) {
      s.limb(H.point(sd * 0.4, 1.35, 3.6), H.point(sd * 2.5, 1.6, 3.0), 0.6, 0.5, face, { k: 0.6, tf: H });
      s.ellipsoid(H.moved(sd * 1.35, 0.5, 3.6).rot(0, 0, sd * 0.3), [1.15, 0.62, 0.8], M.socket, { sub: true, k: 0.25 });
      const ec = H.point(sd * 1.35, 0.5, 3.12);
      s.sphere(ec, 0.62, elfEye, { after: true, tf: H.movedTo(ec) });
      s.limb(H.point(sd * 0.5, 1.6, 3.85), H.point(sd * 2.65, 2.3, 3.1), 0.32, 0.22, hair, { after: true }); // brows
      s.limb(H.point(sd * 3.2, 0.5, -0.3), H.point(sd * 7.8, 2.9, -1.8), 1.05, 0.15, face, { k: 0.6, tf: H });
      s.limb(H.point(sd * 3.0, 1.6, 1.2), H.point(sd * 2.9, -2.6, 1.4), 0.75, 0.4, hair); // side locks
    }
    s.ellipsoid(H.moved(0, 1.7, -0.9), [3.8, 3.0, 4.0], hair, { tf: H });
    const knot = H.point(0, 2.4, -4.1);
    s.sphere(knot, 1.5, hair);
    let hp = knot, hd = H.dir(0, -0.6, -1);
    for (let i = 0; i < 5; i++) {
      hd = V.norm(V.add(hd, H.dir(Math.sin(ps.hair + i) * 0.25, -0.55, -0.15 * ps.hair)));
      const np = V.madd(hp, hd, 3.2);
      s.limb(hp, np, 1.3 - i * 0.18, 1.1 - i * 0.2, hair);
      hp = np;
    }

    // Arms and legs
    for (const Sd of ['L', 'R']) {
      const A = J[Sd];
      s.limb(A.sh, A.el, 2.2, 1.8, leather, { k: 1 });
      s.limb(A.el, A.wr, 1.8, 1.4, leather, { k: 0.8 });
      s.limb(V.lerp(A.el, A.wr, 0.3), V.lerp(A.el, A.wr, 0.95), 2.0, 1.7, chitin);
      s.ellipsoid(A.hand.moved(0, -1.5, 0.2), [1.4, 1.7, 1.2], skin, { k: 0.6, tf: A.hand });

      s.limb(A.hip, A.knee, 3.0, 2.2, leather, { k: 1.4 });
      s.sphere(V.add(A.knee, A.foot.dir(0, 0, 0.9)), 1.9, chitin);
      s.limb(A.knee, A.ankle, 2.2, 1.6, leather, { k: 1 });
      s.limb(V.lerp(A.knee, A.ankle, 0.35), A.ankle, 2.4, 1.9, chitin);
      s.ellipsoid(A.foot.moved(0, -P.ankle + 1.2, 1.5), [1.7, 1.2, 3.4], leather, { tf: A.foot });

      // Curved blade
      const hf = A.hand, grip = hf.point(0, -1.5, 0.3), bd = hf.dir(0, 0, 1);
      s.limb(V.madd(grip, bd, -2.4), V.madd(grip, bd, 1.4), 0.55, 0.55, M.leather);
      s.sphere(V.madd(grip, bd, -2.8), 0.8, M.gold);
      let bf = Frame.along(V.madd(grip, bd, 1.8), bd, hf.y);
      s.box(bf, [2.3, 0.45, 0.6], 0.25, M.gold, { tf: bf });
      const seg = 5.2;
      for (let i = 0; i < 3; i++) {
        s.box(bf.moved(0, seg / 2, 0), [1.0 - i * 0.12, seg / 2 + 0.2, 0.28], 0.2, blade, { tf: bf });
        bf = bf.moved(0, seg, 0).rot(0, 0, 0.2);
      }
    }
    s.point('chest', C.point(0, 1, 4));
    if (ps.pool > 0) s.ellipsoid(Frame.at(ps.poolAt), [ps.pool * 1.15, 0.7, ps.pool], M.blood);
  }

  const act = {};
  act.idle = {
    frames: 6, fps: 6, loop: true,
    pose: (t) => {
      const b = Math.sin(t * TAU), c = Math.cos(t * TAU);
      return merge(stance(), {
        root: { y: -0.8 + 0.35 * b },
        spine: { pitch: 0.12 - 0.03 * b },
        head: { yaw: -0.12 + 0.25 * Math.sin(t * TAU - 1), pitch: -0.05 + 0.04 * c },
        arms: { R: { wrist: -0.35 + 0.25 * b, wristTwist: 0.4 * c }, L: { wrist: 0.15 - 0.2 * b } },
        hair: 0.3 + 0.3 * c, sashSwing: 0.05 * b,
      });
    },
  };
  act.walk = {
    frames: 8, fps: 9, loop: true, travel: 34,
    pose: (t) => {
      const sw = Math.cos(t * TAU), s2 = Math.sin(t * TAU);
      return merge(stance(), {
        root: { y: -2 + 0.7 * -Math.cos(t * TAU * 2), yaw: 0.06 * sw, roll: 0.03 * s2 },
        spine: { pitch: 0.24, yaw: -0.12 * sw },
        head: { pitch: -0.2, yaw: 0 },
        arms: { R: { pitch: 0.5 + 0.25 * sw, out: 0.45, elbow: 0.9 }, L: { pitch: 0.5 - 0.25 * sw, out: 0.4, elbow: 0.9, wrist: -0.3 } },
        legs: gait(t, { stride: 16, lift: 4.2, width: 3.4 }),
        hair: 1.2 + 0.4 * s2, sashSwing: 0.25 * sw,
      });
    },
  };
  act.attack = {
    frames: 10, fps: 12, loop: false,
    pose: (t) => {
      const cross = merge(stance(), {
        root: { y: -4.5, yaw: 0 },
        spine: { pitch: 0.35, yaw: 0 },
        head: { yaw: 0 },
        arms: { R: { pitch: 1.6, out: -0.55, elbow: 0.9, wrist: 0.3 }, L: { pitch: 1.6, out: -0.55, elbow: 0.9, wrist: 0.3 } },
        legs: { L: { ik: [4.6, 0, 3.5] }, R: { ik: [-4.6, 0, -3.5] } },
        hair: 0.4,
      });
      const spinArms = { R: { pitch: 1.45, out: 1.1, elbow: 0.15, wrist: -0.2, twist: 0 }, L: { pitch: 1.45, out: 1.1, elbow: 0.15, wrist: -0.2, twist: 0 } };
      const spin = (yaw) => merge(stance(), {
        root: { y: -2.5, yaw }, spine: { pitch: 0.1, yaw: 0 }, head: { yaw: 0 }, arms: spinArms,
        legs: { L: { ik: [4.4, 1.5, 1] }, R: { ik: [-4.4, 0, -1] } }, hair: 2.2, sashSwing: 0.6,
      });
      const lunge = merge(stance(), {
        root: { y: -6, z: 4, yaw: TAU },
        spine: { pitch: 0.5, yaw: 0 },
        head: { pitch: -0.4, yaw: 0 },
        arms: { R: { pitch: 0.9, out: 0.9, elbow: 0.2, wrist: -0.6 }, L: { pitch: 0.9, out: 0.9, elbow: 0.2, wrist: -0.6 } },
        legs: { L: { ik: [5, 0, 10] }, R: { ik: [-4.4, 0, -5] } },
        hair: 1.0, sashSwing: 0.4,
      });
      const end = merge(stance(), { root: { yaw: TAU + 0.25 } });
      return poseKeys(t, [[0, stance()], [0.18, cross], [0.32, spin(0.3)], [0.44, spin(TAU / 3 + 0.3)], [0.56, spin(TAU * 2 / 3 + 0.3)],
        [0.7, lunge], [0.82, lunge], [1, end]]);
    },
  };
  act.pain = {
    frames: 4, fps: 8, loop: false,
    pose: (t) => {
      const hit = merge(stance(), {
        root: { z: -2.4, y: -0.6, roll: -0.1 },
        spine: { pitch: -0.32, roll: -0.15, yaw: 0.1 },
        head: { pitch: -0.5, yaw: 0.4, roll: -0.2 },
        arms: { R: { pitch: 0.4, out: 0.9, elbow: 0.5 }, L: { pitch: 0.5, out: 0.7, elbow: 0.7 } },
        hair: 1.4,
      });
      return poseKeys(t, [[0, hit], [0.35, hit], [1, stance()]]);
    },
  };
  act.death = {
    frames: 10, fps: 8, loop: false,
    pose: (t) => {
      const fk = (o) => merge(pose({ hair: 0.3, sashSwing: 0, legs: { L: { pitch: 0.1, out: 0.1, knee: 0.3 }, R: { pitch: -0.05, out: 0.1, knee: 0.3 } } }), o);
      const stand = fk({ root: { y: -1, yaw: 0.25 }, spine: { pitch: 0.12, yaw: -0.2 },
        arms: { R: { pitch: 0.7, out: 0.4, elbow: 1.0, wrist: -0.35 }, L: { pitch: 0.95, out: 0.2, elbow: 1.55, wrist: 0.15 } } });
      const clutch = fk({ root: { y: -2, z: -1, yaw: 0.6 }, spine: { pitch: 0.45, yaw: 0.2 }, head: { pitch: 0.3 },
        arms: { R: { pitch: 0.7, out: -0.3, elbow: 1.6, wrist: 0.5 }, L: { pitch: 0.2, out: 0.6, elbow: 0.4, wrist: 0.8 } }, hair: 0.8 });
      const kneel = fk({ root: { y: -14.5, z: 1, yaw: 0.9 }, spine: { pitch: 0.3 }, head: { pitch: 0.6 },
        arms: { R: { pitch: 0.4, out: 0.1, elbow: 1.2 }, L: { pitch: 0.1, out: 0.5, elbow: 0.2, wrist: 0.8 } },
        legs: { L: { pitch: 0.6, knee: 2.1 }, R: { pitch: 0.2, knee: 2.15 } }, hair: 0.2 });
      const down = fk({ root: { y: -25.3, z: -4, yaw: 1.2, roll: 1.5, x: 4 }, spine: { pitch: 0.4 }, head: { pitch: 0.3, roll: -0.3 },
        arms: { R: { pitch: 0.9, out: -0.2, elbow: 1.0 }, L: { pitch: 1.3, out: 0.3, elbow: 0.3, wrist: 0.8 } },
        legs: { L: { pitch: 0.35, knee: 0.7 }, R: { pitch: 0.1, knee: 0.3 } }, hair: -0.6 });
      const p = poseKeys(t, [[0, stand], [0.16, clutch], [0.42, kneel], [0.68, down], [1, down]]);
      p.pool = 10 * span(t, 0.68, 1);
      p.poolAt = [-3, 0, -6];
      return p;
    },
  };

  defineCreature({
    id: 'darkelf', name: 'Dark Elf', code: 'DELF',
    lore: 'An exile from the ashlands who sells the use of both blades to whoever pays first. Dark elves live for centuries and hold grudges for every one of them.',
    stats: { hp: 85, dmg: '2-14 ×2', speed: 'Very fast' },
    shadow: [13, 9], blood: 'red', height: 62,
    labels: { attack: 'Whirl' },
    build, actions: act,
  });
})();
