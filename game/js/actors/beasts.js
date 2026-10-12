'use strict';
// Creatures of the outskirts: wolves, giant rats, mudcrabs, and a cat called Mittens.
// Four-legged animals share a rig with leg IK (digitigrade hind legs).

const BEASTS = {};

// Quadruped rig. P: proportions; ps: pose.
//   ps.root {x,y,z,pitch,yaw,roll}, ps.spine (arch), ps.neck {lift, yaw}, ps.head {pitch, yaw, roll},
//   ps.legs {FL, FR, BL, BR: [dx, lift, dz]} offsets from the rest stance, ps.jaw, ps.tail {lift, sway},
//   ps.limp: legs follow the body (for falling over) instead of planting on the ground.
function rigQuad(P, ps) {
  const r = ps.root;
  const G = Frame.at([r.x, 0, r.z]).rot(0, r.yaw, 0);
  const body = Frame.at([r.x, P.h + r.y, r.z]).rot(r.pitch, r.yaw, r.roll);
  const sp = ps.spine || 0;
  const chest = body.rot(sp, 0, 0).moved(0, 0, P.len * 0.5);
  const hips = body.rot(-sp, 0, 0).moved(0, 0, -P.len * 0.5);
  const neckBase = chest.point(0, P.neckUp, P.neckFwd);
  const neckF = chest.movedTo(neckBase).rot(-(P.neckLift + (ps.neck.lift || 0)), ps.neck.yaw || 0, 0);
  const headC = neckF.point(0, 0, P.neckLen);
  const head = neckF.movedTo(headC).rot((P.neckLift + (ps.neck.lift || 0)) * 0.8 + (ps.head.pitch || 0), ps.head.yaw || 0, ps.head.roll || 0);
  const J = { G, body, chest, hips, neckBase, head, legs: {} };
  const ref = ps.limp ? body.moved(0, -P.h, 0) : G;
  for (const name of ['FL', 'FR', 'BL', 'BR']) {
    const sd = name[1] === 'L' ? 1 : -1, front = name[0] === 'F';
    const o = ps.legs[name] || [0, 0, 0];
    const paw = ref.point(sd * P.footW + o[0], o[1] + P.pawH, (front ? P.len * 0.5 + P.footFwd : -P.len * 0.5 - P.footBack) + o[2]);
    if (front) {
      const sh = chest.point(sd * P.shW, -P.shDown, 0);
      const { mid, end } = ik2(sh, paw, P.fUp, P.fLow, ref.dir(0, 0.1, -1));
      J.legs[name] = { root: sh, mid, end, sd, front };
    } else {
      const hip = hips.point(sd * P.hipW, -P.hipDown, 0);
      const lift = o[1] > 0 ? o[1] * 0.06 : 0;
      const hock = V.add(paw, ref.dir(0, P.meta * Math.cos(0.45 + lift), -P.meta * Math.sin(0.45 + lift)));
      const { mid, end } = ik2(hip, hock, P.bUp, P.bLow, ref.dir(0, -0.1, 1));
      J.legs[name] = { root: hip, mid, end, paw, sd, front };
    }
  }
  return J;
}
// Trot: diagonal pairs (FL+BR, FR+BL) swing together.
function trot(t, stride, lift) {
  const legs = {};
  for (const [name, ph0] of [['FL', 0], ['BR', 0], ['FR', 0.5], ['BL', 0.5]]) {
    const ph = (t + ph0) % 1;
    let z, y;
    if (ph < 0.5) { const s = ph / 0.5; z = stride / 2 - stride * s; y = 0; }
    else { const s = (ph - 0.5) / 0.5; z = -stride / 2 + stride * smooth(s); y = lift * Math.sin(Math.PI * s); }
    legs[name] = [0, y, z];
  }
  return legs;
}
function quadPose(o) {
  return merge({ root: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 }, spine: 0, neck: { lift: 0, yaw: 0 }, head: { pitch: 0, yaw: 0, roll: 0 },
    legs: { FL: [0, 0, 0], FR: [0, 0, 0], BL: [0, 0, 0], BR: [0, 0, 0] }, jaw: 0, tail: { lift: 0, sway: 0 }, ear: 0 }, o || {});
}
function drawLegs(s, J, P, m, pawM) {
  for (const name of ['FL', 'FR', 'BL', 'BR']) {
    const L = J.legs[name];
    const r0 = L.front ? P.legR[0] : P.legR[0] * 1.15;
    s.limb(L.root, L.mid, r0, P.legR[1], m, { k: 1.5 });
    s.limb(L.mid, L.end, P.legR[1], P.legR[2], m, { k: 0.8 });
    if (!L.front) s.limb(L.end, L.paw, P.legR[2], P.legR[2] * 0.9, m, { k: 0.5 });
    const pw = L.front ? L.end : L.paw;
    s.ellipsoid(Frame.at(V.add(pw, [0, -P.pawH * 0.4, 0])).rot(0, J.G === undefined ? 0 : 0, 0), [P.legR[2] * 1.2, P.pawH * 0.7, P.legR[2] * 1.6], pawM || m);
  }
}

