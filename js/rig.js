'use strict';
// Creature registry, the shared humanoid rig, and gait helpers.

const CREATURES = [];
function defineCreature(c) { CREATURES.push(c); return c; }

// t runs 0..(n-1)/n for looping actions and 0..1 for one-shots.
function frameTime(act, f) {
  return act.loop ? f / act.frames : (act.frames > 1 ? f / (act.frames - 1) : 0);
}
function buildFrame(creature, action, f) {
  const act = creature.actions[action];
  const t = frameTime(act, f);
  const s = new Shape();
  creature.build(s, act.pose(t, f), action, t);
  return s;
}

const SIDES = { L: 1, R: -1 }; // creature's left is +x

// Default pose skeleton; creature poses override pieces of it.
function pose(over) {
  const p = {
    root: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
    spine: { pitch: 0, yaw: 0, roll: 0 },
    head: { pitch: 0, yaw: 0, roll: 0 },
    arms: {
      L: { pitch: 0, out: 0.12, twist: 0, elbow: 0.2, wrist: 0, wristTwist: 0 },
      R: { pitch: 0, out: 0.12, twist: 0, elbow: 0.2, wrist: 0, wristTwist: 0 },
    },
    legs: { L: { ik: [3.5, 0, 0], toe: 0 }, R: { ik: [-3.5, 0, 0], toe: 0 } },
    jaw: 0,
  };
  return merge(p, over || {});
}
function merge(a, b) {
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}
// Blend two poses (numbers and arrays are interpolated).
function mixPose(a, b, t) {
  if (typeof a === 'number') return lerp(a, b, t);
  if (Array.isArray(a)) return a.map((v, i) => lerp(v, b[i], t));
  if (a && typeof a === 'object') {
    const o = {};
    for (const k of Object.keys(a)) o[k] = k in b ? mixPose(a[k], b[k], t) : a[k];
    for (const k of Object.keys(b)) if (!(k in o)) o[k] = b[k];
    return o;
  }
  return t < 0.5 ? a : b;
}

// Keyframed poses: ks = [[t0, poseObj], [t1, poseObj], ...] with smoothstep easing between keys.
function poseKeys(t, ks) {
  if (t <= ks[0][0]) return mixPose(ks[0][1], ks[0][1], 0);
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const [t0, a] = ks[i - 1], [t1, b] = ks[i];
      return mixPose(a, b, smooth((t - t0) / (t1 - t0)));
    }
  }
  const last = ks[ks.length - 1][1];
  return mixPose(last, last, 0);
}

// Scatters rigid parts of a body onto the floor (used for skeletons and other things that fall
// apart). parts: { id: { c: centre, rest, delay, dur, pitch, yaw, ox, oz, bounce } }
function collapser(parts, c) {
  const info = {};
  for (const id of Object.keys(parts)) {
    const p = parts[id];
    const u = easeIn(span(c, p.delay, p.delay + p.dur));
    let hop = 0;
    if (p.bounce && c > p.delay + p.dur) hop = p.bounce * Math.sin(Math.PI * span(c, p.delay + p.dur, p.delay + p.dur + 0.22));
    const ur = smooth(u);
    info[id] = {
      c: p.c, a: (p.pitch || 0) * ur, b: (p.yaw || 0) * ur,
      n: [p.c[0] + (p.ox || 0) * u, lerp(p.c[1], p.rest, u) + hop, p.c[2] + (p.oz || 0) * u],
    };
  }
  const rotv = (v, a, b) => {
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const y = v[1] * ca - v[2] * sa, z = v[1] * sa + v[2] * ca;
    return [v[0] * cb + z * sb, y, -v[0] * sb + z * cb];
  };
  const pt = (id, p) => {
    const k = info[id];
    if (!k || c <= 0) return p;
    return V.add(k.n, rotv(V.sub(p, k.c), k.a, k.b));
  };
  const fr = (id, f) => {
    const k = info[id];
    if (!k || c <= 0) return f;
    return new Frame(pt(id, f.o), rotv(f.x, k.a, k.b), rotv(f.y, k.a, k.b), rotv(f.z, k.a, k.b));
  };
  return { pt, fr };
}

