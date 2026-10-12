'use strict';
// Fire Fiend: wiry horned demon that conjures and hurls fireballs.
(function () {
  const P = { thigh: 13.5, shin: 13.5, ankle: 2.6, foot: 5, hipW: 3.6, crouch: 3.2,
    spine: 12, shY: 5, shW: 8.2, neckY: 5.2, headY: 4.2, upper: 12, fore: 11.5 };

  const skin = mat('RED', { amb: 0.07, dif: 0.95, gain: 0.74, bias: -1.6, spec: 0.22, shin: 9, noise: 1.2, nf: 0.5,
    pattern: (x, y, z) => (vnoise(x * 0.25, y * 0.25 + 9, z * 0.25) - 0.5) * 2.6 });
  const ribs = mat('RED', { amb: 0.07, dif: 0.95, gain: 0.74, bias: -1.6, spec: 0.22, shin: 9, noise: 1.0,
    pattern: (x, y) => (Math.abs(x) > 2.5 && Math.sin(y * 1.9) > 0.35 ? -2.5 : 0) });
  const horn = mat('BONE', { amb: 0.12, dif: 0.85, bias: -2.2, noise: 1.0, nf: 0.9, spec: 0.25,
    pattern: (x, y) => (Math.sin(y * 3.1) > 0.6 ? -1.6 : 0) });
  const claw = mat('BONE', { amb: 0.2, dif: 0.8, bias: -0.5, noise: 0.5, spec: 0.3 });
  const hoof = mat('GRAY', { amb: 0.08, dif: 0.6, spec: 0.4, shin: 12, noise: 0.6, bias: -2 });
  const maw = mat('FIRE', { emissive: true, glow: 6, noise: 2.2, nf: 1.2 });
  const fiendEye = eyeMat('GOLD', 13, 'slit', 1.3);
  // Head skin: sunken dark around the eyes and a black sigil on the brow.
  const face = mat('RED', { amb: 0.07, dif: 0.95, gain: 0.74, bias: -1.6, spec: 0.22, shin: 9, noise: 1.0, nf: 0.6,
    rampFn: (x, y, z, l) => {
      if (z > 1.5) {
        if (seg2(x, y, 0, 3.6, 0, 2.2) < 0.28 || seg2(Math.abs(x), y, 0, 2.2, 1.3, 3.2) < 0.28) return [R.GRAY, 1 + l * 0.25];
        const e = Math.hypot(Math.abs(x) - 1.5, (y - 0.4) * 1.3);
        if (e < 1.6) return [R.RED, l - (1.6 - e) * 2.2];
      }
      return [R.RED, l + (vnoise(x * 0.25, y * 0.25 + 9, z * 0.25) - 0.5) * 2.6];
    } });

  const stance = () => pose({
    root: { y: -0.4 },
    spine: { pitch: 0.3 },
    head: { pitch: -0.32 },
    arms: { R: { pitch: 0.35, out: 0.3, elbow: 0.9, wrist: 0.3 }, L: { pitch: 0.35, out: 0.3, elbow: 0.9, wrist: 0.3 } },
    legs: { L: { ik: [4.3, 0, 2] }, R: { ik: [-4.3, 0, -1.5] } },
    tail: 0, fire: 0, curl: 0.4,
  });

  function build(s, ps) {
    const J = rigHumanoid(P, ps);
    const H = J.head, C = J.chest, Pv = J.pelvis;
    s.basis = Pv;

    // Torso
    s.ellipsoid(C.moved(0, 1.2, 0), [7.2, 7.0, 5.0], ribs, { tf: C });
    s.ellipsoid(C.moved(0, 5.4, -1.6), [6.4, 2.8, 3.6], skin, { k: 2.5, tf: C });
    s.ellipsoid(Pv.moved(0, 5, 0.6), [5.0, 5.4, 4.0], skin, { k: 3, tf: Pv });
    s.ellipsoid(Pv.moved(0, 0.8, -0.2), [5.6, 3.4, 4.2], skin, { k: 2.5, tf: Pv });
    for (let i = 0; i < 5; i++) { // spinal spikes
      const u = i / 4;
      const base = V.lerp(Pv.point(0, 4, -3.4), C.point(0, 5.5, -4.6), u);
      const dir = V.norm(V.lerp(Pv.dir(0, 0.6, -1), C.dir(0, 0.9, -0.7), u));
      s.limb(base, V.madd(base, dir, 3.2 - Math.abs(u - 0.6) * 1.6), 1.1, 0.12, horn);
    }

    // Tail
    let tb = Pv.point(0, 0.5, -3.6), td = Pv.dir(0, -0.5, -1);
    for (let i = 0; i < 5; i++) {
      const sw = Math.sin(ps.tail + i * 0.7) * 0.5;
      td = V.norm(V.add(td, Pv.dir(sw, 0.25 - i * 0.02, -0.2)));
      const nb = V.madd(tb, td, 4.2);
      s.limb(tb, nb, 1.9 - i * 0.3, 1.6 - i * 0.3, skin, { k: 0.8 });
      tb = nb;
    }
    const spade = Frame.along(tb, td, Pv.y);
    s.ellipsoid(spade.moved(0, 1.4, 0), [2.2, 1.9, 0.5], horn, { tf: spade });

    // Head: ridged skull, angry brow, slit-pupil eyes, nostril slits, a burning grin full of teeth.
    s.limb(J.neck, H.point(0, -1.6, -0.6), 2.4, 2.0, skin, { k: 1.5 });
    s.ellipsoid(H.moved(0, 0.7, -0.4), [4.4, 4.1, 4.6], face, { k: 1.2, tf: H });
    s.ellipsoid(H.moved(0, -0.7, 3.2), [2.3, 1.7, 2.5], face, { k: 1.4, tf: H });          // muzzle
    for (const sd of [1, -1]) s.ellipsoid(H.moved(sd * 2.7, -0.4, 2.6), [1.4, 1.0, 1.3], face, { k: 1.1, tf: H }); // cheekbones
    const jawF = H.movedTo(H.point(0, -1.4, -0.6)).rot(ps.jaw, 0, 0);
    s.ellipsoid(jawF.moved(0, -1.3, 3.2), [2.6, 1.1, 3.0], face, { k: 0.8, tf: H });
    // Grin: carved with a glowing interior, plus the fire inside the throat.
    const grin = [[-2.7, -1.2, 3.4], [-1.3, -1.95, 4.75], [1.3, -1.95, 4.75], [2.7, -1.2, 3.4]].map((q) => H.point(...q));
    for (let i = 0; i < 3; i++) s.limb(grin[i], grin[i + 1], 0.5 + ps.jaw * 0.6, 0.5 + ps.jaw * 0.6, maw, { sub: true, k: 0.3 });
    s.ellipsoid(H.moved(0, -2.0, 3.0), [1.9, 0.5 + ps.jaw * 1.7, 2.3], maw, { after: true });
    for (let i = 0; i < 7; i++) { // upper teeth along the grin
      const u = (i + 0.5) / 7, x = lerp(-2.4, 2.4, u), y = -1.55 - Math.cos((u - 0.5) * Math.PI) * 0.35, z = 4.75 - Math.abs(u - 0.5) * 2.4;
      s.limb(H.point(x, y + 0.15, z - 0.3), H.point(x, y - 0.75, z - 0.15), 0.32, 0.05, claw, { after: true });
      if (i % 2 === 0) s.limb(jawF.point(x * 0.9, -0.55, z + 0.2), jawF.point(x * 0.9, 0.35, z + 0.25), 0.3, 0.05, claw, { after: true });
    }
    // Brow
    for (const sd of [1, -1]) s.limb(H.point(sd * 0.3, 1.3, 4.1), H.point(sd * 3.3, 2.4, 2.9), 1.15, 0.85, face, { k: 0.9, tf: H });
    s.sphere(H.point(0, 2.0, 4.55), 0.42, M.socket, { sub: true });
    for (const sd of [1, -1]) {
      s.sphere(H.point(sd * 1.55, 0.6, 3.75), 1.0, M.socket, { sub: true, k: 0.35 });
      const ec = H.point(sd * 1.5, 0.55, 3.2);
      s.sphere(ec, 0.8, fiendEye, { after: true, tf: H.movedTo(ec) });
      s.limb(H.point(sd * 0.55, -0.15, 5.5), H.point(sd * 0.75, -0.75, 5.3), 0.3, 0.3, M.socket, { sub: true }); // nostril slits
      s.limb(H.point(sd * 1.05, -1.9, 4.75), H.point(sd * 1.0, -3.6 - ps.jaw * 0.6, 4.6), 0.5, 0.1, claw, { after: true }); // fangs
      s.limb(jawF.point(sd * 0.9, -2.0, 4.1), jawF.point(sd * 0.7, -3.2, 3.8), 0.45, 0.1, horn); // chin spikes
      s.limb(H.point(sd * 1.0, 3.6, 2.4), H.point(sd * 1.3, 4.9, 2.6), 0.6, 0.12, horn, { k: 0.4 }); // brow nubs
      const hp = [H.point(sd * 2.4, 2.4, 0.4), H.point(sd * 4.6, 5.2, -1.2), H.point(sd * 5.5, 6.5, -4.3), H.point(sd * 4.9, 5.0, -6.8), H.point(sd * 4.2, 3.0, -6.4)];
      const hr = [1.55, 1.2, 0.9, 0.6, 0.15];
      for (let i = 0; i < 4; i++) s.limb(hp[i], hp[i + 1], hr[i], hr[i + 1], horn, { k: i === 0 ? 0.6 : 0, tf: H.movedTo(hp[0]), toff: i * 2.1 });
      s.limb(H.point(sd * 3.4, 0.8, -0.5), H.point(sd * 6.2, 1.9, -2.4), 0.95, 0.2, skin, { k: 0.6 });
    }

    // Arms with claws; shoulder spikes.
    for (const Sd of ['L', 'R']) {
      const A = J[Sd], sd = A.sd;
      s.sphere(A.sh, 2.8, skin, { k: 2 });
      s.limb(A.sh, A.el, 2.3, 1.8, skin, { k: 1.5 });
      s.limb(A.el, A.wr, 1.9, 1.4, skin, { k: 1.2 });
      for (const [a, b] of [[0, 0], [1.6, -1.4]]) {
        const base = V.add(A.sh, C.dir(sd * (1 + b * 0.3), 2.0 + a * 0.4, -0.5 + b));
        s.limb(base, V.add(base, C.dir(sd * 1.6, 3.4 - a, -1.2)), 1.0, 0.12, horn);
      }
      s.limb(A.el, V.add(A.el, A.upper.dir(0, 0.4, -3.2)), 0.8, 0.1, horn);
      const hf = A.hand;
      s.ellipsoid(hf.moved(0, -1.4, 0.2), [1.7, 1.8, 1.0], skin, { k: 1, tf: hf });
      for (const fx of [-1.1, 0, 1.1]) {
        const b = hf.point(fx, -2.6, 0.4);
        const m = V.add(b, hf.dir(fx * 0.2, -1.8, 0.6 + ps.curl));
        s.limb(b, m, 0.55, 0.42, skin);
        s.limb(m, V.add(m, hf.dir(fx * 0.1, -1.0, 1.4 + ps.curl * 1.5)), 0.42, 0.08, claw);
      }

      s.limb(A.hip, A.knee, 3.0, 2.2, skin, { k: 1.8 });
      s.limb(A.knee, A.ankle, 2.2, 1.5, skin, { k: 1.2 });
      s.limb(A.knee, V.add(A.knee, A.foot.dir(0, 1.2, 2.6)), 0.75, 0.1, horn);
      s.ellipsoid(A.foot.moved(0, -P.ankle + 1.3, 1.6), [2.0, 1.4, 3.2], hoof, { tf: A.foot });
    }

    // Conjured fireball in the right claw.
    const fp = J.R.hand.point(0, -3.4, 2.4);
    if (ps.fire > 0) s.sphere(fp, 0.6 + ps.fire * 3.2, M.fire, { tf: J.R.hand.movedTo(fp) });
    s.point('hand', fp);
    s.point('chest', C.point(0, 1, 4));
    if (ps.pool > 0) s.ellipsoid(Frame.at(ps.poolAt), [ps.pool * 1.15, 0.7, ps.pool], M.blood);
  }

  const act = {};
  act.idle = {
    frames: 6, fps: 6, loop: true,
    pose: (t) => {
      const b = Math.sin(t * TAU), c = Math.cos(t * TAU);
      return merge(stance(), {
        root: { y: -0.4 + 0.5 * b, roll: 0.03 * c },
        spine: { pitch: 0.3 - 0.05 * b, roll: -0.04 * c },
        head: { pitch: -0.32 + 0.06 * b, roll: 0.12 * c, yaw: 0.12 * Math.sin(t * TAU + 1) },
        arms: { R: { elbow: 0.9 + 0.2 * b }, L: { elbow: 0.9 - 0.2 * b } },
        tail: t * TAU, curl: 0.4 + 0.4 * Math.max(0, b), jaw: 0.1 + 0.1 * Math.max(0, -b),
      });
    },
  };
  act.walk = {
    frames: 8, fps: 9, loop: true, travel: 28,
    pose: (t) => {
      const sw = Math.cos(t * TAU), s2 = Math.sin(t * TAU);
      return merge(stance(), {
        root: { y: -1.2 + 1.0 * -Math.cos(t * TAU * 2), roll: 0.05 * s2, yaw: 0.08 * sw },
        spine: { pitch: 0.38, yaw: -0.16 * sw },
        head: { pitch: -0.42, roll: 0.05 * s2 },
        arms: { L: { pitch: -0.6 * sw + 0.25, elbow: 0.8 + 0.4 * Math.max(0, sw) }, R: { pitch: 0.6 * sw + 0.25, elbow: 0.8 + 0.4 * Math.max(0, -sw) } },
        legs: gait(t, { stride: 14, lift: 4.2, width: 3.9 }),
        tail: t * TAU * 2, jaw: 0.15,
      });
    },
  };
  act.attack = {
    frames: 8, fps: 9, loop: false, emit: { frame: 5, fx: 'fireball', point: 'hand' },
    pose: (t, f) => {
      const conjure = merge(stance(), {
        root: { y: 0.4, z: -1.5 },
        spine: { pitch: 0.05, yaw: -0.55, roll: 0.1 },
        head: { pitch: -0.15, yaw: 0.3 },
        arms: { R: { pitch: 2.4, out: 0.6, elbow: 1.7, wrist: 0.4 }, L: { pitch: 0.9, out: 0.4, elbow: 0.5 } },
        legs: { L: { ik: [4.3, 0, 3.5] }, R: { ik: [-4.3, 0, -3.5] } },
        tail: 1.5, jaw: 0.5, curl: 0.9,
      });
      const hurl = merge(stance(), {
        root: { y: -2.2, z: 3 },
        spine: { pitch: 0.55, yaw: 0.5 },
        head: { pitch: -0.55, yaw: -0.15 },
        arms: { R: { pitch: 1.35, out: 0.0, elbow: 0.1, wrist: -0.3 }, L: { pitch: -0.4, out: 0.5, elbow: 0.6 } },
        legs: { L: { ik: [4.3, 0, 8] }, R: { ik: [-4.3, 0, -4] } },
        tail: 3, jaw: 0.9, curl: 0.0,
      });
      const p = poseKeys(t, [[0, stance()], [0.45, conjure], [0.62, hurl], [0.78, hurl], [1, stance()]]);
      p.fire = f >= 5 ? 0 : [0.15, 0.45, 0.75, 1, 1][f];
      return p;
    },
  };
  act.pain = {
    frames: 4, fps: 8, loop: false,
    pose: (t) => {
      const hit = merge(stance(), {
        root: { z: -2, y: -0.6 },
        spine: { pitch: -0.2, roll: 0.2 },
        head: { pitch: -0.8, roll: 0.3 },
        arms: { R: { pitch: 0.9, out: 0.8, elbow: 1.4 }, L: { pitch: 0.9, out: 0.8, elbow: 1.4 } },
        tail: 2.5, jaw: 1.0, curl: 1.0,
      });
      return poseKeys(t, [[0, hit], [0.35, hit], [1, stance()]]);
    },
  };
  act.death = {
    frames: 10, fps: 9, loop: false,
    pose: (t) => {
      const fk = (o) => merge(pose({ tail: 0, fire: 0, curl: 0.4, legs: { L: { pitch: 0, out: 0.1, knee: 0.3 }, R: { pitch: 0, out: 0.1, knee: 0.3 } } }), o);
      const stand = fk({ spine: { pitch: 0.3 }, head: { pitch: -0.32 }, arms: { R: { pitch: 0.35, out: 0.3, elbow: 0.9 }, L: { pitch: 0.35, out: 0.3, elbow: 0.9 } } });
      const shriek = fk({ root: { z: -2 }, spine: { pitch: -0.45 }, head: { pitch: -0.9 },
        arms: { R: { pitch: 1.8, out: 0.5, elbow: 1.5 }, L: { pitch: 1.7, out: 0.55, elbow: 1.6 } }, jaw: 1.1, curl: 1.0, tail: 2 });
      const fall = fk({ root: { y: -14, z: -10, pitch: -0.9 }, spine: { pitch: -0.2 }, head: { pitch: -0.4 },
        arms: { R: { pitch: 1.0, out: 0.9, elbow: 0.9 }, L: { pitch: 0.8, out: 1.0, elbow: 1.0 } }, legs: { L: { pitch: 0.7, knee: 0.6 }, R: { pitch: 0.4, knee: 0.4 } }, jaw: 0.9, tail: 3 });
      const down = fk({ root: { y: -23, z: -14, pitch: -1.52 }, spine: { pitch: 0.05 }, head: { pitch: 0.2, yaw: 0.6 },
        arms: { R: { pitch: 0.2, out: 0.75, elbow: 0.5 }, L: { pitch: -0.1, out: 0.5, elbow: 0.3 } },
        legs: { L: { pitch: 0.55, knee: 1.2, out: 0.25 }, R: { pitch: 0.1, knee: 0.2, out: 0.15 } }, jaw: 0.7, curl: 1.2, tail: 4 });
      const p = poseKeys(t, [[0, stand], [0.2, shriek], [0.45, fall], [0.65, down], [1, down]]);
      p.pool = 11 * span(t, 0.65, 1);
      p.poolAt = [0, 0, -20];
      return p;
    },
  };

  defineCreature({
    id: 'fiend', name: 'Fire Fiend', code: 'FIEN',
    lore: 'Born where the deepest mines broke through into the burning places. It throws fire the way a child throws stones, and enjoys it more.',
    stats: { hp: 70, dmg: '3-24 (fire)', speed: 'Fast' },
    shadow: [12, 8], blood: 'red', height: 56,
    labels: { attack: 'Hurl fire' },
    build, actions: act,
  });
})();