// ---- Wolf ------------------------------------------------------------------------------------
(function () {
  const P = { h: 22, len: 24, neckUp: 3, neckFwd: 3, neckLift: 0.55, neckLen: 9, shW: 3.8, shDown: 3, hipW: 3.6, hipDown: 2,
    footW: 3.6, footFwd: 1, footBack: 1, pawH: 1.4, fUp: 10, fLow: 11, bUp: 10, bLow: 9.5, meta: 6.5, legR: [3.3, 2.1, 1.5] };
  // Grey-brown pelt: a dark saddle, tawny flanks, pale belly, and streaky guard hairs.
  const fur = mat('GRAY', { amb: 0.12, dif: 0.9, gain: 0.85, bias: -0.6, noise: 1.8, nf: 1.1,
    rampFn: (x, y, z, l) => {
      const streak = Math.sin(z * 1.3 + y * 0.9 + vnoise(x, y, z) * 3) * 0.8;
      if (y > 3 + vnoise(x * 0.4, z * 0.3, 1) * 2) return [R.GRAY, l - 3.2 + streak];
      if (y < -4.5) return [R.STONE, l + 0.5];
      return [vnoise(x * 0.3 + 4, y * 0.3, z * 0.3) > 0.55 ? R.STONE : R.GRAY, l + streak];
    } });
  const furHead = mat('GRAY', { amb: 0.14, dif: 0.9, bias: -0.4, noise: 1.6, nf: 1.2,
    rampFn: (x, y, z, l) => (y < -1.6 || (z > 4 && y < -0.5) ? [R.BONE, l] : y > 2.6 ? [R.GRAY, l - 2.5] : [R.GRAY, l]) });
  const nose = mat('GRAY', { amb: 0.05, dif: 0.6, spec: 1.2, shin: 20, bias: -7, noise: 0.3 });
  const eye = eyeMat('GOLD', 11, 'round', 0.9);
  const teeth = mat('BONE', { amb: 0.3, dif: 0.8, bias: 2, noise: 0.4 });
  const mouth = mat('RED', { amb: 0.05, dif: 0.4, bias: -4, edge: 0 });

  function build(s, ps) {
    const J = rigQuad(P, ps);
    const { body, chest, hips, head: H } = J;
    s.basis = body;
    s.ellipsoid(chest.moved(0, 0.5, -3), [7.4, 9.2, 9.5], fur, { tf: body, k: 3 });
    s.ellipsoid(body.moved(0, 1.4, -1), [6.2, 7.2, 11], fur, { tf: body, k: 4 });
    s.ellipsoid(hips.moved(0, 1.2, 2), [6.4, 7.6, 7.5], fur, { tf: body, k: 4 });
    // Neck and ruff
    s.limb(chest.point(0, 2, 2), J.head.point(0, -1, -2.5), 5.6, 4.2, fur, { k: 3, tf: body });
    for (const sd of [1, -1]) s.sphere(V.add(J.neckBase, chest.dir(sd * 3.2, 1.2, 1)), 3.6, fur, { k: 3, tf: body });
    // Head
    s.ellipsoid(H.moved(0, 0.6, -0.5), [4.1, 3.8, 4.6], furHead, { k: 1.2, tf: H });
    s.limb(H.point(0, -0.6, 2.4), H.point(0, -1.4, 9.2), 2.6, 1.35, furHead, { k: 1.2, tf: H });
    s.sphere(H.point(0, -1.0, 9.6), 1.1, nose, { after: true });
    const jawF = H.movedTo(H.point(0, -2.2, 2)).rot(ps.jaw, 0, 0);
    s.limb(jawF.point(0, -0.4, 0), jawF.point(0, -0.9, 6.6), 1.7, 0.9, furHead, { k: 0.8, tf: H });
    if (ps.jaw > 0.12) {
      s.limb(H.point(0, -2.1, 3), H.point(0, -2.4, 8.4), 1.3, 0.8, mouth, { after: true });
      for (const sd of [1, -1]) {
        s.limb(H.point(sd * 0.9, -2.1, 7.8), H.point(sd * 0.9, -3.3, 7.7), 0.38, 0.1, teeth, { after: true });
        s.limb(jawF.point(sd * 0.8, -0.3, 5.6), jawF.point(sd * 0.8, 0.8, 5.6), 0.34, 0.1, teeth, { after: true });
      }
    }
    for (const sd of [1, -1]) {
      s.limb(H.point(sd * 2.3, 2.6, -1), H.point(sd * 2.9, 7.0 - ps.ear * 2, -2.4 - ps.ear * 2), 1.7, 0.3, furHead, { k: 0.6, tf: H });
      s.sphere(H.point(sd * 1.65, 1.0, 3.4), 0.7, M.socket, { sub: true });
      const ec = H.point(sd * 1.6, 0.95, 3.0);
      s.sphere(ec, 0.62, eye, { after: true, tf: H.movedTo(ec) });
    }
    drawLegs(s, J, P, fur);
    // Bushy tail
    let tp = hips.point(0, 2.4, -6), td = hips.dir(0, 0.2 + ps.tail.lift, -1);
    for (let i = 0; i < 4; i++) {
      td = V.norm(V.add(td, hips.dir(Math.sin(ps.tail.sway + i * 0.8) * 0.3, -0.35, 0)));
      const np = V.madd(tp, td, 4.2);
      const rr = [2.0, 2.8, 2.9, 2.2][i];
      s.limb(tp, np, rr, rr * 0.9, i === 3 ? mat('GRAY', { amb: 0.12, bias: -4.5, noise: 2 }) : fur, { k: 1.5, tf: body });
      tp = np;
    }
    s.point('chest', chest.point(0, 2, 6));
    if (ps.pool > 0) s.ellipsoid(Frame.at([0, 0, 0]), [ps.pool * 1.2, 0.7, ps.pool], M.blood);
  }

  const idle = (t) => quadPose({ root: { y: 0.4 * Math.sin(t * TAU) }, neck: { lift: 0.1 * Math.sin(t * TAU * 2), yaw: 0.3 * Math.sin(t * TAU) }, head: { roll: 0.1 * Math.sin(t * TAU) },
    tail: { lift: -0.3, sway: t * TAU }, ear: 0 });
  BEASTS.wolf = {
    id: 'wolf', res: 1, height: 36, shadow: [16, 11],
    build: (s, ps) => build(s, ps),
    actions: {
      idle: { frames: 6, fps: 5, loop: true, pose: idle },
      walk: { frames: 8, fps: 10, loop: true, travel: 30,
        pose: (t) => quadPose({ root: { y: -0.8 + 0.8 * Math.cos(t * TAU * 2), pitch: 0.03 * Math.sin(t * TAU * 2) }, spine: 0.04 * Math.sin(t * TAU * 2),
          neck: { lift: -0.15, yaw: 0.05 * Math.sin(t * TAU) }, legs: trot(t, 14, 4), tail: { lift: -0.1, sway: t * TAU * 2 }, ear: 0.2 }) },
      attack: { frames: 6, fps: 10, loop: false, hit: 3,
        pose: (t, f) => {
          const k = [0, 0.5, 1, 1, 0.5, 0][f], snap = [0, 0.1, 0.8, 0.15, 0.4, 0][f];
          return quadPose({ root: { y: -2 * k, z: 6 * k, pitch: 0.15 * k }, spine: -0.1 * k, neck: { lift: -0.4 * k }, head: { pitch: -0.2 * k },
            legs: { FL: [0, 3 * k, 6 * k], FR: [0, 2 * k, 5 * k], BL: [0, 0, -2 * k], BR: [0, 0, -2 * k] }, jaw: snap, tail: { lift: 0.3 * k, sway: 0 }, ear: 1 });
        } },
      pain: { frames: 3, fps: 8, loop: false,
        pose: (t, f) => { const k = [1, 0.6, 0][f]; return quadPose({ root: { z: -3 * k, roll: 0.15 * k, y: 1 * k }, neck: { lift: 0.5 * k, yaw: 0.4 * k }, head: { roll: 0.3 * k }, jaw: 0.5 * k, tail: { lift: -0.6 * k }, ear: 1 * k }); } },
      death: { frames: 7, fps: 8, loop: false,
        pose: (t) => {
          const f = easeIn(span(t, 0, 0.6));
          return quadPose({ root: { y: lerp(0, -18, f), roll: lerp(0, 1.45, f), x: lerp(0, -6, f) }, neck: { lift: lerp(0.3, -0.3, f) }, head: { roll: 0.3 * f },
            legs: { FL: [0, 0, 2 * f], FR: [0, 0, -2 * f], BL: [0, 0, 2 * f], BR: [0, 0, -1 * f] }, limp: t > 0.2, jaw: 0.35, tail: { lift: -0.6 }, ear: 1, pool: 11 * span(t, 0.6, 1) });
        } },
    },
  };
})();

