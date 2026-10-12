'use strict';
// Giant Cave Spider: eight IK legs on an alternating tetrapod gait.
(function () {
  const chitin = mat('BROWN', { amb: 0.06, dif: 0.9, gain: 0.58, bias: -1.2, spec: 0.55, shin: 16, noise: 1.6, nf: 1.1 });
  const hairy = mat('BROWN', { amb: 0.06, dif: 0.85, gain: 0.6, bias: -1.2, spec: 0.15, shin: 8, noise: 2.6, nf: 1.7,
    rampFn: (x, y, z, l) => (Math.sin(y * 0.75) > 0.5 ? [R.RUST, l + 0.5] : [R.GRAY, l - 0.5]) });
  const abdomen = mat('BROWN', { amb: 0.06, dif: 0.92, gain: 0.5, bias: -1.2, spec: 0.35, shin: 10, noise: 2.2, nf: 1.3,
    rampFn: (x, y, z, l) => {
      // Rust-red chevrons down the back, like an arrowhead pointing at the head.
      if (y > 2.5) {
        const k = (z * 0.55 - Math.abs(x) * 0.45 + 40) % 4;
        if (k < 1.3 && Math.abs(x) < 6.5) return [R.RED, l + 4];
      }
      return [R.BROWN, l];
    } });
  const eye = eyeMat('RED', 11, null);
  const fangMat = mat('GRAY', { amb: 0.15, dif: 0.7, spec: 0.8, shin: 20, noise: 0.5, bias: -1 });
  const ichor = mat('OLIVE', { amb: 0.12, dif: 0.6, spec: 0.8, shin: 30, noise: 0.8, bias: 0 });

  // Legs: [hip x, hip z (relative to cephalothorax), rest foot x, rest foot z, tetrapod group]
  const LEGS = [];
  [[1, 0], [-1, 1]].forEach(([sd, g0]) => {
    LEGS.push({ sd, hz: 4.5, fx: 21, fz: 24, g: g0 });
    LEGS.push({ sd, hz: 2, fx: 27, fz: 9, g: 1 - g0 });
    LEGS.push({ sd, hz: -0.8, fx: 27, fz: -7, g: g0 });
    LEGS.push({ sd, hz: -3.4, fx: 21, fz: -22, g: 1 - g0 });
  });
  const L1 = 17, L2 = 21;

  function base() {
    return { y: 14, z: 0, pitch: 0, yaw: 0, roll: 0, fang: 0.2, palp: 0, feet: LEGS.map((l) => [l.sd * l.fx, 0, l.fz]), curl: 0, pool: 0 };
  }

  function build(s, ps) {
    const B = Frame.at([0, ps.y, ps.z]).rot(ps.pitch, ps.yaw, ps.roll);
    s.basis = B;
    const ceph = B.moved(0, 0, 7);
    s.ellipsoid(ceph, [7.2, 5.0, 8.2], chitin, { tf: ceph });
    s.ellipsoid(ceph.moved(0, 2.2, -1), [5.4, 3.0, 6.2], chitin, { k: 2, tf: ceph });
    s.limb(ceph.point(0, 0.5, -7), B.point(0, 2.5, -4), 2.6, 2.6, chitin, { k: 1.5 });
    const abd = B.moved(0, 4.5, -13).rot(-0.28, 0, 0);
    s.ellipsoid(abd, [10.5, 9.0, 13], abdomen, { tf: abd });
    s.limb(abd.point(0, -3, -12), abd.point(0, -4.5, -14), 1.8, 0.8, chitin); // spinnerets

    // Eyes: two big, six small, all burning red.
    for (const [x, y, z, r] of [[1.55, 2.5, 7.3, 1.0], [-1.55, 2.5, 7.3, 1.0], [3.3, 2.8, 5.7, 0.7], [-3.3, 2.8, 5.7, 0.7],
      [1.9, 4.1, 5.6, 0.55], [-1.9, 4.1, 5.6, 0.55], [4.1, 1.8, 4.2, 0.55], [-4.1, 1.8, 4.2, 0.55]]) {
      const ep = ceph.point(x, y, z);
      s.sphere(V.add(ep, ceph.dir(0, 0, 0.25)), r + 0.4, M.socket, { sub: true }); // dark pit around each eye
      s.sphere(ep, r, eye, { after: true, tf: ceph.movedTo(ep) });
    }

    // Chelicerae and fangs
    for (const sd of [1, -1]) {
      const cb = ceph.point(sd * 2.3, -1.6, 7.4);
      const ct = ceph.point(sd * (2.4 + ps.fang * 1.2), -4.6, 9.2);
      s.limb(cb, ct, 2.3, 1.7, chitin, { k: 1 });
      const tip = V.add(ct, ceph.dir(-sd * (1.4 - ps.fang * 1.6), -2.4 + ps.fang, 1.2 + ps.fang));
      s.limb(ct, tip, 0.9, 0.12, fangMat, { after: true });
      // Pedipalps
      const pb = ceph.point(sd * 3.6, -1.6, 6.6);
      const pm = V.add(pb, ceph.dir(sd * 2.2, 2.6 + ps.palp * 2, 3.2));
      const pt = V.add(pm, ceph.dir(sd * 0.6, -4.6 - ps.palp, 2.2 + ps.palp * 2));
      s.limb(pb, pm, 1.2, 1.0, hairy);
      s.limb(pm, pt, 1.0, 0.8, hairy);
    }

    // Legs: two-bone IK from the hip to the foot with the knee raised high.
    LEGS.forEach((l, i) => {
      const hip = ceph.point(l.sd * 5.6, 0.6, l.hz);
      const foot = ps.feet[i];
      const out = V.norm([foot[0] - hip[0], 0, foot[2] - hip[2]]);
      const pole = V.add([0, 1.6 + ps.curl * 1.5, 0], V.scale(out, 0.4 - ps.curl * 0.8));
      const { mid: knee, end } = ik2(hip, foot, L1, L2, pole);
      // Slight kink partway down the lower leg (the metatarsus joint).
      const kd = V.sub(end, knee);
      const kink = V.add(V.madd(knee, kd, 0.62), V.scale(out, 1.4 + ps.curl * 1.5));
      s.sphere(hip, 2.0, chitin, { k: 1 });
      s.limb(hip, knee, 2.0, 1.55, hairy, { k: 0.6 });
      s.sphere(knee, 1.65, chitin);
      s.limb(knee, kink, 1.45, 1.05, hairy);
      s.limb(kink, end, 1.0, 0.45, hairy);
    });

    s.point('chest', ceph.point(0, 2, 9));
    if (ps.pool > 0) s.ellipsoid(Frame.at([0, 0, 2]), [ps.pool * 1.25, 0.7, ps.pool], ichor);
  }

  // Tetrapod gait: legs in group 0 step while group 1 pushes, then swap.
  function walkFeet(t, stride, lift) {
    return LEGS.map((l) => {
      const ph = (t + l.g * 0.5) % 1;
      let dz, y;
      if (ph < 0.5) { const s = ph / 0.5; dz = stride / 2 - stride * s; y = 0; }
      else { const s = (ph - 0.5) / 0.5; dz = -stride / 2 + stride * smooth(s); y = lift * Math.sin(Math.PI * s); }
      return [l.sd * l.fx, y, l.fz + dz];
    });
  }

  const act = {};
  act.idle = {
    frames: 6, fps: 5, loop: true,
    pose: (t, f) => {
      const p = base();
      p.y = 14 + 0.6 * Math.sin(t * TAU);
      p.pitch = 0.03 * Math.sin(t * TAU);
      p.palp = 0.5 * Math.max(0, Math.sin(t * TAU * 2));
      p.fang = 0.2 + 0.3 * Math.max(0, Math.sin(t * TAU + 1));
      // One front leg taps the floor.
      if (f === 2 || f === 3) p.feet[0] = [p.feet[0][0], f === 2 ? 5 : 2, p.feet[0][2] + 1];
      return p;
    },
  };
  act.walk = {
    frames: 8, fps: 10, loop: true, travel: 26,
    pose: (t) => {
      const p = base();
      p.feet = walkFeet(t, 13, 6);
      p.y = 14 + 0.9 * Math.cos(t * TAU * 2);
      p.yaw = 0.05 * Math.sin(t * TAU);
      p.roll = 0.04 * Math.sin(t * TAU);
      p.palp = 0.4 * Math.sin(t * TAU * 2);
      return p;
    },
  };
  act.attack = {
    frames: 8, fps: 10, loop: false,
    pose: (t) => {
      const rear = easeOut(span(t, 0, 0.45)) * (1 - span(t, 0.48, 0.62));
      const lunge = span(t, 0.45, 0.62) * (1 - span(t, 0.75, 1));
      const p = base();
      p.pitch = -0.55 * rear + 0.18 * lunge;
      p.y = 14 + 5 * rear - 2.5 * lunge;
      p.z = -3 * rear + 7 * lunge;
      p.fang = 0.2 + 1.2 * rear - 0.4 * lunge;
      p.palp = 1.2 * rear;
      p.feet = LEGS.map((l, i) => {
        const f = [l.sd * l.fx, 0, l.fz];
        if (i === 0 || i === 4) return [l.sd * (l.fx - 6 * rear), 24 * rear, l.fz + 6 * rear + 12 * lunge];
        if (i === 1 || i === 5) return [f[0], 6 * rear, f[2] + 4 * lunge];
        return [f[0], 0, f[2] + 2 * lunge];
      });
      return p;
    },
  };
  act.pain = {
    frames: 4, fps: 8, loop: false,
    pose: (t, f) => {
      const k = [1, 0.8, 0.4, 0][f];
      const p = base();
      p.pitch = -0.2 * k; p.z = -3 * k; p.y = 14 + 2 * k; p.roll = 0.12 * k;
      p.fang = 0.2 + 0.8 * k; p.palp = k;
      p.feet = LEGS.map((l) => [l.sd * (l.fx - 5 * k), 3 * k * (l.g ? 1 : 0.3), l.fz * (1 - 0.15 * k)]);
      return p;
    },
  };
  act.death = {
    frames: 10, fps: 8, loop: false,
    pose: (t) => {
      const c = easeIn(span(t, 0.1, 0.7));
      const p = base();
      p.y = lerp(14, 6.5, c) + 3 * (1 - span(t, 0, 0.15)) * span(t, 0, 0.08);
      p.pitch = -0.25 * (1 - span(t, 0.1, 0.5)) + 0.12 * c;
      p.roll = 0.15 * c;
      p.fang = lerp(1.2, 0.6, c);
      p.palp = 0.6;
      p.curl = c;
      p.feet = LEGS.map((l) => {
        const rx = l.sd * l.fx, rz = l.fz;
        return [lerp(rx, l.sd * 7, c), lerp(0, 10, c), lerp(rz, rz * 0.25 + 5, c)];
      });
      p.pool = 14 * span(t, 0.65, 1);
      return p;
    },
  };

  defineCreature({
    id: 'spider', name: 'Giant Cave Spider', code: 'SPID',
    lore: 'Grows fat on the rats of the lower galleries and on anything slow enough to follow them. Its eight red eyes are the last light many delvers see.',
    stats: { hp: 80, dmg: '2-16 + poison', speed: 'Very fast' },
    shadow: [24, 20], blood: 'ichor', height: 26,
    labels: { walk: 'Skitter', attack: 'Bite' },
    build, actions: act,
  });
})();
