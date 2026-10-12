'use strict';
// Everything that moves in a map: villagers, creatures and the cat. Spawning, AI, animation,
// combat, corpses and the sprite cache that renders frames on demand.

const ENEMY_TYPES = {
  rat: { name: 'Giant Rat', def: 'rat', hp: 14, dmg: [2, 4], armor: 0, walk: 60, run: 150, aggro: 300, reach: 38, cooldown: 1.0, xp: 8, loot: [['rat_tail', 0.85]], radius: 12, wander: 2, hitR: 17 },
  mudcrab: { name: 'Mudcrab', def: 'mudcrab', hp: 24, dmg: [3, 6], armor: 2, walk: 40, run: 85, aggro: 230, reach: 44, cooldown: 1.4, xp: 12, loot: [['crab_meat', 1], ['crab_shell', 0.35]], radius: 17, wander: 2.5, hitR: 20 },
  wolf: { name: 'Grey Wolf', def: 'wolf', hp: 32, dmg: [4, 8], armor: 0, walk: 70, run: 235, aggro: 520, reach: 48, cooldown: 1.25, xp: 20, loot: [['wolf_pelt', 1], ['wolf_fang', 0.5]], radius: 15, wander: 3, hitR: 18 },
};
const SPAWNS = {
  town: [
    ['wolf', 54, 20], ['wolf', 56.5, 12.5], ['wolf', 58, 6.5], ['wolf', 47, 7.5], ['wolf', 56, 17.5], ['wolf', 44, 57], ['wolf', 56, 58.5],
    ['rat', 11, 34.6], ['rat', 3.6, 38.4], ['rat', 12.2, 41.6], ['rat', 7.6, 31.4],
    ['mudcrab', 8, 46], ['mudcrab', 23.5, 51.4], ['mudcrab', 40.5, 51.2], ['mudcrab', 55, 46], ['mudcrab', 59, 51], ['mudcrab', 27, 44.3],
  ],
  cellar: [['rat', 5.5, 3.5], ['rat', 7.5, 6.2], ['rat', 2.6, 7.4], ['rat', 7.4, 3.4]],
};
const RESPAWN = { town: 8 * 60, cellar: 3 * 1440 };