// ---- Giant rat --------------------------------------------------------------------------------
(function () {
  const P = { h: 9, len: 12, neckUp: 1, neckFwd: 2, neckLift: 0.2, neckLen: 5, shW: 2.6, shDown: 1.5, hipW: 3, hipDown: 1,
    footW: 3, footFwd: 1, footBack: 0, pawH: 0.6, fUp: 4.5, fLow: 5, bUp: 5, bLow: 4.5, meta: 3, legR: [1.6, 1.0, 0.7] };
  const fur = mat('BROWN', { amb: 0.1, dif: 0.85, gain: 0.7, bias: -1.6, noise: 1.8, nf: 1.4,
    rampFn: (x, y, z, l) => (y < -3 ? [R.STONE, l - 1] : [vnoise(x * 0.4, y * 0.4, z * 0.4) > 0.55 ? R.GRAY : R.BROWN, l + Math.sin(z * 2 + y) * 0.6]) });
  const pink = mat('PINK', { amb: 0.2, dif: 0.85, bias: -0.8, noise: 0.8, pattern: (x, y, z) => (Math.sin(z * 4) > 0.7 ? -1 : 0) });
  const eye = mat('RED', { emissive: true, glow: 10, noise: 0.5 });
  const tooth = mat('GOLD', { amb: 0.3, dif: 0.7, bias: 1.5 });
  function build(s, ps) {
    const J = rigQuad(P, ps);
    const { body, chest, hips, head: H } = J;
    s.basis = body;
    s.ellipsoid(body.moved(0, 0.5, -1), [5.5, 5.5, 9.5], fur, { tf: body });
    s.ellipsoid(hips.moved(0, 0.5, 0), [5.6, 5.8, 6], fur, { tf: body, k: 3 });
    s.limb(chest.point(0, 1, 0), H.point(0, 0, -1), 4.2, 3, fur, { k: 2, tf: body });
    s.ellipsoid(H.moved(0, 0.3, 0.5), [2.8, 2.6, 3.2], fur, { k: 1, tf: body });
    s.limb(H.point(0, 0, 2), H.point(0, -0.6, 6.4), 1.8, 0.7, fur, { k: 1, tf: body });
    s.sphere(H.point(0, -0.5, 6.8), 0.65, pink, { after: true });
    for (const sd of [1, -1]) {
      s.ellipsoid(H.moved(sd * 2.0, 2.4, -0.6).rot(0, sd * 0.4, 0), [1.6, 1.8, 0.5], pink, { k: 0.4 });
      s.sphere(H.point(sd * 1.3, 0.7, 2.6), 0.55, eye, { after: true });
      for (const a of [-0.3, 0.2]) s.limb(H.point(sd * 0.8, -0.4, 5.6), H.point(sd * 4.5, -0.4 + a * 2, 6.5), 0.08, 0.05, mat('GRAY', { bias: 3 }), { after: true });
    }
    if (ps.jaw > 0.1) s.limb(H.point(-0.4, -1.2, 6.2), H.point(0.4, -1.2, 6.2), 0.4, 0.4, tooth, { after: true });
    drawLegs(s, J, P, fur, pink);
    // Long, naked tail
    let tp = hips.point(0, 0.5, -5), td = hips.dir(0, -0.2 + ps.tail.lift, -1);
    for (let i = 0; i < 5; i++) {
      td = V.norm(V.add(td, hips.dir(Math.sin(ps.tail.sway + i) * 0.35, -0.12, 0)));
      let np = V.madd(tp, td, 4.2);
      if (np[1] < 0.6) np = [np[0], 0.6, np[2]];
      s.limb(tp, np, 1.0 - i * 0.16, 0.85 - i * 0.16, pink);
      tp = np;
    }
    s.point('chest', chest.point(0, 1, 3));
    if (ps.pool > 0) s.ellipsoid(Frame.at([0, 0, 0]), [ps.pool * 1.2, 0.6, ps.pool], M.blood);
  }
  BEASTS.rat = {
    id: 'rat', res: 1, scale: 1.35, height: 19, shadow: [11, 8],
    build: (s, ps) => build(s, ps),
    actions: {
      idle: { frames: 4, fps: 6, loop: true, pose: (t) => quadPose({ root: { y: 0.3 * Math.sin(t * TAU) }, neck: { lift: 0.2 + 0.15 * Math.sin(t * TAU * 2), yaw: 0.4 * Math.sin(t * TAU) }, tail: { sway: t * TAU } }) },
      walk: { frames: 6, fps: 12, loop: true, travel: 16 * 1.35, pose: (t) => quadPose({ root: { y: 0.5 * Math.cos(t * TAU * 2) }, spine: 0.08 * Math.sin(t * TAU), neck: { lift: -0.1 }, legs: trot(t, 7, 2.5), tail: { sway: t * TAU * 2 } }) },
      attack: { frames: 5, fps: 10, loop: false, hit: 2,
        pose: (t, f) => { const k = [0, 0.7, 1, 0.5, 0][f]; return quadPose({ root: { z: 5 * k, y: 1.5 * k, pitch: -0.2 * k }, neck: { lift: 0.3 * k }, legs: { FL: [0, 3 * k, 5 * k], FR: [0, 3 * k, 5 * k] }, jaw: k, tail: { lift: 0.4 * k } }); } },
      pain: { frames: 3, fps: 8, loop: false, pose: (t, f) => { const k = [1, 0.5, 0][f]; return quadPose({ root: { z: -2 * k, roll: 0.2 * k, y: 1 * k }, neck: { lift: 0.5 * k }, jaw: k, tail: { lift: 0.5 * k } }); } },
      death: { frames: 6, fps: 8, loop: false,
        pose: (t) => { const f = easeIn(span(t, 0, 0.6)); return quadPose({ root: { y: lerp(0, -1, f) + 3 * Math.sin(Math.PI * span(t, 0, 0.6)), roll: lerp(0, Math.PI * 0.95, f) }, limp: true, neck: { lift: -0.2 }, legs: { FL: [0, 3 * f, 0], FR: [0, 3 * f, 0], BL: [0, 3 * f, 0], BR: [0, 3 * f, 0] }, jaw: 0.6, pool: 6 * span(t, 0.6, 1) }); } },
    },
  };
})();

