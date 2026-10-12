'use strict';
// The player: movement, stamina, health regeneration, attacking, and working out what is in
// front of you to interact with.

const Player = {
  x: 0, z: 0, ang: 0, pitch: 0, r: 13, eye: 50, bobT: 0, moving: 0,
  swing: null, sinceHurt: 99, sinceRun: 99, target: null,
};
const WALK = 140, RUN = 235, EYE = 50;

function updatePlayer(dt, input, map, ents, ctx) {
  const P = Player;
  // Look
  P.ang += (input.turn * 2.6 * dt) + input.lookX;
  P.pitch = clamp(P.pitch - input.lookY, -1.45, 1.45); // radians, nearly straight up or down
  // Move
  let fx = input.fwd, sx = input.strafe;
  const len = Math.hypot(fx, sx);
  if (len > 1) { fx /= len; sx /= len; }
  const moving = len > 0.05;
  const running = moving && input.run && G.p.st > 2;
  const speed = (running ? RUN : WALK) * Math.min(1, len);
  const ca = Math.cos(P.ang), sa = Math.sin(P.ang);
  const dx = (ca * fx - sa * sx) * speed * dt, dz = (sa * fx + ca * sx) * speed * dt;
  const ox = P.x, oz = P.z;
  moveCircle(map, P, dx, dz, P.r, ctx.propGrid);
  for (const e of ents) {
    if (e.state === 'dead') continue;
    const ex = P.x - e.x, ez = P.z - e.z, d = Math.hypot(ex, ez), min = P.r + e.r;
    if (d < min && d > 0.01) moveCircle(map, P, ex / d * (min - d), ez / d * (min - d), P.r);
  }
  const moved = Math.hypot(P.x - ox, P.z - oz);
  P.moving = moved / Math.max(dt, 1e-4);
  if (moved > 0.2) P.bobT += moved / 26;
  P.eye = EYE + Math.sin(P.bobT * 2) * (moved > 0.2 ? 1.6 : 0) * (running ? 1.4 : 1);
  // Stamina and health
  if (running && moved > 0.2) { G.p.st = Math.max(0, G.p.st - 14 * dt); P.sinceRun = 0; } else P.sinceRun += dt;
  if (P.sinceRun > 0.8 && !P.swing) G.p.st = Math.min(maxSt(), G.p.st + 11 * dt);
  P.sinceHurt += dt;
  if (P.sinceHurt > 6 && !ctx.inCombat) G.p.hp = Math.min(maxHp(), G.p.hp + 0.5 * dt);
  // Attack
  const W = weaponItem();
  if (input.attack && !P.swing && G.p.st >= 4) {
    P.swing = { t: 0, dur: W.swing, hit: false };
    G.p.st = Math.max(0, G.p.st - (W.swing > 0.5 ? 10 : 7));
    ctx.sfx('swing', W.model);
  }
  if (P.swing) {
    P.swing.t += dt;
    if (!P.swing.hit && P.swing.t >= P.swing.dur * 0.42) { P.swing.hit = true; meleeHit(map, ents, W, ctx); }
    if (P.swing.t >= P.swing.dur * 1.15) P.swing = null;
  }
  P.target = findTarget(map, ents);
}

function meleeHit(map, ents, W, ctx) {
  const P = Player;
  let best = null, bd = 1e9;
  for (const e of ents) {
    if (e.state === 'dead') continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    const reach = W.reach + (e.r || 10);
    if (d > reach) continue;
    const off = Math.abs(angTo(P.ang, Math.atan2(dz, dx)));
    if (off > Math.atan2((e.r || 10) + 10, d) + 0.3) continue;
    if (!lineOfSight(map, P.x, P.z, e.x, e.z)) continue;
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return;
  if (best.kind === 'npc') { ctx.bark(best, ['Hey! Watch it!', 'Do that again and I call the guard.', 'Is that supposed to be funny?'][Math.floor(Math.random() * 3)]); return; }
  if (best.kind === 'cat') { ctx.bark(best, 'Mittens hisses and swats at you.'); return; }
  let dmg = rngInt(W.dmg[0], W.dmg[1]) + damageBonus();
  let sneak = false;
  if (best.state === 'idle' || best.state === 'wander') { dmg = Math.round(dmg * 1.5); sneak = true; }
  const dealt = damageEnemy(best, dmg, ctx);
  ctx.sfx('hit', best.type);
  if (sneak) notify(`Sneak attack for ${dealt} damage!`, 'combat');
  ctx.blood(best);
}

// What's in front of the player that can be used: people, corpses, items, doors.
function findTarget(map, ents) {
  const P = Player;
  let best = null, bd = 1e9;
  const consider = (o, x, z, half, range) => {
    const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
    if (d > range) return;
    const off = Math.abs(angTo(P.ang, Math.atan2(dz, dx)));
    if (off > Math.atan2(half, Math.max(d, 1)) + 0.08) return;
    if (!lineOfSight(map, P.x, P.z, x, z)) return;
    if (d < bd) { bd = d; best = o; }
  };
  for (const e of ents) {
    if (e.kind === 'npc') consider({ kind: 'npc', e, verb: 'Talk to', label: e.name }, e.x, e.z, 18, 160);
    else if (e.kind === 'cat') consider({ kind: 'cat', e, verb: 'Pick up', label: 'Mittens' }, e.x, e.z, 10, 80);
    else if (e.state === 'dead' && e.at > 0.6) consider({ kind: 'corpse', e, verb: 'Search', label: e.name }, e.x, e.z, 18, 90);
  }
  for (const p of map.props) {
    if (p.taken) continue;
    if (p.pick) consider({ kind: 'pick', p, verb: 'Pick', label: ITEMS[p.pick].name }, p.x, p.z, 10, 80);
    else if (p.read) consider({ kind: 'read', p, verb: 'Read', label: p.type === 'noticeboard' ? 'Notice board' : 'Sign' }, p.x, p.z, 14, 100);
    else if (p.container) consider({ kind: 'container', p, verb: 'Open', label: 'Chest' }, p.x, p.z, 14, 90);
    else if (p.type === 'bed' && map.id === 'home') consider({ kind: 'bed', p, verb: 'Sleep in', label: 'your bed' }, p.x, p.z, 18, 90);
  }
  // Doors: the first wall straight ahead.
  const ca = Math.cos(P.ang), sa = Math.sin(P.ang);
  for (let d = 8; d < 112; d += 4) {
    const tx = Math.floor((P.x + ca * d) / TILE), tz = Math.floor((P.z + sa * d) / TILE);
    if (!map.inside(tx, tz)) break;
    const w = map.wall[map.idx(tx, tz)];
    if (!w) continue;
    const door = map.doors.get(map.idx(tx, tz));
    if (door && d < bd) best = { kind: 'door', door, verb: door.locked ? '' : (map.outdoor ? 'Enter' : 'Go to'), label: door.locked ? 'Locked door' : door.label };
    break;
  }
  return best;
}