// ---- Sprite cache, rendered a few rows at a time ---------------------------------------------
// Actor sprites are ray-marched on demand. Frames wanted on screen queue in `hot`, prefetches in
// `cold`; pump() advances one render job within a per-frame time budget, and get() shows the
// nearest finished pose until the exact one is ready.
const ActorSprites = {
  cache: new Map(), hot: new Map(), cold: new Map(), job: null, syncUsed: false,
  pinned: new Map(), // baked villagers' frames: never rendered here, never evicted
  beginFrame() { this.syncUsed = false; },
  key: (d, a, f, r) => `${d}|${a}|${f}|${r}`,
  start(defId, action, frame, rot) {
    const def = ACTOR_DEFS()[defId];
    const act = def.actions[action];
    const t = act.loop ? frame / act.frames : frame / Math.max(1, act.frames - 1);
    const s = new Shape();
    def.build(s, act.pose(t, frame), action, t);
    // A `scale` above 1 renders more pixels, then labels them at the normal density, so the
    // creature comes out bigger in the world (giant rats).
    return spriteJob(s, rot * Math.PI / 4, { res: (def.res || 1) * (def.scale || 1) });
  },
  finish(defId, spr) {
    delete spr.depth;
    spr.res /= ACTOR_DEFS()[defId].scale || 1;
    return spr;
  },
  render(defId, action, frame, rot) {
    const job = this.start(defId, action, frame, rot);
    let r = job.next();
    while (!r.done) r = job.next();
    return this.finish(defId, r.value);
  },
  // Render now if missing: used behind the fade when entering a map.
  warm(defId, action, frame, rot) {
    if (ACTOR_DEFS()[defId].baked) return;
    const k = this.key(defId, action, frame, rot);
    if (!this.cache.has(k)) this.store(k, this.render(defId, action, frame, rot));
  },
  get(defId, action, frame, rot) {
    const def = ACTOR_DEFS()[defId];
    if (def.baked) {
      if (def.alias[action]) action = def.alias[action];
      else if (!def.actions[action]) { action = 'idle'; frame = 0; } // only the baked moves exist
    }
    const k = this.key(defId, action, frame, rot);
    const s = this.pinned.get(k) || this.cache.get(k);
    if (s) return s;
    if (def.baked) { const near = this.nearest(defId, action, frame, rot); return near ? near.spr : null; }
    this.cold.delete(k);
    this.hot.set(k, { args: [defId, action, frame, rot], t: performance.now() });
    const near = this.nearest(defId, action, frame, rot);
    if (near && !(action === 'death' && near.action !== 'death')) return near.spr;
    // Nothing close enough (or a corpse that would stand up): pay for one render this frame.
    if (this.syncUsed) return near ? near.spr : null;
    this.syncUsed = true;
    this.hot.delete(k);
    const spr = this.render(defId, action, frame, rot);
    this.store(k, spr);
    return spr;
  },
  // The closest finished pose: other frames of the action from this angle, then nearby angles,
  // then standing idle.
  nearest(defId, action, frame, rot) {
    const n = ACTOR_DEFS()[defId].actions[action].frames;
    const look = (a, f, r) => { const k = this.key(defId, a, f, (r + 8) % 8), s = this.pinned.get(k) || this.cache.get(k); return s ? { spr: s, action: a } : null; };
    for (let df = 0; df < n; df++) {
      const hit = look(action, (frame + df) % n, rot) || look(action, (frame - df + n) % n, rot);
      if (hit) return hit;
    }
    for (const dr of [1, -1, 2, -2]) { const hit = look(action, frame, rot + dr) || look(action, 0, rot + dr); if (hit) return hit; }
    for (const dr of [0, 1, -1, 2, -2, 3, -3, 4]) { const hit = look('idle', 0, rot + dr); if (hit) return hit; }
    return null;
  },
  store(k, s) {
    this.cache.set(k, s);
    if (this.cache.size > 4000) this.cache.delete(this.cache.keys().next().value);
  },
  take() {
    const now = performance.now();
    for (const [k, v] of this.hot) {
      this.hot.delete(k);
      if (this.cache.has(k)) continue;
      if (now - v.t > 1500) { this.cold.set(k, v.args); continue; } // no longer on screen
      return [k, v.args];
    }
    for (const [k, args] of this.cold) {
      this.cold.delete(k);
      if (!this.cache.has(k)) return [k, args];
    }
    return null;
  },
  // Spend up to `ms` milliseconds advancing render jobs.
  pump(ms) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (!this.job) {
        const next = this.take();
        if (!next) return;
        this.job = { k: next[0], defId: next[1][0], gen: this.start(...next[1]) };
      }
      const r = this.job.gen.next();
      if (r.done) {
        this.store(this.job.k, this.finish(this.job.defId, r.value));
        this.job = null;
      }
    }
  },
  prefetch(defId, actions, firstFrameOnly) {
    const def = ACTOR_DEFS()[defId];
    if (def.baked) return;
    for (const a of actions) if (def.actions[a]) for (let f = 0; f < (firstFrameOnly ? 1 : def.actions[a].frames); f++) for (let r = 0; r < 8; r++) {
      const k = this.key(defId, a, f, r);
      if (!this.cache.has(k) && !this.hot.has(k)) this.cold.set(k, [defId, a, f, r]);
    }
  },
};