// ---- Mudcrab ----------------------------------------------------------------------------------
(function () {
  // Mud-caked carapace: olive and brown blotches, a paler underside.
  const shell = mat('OLIVE', { amb: 0.1, dif: 0.9, gain: 0.72, bias: -0.8, spec: 0.5, shin: 14, noise: 2.0, nf: 0.6,
    rampFn: (x, y, z, l) => {
      if (y < -1.5) return [R.STONE, l - 1];
      const m = vnoise(x * 0.25 + 2, y * 0.25, z * 0.25);
      return [m > 0.62 ? R.BROWN : m < 0.35 ? R.GRAY : R.OLIVE, l + (Math.abs(Math.sin(x * 0.6)) < 0.12 ? -2 : 0)];
    } });
  const leg = mat('BROWN', { amb: 0.1, dif: 0.85, gain: 0.8, bias: -1.2, spec: 0.4, shin: 10, noise: 1.2, pattern: (x, y, z) => (Math.sin((x + y + z) * 0.9) > 0.85 ? -2 : 0) });
  const tip = mat('GRAY', { amb: 0.1, dif: 0.8, spec: 0.8, shin: 16, bias: -3 });
  const eye = mat('GRAY', { amb: 0.05, dif: 0.6, spec: 1.4, shin: 30, bias: -6 });
  function build(s, ps) {
    const B = Frame.at([0, 9 + ps.y, ps.z || 0]).rot(ps.pitch, ps.yaw, ps.roll);
    s.basis = B;
    s.ellipsoid(B, [17, 7.5, 13], shell, { tf: B });
    s.ellipsoid(B.moved(0, 3, -1), [12, 5, 9], shell, { k: 3, tf: B });
    for (const [x, z] of [[-8, 3], [7, 4], [0, -5], [-5, -7], [9, -3]]) s.sphere(B.point(x, 6.5, z), 1.6, shell, { k: 1.5 });
    // Eyestalks and mouthparts
    for (const sd of [1, -1]) {
      const base = B.point(sd * 3, 3, 11);
      const top = V.add(base, B.dir(sd * 0.8, 4 + ps.eyes, 1));
      s.limb(base, top, 0.8, 0.6, leg);
      s.sphere(top, 1.1, eye, { after: true });
    }
    s.ellipsoid(B.moved(0, -1, 12), [4, 2, 1.5], leg, { k: 1 });
    // Six walking legs
    for (let i = 0; i < 3; i++) for (const sd of [1, -1]) {
      const hip = B.point(sd * 14, -1, 5 - i * 6);
      const ph = ps.step + i * 2.1 + (sd > 0 ? 0 : Math.PI);
      const foot = [hip[0] + sd * 9, Math.max(0, Math.sin(ph) * 3 * ps.walk) + (ps.curl || 0) * 8, hip[2] + Math.cos(ph) * 3 * ps.walk];
      const { mid } = ik2(hip, foot, 8, 9.5, [0, 1, 0]);
      s.limb(hip, mid, 1.4, 1.1, leg); s.limb(mid, foot, 1.1, 0.3, tip);
    }
    // Claws
    for (const sd of [1, -1]) {
      const sh = B.point(sd * 12, 1, 9);
      const el = V.add(sh, B.dir(sd * 8, 3 + ps.claws * 7, 4 + ps.claws * 2));
      const wr = V.add(el, B.dir(sd * 1, 3 + ps.claws * 4, 6));
      s.limb(sh, el, 2.0, 1.8, leg);
      s.limb(el, wr, 1.8, 2.6, leg);
      const cf = Frame.along(wr, B.dir(-sd * 0.2, 0.5, 1), B.y);
      s.ellipsoid(cf.moved(0, 3, 0), [4.2, 5.2, 3.2], shell, { k: 1, tf: cf });
      s.limb(cf.point(0, 5, 0.8), cf.point(sd * -0.5, 9.5, 1.2), 1.5, 0.3, tip);
      const fing = cf.rot(0, 0, sd * (0.15 + ps.pinch * 0.6));
      s.limb(cf.point(sd * 1.5, 4.5, -0.6), fing.point(sd * 1.0, 9, -1.4), 1.1, 0.3, tip);
    }
    s.point('chest', B.point(0, 4, 12));
    if (ps.pool > 0) s.ellipsoid(Frame.at([0, 0, 0]), [ps.pool * 1.3, 0.6, ps.pool], mat('OLIVE', { amb: 0.1, dif: 0.6, spec: 0.8, shin: 30, bias: -1 }));
  }
  const cp = (o) => Object.assign({ y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, step: 0, walk: 0, claws: 0, pinch: 0, eyes: 0, curl: 0, pool: 0 }, o);
  BEASTS.mudcrab = {
    id: 'mudcrab', res: 1, height: 24, shadow: [20, 14],
    build: (s, ps) => build(s, ps),
    actions: {
      idle: { frames: 4, fps: 4, loop: true, pose: (t) => cp({ y: 0.4 * Math.sin(t * TAU), claws: 0.35 + 0.12 * Math.sin(t * TAU), pinch: Math.max(0, Math.sin(t * TAU * 2)), eyes: 0.4 * Math.sin(t * TAU) }) },
      walk: { frames: 6, fps: 10, loop: true, travel: 14, pose: (t) => cp({ y: 0.6 * Math.abs(Math.sin(t * TAU * 2)), roll: 0.05 * Math.sin(t * TAU), step: t * TAU, walk: 1, claws: 0.2, pinch: 0.3 }) },
      attack: { frames: 5, fps: 9, loop: false, hit: 3,
        pose: (t, f) => cp({ pitch: [0, -0.12, -0.18, 0.1, 0][f], z: [0, 0, 2, 5, 0][f], claws: [0.2, 0.9, 1.1, 0.3, 0.2][f], pinch: [0.2, 1, 1, 0, 0.3][f], eyes: 1 }) },
      pain: { frames: 3, fps: 8, loop: false, pose: (t, f) => cp({ y: [3, 1.5, 0][f], z: [-3, -1.5, 0][f], roll: [0.15, 0.08, 0][f], claws: [0.8, 0.4, 0.2][f], pinch: 1, eyes: -1 }) },
      death: { frames: 6, fps: 8, loop: false,
        pose: (t) => { const f = easeIn(span(t, 0, 0.6)); return cp({ y: 6 * Math.sin(Math.PI * span(t, 0, 0.6)), roll: lerp(0, Math.PI, f), claws: 0.6, pinch: 1, curl: f, eyes: -1, pool: 10 * span(t, 0.6, 1) }); } },
    },
  };
})();

