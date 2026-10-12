'use strict';
// Heads-up display drawn straight into the 320x200 frame buffer with the bitmap font.

const MAP_PARENT = { inn: 'town', cellar: 'inn', home: 'town', store: 'town', bakery: 'town', herbs: 'town', chapel: 'town' };
function mapChain(id) { const c = [id]; while (MAP_PARENT[c[c.length - 1]]) c.push(MAP_PARENT[c[c.length - 1]]); return c; }
// Where a quest target is, as seen from the current map: the spot itself, or the door that leads toward it.
function resolveTarget(t, mapId, map, ents) {
  let tm, x, z;
  if (t.npc) {
    const live = ents.find((e) => e.kind === 'npc' && e.id === t.npc);
    if (live) return { x: live.x, z: live.z };
    tm = CAST[t.npc].map; x = CAST[t.npc].at[0] * TILE; z = CAST[t.npc].at[1] * TILE;
  } else { tm = t.map; x = t.x * TILE; z = t.z * TILE; }
  if (tm === mapId) return { x, z };
  const here = mapChain(mapId), there = mapChain(tm);
  // Go down toward a child on the target's chain, otherwise out through the exit.
  const child = there.find((m) => MAP_PARENT[m] === mapId);
  for (const [i, d] of map.doors) {
    if (d.locked) continue;
    if ((child && d.to === child) || (!child && d.to === here[1])) return { x: (d.x + 0.5) * TILE, z: (d.z + 0.5) * TILE, door: true };
  }
  return null;
}
function questMarkers(mapId, map, ents) {
  const out = [];
  for (const id of QUEST_ORDER) {
    if (!qActive(id)) continue;
    const q = G.quests[id];
    for (const t of QUESTS[id].targets(q)) { const r = resolveTarget(t, mapId, map, ents); if (r) out.push(Object.assign(r, { quest: id })); }
  }
  return out;
}

function fillRect(fb, x, y, w, h, c) {
  for (let j = Math.max(0, y); j < Math.min(VH, y + h); j++) for (let i = Math.max(0, x); i < Math.min(VW, x + w); i++) fb[j * VW + i] = c;
}
function shadeRect(fb, x, y, w, h, cmaps, lvl) {
  for (let j = Math.max(0, y); j < Math.min(VH, y + h); j++) for (let i = Math.max(0, x); i < Math.min(VW, x + w); i++) fb[j * VW + i] = cmaps[lvl * 256 + fb[j * VW + i]];
}
function textC(fb, x, y, str, c, sh) { drawText(fb, VW, Math.round(x - textWidth(str) / 2), y, str, c, sh); }
const HUDC = { gold: R.GOLD + 12, goldDim: R.GOLD + 8, white: R.BONE + 14, ink: R.BONE + 11, red: R.RED + 11, green: R.GREEN + 10, shadow: R.GRAY, dark: R.GRAY + 1, blue: R.BLUE + 11 };

function drawBar(fb, x, y, w, frac, col, colDark) {
  fillRect(fb, x - 1, y - 1, w + 2, 6, R.GRAY + 0);
  fillRect(fb, x, y, w, 4, R.GRAY + 2);
  const f = Math.round(w * clamp(frac, 0, 1));
  fillRect(fb, x, y, f, 4, col);
  fillRect(fb, x, y + 3, f, 1, colDark);
  fillRect(fb, x, y, f, 1, col + 2 > 255 ? col : col + 2);
}