// ---- Spawning ---------------------------------------------------------------------------------
function populateMap(mapId) {
  const ents = [];
  for (const [id, c] of Object.entries(CAST)) {
    if (c.map !== mapId) continue;
    const def = ACTOR_DEFS()[id];
    ents.push({ kind: 'npc', id, defId: id, name: c.name, x: c.at[0] * TILE, z: c.at[1] * TILE, ang: c.ang, home: [c.at[0] * TILE, c.at[1] * TILE], homeAng: c.ang,
      wander: (c.wander || 0) * TILE, work: !!c.work, r: 11, act: c.work ? 'work' : 'idle', at: Math.random() * 3, wait: 1 + Math.random() * 3, target: null, height: def.height,
      hp: c.fights ? c.fights.hp : 30, maxHp: c.fights ? c.fights.hp : 30 });
  }
  if (mapId === 'town' && !hasItem('mittens') && !qDone('mittens') && !G.flags.mittensTaken) {
    ents.push({ kind: 'cat', id: 'mittens', defId: 'cat', name: 'Mittens', x: 21.2 * TILE, z: 45.2 * TILE, ang: 0, home: [21.2 * TILE, 45.2 * TILE], wander: 1.6 * TILE, r: 6, act: 'idle', at: 0, wait: 2, target: null, height: 14 });
  }
  const W = worldOf(mapId);
  (SPAWNS[mapId] || []).forEach(([type, tx, tz], i) => {
    const sid = `${mapId}:${i}`;
    const T_ = ENEMY_TYPES[type];
    const until = W.dead[sid];
    if (until && G.time < until) {
      const L = W.loot[sid];
      if (L) ents.push({ kind: 'enemy', type, sid, defId: T_.def, name: T_.name, x: L.x, z: L.z, ang: L.ang, r: T_.radius, state: 'dead', act: 'death', at: 99, hp: 0, maxHp: T_.hp, loot: L.items, mapId });
      return;
    }
    if (until) { delete W.dead[sid]; delete W.loot[sid]; }
    ents.push({ kind: 'enemy', type, sid, defId: T_.def, name: T_.name, x: tx * TILE, z: tz * TILE, ang: Math.random() * TAU, home: [tx * TILE, tz * TILE],
      r: T_.radius, state: 'idle', act: 'idle', at: Math.random(), hp: T_.hp, maxHp: T_.hp, wait: 1 + Math.random() * 4, cool: 0, target: null, path: null, repath: 0, mapId });
  });
  return ents;
}

// ---- Movement and collision -----------------------------------------------------------------
function blockedAt(map, x, z, r) {
  for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, -r], [0, r], [-r, 0], [r, 0]]) if (map.solidAt(x + ox, z + oz)) return true;
  return false;
}
// Slide a circle through the map, then push it out of solid props.
function moveCircle(map, o, dx, dz, r, propGrid) {
  if (!blockedAt(map, o.x + dx, o.z, r)) o.x += dx;
  if (!blockedAt(map, o.x, o.z + dz, r)) o.z += dz;
  if (propGrid) {
    const tx = Math.floor(o.x / TILE), tz = Math.floor(o.z / TILE);
    for (let z = tz - 1; z <= tz + 1; z++) for (let x = tx - 1; x <= tx + 1; x++) {
      const list = propGrid.get(z * 1000 + x);
      if (!list) continue;
      for (const p of list) {
        const ddx = o.x - p.x, ddz = o.z - p.z, d = Math.hypot(ddx, ddz), min = r + p.cr;
        if (d < min && d > 0.01) {
          const push = (min - d);
          const nx = o.x + ddx / d * push, nz = o.z + ddz / d * push;
          if (!blockedAt(map, nx, nz, r)) { o.x = nx; o.z = nz; }
        }
      }
    }
  }
}
function buildPropGrid(map) {
  const grid = new Map();
  for (const p of map.props) {
    const P = PROPS[p.type];
    if (!P || !P.collide || p.taken) continue;
    const k = Math.floor(p.z / TILE) * 1000 + Math.floor(p.x / TILE);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push({ x: p.x, z: p.z, cr: P.collide });
  }
  return grid;
}
// Line of sight through the tile grid (only tall walls block sight).
function lineOfSight(map, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 16);
  for (let i = 1; i < n; i++) {
    const x = Math.floor((ax + (bx - ax) * i / n) / TILE), z = Math.floor((az + (bz - az) * i / n) / TILE);
    const w = map.wallAt(x, z);
    if (w && STYLES[w].h > 40) return false;
  }
  return true;
}
// Breadth-first search toward the target tile; returns the next tile centre to walk to.
function nextStep(map, ax, az, bx, bz) {
  const sx = Math.floor(ax / TILE), sz = Math.floor(az / TILE), tx = Math.floor(bx / TILE), tz = Math.floor(bz / TILE);
  if (sx === tx && sz === tz) return [bx, bz];
  const W = map.w, prev = new Map(), q = [sz * W + sx];
  prev.set(sz * W + sx, -1);
  let found = -1;
  for (let qi = 0; qi < q.length && qi < 900; qi++) {
    const c = q[qi];
    if (c === tz * W + tx) { found = c; break; }
    const cx = c % W, cz = (c / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz, ni = nz * W + nx;
      if (!map.inside(nx, nz) || prev.has(ni) || map.wall[ni] || FLOORS[map.floor[ni]].solid) continue;
      prev.set(ni, c); q.push(ni);
    }
  }
  if (found < 0) return null;
  let c = found, p = prev.get(c);
  while (p !== -1 && prev.get(p) !== -1) { c = p; p = prev.get(c); }
  return [(c % W + 0.5) * TILE, (((c / W) | 0) + 0.5) * TILE];
}