// ---- Mittens the cat ---------------------------------------------------------------------------
(function () {
  const P = { h: 8.5, len: 9, neckUp: 1.5, neckFwd: 1.5, neckLift: 0.6, neckLen: 3.5, shW: 1.8, shDown: 1, hipW: 2, hipDown: 1,
    footW: 1.8, footFwd: 0.5, footBack: 0, pawH: 0.6, fUp: 4.2, fLow: 4.6, bUp: 4.4, bLow: 4, meta: 2.6, legR: [1.3, 0.9, 0.7] };
  const fur = mat('RUST', { amb: 0.16, dif: 0.9, bias: 0.8, noise: 1.2, nf: 1.2,
    rampFn: (x, y, z, l) => (y < -2.2 ? [R.BONE, l + 1] : [R.RUST, l + (Math.sin(z * 1.6 + x * 0.3) > 0.45 ? -2.2 : 0)]) });
  const eye = eyeMat('GREEN', 10, 'slit', 1.2);
  function build(s, ps) {
    const J = rigQuad(P, ps);
    const { body, chest, hips, head: H } = J;
    s.basis = body;
    s.ellipsoid(body.moved(0, 0.3, -0.5), [3.4, 3.6, 7], fur, { tf: body });
    s.ellipsoid(hips.moved(0, 0.4, 0.5), [3.4, 3.8, 3.8], fur, { tf: body, k: 2 });
    s.limb(chest.point(0, 1, 0), H.point(0, 0, -1), 2.6, 2.2, fur, { k: 1.5, tf: body });
    s.ellipsoid(H.moved(0, 0.2, 0), [2.6, 2.3, 2.3], fur, { k: 1, tf: H });
    s.ellipsoid(H.moved(0, -0.6, 1.8), [1.4, 1.0, 1.0], mat('BONE', { bias: 1.5, noise: 0.8 }), { k: 0.6 });
    s.sphere(H.point(0, -0.3, 2.7), 0.4, mat('PINK', { bias: 1 }), { after: true });
    for (const sd of [1, -1]) {
      s.limb(H.point(sd * 1.4, 1.6, -0.2), H.point(sd * 1.9, 3.8, -0.4), 1.1, 0.15, fur, { k: 0.3 });
      const ec = H.point(sd * 0.95, 0.5, 1.9);
      s.sphere(ec, 0.55, eye, { after: true, tf: H.movedTo(ec) });
    }
    drawLegs(s, J, P, fur, mat('BONE', { bias: 1 }));
    let tp = hips.point(0, 1.5, -2.5), td = hips.dir(0, 1, -0.4);
    for (let i = 0; i < 4; i++) {
      td = V.norm(V.add(td, hips.dir(Math.sin(ps.tail.sway + i * 0.9) * 0.4, 0.1 + ps.tail.lift * 0.2, -0.3)));
      const np = V.madd(tp, td, 2.6);
      s.limb(tp, np, 0.85, 0.75, fur);
      tp = np;
    }
  }
  BEASTS.cat = {
    id: 'cat', res: 1, height: 14, shadow: [6, 5],
    build: (s, ps) => build(s, ps),
    actions: {
      idle: { frames: 6, fps: 4, loop: true, pose: (t) => quadPose({ root: { y: -1.2 }, spine: -0.1, neck: { yaw: 0.4 * Math.sin(t * TAU) }, legs: { BL: [0, 0, 2], BR: [0, 0, 2] }, tail: { sway: t * TAU } }) },
      walk: { frames: 8, fps: 9, loop: true, travel: 14, pose: (t) => quadPose({ root: { y: 0.3 * Math.cos(t * TAU * 2) }, legs: trot(t, 5, 1.6), tail: { sway: t * TAU, lift: 0.5 } }) },
    },
  };
})();
