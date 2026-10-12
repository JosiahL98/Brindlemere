// Dev tool: sanity checks for the game world. Run with `node tools/validate.js`.
// Reports spawns, NPCs, props and door targets that land in walls or water,
// and item ids in shops, loot and backgrounds that don't exist.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const gameDir = path.join(__dirname, '..', 'game');
const html = fs.readFileSync(path.join(gameDir, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"( data-dom)?/g)].filter((m) => !m[2]).map((m) => m[1]);
for (const s of scripts) vm.runInThisContext(fs.readFileSync(path.join(gameDir, s), 'utf8'), { filename: s });

const MAPS = Object.assign({ town: buildTown() }, buildInteriors());
const problems = [];
const where = (map, x, z) => {
  const m = MAPS[map];
  if (!m) return `unknown map ${map}`;
  const tx = Math.floor(x), tz = Math.floor(z);
  if (!m.inside(tx, tz)) return 'outside the map';
  const i = m.idx(tx, tz);
  if (m.wall[i]) return `inside wall ${m.wall[i]}`;
  if (FLOORS[m.floor[i]].solid) return 'in water';
  return null;
};
const check = (what, map, x, z) => { const w = where(map, x, z); if (w) problems.push(`${what} at ${map} ${x},${z}: ${w}`); };

for (const [map, list] of Object.entries(SPAWNS)) for (const [type, x, z] of list) check(`spawn ${type}`, map, x, z);
for (const [id, c] of Object.entries(CAST)) check(`npc ${id}`, c.map, c.at[0], c.at[1]);
for (const [id, m] of Object.entries(MAPS)) {
  // Boats float and candles sit on counters, so those may overlap water and walls.
  for (const p of m.props) if (p.type !== 'boat' && p.type !== 'candle') check(`prop ${p.type}`, id, p.x / TILE, p.z / TILE);
  for (const d of m.doors.values()) if (d.to) check(`door ${id}->${d.to} target`, d.to, d.tx, d.tz);
}
const itemRefs = [];
for (const [id, s] of Object.entries(SHOPS)) for (const it of Object.keys(s.stock)) itemRefs.push([`shop ${id}`, it]);
for (const [id, t] of Object.entries(ENEMY_TYPES)) for (const [it] of t.loot || []) itemRefs.push([`loot ${id}`, it]);
for (const [id, b] of Object.entries(BACKGROUNDS)) for (const it of Object.keys(b.items || {})) itemRefs.push([`background ${id}`, it]);
for (const [what, it] of itemRefs) if (!ITEMS[it]) problems.push(`${what}: unknown item ${it}`);
for (const it of Object.keys(ITEMS)) if (!ITEM_ORDER.includes(ITEMS[it].type)) problems.push(`item ${it}: type ${ITEMS[it].type} not in ITEM_ORDER`);

console.log(problems.length ? problems.join('\n') : 'world OK');
process.exitCode = problems.length ? 1 : 0;