// ---- Per-frame update -------------------------------------------------------------------------
function angTo(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
function turnToward(e, target, rate, dt) { const d = angTo(e.ang, target); e.ang += clamp(d, -rate * dt, rate * dt); }
function setAct(e, a) { if (e.act !== a) { e.act = a; e.at = 0; e.hitDone = false; } }

function updateEnts(dt, ents, map, P, ctx) {
  const defs = ACTOR_DEFS();
  for (const e of ents) {
    const def = defs[e.defId];
    e.at += dt;
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz);
    const toP = Math.atan2(dz, dx);
    if (e.kind === 'npc' || e.kind === 'cat') {
      if (ctx.talkingTo === e) { setAct(e, e.kind === 'npc' ? 'talk' : 'idle'); turnToward(e, toP, 4, dt); continue; }
      e.animRate = 1;
      if (e.kind === 'npc' && npcDefend(e, ents, map, P, ctx, dt, def)) continue;
      if (e.work) { setAct(e, 'work'); turnToward(e, e.homeAng, 3, dt); continue; }
      if (!e.wander) {
        setAct(e, 'idle');
        turnToward(e, d < 150 ? toP : e.homeAng, 2, dt);
        continue;
      }
      if (e.target) {
        const tx = e.target[0] - e.x, tz = e.target[1] - e.z, td = Math.hypot(tx, tz);
        const sp = def.actions.walk.travel * def.actions.walk.fps / def.actions.walk.frames;
        if (td < 4 || e.stuck > 1.5) { e.target = null; e.wait = 2 + Math.random() * 5; setAct(e, 'idle'); continue; }
        turnToward(e, Math.atan2(tz, tx), 4, dt);
        const ox = e.x, oz = e.z;
        moveCircle(map, e, Math.cos(e.ang) * sp * dt, Math.sin(e.ang) * sp * dt, e.r, ctx.propGrid);
        e.stuck = Math.hypot(e.x - ox, e.z - oz) < sp * dt * 0.3 ? (e.stuck || 0) + dt : 0;
        setAct(e, 'walk');
      } else {
        setAct(e, 'idle');
        if (d < 120 && e.kind === 'npc') turnToward(e, toP, 2, dt);
        e.wait -= dt;
        if (e.wait <= 0) {
          const a = Math.random() * TAU, r = Math.random() * e.wander;
          const t = [e.home[0] + Math.cos(a) * r, e.home[1] + Math.sin(a) * r];
          if (!blockedAt(map, t[0], t[1], e.r) && lineOfSight(map, e.x, e.z, t[0], t[1])) { e.target = t; e.stuck = 0; } else e.wait = 0.5;
        }
      }
      continue;
    }
    // ---- Enemies ----
    const T_ = ENEMY_TYPES[e.type];
    if (e.state === 'dead') { setAct(e, 'death'); continue; }
    e.cool = Math.max(0, e.cool - dt);
    const act = def.actions[e.act];
    const animDone = !act.loop && e.at * act.fps >= act.frames;
    // Who it's fighting: the player, or a villager who joined in (until they back off).
    let foe = null, fd = d, fa = toP, fr = P.r;
    if (e.foe) {
      const o = e.foe, od = Math.hypot(o.x - e.x, o.z - e.z);
      if (o.hurt || od > T_.aggro * 1.5 || !ents.includes(o)) e.foe = null;
      else { foe = o; fd = od; fa = Math.atan2(o.z - e.z, o.x - e.x); fr = o.r; }
    }
    if (e.state === 'pain') { if (animDone) e.state = 'chase'; continue; }
    if (e.state === 'attack') {
      turnToward(e, fa, 5, dt);
      const hitFrame = act.hit !== undefined ? act.hit : Math.floor(act.frames / 2);
      if (!e.hitDone && e.at * act.fps >= hitFrame) {
        e.hitDone = true;
        if (fd < T_.reach + fr + 10 && Math.abs(angTo(e.ang, fa)) < 1.0) {
          if (foe) hurtNpc(foe, rngInt(T_.dmg[0], T_.dmg[1]), ctx);
          else if (!ctx.dead) ctx.hurtPlayer(rngInt(T_.dmg[0], T_.dmg[1]), e);
        }
      }
      if (animDone) { e.state = 'chase'; e.cool = T_.cooldown; setAct(e, 'idle'); }
      continue;
    }
    // Once it has given up and turned for home, it won't be drawn back in until it's nearly
    // home again, unless it is struck.
    const leashed = e.state === 'return' && Math.hypot(e.x - e.home[0], e.z - e.home[1]) > 12 * TILE;
    const sees = d < T_.aggro && !leashed && lineOfSight(map, e.x, e.z, P.x, P.z) && !ctx.dead;
    e.angry = Math.max(0, (e.angry || 0) - dt);
    if ((e.state === 'idle' || e.state === 'wander' || e.state === 'return') && (sees || e.provoked)) {
      e.state = 'chase'; e.provoked = false;
      if (!foe || d < 900) ctx.alert(e);
    }
    if (e.state === 'chase') {
      const home = Math.hypot(e.x - e.home[0], e.z - e.home[1]);
      if ((!foe && (ctx.dead || d > T_.aggro * 2.2)) || (home > 20 * TILE && !e.angry) || ctx.mapChanged) { e.state = 'return'; e.foe = null; continue; }
      if (fd < T_.reach + fr) {
        turnToward(e, fa, 6, dt);
        if (e.cool <= 0 && Math.abs(angTo(e.ang, fa)) < 0.5) { e.state = 'attack'; setAct(e, 'attack'); }
        else setAct(e, 'idle');
        continue;
      }
      // Steer straight at the target when visible, otherwise follow a path.
      const tx = foe ? foe.x : P.x, tz = foe ? foe.z : P.z;
      let goal = [tx, tz];
      if (!lineOfSight(map, e.x, e.z, tx, tz)) {
        e.repath -= dt;
        if (e.repath <= 0 || !e.path) { e.path = nextStep(map, e.x, e.z, tx, tz); e.repath = 0.5; }
        if (e.path) goal = e.path;
      }
      turnToward(e, Math.atan2(goal[1] - e.z, goal[0] - e.x), 6, dt);
      moveCircle(map, e, Math.cos(e.ang) * T_.run * dt, Math.sin(e.ang) * T_.run * dt, e.r, ctx.propGrid);
      setAct(e, 'walk');
      e.animRate = T_.run / (def.actions.walk.travel * def.actions.walk.fps / def.actions.walk.frames);
      continue;
    }
    e.animRate = 1;
    if (e.state === 'return' || e.target) {
      const t = e.state === 'return' ? e.home : e.target;
      const tx = t[0] - e.x, tz = t[1] - e.z, td = Math.hypot(tx, tz);
      if (td < 10 || (e.stuck || 0) > 1.5) { e.state = 'idle'; e.target = null; e.wait = 2 + Math.random() * 5; setAct(e, 'idle'); continue; }
      turnToward(e, Math.atan2(tz, tx), 4, dt);
      const ox = e.x, oz = e.z;
      moveCircle(map, e, Math.cos(e.ang) * T_.walk * dt, Math.sin(e.ang) * T_.walk * dt, e.r, ctx.propGrid);
      e.stuck = Math.hypot(e.x - ox, e.z - oz) < T_.walk * dt * 0.3 ? (e.stuck || 0) + dt : 0;
      e.animRate = T_.walk / (def.actions.walk.travel * def.actions.walk.fps / def.actions.walk.frames);
      setAct(e, 'walk');
      continue;
    }
    setAct(e, 'idle');
    e.wait -= dt;
    if (e.wait <= 0) {
      const a = Math.random() * TAU, r = Math.random() * T_.wander * TILE;
      const t = [e.home[0] + Math.cos(a) * r, e.home[1] + Math.sin(a) * r];
      if (!blockedAt(map, t[0], t[1], e.r)) { e.target = t; e.stuck = 0; } else e.wait = 0.5;
    }
  }
  // Keep bodies from overlapping each other and the player.
  for (let i = 0; i < ents.length; i++) {
    const a = ents[i];
    if (a.state === 'dead') continue;
    for (let j = i + 1; j < ents.length; j++) {
      const b = ents[j];
      if (b.state === 'dead') continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.r + b.r;
      if (d < min && d > 0.01) {
        const p = (min - d) / 2, nx = dx / d, nz = dz / d;
        moveCircle(map, a, -nx * p, -nz * p, a.r); moveCircle(map, b, nx * p, nz * p, b.r);
      }
    }
  }
}
function rngInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// Animation frame for an entity's current action.
function entFrame(e) {
  const act = ACTOR_DEFS()[e.defId].actions[e.act];
  const f = Math.floor(e.at * act.fps * (e.animRate || 1));
  return act.loop ? f % act.frames : Math.min(act.frames - 1, f);
}
// Which of the eight sprite rotations faces the camera.
function entRot(e, camX, camZ) {
  const toCam = Math.atan2(camZ - e.z, camX - e.x);
  return ((Math.round(angTo(e.ang, toCam) / (Math.PI / 4)) % 8) + 8) % 8;
}