// Humanoid forward/inverse kinematics.
// P: proportions { thigh, shin, ankle, foot, hipW, crouch, spine, shY, shW, neckY, headY, upper, fore, hand }
function rigHumanoid(P, ps) {
  const r = ps.root;
  const standH = P.thigh + P.shin + P.ankle - (P.crouch || 0);
  const G = Frame.at([r.x, 0, r.z]).rot(0, r.yaw, 0);
  const pelvis = Frame.at([r.x, standH + r.y, r.z]).rot(r.pitch, r.yaw, r.roll);
  const chest = pelvis.rot(ps.spine.pitch, ps.spine.yaw, ps.spine.roll).moved(0, P.spine, 0);
  const neck = chest.point(0, P.neckY, 0);
  const head = chest.movedTo(neck).rot(ps.head.pitch, ps.head.yaw, ps.head.roll).moved(0, P.headY, 0);
  const J = { P, G, pelvis, chest, neck, head, standH };

  for (const side of ['L', 'R']) {
    const sd = SIDES[side];
    const a = ps.arms[side];
    const sh = chest.point(sd * P.shW, P.shY, 0);
    let upper, el, fore, wr;
    if (a.ik) {
      const target = a.ik;
      const pole = a.pole || chest.dir(sd * 0.4, -0.2, -1);
      const { mid, end } = ik2(sh, target, P.upper, P.fore, pole);
      el = mid; wr = end;
      upper = Frame.along(sh, V.sub(sh, el), chest.z);
      upper = new Frame(sh, upper.x, upper.y, upper.z);
      fore = Frame.along(el, V.sub(el, wr), chest.z);
    } else {
      upper = chest.movedTo(sh).rot(-a.pitch, sd * (a.twist || 0), sd * a.out);
      el = upper.point(0, -P.upper, 0);
      fore = upper.movedTo(el).rot(-a.elbow, 0, 0);
      wr = fore.point(0, -P.fore, 0);
    }
    const hand = fore.movedTo(wr).rot(-(a.wrist || 0), sd * (a.wristTwist || 0), 0);
    J[side] = { sd, sh, el, wr, upper, fore, hand };

    const l = ps.legs[side];
    const hip = pelvis.point(sd * P.hipW, 0, 0);
    let knee, ankle, foot;
    if (l.ik) {
      const target = G.point(l.ik[0], l.ik[1] + P.ankle, l.ik[2]);
      const pole = V.add(G.dir(sd * 0.15, 0.1, 1), l.pole || [0, 0, 0]);
      const res = ik2(hip, target, P.thigh, P.shin, pole);
      knee = res.mid; ankle = res.end;
      foot = G.movedTo(ankle).rot(l.toe || 0, sd * (l.splay || 0.1), 0);
    } else {
      const thigh = pelvis.movedTo(hip).rot(-l.pitch, sd * (l.twist || 0), sd * (l.out || 0));
      knee = thigh.point(0, -P.thigh, 0);
      const shin = thigh.movedTo(knee).rot(l.knee || 0, 0, 0);
      ankle = shin.point(0, -P.shin, 0);
      foot = shin.movedTo(ankle).rot(-(l.knee || 0) + l.pitch + (l.foot || 0), 0, 0);
    }
    const heel = foot.point(0, -P.ankle + 0.4, -1.2);
    const toe = foot.point(0, -P.ankle + 0.6, P.foot);
    Object.assign(J[side], { hip, knee, ankle, foot, heel, toe });
  }
  return J;
}

// Foot placement for a looping gait. Returns { L, R } leg specs for rigHumanoid.
function gait(t, o) {
  const stride = o.stride, lift = o.lift, stance = o.stance || 0.55, w = o.width || 3.5;
  const res = {};
  for (const side of ['L', 'R']) {
    const ph = (t + (side === 'R' ? 0.5 : 0)) % 1;
    let z, y, toe;
    if (ph < stance) {
      const s = ph / stance;
      z = stride / 2 - stride * s; y = 0; toe = s > 0.8 ? (s - 0.8) * 2 : 0;
    } else {
      const s = (ph - stance) / (1 - stance);
      z = -stride / 2 + stride * smooth(s); y = lift * Math.sin(Math.PI * s); toe = 0.5 * Math.sin(Math.PI * s) - 0.15 * s;
    }
    res[side] = { ik: [SIDES[side] * w, y, z + (o.zOff || 0)], toe };
  }
  return res;
}
