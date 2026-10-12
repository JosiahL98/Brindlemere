'use strict';
// Skeleton Warrior: animated bones with a rust-eaten sword. Falls apart into a pile when slain.
(function () {
  const P = { thigh: 14, shin: 13.5, ankle: 2.2, foot: 4.5, hipW: 3.4, crouch: 1.2,
    spine: 11, shY: 4.5, shW: 7.5, neckY: 7, headY: 4.5, upper: 11, fore: 10 };

  const teeth = teethMat(0.95, 0.5);
  const eye = mat('RED', { emissive: true, glow: 13, noise: 0.6, nf: 2, edge: 0 });
  // Bone with hairline cracks running down from the crown.
  const cranium = mat('BONE', { amb: 0.2, dif: 0.92, noise: 1.0, nf: 0.6, spec: 0.08, shin: 6,
    pattern: (x, y, z) => {
      if (z < 0.5) return 0;
      const crack = Math.min(seg2(x, y, 0.6, 5.2, 1.4, 3.6), seg2(x, y, 1.4, 3.6, 1.0, 2.3), seg2(x, y, 1.4, 3.6, 2.6, 3.1),
        seg2(x, y, -2.2, 4.6, -1.6, 3.3));
      return crack < 0.3 ? -5 : 0;
    } });
  const blade = mat('STEEL', { amb: 0.14, dif: 0.8, spec: 0.8, shin: 18, noise: 0.7, nf: 0.6, edge: 1,
    rampFn: (x, y, z, l) => (vnoise(x * 0.4 + 3, y * 0.3, z * 0.4) > 0.6 ? [R.RUST, l - 0.5] : [R.STEEL, l + 0.5]) });

  const stance = () => pose({
    root: { y: -0.6 },
    spine: { pitch: 0.12 },
    head: { pitch: -0.1 },
    arms: { R: { pitch: 0.35, out: 0.2, elbow: 1.25, wrist: -0.45 }, L: { pitch: 0.12, out: 0.3, elbow: 0.55 } },
    legs: { L: { ik: [4, 0, 2.5] }, R: { ik: [-4, 0, -2] } },
  });

  function build(s, ps) {
    const J = rigHumanoid(P, ps);
    const H = J.head, C = J.chest, Pv = J.pelvis;
    s.basis = Pv;

    const grip = J.R.hand.point(0, -1.4, 0);
    const parts = {
      skull: { c: H.o, rest: 4.4, delay: 0.14, dur: 0.6, pitch: 0.5, yaw: 0.9, ox: 5, oz: 3, bounce: 2.5 },
      ribs: { c: C.o, rest: 3.4, delay: 0.08, dur: 0.6, pitch: -1.45, yaw: 0.3, ox: -1, oz: -3 },
      pelvis: { c: Pv.o, rest: 2.2, delay: 0.04, dur: 0.55, pitch: -1.1, yaw: -0.4, ox: 0.5, oz: -1 },
      uaL: { c: V.lerp(J.L.sh, J.L.el, 0.5), rest: 1.2, delay: 0.12, dur: 0.5, pitch: 1.5, yaw: 0.7, ox: 4, oz: 0 },
      faL: { c: V.lerp(J.L.el, J.L.wr, 0.5), rest: 0.9, delay: 0.16, dur: 0.5, pitch: -1.4, yaw: -0.5, ox: 6, oz: 2 },
      uaR: { c: V.lerp(J.R.sh, J.R.el, 0.5), rest: 1.2, delay: 0.1, dur: 0.5, pitch: 1.6, yaw: -1.0, ox: -5, oz: 1 },
      faR: { c: V.lerp(J.R.el, J.R.wr, 0.5), rest: 0.9, delay: 0.13, dur: 0.5, pitch: 1.3, yaw: 0.6, ox: -7, oz: 3 },
      thL: { c: V.lerp(J.L.hip, J.L.knee, 0.5), rest: 1.4, delay: 0, dur: 0.48, pitch: 1.5, yaw: 0.3, ox: 3, oz: 2 },
      shL: { c: V.lerp(J.L.knee, J.L.ankle, 0.5), rest: 1.2, delay: 0, dur: 0.42, pitch: -1.5, yaw: 1.2, ox: 4, oz: 4 },
      thR: { c: V.lerp(J.R.hip, J.R.knee, 0.5), rest: 1.4, delay: 0.02, dur: 0.48, pitch: -1.5, yaw: -0.4, ox: -3, oz: 1 },
      shR: { c: V.lerp(J.R.knee, J.R.ankle, 0.5), rest: 1.2, delay: 0, dur: 0.42, pitch: 1.5, yaw: -1.3, ox: -5, oz: 3 },
      sword: { c: grip, rest: 0.6, delay: 0.06, dur: 0.4, pitch: 1.2, yaw: 0.8, ox: -6, oz: 7, bounce: 1.2 },
    };
    const K = collapser(parts, ps.collapse || 0);
    const pt = K.pt, fr = K.fr;

    // Skull: cranium with cracks, brow ridge, sunken temples, deep sockets with pinpoint glows,
    // a heart-shaped nasal cavity and two rows of teeth.
    const Hf = fr('skull', H);
    s.ellipsoid(Hf.moved(0, 0.9, -0.5), [4.2, 4.3, 4.7], cranium, { tf: Hf });
    s.ellipsoid(Hf.moved(0, -1.5, 1.7), [3.4, 2.6, 2.8], cranium, { k: 1.6, tf: Hf });
    s.limb(Hf.point(-3, -0.6, 1.2), Hf.point(3, -0.6, 1.2), 1.1, 1.1, cranium, { k: 1.2, tf: Hf }); // cheekbones
    s.limb(Hf.point(-2.7, 1.15, 3.35), Hf.point(2.7, 1.15, 3.35), 0.75, 0.75, cranium, { k: 0.7, tf: Hf }); // brow ridge
    for (const sd of [1, -1]) {
      s.sphere(Hf.point(sd * 3.9, 0.4, 1.2), 1.2, M.boneDark, { sub: true, k: 0.9 });                 // temples
      s.sphere(Hf.point(sd * 1.8, -0.15, 4.0), 1.28, M.socket, { sub: true, k: 0.4 });
      s.sphere(Hf.point(sd * 1.7, -0.3, 2.95), 0.48, eye, { after: true });
      s.sphere(Hf.point(sd * 0.32, -2.15, 4.45), 0.45, M.socket, { sub: true });                        // nasal cavity
    }
    s.limb(Hf.point(0, -1.95, 4.6), Hf.point(0, -2.75, 4.3), 0.38, 0.2, M.socket, { sub: true });
    s.box(Hf.moved(0, -3.2, 2.9), [2.3, 0.65, 0.9], 0.4, teeth, { tf: Hf });
    const jawF = Hf.movedTo(Hf.point(0, -2.4, -0.6)).rot(ps.jaw, 0, 0);
    s.box(jawF.moved(0, -1.7, 2.7), [2.5, 0.9, 2.0], 0.8, M.bone, { tf: jawF });
    s.box(jawF.moved(0, -0.85, 3.3), [2.1, 0.5, 0.8], 0.3, teeth, { tf: jawF });
    for (const sd of [1, -1]) s.limb(jawF.point(sd * 2.6, 0.2, 0), jawF.point(sd * 2.3, -1.8, 1.6), 0.7, 0.7, M.bone);

    // Spine, ribs, collarbones
    const Cf = fr('ribs', C);
    const neckTop = pt('skull', H.point(0, -3.2, -1.2));
    s.limb(pt('ribs', J.neck), neckTop, 1.0, 0.9, M.bone);
    const spinePts = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      spinePts.push(V.lerp(Pv.point(0, 1.5, -1.6), C.point(0, 3.5, -3.0), u));
    }
    spinePts.forEach((p, i) => s.sphere(pt(i < 2 ? 'pelvis' : 'ribs', p), i % 2 ? 1.05 : 1.25, M.bone));
    const ribY = [3.0, 1.0, -1.0, -2.9];
    ribY.forEach((y, r) => {
      for (const sd of [1, -1]) {
        const back = Cf.point(sd * 1.0, y + 0.9, -3.3);
        const side = Cf.point(sd * (5.3 - Math.abs(r - 1) * 0.35), y, -0.5);
        const front = r < 3 ? Cf.point(sd * 2.2, y - 1.3, 3.1) : Cf.point(sd * 3.6, y - 0.8, 1.8);
        s.limb(back, side, 0.72, 0.72, M.bone);
        s.limb(side, front, 0.72, 0.62, M.bone);
      }
    });
    s.limb(Cf.point(0, 3.8, 3.4), Cf.point(0, -1.4, 3.1), 0.85, 0.7, M.bone);
    for (const sd of [1, -1]) {
      const Sd = sd === 1 ? 'L' : 'R';
      s.limb(Cf.point(sd * 0.8, 4.4, 3.2), pt('ribs', J[Sd].sh), 0.7, 0.75, M.bone);
    }

    // Pelvis
    const Pf = fr('pelvis', Pv);
    s.ellipsoid(Pf.moved(0, 0.9, -0.2), [4.6, 2.7, 2.5], M.bone, { tf: Pf });
    s.sphere(Pf.point(0, 1.6, 0.8), 2.3, M.socket, { sub: true, k: 0.6 });

    // Limbs
    for (const Sd of ['L', 'R']) {
      const A = J[Sd], sd = A.sd;
      const ua = 'ua' + Sd, fa = 'fa' + Sd, th = 'th' + Sd, sh = 'sh' + Sd;
      s.sphere(pt(ua, A.sh), 1.6, M.bone);
      s.limb(pt(ua, A.sh), pt(ua, A.el), 1.1, 0.95, M.bone);
      s.sphere(pt(ua, A.el), 1.3, M.bone);
      const fx = A.fore.x;
      s.limb(pt(fa, V.madd(A.el, fx, 0.45)), pt(fa, V.madd(A.wr, fx, 0.5)), 0.7, 0.6, M.bone);
      s.limb(pt(fa, V.madd(A.el, fx, -0.45)), pt(fa, V.madd(A.wr, fx, -0.3)), 0.62, 0.55, M.bone);
      const hf = fr(fa, A.hand);
      s.box(hf.moved(0, -1.2, 0), [1.3, 1.3, 0.75], 0.5, M.bone);
      if (Sd === 'L') {
        for (const fxo of [-0.8, 0, 0.8]) s.limb(hf.point(fxo, -2.2, 0.2), hf.point(fxo, -3.9, 0.9), 0.42, 0.38, M.bone);
      } else {
        s.limb(hf.point(-1.2, -1.4, 0.6), hf.point(1.2, -1.4, 0.6), 0.75, 0.75, M.bone); // fingers wrapped on the grip
      }

      s.sphere(pt(th, A.hip), 1.5, M.bone);
      s.limb(pt(th, A.hip), pt(th, A.knee), 1.35, 1.1, M.bone);
      s.sphere(pt(sh, A.knee), 1.55, M.bone);
      s.limb(pt(sh, A.knee), pt(sh, A.ankle), 1.1, 0.8, M.bone);
      s.limb(pt(sh, V.madd(A.knee, A.foot.x, sd * 1.0)), pt(sh, V.madd(A.ankle, A.foot.x, sd * 0.7)), 0.5, 0.5, M.bone);
      s.sphere(pt(sh, A.ankle), 1.05, M.bone);
      s.limb(pt(sh, A.heel), pt(sh, A.foot.point(0, -P.ankle + 0.7, 2.2)), 0.9, 0.75, M.bone);
      for (const tx of [-0.9, 0, 0.9]) s.limb(pt(sh, A.foot.point(tx * 0.6, -P.ankle + 0.7, 2.0)), pt(sh, A.foot.point(tx, -P.ankle + 0.5, P.foot)), 0.45, 0.45, M.bone);
    }

    // Rusty arming sword in the right hand.
    const hR = J.R.hand;
    const bd = hR.dir(0, 0, 1);
    const at = (d) => pt('sword', V.madd(grip, bd, d));
    const sw = fr('sword', Frame.along(grip, bd, hR.y));
    const swAt = (d) => sw.movedTo(at(d));
    s.sphere(at(-3.0), 0.95, M.rust);
    s.limb(at(-2.6), at(1.2), 0.6, 0.6, M.leather);
    s.box(swAt(1.6), [3.3, 0.55, 0.65], 0.3, M.rust);
    s.box(swAt(11.2), [1.35, 9.3, 0.5], 0.25, blade);
    s.point('hand', grip);
  }

  const act = {};
  act.idle = {
    frames: 6, fps: 5, loop: true,
    pose: (t) => {
      const w = Math.sin(t * TAU);
      return merge(stance(), {
        root: { y: -0.6 + 0.25 * Math.cos(t * TAU * 2) },
        spine: { roll: 0.035 * w, yaw: 0.05 * w },
        head: { yaw: 0.22 * Math.sin(t * TAU + 0.6), roll: -0.05 * w },
        arms: { R: { pitch: 0.35 + 0.05 * w }, L: { elbow: 0.55 + 0.1 * w } },
        jaw: 0.28 * Math.max(0, Math.sin(t * TAU * 2 - 0.5)),
      });
    },
  };
  act.walk = {
    frames: 8, fps: 8, loop: true, travel: 26,
    pose: (t) => {
      const sw = Math.cos(t * TAU), s2 = Math.sin(t * TAU);
      return pose({
        root: { y: -1.1 + 0.9 * -Math.cos(t * TAU * 2), roll: 0.05 * s2, yaw: 0.07 * sw },
        spine: { pitch: 0.2, yaw: -0.14 * sw, roll: -0.03 * s2 },
        head: { pitch: -0.14, roll: 0.07 * s2, yaw: 0.06 * sw },
        arms: {
          L: { pitch: -0.5 * sw + 0.1, out: 0.22, elbow: 0.35 + 0.35 * Math.max(0, -sw) },
          R: { pitch: 0.4 + 0.22 * sw, out: 0.22, elbow: 1.15, wrist: -0.4 },
        },
        legs: gait(t, { stride: 13, lift: 4, width: 3.7 }),
        jaw: 0.15 * Math.max(0, s2),
      });
    },
  };
  act.attack = {
    frames: 8, fps: 10, loop: false,
    pose: (t) => {
      const wind = merge(stance(), {
        root: { y: -0.4, z: -1 },
        spine: { pitch: -0.18, yaw: -0.55, roll: 0.06 },
        head: { pitch: -0.05, yaw: 0.35 },
        arms: { R: { pitch: 2.75, out: 0.35, elbow: 1.55, wrist: 0.3 }, L: { pitch: 0.7, out: 0.55, elbow: 0.6 } },
        legs: { L: { ik: [4, 0, 1.5] }, R: { ik: [-4.2, 0, -3] } },
        jaw: 0.45,
      });
      const strike = merge(stance(), {
        root: { y: -2.6, z: 2.5 },
        spine: { pitch: 0.5, yaw: 0.4, roll: -0.05 },
        head: { pitch: -0.3, yaw: -0.2 },
        arms: { R: { pitch: 0.55, out: 0.0, elbow: 0.15, wrist: -0.15 }, L: { pitch: -0.4, out: 0.45, elbow: 0.3 } },
        legs: { L: { ik: [4, 0, 8.5] }, R: { ik: [-4, 0, -4] } },
        jaw: 0.1,
      });
      return poseKeys(t, [[0, stance()], [0.38, wind], [0.55, strike], [0.72, strike], [1, stance()]]);
    },
  };
  act.pain = {
    frames: 4, fps: 8, loop: false,
    pose: (t) => {
      const hit = merge(stance(), {
        root: { z: -1.8, y: -0.4, roll: 0.1 },
        spine: { pitch: -0.35, roll: 0.16, yaw: 0.2 },
        head: { pitch: -0.5, yaw: 0.35, roll: 0.2 },
        arms: { R: { pitch: 0.9, out: 0.55, elbow: 0.7 }, L: { pitch: -0.2, out: 0.9, elbow: 0.7 } },
        jaw: 0.5,
      });
      return poseKeys(t, [[0, hit], [0.4, hit], [1, stance()]]);
    },
  };
  act.death = {
    frames: 10, fps: 9, loop: false,
    pose: (t) => {
      const hit = merge(stance(), {
        root: { z: -1.5, roll: -0.08 },
        spine: { pitch: -0.4, roll: -0.15 },
        head: { pitch: -0.6, yaw: -0.3 },
        arms: { R: { pitch: 1.1, out: 0.7, elbow: 0.4 }, L: { pitch: 0.3, out: 1.0, elbow: 0.8 } },
        jaw: 0.7,
      });
      const p = poseKeys(t, [[0, stance()], [0.12, hit], [1, hit]]);
      p.collapse = span(t, 0.1, 1);
      return p;
    },
  };

  defineCreature({
    id: 'skeleton', name: 'Skeleton Warrior', code: 'SKEL',
    lore: 'Bones of a fallen legionnaire, bound by necromancy to guard the deep halls. Its blade is more rust than steel, which is no comfort to the wounded.',
    stats: { hp: 45, dmg: '1-8', speed: 'Average' },
    build, actions: act,
  });
})();
