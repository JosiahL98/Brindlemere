'use strict';
// Lich: a hovering, crowned sorcerer in tattered robes, casting bolts from a bone staff.
(function () {
  const P = { thigh: 13, shin: 13, ankle: 2, foot: 4, hipW: 3.4, crouch: 0,
    spine: 12, shY: 5, shW: 7.4, neckY: 6.2, headY: 4.4, upper: 11, fore: 10 };

  const robe = mat('PURPLE', { amb: 0.08, dif: 0.85, gain: 0.66, bias: -1.2, noise: 1.3, nf: 0.6,
    rampFn: (x, y, z, l) => {
      if (y < 3.2 && y > 1.6) return [R.GOLD, l + 1];                    // hem band
      if (Math.abs(x) < 0.9 && z > 0 && y > 2) return [R.GOLD, l];       // front stripe
      return [R.PURPLE, l + Math.sin(Math.atan2(x, z) * 7) * 1.1];        // folds
    } });
  const robeUpper = mat('PURPLE', { amb: 0.08, dif: 0.85, gain: 0.66, bias: -1.2, noise: 1.3, nf: 0.6 });
  const tatter = mat('PURPLE', { amb: 0.06, dif: 0.7, gain: 0.6, bias: -2.4, noise: 1.5 });
  const hoodInside = mat('GRAY', { amb: 0, dif: 0.08, fill: 0, noise: 0.5, edge: 0 });
  const skull = mat('BONE', { amb: 0.12, dif: 0.6, fill: 0.35, bias: -1.8, noise: 0.9, nf: 0.8,
    pattern: (x, y, z) => {
      if (y < -1.6 && y > -2.8 && (Math.floor(x * 1.2 + 10) & 1)) return -4; // teeth gaps
      if (Math.hypot(Math.abs(x) - 1.35, (y - 0.1) * 1.1) < 1.05) return -8; // sockets
      if (Math.abs(x) < 0.55 - (y + 0.7) * 0.4 && y < -0.6 && y > -1.5) return -7; // nose
      if (Math.abs(Math.abs(x) - 2.3) < 0.5 && y < -0.6 && y > -1.3) return 2;   // cheekbones
      if (y > 1.5 && y < 1.9 && Math.abs(x) < 2.6) return 1.5;                  // brow
      return 0;
    } });
  const eyeOn = mat('GHOST', { emissive: true, glow: 13, noise: 1, nf: 2 });
  const gem = eyeMat('RED', 11, null);
  const boneHand = mat('BONE', { amb: 0.2, dif: 0.85, bias: -0.5, noise: 0.8 });
  const staffWood = mat('BROWN', { amb: 0.1, dif: 0.85, bias: -2, noise: 1.6, nf: 0.9,
    pattern: (x, y) => (Math.sin(y * 1.4) > 0.7 ? -1.5 : 0) });

  const stance = () => pose({
    root: { y: 3 },
    spine: { pitch: 0.08 },
    head: { pitch: 0.12 },
    arms: { R: { pitch: 0.45, out: 0.22, elbow: 1.2, wrist: -0.15, twist: 0.1 }, L: { pitch: 0.55, out: 0.3, elbow: 1.5, wrist: 0.4 } },
    legs: { L: { ik: [3.4, 0, 0] }, R: { ik: [-3.4, 0, 0] } },
    hem: [0, 0], orb: 0.4, collapse: 0, eyes: 1, fingers: 0.3,
  });

  function build(s, ps) {
    const J = rigHumanoid(P, ps);
    const H = J.head, C = J.chest, Pv = J.pelvis;
    s.basis = Pv;
    const c = ps.collapse;

    // Robe: a long bell from the waist to the hem, which drags behind when moving.
    const hemY = lerp(2.2 + ps.root.y * 0.4, 0.6, c);
    const hem = [Pv.o[0] + ps.hem[0], hemY, Pv.o[2] + ps.hem[1]];
    const waist = Pv.point(0, 2, 0);
    const rf = Frame.along(hem, V.sub(waist, hem), [0, 0, 1]);
    s.limb(hem, waist, 11 + c * 4, 6, robe, { clip: [0, -1, 0, -hemY], tf: rf.moved(0, 0, 0), k: 0 });
    s.ellipsoid(C.moved(0, 0.5, -0.3), [7.4, 8, 5.2], robeUpper, { k: 3, tf: C });
    // Tattered strips at the hem
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.3;
      const r = 10.2 + c * 4;
      const top = [hem[0] + Math.sin(a) * r, hemY + 1.5, hem[2] + Math.cos(a) * r];
      const len = 3 + hash3(i, 3, 3) * 2.5;
      s.limb(top, [top[0] - ps.hem[0] * 0.2, Math.max(0.4, hemY - len), top[2] - ps.hem[1] * 0.25], 1.1, 0.4, tatter);
    }
    // Mantle over the shoulders
    s.ellipsoid(C.moved(0, 4.8, -0.6), [9.6, 3.4, 6.4], robeUpper, { k: 2, tf: C });

    // Hood with the skull inside it, glowing eyes, iron-gold crown.
    s.sphere(H.point(0, 0.8, -1.2), 6.2, robeUpper, { tf: H });
    s.ellipsoid(H.moved(0, -0.4, 4.0), [3.9, 4.6, 4.2], hoodInside, { sub: true, k: 0.8 });
    s.ellipsoid(H.moved(0, -0.2, 0.2), [3.1, 3.6, 3.4], skull, { after: true, tf: H.moved(0, -0.2, 2.6) });
    s.box(H.moved(0, -2.9, 1.6), [2.2, 0.9, 1.4], 0.6, skull, { after: true, tf: H.moved(0, -1.0, 2.6) });
    if (ps.eyes > 0) for (const sd of [1, -1]) s.sphere(H.point(sd * 1.35, 0.0, 2.9), 0.4 + 0.3 * ps.eyes, eyeOn, { after: true });
    const crown = H.moved(0, 5.6, -1.0).rot(-0.18, 0, 0);
    s.torus(crown, 4.2, 0.65, M.gold, { tf: crown });
    s.sphere(crown.point(0, 0.5, 4.5), 0.85, gem, { after: true, tf: crown.movedTo(crown.point(0, 0.5, 4.5)) });
    for (let i = 0; i < 5; i++) {
      const a = -1.2 + i * 0.6;
      const b = crown.point(Math.sin(a) * 4.2, 0, Math.cos(a) * 4.2);
      s.limb(b, V.add(b, crown.dir(Math.sin(a) * 0.4, 2.4 + (i === 2 ? 1.2 : 0), Math.cos(a) * 0.4)), 0.7, 0.15, M.gold);
    }

    // Wide sleeves with bony hands.
    for (const Sd of ['L', 'R']) {
      const A = J[Sd];
      s.limb(A.sh, A.el, 2.8, 3.0, robeUpper, { k: 1.5 });
      const cuff = V.madd(A.wr, A.fore.y, 1.2);
      s.limb(A.el, cuff, 3.0, 4.0, robeUpper);
      s.sphere(V.madd(cuff, A.fore.y, -2.4), 3.1, hoodInside, { sub: true });
      const hf = A.hand;
      s.limb(A.wr, hf.point(0, -1.6, 0), 0.7, 0.9, boneHand, { after: true });
      s.box(hf.moved(0, -1.6, 0.1), [1.2, 1.1, 0.5], 0.4, boneHand, { after: true });
      for (const fx of [-0.9, 0, 0.9]) {
        const b = hf.point(fx, -2.4, 0.2);
        s.limb(b, V.add(b, hf.dir(fx * 0.3, -2.4, ps.fingers * 1.5)), 0.38, 0.3, boneHand, { after: true });
      }
    }

    // Staff with a glowing orb held in a bone cage.
    const hR = J.R.hand, grip = hR.point(0, -1.6, 0.4), sd = hR.dir(0, 0, 1);
    const fallStaff = collapser({ staff: { c: grip, rest: 0.9, delay: 0.25, dur: 0.45, pitch: 1.45, yaw: 0.7, ox: -9, oz: 6, bounce: 1 } }, c);
    const at = (d) => fallStaff.pt('staff', V.madd(grip, sd, d));
    s.limb(at(-22), at(13), 0.85, 0.95, staffWood);
    const orbC = at(16.6);
    s.sphere(orbC, 2.0 + ps.orb * 1.6, M.magic, { after: true });
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4;
      const side = V.norm(V.cross(sd, [0, 1, 0.01]));
      const up2 = V.norm(V.cross(side, sd));
      const off = V.add(V.scale(side, Math.cos(a) * 3.4), V.scale(up2, Math.sin(a) * 3.4));
      s.limb(at(13), fallStaff.pt('staff', V.add(V.madd(grip, sd, 16.6), off)), 0.55, 0.45, boneHand);
      s.limb(fallStaff.pt('staff', V.add(V.madd(grip, sd, 16.6), off)), at(19.8), 0.45, 0.2, boneHand);
    }
    s.point('orb', orbC);
    s.point('chest', C.point(0, 1, 4));
  }

  const act = {};
  act.idle = {
    frames: 8, fps: 6, loop: true,
    pose: (t) => {
      const b = Math.sin(t * TAU), c = Math.cos(t * TAU);
      return merge(stance(), {
        root: { y: 3 + 1.4 * b, roll: 0.03 * c },
        spine: { pitch: 0.08 + 0.03 * c, yaw: 0.05 * c },
        head: { pitch: 0.12 - 0.05 * b, yaw: 0.2 * Math.sin(t * TAU - 0.7), roll: -0.06 * c },
        arms: { L: { pitch: 0.55 + 0.15 * b, elbow: 1.5 + 0.2 * c, wristTwist: 0.4 * b } },
        hem: [0.8 * c, -0.6 * b], orb: 0.4 + 0.3 * Math.sin(t * TAU * 2), fingers: 0.3 + 0.4 * Math.max(0, b),
      });
    },
  };
  act.walk = {
    frames: 8, fps: 8, loop: true, travel: 22,
    pose: (t) => {
      const b = Math.sin(t * TAU * 2), c = Math.cos(t * TAU);
      return merge(stance(), {
        root: { y: 4 + 1.0 * b, pitch: 0.12, roll: 0.04 * c },
        spine: { pitch: 0.12 },
        head: { pitch: 0.0, roll: 0.04 * c },
        arms: { L: { pitch: 0.2 + 0.1 * c, out: 0.35, elbow: 0.9 }, R: { pitch: 0.55 + 0.05 * c } },
        hem: [0.9 * c, -5.5 + 0.7 * b], orb: 0.5,
      });
    },
  };
  act.attack = {
    frames: 8, fps: 9, loop: false, emit: { frame: 4, fx: 'magic', point: 'orb' },
    pose: (t, f) => {
      const raise = merge(stance(), {
        root: { y: 6, z: -1 },
        spine: { pitch: -0.2 },
        head: { pitch: -0.15 },
        arms: { R: { pitch: 2.5, out: 0.25, elbow: 0.6, wrist: -0.6 }, L: { pitch: 1.6, out: 0.6, elbow: 0.4, wrist: -0.4 } },
        hem: [0, 2], fingers: 1.2,
      });
      const thrust = merge(stance(), {
        root: { y: 3, z: 3 },
        spine: { pitch: 0.35 },
        head: { pitch: -0.25 },
        arms: { R: { pitch: 1.35, out: 0.05, elbow: 0.3, wrist: -1.3 }, L: { pitch: 0.2, out: 0.5, elbow: 0.8 } },
        hem: [0, -3], fingers: 0.0,
      });
      const p = poseKeys(t, [[0, stance()], [0.4, raise], [0.56, thrust], [0.75, thrust], [1, stance()]]);
      p.orb = [0.6, 1.2, 1.8, 2.4, 0.2, 0.4, 0.5, 0.5][f];
      p.eyes = f >= 2 && f <= 4 ? 1.6 : 1;
      return p;
    },
  };
  act.pain = {
    frames: 4, fps: 8, loop: false,
    pose: (t) => {
      const hit = merge(stance(), {
        root: { y: 5, z: -2, roll: 0.08 },
        spine: { pitch: -0.3, roll: 0.12 },
        head: { pitch: -0.45, yaw: 0.35 },
        arms: { R: { pitch: 0.2, out: 0.5, elbow: 0.9 }, L: { pitch: 1.1, out: 0.7, elbow: 0.6, wrist: -0.8 } },
        hem: [-1, 3], orb: 0.1, fingers: 1.4,
      });
      return poseKeys(t, [[0, hit], [0.35, hit], [1, stance()]]);
    },
  };
  act.death = {
    frames: 10, fps: 8, loop: false,
    pose: (t) => {
      const shriek = merge(stance(), {
        root: { y: 8 }, spine: { pitch: -0.4 }, head: { pitch: -0.7 },
        arms: { R: { pitch: 0.8, out: 0.8, elbow: 0.3 }, L: { pitch: 2.2, out: 0.5, elbow: 0.3 } }, hem: [0, 2], fingers: 1.5, orb: 1.5,
      });
      const heap = merge(stance(), {
        root: { y: -16, z: 3, pitch: 0.8 }, spine: { pitch: 0.7 }, head: { pitch: 0.4, roll: 0.3 },
        arms: { R: { pitch: 0.6, out: 0.9, elbow: 0.2 }, L: { pitch: 0.9, out: 0.9, elbow: 0.3 } }, hem: [0, 0], fingers: 0, orb: 0,
      });
      const p = poseKeys(t, [[0, stance()], [0.18, shriek], [0.8, heap], [1, heap]]);
      p.collapse = easeIn(span(t, 0.2, 0.85));
      p.eyes = 1 - span(t, 0.6, 1);
      p.orb = lerp(1.5, 0, span(t, 0.2, 0.8));
      return p;
    },
  };

  defineCreature({
    id: 'lich', name: 'Lich', code: 'LICH',
    lore: 'A court wizard who bargained for more time and got all of it. The crown is from a kingdom that no longer appears on any map.',
    stats: { hp: 140, dmg: '8-32 (frost)', speed: 'Average' },
    shadow: [12, 9], blood: 'dust', height: 60, float: true,
    labels: { walk: 'Glide', attack: 'Cast' },
    build, actions: act,
  });
})();