// ---- Combat ---------------------------------------------------------------------------------
// `by` is the villager who struck the blow, or undefined for the player. Kills only give XP and
// quest credit if the player landed at least one hit.
function damageEnemy(e, dmg, ctx, by) {
  const T_ = ENEMY_TYPES[e.type];
  const dealt = Math.max(1, dmg - T_.armor);
  e.hp -= dealt;
  e.provoked = true;
  e.angry = 6; // fights back for a while even far from home
  if (by) {
    if (!e.foe && (Math.hypot(by.x - e.x, by.z - e.z) < Math.hypot(Player.x - e.x, Player.z - e.z) || Math.random() < 0.35)) e.foe = by;
  } else {
    e.playerHit = true;
    ctx.lastHit = { e, t: performance.now() };
    if (e.foe && Math.random() < 0.5) e.foe = null;
  }
  if (e.hp <= 0) {
    e.hp = 0; e.state = 'dead'; setAct(e, 'death');
    const items = {};
    for (const [id, chance] of T_.loot) if (Math.random() < chance) items[id] = (items[id] || 0) + 1;
    e.loot = items;
    const W = worldOf(e.mapId);
    W.dead[e.sid] = G.time + RESPAWN[e.mapId];
    W.loot[e.sid] = { x: e.x, z: e.z, ang: e.ang, items };
    if (e.playerHit) {
      G.stats.kills++;
      addXp(T_.xp);
      questKill(e.type, e);
    } else if (by && distToPlayer(by) < 900) notify(`${by.name} killed the ${T_.name.toLowerCase()}.`, 'combat');
    emit('kill', e);
  } else {
    if (e.state !== 'attack' || Math.random() < 0.5) { e.state = 'pain'; setAct(e, 'pain'); }
    else if (e.state !== 'attack') e.state = 'chase';
  }
  return dealt;
}