function drawHud(fb, ctx) {
  const P = Player;
  const cm = ctx.cmaps;
  // Compass
  const cx = VW / 2, cw = 150, cy = 4;
  shadeRect(fb, cx - cw / 2, cy, cw, 11, cm, 18);
  fillRect(fb, cx - cw / 2, cy, cw, 1, R.GOLD + 7); fillRect(fb, cx - cw / 2, cy + 10, cw, 1, R.GOLD + 5);
  const toX = (ang) => { const rel = angTo(P.ang, ang); return Math.abs(rel) < Math.PI / 2 ? cx + rel / (Math.PI / 2) * (cw / 2 - 6) : null; };
  for (let i = 0; i < 16; i++) {
    const a = i * TAU / 16, x = toX(a);
    if (x === null) continue;
    if (i % 4 === 0) { const L = { 0: 'E', 4: 'S', 8: 'W', 12: 'N' }[i]; drawText(fb, VW, Math.round(x - 2), cy + 2, L, L === 'N' ? HUDC.red : HUDC.gold, HUDC.shadow); }
    else fillRect(fb, Math.round(x), cy + (i % 2 ? 6 : 4), 1, i % 2 ? 2 : 4, R.GOLD + 6);
  }
  for (const m of ctx.markers) {
    const x = toX(Math.atan2(m.z - P.z, m.x - P.x));
    if (x === null) continue;
    const X = Math.round(x);
    for (let j = 0; j < 4; j++) fillRect(fb, X - 3 + j, cy + 1 + j, 7 - j * 2, 1, j === 0 ? R.GOLD + 15 : R.GOLD + 12);
  }
  for (const e of ctx.ents) {
    if (e.kind !== 'enemy' || e.state === 'dead' || (e.state !== 'chase' && e.state !== 'attack' && e.state !== 'pain')) continue;
    const x = toX(Math.atan2(e.z - P.z, e.x - P.x));
    if (x !== null) fillRect(fb, Math.round(x) - 1, cy + 7, 3, 2, R.RED + 12);
  }
  // Enemy health under the compass
  const lh = ctx.lastHit;
  if (lh && performance.now() - lh.t < 3500 && lh.e) {
    textC(fb, cx, cy + 15, lh.e.name, HUDC.ink, HUDC.shadow);
    drawBar(fb, cx - 30, cy + 24, 60, lh.e.hp / lh.e.maxHp, R.RED + 10, R.RED + 6);
  }
  // Crosshair and prompt
  if (!ctx.ui) {
    fb[100 * VW + 160] = R.BONE + 13; fb[100 * VW + 159] = R.GRAY + 2; fb[100 * VW + 161] = R.GRAY + 2;
    if (P.target) {
      const t = P.target;
      const line = t.verb ? `${t.verb} ${t.label}` : t.label;
      textC(fb, cx, 112, line, t.kind === 'door' && t.door.locked ? HUDC.ink : HUDC.white, HUDC.shadow);
      textC(fb, cx, 121, ctx.touch ? 'TAP USE' : 'E', HUDC.goldDim, HUDC.shadow);
    }
  }
  // Bars
  drawText(fb, VW, 6, VH - 21, 'HP', HUDC.goldDim, HUDC.shadow);
  drawBar(fb, 20, VH - 20, 70, G.p.hp / maxHp(), R.RED + 10, R.RED + 6);
  drawText(fb, VW, 6, VH - 12, 'ST', HUDC.goldDim, HUDC.shadow);
  drawBar(fb, 20, VH - 11, 70, G.p.st / maxSt(), R.GREEN + 10, R.GREEN + 6);
  // Gold, level and clock
  const gold = `${G.p.gold} GOLD`;
  drawText(fb, VW, VW - textWidth(gold) - 6, VH - 12, gold, HUDC.gold, HUDC.shadow);
  drawText(fb, VW, VW - textWidth(`LV ${G.p.level}`) - 6, VH - 21, `LV ${G.p.level}`, HUDC.ink, HUDC.shadow);
  const clock = clockText().toUpperCase();
  drawText(fb, VW, VW - textWidth(clock) - 5, 4, clock, HUDC.ink, HUDC.shadow);
  // Notifications
  const now = performance.now();
  const msgs = G.messages.filter((m) => now - m.t < 6000).slice(-4);
  msgs.forEach((m, i) => {
    const col = { quest: HUDC.gold, level: HUDC.green, gold: HUDC.gold, combat: HUDC.red, item: HUDC.ink }[m.kind] || HUDC.white;
    drawText(fb, VW, 5, 18 + i * 9, m.text.toUpperCase().slice(0, 50), col, HUDC.shadow);
  });
  // Location name and banners
  if (ctx.banner && now - ctx.banner.t < 3200) {
    textC(fb, cx, 60, ctx.banner.text.toUpperCase(), HUDC.gold, HUDC.shadow);
    if (ctx.banner.sub) textC(fb, cx, 70, ctx.banner.sub.toUpperCase(), HUDC.ink, HUDC.shadow);
  }
}