// ---- Villagers in a fight -------------------------------------------------------------------
// Armed villagers (CAST fights) wade in when a wild animal is fighting nearby; everyone else
// runs. Nobody in town can be killed: badly hurt, they fall back and recover. Afterwards they
// walk back to where they were. Returns true when it has handled the villager this frame.
const distToPlayer = (e) => Math.hypot(Player.x - e.x, Player.z - e.z);
const FLEE_LINES = ['Help! Help!', 'Get it away from me!', 'Somebody do something!'];
function npcDefend(e, ents, map, P, ctx, dt, def) {
  const F = CAST[e.id].fights;
  e.hurt = Math.max(0, (e.hurt || 0) - dt);
  e.barkT = Math.max(0, (e.barkT || 0) - dt);
  e.cool = Math.max(0, (e.cool || 0) - dt);
  if (!e.fight && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + dt * 2);
  e.scan = (e.scan || 0) - dt;
  if (e.scan <= 0) {
    e.scan = 0.3;
    // Once running, keep running a little further than the distance that set them off.
    e.threat = findThreat(e, ents, map, (F ? 9 : 6) * (e.fleeing ? 1.5 : 1) * TILE);
    e.danger = e.away && !e.threat ? findThreat({ x: e.home[0], z: e.home[1] }, ents, map, 9 * TILE) : null;
  }
  let th = e.threat;
  if (th && (th.state === 'dead' || Math.hypot(th.x - e.x, th.z - e.z) > 12 * TILE)) th = e.threat = null;
  const say = (lines) => { if (e.barkT <= 0 && distToPlayer(e) < 900) { e.barkT = 7; ctx.bark(e, lines[Math.floor(Math.random() * lines.length)]); } };

  // A blow already under way plays out.
  if (e.act === 'attack') {
    const act = def.actions.attack;
    if (th) turnToward(e, Math.atan2(th.z - e.z, th.x - e.x), 6, dt);
    if (!e.hitDone && e.at * act.fps >= act.hit) {
      e.hitDone = true;
      if (th && Math.hypot(th.x - e.x, th.z - e.z) < F.reach + th.r + 8) {
        damageEnemy(th, rngInt(F.dmg[0], F.dmg[1]), ctx, e);
        if (distToPlayer(e) < 700) { ctx.sfx('hit', th.type); ctx.blood(th); }
      }
    }
    if (e.at * act.fps >= act.frames) { e.cool = F.cooldown; setAct(e, 'idle'); }
    return true;
  }
  if (th && F && !e.hurt && Math.hypot(e.x - e.home[0], e.z - e.home[1]) < 14 * TILE) {
    if (e.fight !== th) { e.fight = th; e.away = true; say(F.shout); ActorSprites.prefetch(e.defId, ['attack']); }
    const dx = th.x - e.x, dz = th.z - e.z, a = Math.atan2(dz, dx);
    if (Math.hypot(dx, dz) < F.reach + th.r) {
      turnToward(e, a, 6, dt);
      setAct(e, e.cool <= 0 && Math.abs(angTo(e.ang, a)) < 0.5 ? 'attack' : 'idle');
      return true;
    }
    stepToward(e, map, th.x, th.z, F.speed, dt, ctx, def);
    return true;
  }
  e.fight = null;
  if (th) {
    // Run directly away, sliding sideways when something is in the way.
    if (!e.fleeing) { e.fleeing = true; say(F ? ["I'm hurt! Fall back!", "I can't hold it!"] : FLEE_LINES); }
    e.away = true;
    const away = Math.atan2(e.z - th.z, e.x - th.x);
    if (e.stuck > 0.3) { e.dodge = (Math.random() < 0.5 ? 1 : -1) * 1.3; e.stuck = 0; }
    turnToward(e, away + (e.dodge || 0), 8, dt);
    const sp = 150, ox = e.x, oz = e.z;
    moveCircle(map, e, Math.cos(e.ang) * sp * dt, Math.sin(e.ang) * sp * dt, e.r, ctx.propGrid);
    e.stuck = Math.hypot(e.x - ox, e.z - oz) < sp * dt * 0.3 ? (e.stuck || 0) + dt : 0;
    if (!e.stuck && Math.random() < dt) e.dodge = 0;
    walkAnim(e, def, sp);
    return true;
  }
  e.fleeing = false;
  if (e.away && e.danger && e.danger.state !== 'dead') {
    // Wait at a safe distance, watching, until the fight near home is over.
    setAct(e, 'idle');
    turnToward(e, Math.atan2(e.danger.z - e.z, e.danger.x - e.x), 3, dt);
    return true;
  }
  if (e.away) {
    const hd = Math.hypot(e.home[0] - e.x, e.home[1] - e.z);
    if (hd < 8 || (e.wander && hd < e.wander * 0.8)) { e.away = false; e.target = null; e.wait = 1; return false; }
    const w = def.actions.walk;
    stepToward(e, map, e.home[0], e.home[1], w.travel * w.fps / w.frames, dt, ctx, def);
    return true;
  }
  return false;
}
// The closest wild animal worth reacting to: one already fighting within `range`, or any that
// has come right up close.
function findThreat(e, ents, map, range) {
  let best = null, bd = 1e9;
  for (const o of ents) {
    if (o.kind !== 'enemy' || o.state === 'dead') continue;
    const d = Math.hypot(o.x - e.x, o.z - e.z);
    const engaged = o.state === 'chase' || o.state === 'attack' || o.state === 'pain';
    if (d > (engaged ? range : 2.5 * TILE) || d >= bd) continue;
    if (lineOfSight(map, e.x, e.z, o.x, o.z)) { bd = d; best = o; }
  }
  return best;
}
function hurtNpc(n, dmg, ctx) {
  n.hp = Math.max(1, n.hp - dmg);
  if (distToPlayer(n) < 700) { ctx.blood(n); ctx.sfx('hit'); }
  if (n.hp <= n.maxHp * 0.25 && !n.hurt) { n.hurt = 10; n.fight = null; n.barkT = 0; }
}
function walkAnim(e, def, speed) {
  const w = def.actions.walk;
  setAct(e, 'walk');
  e.animRate = speed / (w.travel * w.fps / w.frames);
}
// Walk toward a point, pathing around walls and fences when there's no straight line.
function stepToward(e, map, tx, tz, speed, dt, ctx, def) {
  let goal = [tx, tz];
  if (!clearWalk(map, e.x, e.z, tx, tz, e.r)) {
    e.repath = (e.repath || 0) - dt;
    if (e.repath <= 0 || !e.path) { e.path = nextStep(map, e.x, e.z, tx, tz); e.repath = 0.5; }
    if (e.path) goal = e.path;
  }
  turnToward(e, Math.atan2(goal[1] - e.z, goal[0] - e.x), 6, dt);
  const ox = e.x, oz = e.z;
  moveCircle(map, e, Math.cos(e.ang) * speed * dt, Math.sin(e.ang) * speed * dt, e.r, ctx.propGrid);
  e.stuck = Math.hypot(e.x - ox, e.z - oz) < speed * dt * 0.3 ? (e.stuck || 0) + dt : 0;
  walkAnim(e, def, speed);
}
// True when nothing solid (any wall, however low, or water) lies on the straight line.
function clearWalk(map, ax, az, bx, bz, r) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 16);
  for (let i = 1; i <= n; i++) {
    const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
    if (map.solidAt(x, z) || map.solidAt(x + r, z) || map.solidAt(x - r, z) || map.solidAt(x, z + r) || map.solidAt(x, z - r)) return false;
  }
  return true;
}
