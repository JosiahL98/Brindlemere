'use strict';
// Maps: the town of Brindlemere and its interiors. A map is a grid of 64-unit tiles with a wall
// style and a floor type per cell, plus doors, props and light sources.

const TILE = 64;

// Wall styles. tex: face textures picked per face by hash; door: the texture for door cells.
const STYLES = [null];
const STYLE = {};
function defStyle(id, o) { o.id = id; o.index = STYLES.length; STYLES.push(o); STYLE[id] = o; return o; }
defStyle('cliff', { h: 192, tex: ['cliff'] });
defStyle('houseA', { h: 128, tex: ['houseA', 'houseA', 'houseA2', 'houseA3'] });
defStyle('houseB', { h: 128, tex: ['houseB', 'houseB2', 'houseB', 'houseB3'] });
defStyle('houseC', { h: 128, tex: ['houseC', 'houseC2', 'houseC'] });
defStyle('inn', { h: 144, tex: ['inn', 'inn', 'inn2'] });
defStyle('chapel', { h: 160, tex: ['chapel', 'chapel2'] });
defStyle('smithy', { h: 112, tex: ['smithy', 'smithy2'] });
defStyle('barn', { h: 128, tex: ['barn'] });
defStyle('mill', { h: 144, tex: ['mill'] });
defStyle('drystone', { h: 28, tex: ['drystone'], cap: 'cobble' });
defStyle('fence', { h: 32, tex: ['fence'], cap: 'boards' });
defStyle('counter', { h: 40, tex: ['counter'], cap: 'boards' });
// Door cells use the door texture on every face; they are always placed mid-wall.
defStyle('doorA', { h: 128, tex: ['houseAdoor'], door: true });
defStyle('doorB', { h: 128, tex: ['houseBdoor'], door: true });
defStyle('doorC', { h: 128, tex: ['houseCdoor'], door: true });
defStyle('doorInn', { h: 144, tex: ['innDoor'], door: true });
defStyle('doorChapel', { h: 160, tex: ['chapelDoor'], door: true });
defStyle('doorSmithy', { h: 112, tex: ['smithyDoor'], door: true });
defStyle('doorBarn', { h: 128, tex: ['barnDoor'], door: true });
defStyle('doorMill', { h: 144, tex: ['millDoor'], door: true });
// Interiors
defStyle('intPlaster', { h: 96, tex: ['intPlaster'] });
defStyle('intWindow', { h: 96, tex: ['intWindow'] });
defStyle('intStone', { h: 96, tex: ['intStone'] });
defStyle('intStoneTall', { h: 160, tex: ['intStoneTall'] });
defStyle('intDoor', { h: 96, tex: ['intDoor'], door: true });
defStyle('fireplace', { h: 96, tex: ['fireplace0'], anim: ['fireplace0', 'fireplace1', 'fireplace2'] });
defStyle('shelvesStore', { h: 96, tex: ['shelvesStore'] });
defStyle('shelvesBakery', { h: 96, tex: ['shelvesBakery'] });
defStyle('shelvesHerbs', { h: 96, tex: ['shelvesHerbs'] });
defStyle('shelvesBar', { h: 96, tex: ['shelvesBar'] });
defStyle('shelvesBooks', { h: 96, tex: ['shelvesBooks'] });
defStyle('booksTall', { h: 160, tex: ['shelvesBooksTall'] });
const MAX_WALL_H = 192;

// Floor types
const FLOORS = [];
const FLOOR = {};
function defFloor(id, o) { o.id = id; o.index = FLOORS.length; FLOORS.push(o); FLOOR[id] = o; return o; }
defFloor('grass', { tex: ['grass', 'grass2'] });
defFloor('meadow', { tex: ['meadow'] });
defFloor('dirt', { tex: ['dirt'] });
defFloor('cobble', { tex: ['cobble'] });
defFloor('farmland', { tex: ['farmland'] });
defFloor('garden', { tex: ['garden'] });
defFloor('sand', { tex: ['sand'] });
defFloor('water', { tex: ['water0', 'water1', 'water2', 'water3'], anim: true, solid: true });
defFloor('boards', { tex: ['boards'] });
defFloor('flagstone', { tex: ['flagstone'] });
defFloor('straw', { tex: ['straw'] });

class GameMap {
  constructor(id, name, w, h, o = {}) {
    Object.assign(this, { id, name, w, h });
    this.wall = new Uint8Array(w * h);
    this.floor = new Uint8Array(w * h).fill(FLOOR[o.floor || 'grass'].index);
    this.outdoor = o.outdoor !== false;
    this.ceil = o.ceil || null;       // ceiling texture for interiors
    this.ceilH = o.ceilH || 96;
    this.light = o.light || 190;      // interior light level
    this.music = o.music || 'town';
    this.doors = new Map();           // cell index -> door
    this.props = [];                  // static props { type, x, z }
    this.lights = [];                 // { x, z, r, k, night }
    this.lightmap = new Float32Array(w * h);
    this.nightmap = new Float32Array(w * h);
  }
  idx(x, z) { return z * this.w + x; }
  inside(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.h; }
  setWall(x, z, style) { if (this.inside(x, z)) this.wall[this.idx(x, z)] = style ? STYLE[style].index : 0; }
  setFloor(x, z, f) { if (this.inside(x, z)) this.floor[this.idx(x, z)] = FLOOR[f].index; }
  wallAt(x, z) { return this.inside(x, z) ? this.wall[this.idx(x, z)] : 1; }
  floorAt(x, z) { return this.inside(x, z) ? FLOORS[this.floor[this.idx(x, z)]] : FLOORS[0]; }
  fillFloor(x0, z0, x1, z1, f) { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.setFloor(x, z, f); }
  fillWall(x0, z0, x1, z1, s) { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.setWall(x, z, s); }
  // A building block with one or more doors on its edge.
  building(x0, z0, w, h, style, doors = []) {
    this.fillWall(x0, z0, x0 + w - 1, z0 + h - 1, style);
    for (const d of doors) {
      this.setWall(d.x, d.z, d.style);
      this.doors.set(this.idx(d.x, d.z), d);
    }
  }
  prop(type, x, z, o) { this.props.push(Object.assign({ type, x: x * TILE, z: z * TILE }, o || {})); }
  addLight(x, z, r, k, night) { this.lights.push({ x, z, r, k, night: !!night }); }
  // Precompute light bonus per tile (in colormap levels), split into always-on and night-only.
  bakeLights() {
    this.lightmap.fill(0); this.nightmap.fill(0);
    for (const L of this.lights) {
      const r = Math.ceil(L.r);
      for (let z = Math.floor(L.z) - r; z <= Math.floor(L.z) + r; z++) for (let x = Math.floor(L.x) - r; x <= Math.floor(L.x) + r; x++) {
        if (!this.inside(x, z)) continue;
        const d = Math.hypot(x + 0.5 - L.x, z + 0.5 - L.z);
        if (d >= L.r) continue;
        const v = L.k * (1 - d / L.r) ** 1.3;
        const m = L.night ? this.nightmap : this.lightmap;
        m[this.idx(x, z)] = Math.max(m[this.idx(x, z)], v);
      }
    }
  }
  solidAt(wx, wz) {
    const x = Math.floor(wx / TILE), z = Math.floor(wz / TILE);
    if (!this.inside(x, z)) return true;
    const i = this.idx(x, z);
    return this.wall[i] !== 0 || FLOORS[this.floor[i]].solid;
  }
}

// ---- Brindlemere -------------------------------------------------------------------------
function riverZ(x) { return 48.6 + 1.4 * Math.sin(x * 0.16) + 0.5 * Math.sin(x * 0.41 + 1); }

function buildTown() {
  const m = new GameMap('town', 'Brindlemere', 64, 64, { outdoor: true, floor: 'grass', music: 'town' });
  const N = (x, z, s) => pfbm(x, z, 64, 8, s, 2);

  // Valley walls: cliffs of uneven thickness around the edge.
  for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) {
    const edge = Math.min(x, z, 63 - x, 63 - z);
    const t = 2 + Math.floor(N(x, z, 5) * 2.6);
    if (edge < t) m.setWall(x, z, 'cliff');
  }
  // Meadow in the north-west, the Whisper Wood floor in the north-east.
  for (let z = 2; z <= 11; z++) for (let x = 2; x <= 24; x++) if (N(x, z, 9) > 0.35) m.setFloor(x, z, 'meadow');
  // River with sandy banks, a bridge and a dock.
  for (let x = 0; x < 64; x++) {
    const zc = riverZ(x);
    for (let z = 40; z < 58; z++) {
      if (m.wall[m.idx(x, z)]) continue;
      const d = Math.abs(z + 0.5 - zc);
      if (d < 1.95) m.setFloor(x, z, 'water');
      else if (d < 3.1 + N(x, z, 3)) m.setFloor(x, z, 'sand');
    }
  }
  // Roads
  const road = (x, z) => (x >= 20 && x <= 48 && z >= 18 && z <= 42 ? 'cobble' : 'dirt');
  for (let x = 4; x <= 49; x++) for (const z of [30, 31]) m.setFloor(x, z, road(x, z));
  for (let z = 3; z <= 60; z++) for (const x of [32, 33]) {
    if (m.floorAt(x, z).id === 'water' || (m.floorAt(x, z).id === 'sand' && z > 44 && z < 53)) m.setFloor(x, z, 'boards');
    else m.setFloor(x, z, road(x, z));
  }
  const path = (pts, f = 'dirt', w = 1) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const n = Math.max(Math.abs(bx - ax), Math.abs(bz - az)) * 3;
      for (let k = 0; k <= n; k++) {
        const x = Math.round(lerp(ax, bx, k / n)), z = Math.round(lerp(az, bz, k / n));
        for (let dx = 0; dx < w; dx++) if (!m.wall[m.idx(x + dx, z)] && m.floorAt(x + dx, z).id !== 'water') m.setFloor(x + dx, z, f);
      }
    }
  };
  path([[50, 30], [53, 26], [55, 21], [56, 16], [56, 10]]);                  // into the Whisper Wood
  path([[13, 13], [19, 13], [19, 29]]);                                      // herbalist's path
  path([[6, 26], [6, 29]]);                                                  // farmhouse
  path([[32, 42], [24, 42], [19, 43]]);                                      // to the mill
  path([[33, 43], [42, 44], [46, 45]]);                                      // to the dock
  // Town square
  m.fillFloor(26, 26, 39, 35, 'cobble');
  m.fillFloor(20, 26, 26, 29, 'cobble');
  m.fillFloor(30, 15, 31, 19, 'cobble');
  // Fields and gardens
  m.fillFloor(10, 20, 17, 27, 'farmland');
  m.fillFloor(10, 33, 17, 39, 'farmland');
  m.fillFloor(16, 10, 18, 12, 'garden');
  m.fillFloor(42, 38, 44, 40, 'garden');
  // Bridge and dock planks over the water
  for (let z = 40; z < 58; z++) for (const x of [32, 33]) if (m.floorAt(x, z).id === 'water') m.setFloor(x, z, 'boards');
  for (let x = 46; x <= 48; x++) for (let z = 44; z <= 49; z++) if (m.floorAt(x, z).id === 'water' && z < riverZ(x) + 0.4) m.setFloor(x, z, 'boards');

  // Buildings: [x, z, w, h, style, doors]
  const D = (x, z, style, o) => Object.assign({ x, z, style }, o);
  m.building(20, 21, 7, 5, 'inn', [D(23, 25, 'doorInn', { to: 'inn', label: 'The Sleeping Goose', tx: 5.5, tz: 8.5, ta: -Math.PI / 2 })]);
  m.building(38, 21, 5, 4, 'houseB', [D(40, 24, 'doorB', { to: 'store', label: "Cedric's General Goods", tx: 4.5, tz: 6.5, ta: -Math.PI / 2 })]);
  m.building(44, 21, 3, 4, 'houseC', [D(45, 24, 'doorC', { to: 'home', label: 'Your home', tx: 3.5, tz: 5.5, ta: -Math.PI / 2 })]);
  m.building(20, 34, 5, 4, 'houseA', [D(22, 34, 'doorA', { to: 'bakery', label: "Hilda's Bakery", tx: 4.5, tz: 1.5, ta: Math.PI / 2 })]);
  m.building(40, 34, 4, 4, 'smithy', [D(41, 34, 'doorSmithy', { locked: "Tobin's workshop. He trades from the forge outside." })]);
  m.building(45, 34, 3, 4, 'houseB', [D(45, 36, 'doorB', { locked: "Agnes keeps her door bolted. She's probably in her garden." })]);
  m.building(27, 37, 4, 4, 'houseA', [D(28, 37, 'doorA', { locked: 'The Weavers live here. Nobody answers.' })]);
  m.building(35, 38, 4, 4, 'houseB', [D(36, 38, 'doorB', { locked: 'A private home. The door is locked.' })]);
  m.building(42, 26, 3, 3, 'houseA', [D(43, 28, 'doorA', { locked: "Guard Rolf's house. Locked." })]);
  m.building(25, 14, 5, 7, 'chapel', [D(29, 17, 'doorChapel', { to: 'chapel', label: 'Chapel of the Eight', tx: 4.5, tz: 10.5, ta: -Math.PI / 2 })]);
  m.building(12, 9, 4, 4, 'houseC', [D(13, 12, 'doorC', { to: 'herbs', label: "Wren's Remedies", tx: 3.5, tz: 5.5, ta: -Math.PI / 2 })]);
  m.building(4, 22, 5, 4, 'houseA', [D(6, 25, 'doorA', { locked: "Odo's farmhouse. He's out in the fields." })]);
  m.building(4, 33, 6, 5, 'barn', [D(6, 33, 'doorBarn', { locked: 'The barn door is barred from the inside. Something scratches behind it.' })]);
  m.building(15, 41, 4, 4, 'mill', [D(16, 41, 'doorMill', { locked: "Godwin's mill. The machinery inside thunders away." })]);
  // Chapel graveyard walls and the east gate
  for (let z = 13; z <= 20; z++) m.setWall(20, z, 'drystone');
  for (let x = 21; x <= 24; x++) { m.setWall(x, 13, 'drystone'); m.setWall(x, 21, 'drystone'); }
  for (const z of [26, 27, 28, 29, 32, 33, 34, 35]) m.setWall(49, z, 'drystone');
  // Farm fences
  for (let x = 10; x <= 17; x++) { if (x !== 13) m.setWall(x, 19, 'fence'); m.setWall(x, 40, 'fence'); }
  for (let z = 37; z <= 40; z++) m.setWall(41, z, 'fence');

  // ---- Props ----
  const free = (x, z) => !m.wall[m.idx(x, z)] && ['grass', 'meadow'].includes(m.floorAt(x, z).id);
  const rng1 = rng(4242);
  // Whisper Wood: dense pines with oaks and undergrowth, a clearing for the den.
  for (let z = 2; z <= 28; z++) for (let x = 40; x <= 61; x++) {
    if (!free(x, z)) continue;
    if (z > 14 && x < 47) continue;
    if (Math.hypot(x - 55, z - 9) < 3.2) continue;
    const d = 0.38 + (x - 40) * 0.012;
    if (rng1() < d) m.prop(rng1() < 0.72 ? 'pine' : 'oak', x + 0.2 + rng1() * 0.6, z + 0.2 + rng1() * 0.6);
    else if (rng1() < 0.15) m.prop(rng1() < 0.6 ? 'bush' : 'fern', x + rng1(), z + rng1());
  }
  for (const [x, z] of [[54, 8], [56.5, 10.5], [53.5, 10.2]]) m.prop('rock', x, z);
  m.prop('bones', 55.2, 9.2);
  // Meadow: bluebells to pick, scattered oaks and birches.
  const bells = [[4.5, 4.5], [7.5, 6.2], [9.2, 3.6], [5.6, 9.1], [10.6, 8.3], [17.5, 5.5], [20.2, 3.8], [22.6, 7.6], [19.1, 8.8], [3.6, 7.3], [14.3, 4.2], [12.2, 6.9]];
  bells.forEach(([x, z], i) => m.prop('bluebell', x, z, { pick: 'bluebell', id: 'bell' + i }));
  for (let i = 0; i < 26; i++) {
    const x = 3 + Math.floor(rng1() * 36), z = 2 + Math.floor(rng1() * 11);
    if (free(x, z) && Math.abs(x - 32.5) > 2 && Math.hypot(x - 14, z - 11) > 4) m.prop(rng1() < 0.6 ? 'oak' : 'birch', x + 0.5, z + 0.5);
  }
  // South of the river: open grass, trees and stones.
  for (let i = 0; i < 40; i++) {
    const x = 3 + Math.floor(rng1() * 58), z = 53 + Math.floor(rng1() * 8);
    if (free(x, z) && Math.abs(x - 32.5) > 2) m.prop(['oak', 'pine', 'birch', 'rock', 'bush'][Math.floor(rng1() * 5)], x + 0.5, z + 0.5);
  }
  // West and around the farm
  for (let i = 0; i < 16; i++) {
    const x = 3 + Math.floor(rng1() * 8), z = 12 + Math.floor(rng1() * 28);
    if (free(x, z) && (z < 21 || z > 28)) m.prop(rng1() < 0.5 ? 'oak' : 'bush', x + 0.5, z + 0.5);
  }
  // Riverbank reeds
  for (let x = 3; x < 61; x++) {
    const z = Math.floor(riverZ(x) - 2.6);
    if (rng1() < 0.35 && m.floorAt(x, z).id === 'sand' && !(x >= 31 && x <= 34)) m.prop('reeds', x + rng1(), z + rng1());
  }
  // Town furniture
  m.prop('well', 29.5, 28.5);
  m.prop('stall', 36.5, 27.6, { variant: 'apples' });
  m.prop('stall', 36.5, 34.0, { variant: 'cloth' });
  m.prop('stall', 28.6, 34.0, { variant: 'pots' });
  m.prop('bench', 27.2, 29.6); m.prop('bench', 31.0, 26.9);
  m.prop('noticeboard', 34.6, 26.6, { read: 'notice' });
  for (const [x, z] of [[26.5, 26.5], [39.5, 26.5], [26.5, 35.5], [39.5, 35.5], [33.9, 20.5], [33.9, 39.5], [21.5, 29.3], [44.5, 29.3], [50.4, 29.5], [50.4, 32.5], [33.9, 44.2]]) {
    m.prop('lamppost', x, z);
    m.addLight(x, z, 3.4, 12, true);
  }
  m.prop('sign', 24.6, 26.4, { variant: 'inn' });
  m.prop('sign', 41.6, 25.4, { variant: 'store' });
  m.prop('sign', 23.6, 33.5, { variant: 'bakery' });
  m.prop('sign', 42.6, 33.5, { variant: 'smithy' });
  m.prop('sign', 14.6, 13.5, { variant: 'herbs' });
  m.prop('forge', 38.4, 33.0); m.addLight(38.4, 33.0, 2.6, 6, false);
  m.prop('anvil', 37.4, 34.4, { ang: 0.88 }); // turned to face Tobin, who works at it
  m.prop('weaponrack', 39.4, 32.4);
  for (const [x, z] of [[37.4, 21.5], [37.4, 22.5], [43.4, 21.4], [27.4, 21.4], [27.4, 24.6], [19.6, 34.4], [25.4, 37.6], [44.6, 33.6]]) m.prop(rng1() < 0.5 ? 'barrel' : 'crate', x, z);
  m.prop('cart', 41.8, 28.6);
  m.prop('dummy', 18.4, 27.6);
  m.prop('haystack', 9.5, 31.6); m.prop('haystack', 10.6, 28.6); m.prop('haystack', 3.6, 30.4);
  m.prop('signpost', 34.4, 4.2, { read: 'northroad' });
  m.prop('signpost', 34.4, 58.2, { read: 'southroad' });
  m.prop('signpost', 51.0, 28.6, { read: 'woodroad' });
  for (const [x, z] of [[31.6, 3.4], [33.4, 3.2], [32.6, 3.05]]) m.prop('rock', x, z);
  for (const [x, z] of [[21.5, 15], [23.2, 15.2], [21.6, 17.3], [23.2, 17.6], [22.2, 19.4]]) m.prop('grave', x, z);
  m.prop('waterwheel', 17.0, 46.6);
  m.prop('boat', 49.6, 48.6);
  m.prop('crate', 46.4, 44.6); m.prop('barrel', 48.6, 44.8);
  m.prop('scarecrow', 13.5, 23.5); m.prop('scarecrow', 14.5, 36.5);
  m.prop('woodpile', 9.6, 23.0);
  m.bakeLights();
  return m;
}

// ---- Interiors ---------------------------------------------------------------------------
// Legend: # wall, W window, F fireplace, S shelves (o.shelf), K books, D exit door, c counter,
//         d inner door (o.inner), . floor. Props are placed separately by coordinates.
function buildInterior(id, name, rows, o) {
  const w = rows[0].length, h = rows.length;
  const m = new GameMap(id, name, w, h, { outdoor: false, floor: o.floor || 'boards', ceil: o.ceil || 'beams', ceilH: o.ceilH || 96, light: o.light || 188, music: o.music || 'interior' });
  const wallStyle = o.wall || 'intPlaster';
  rows.forEach((row, z) => [...row].forEach((ch, x) => {
    const st = { '#': wallStyle, W: 'intWindow', F: 'fireplace', S: o.shelf || 'shelvesStore', K: 'shelvesBooks', D: 'intDoor', c: 'counter', d: 'intDoor' }[ch];
    if (st) m.setWall(x, z, st);
    if (ch === 'D') m.doors.set(m.idx(x, z), Object.assign({ x, z }, o.exit));
    if (ch === 'd') m.doors.set(m.idx(x, z), Object.assign({ x, z }, o.inner));
    if (ch === 'F') m.addLight(x + 0.5, z + 0.5, 4, 7, false);
  }));
  return m;
}

function buildInteriors() {
  const maps = {};
  const out = (tx, tz, ta, label = 'Brindlemere') => ({ to: 'town', label, tx, tz, ta });
  maps.home = buildInterior('home', 'Your home', [
    '##W##F##',
    '#......#',
    '#......#',
    '#......#',
    '#......#',
    '#......#',
    '###D####',
  ], { exit: out(45.5, 25.5, Math.PI / 2) });
  maps.home.prop('bed', 1.6, 1.6); maps.home.prop('table', 4.5, 2.6); maps.home.prop('stool', 4.5, 3.6); maps.home.prop('stool', 5.4, 2.5);
  maps.home.prop('chest', 1.6, 4.6, { container: 'homechest' }); maps.home.prop('barrel', 6.4, 5.4); maps.home.prop('candle', 4.5, 2.4);
  maps.home.addLight(4.5, 2.6, 3, 5, false);

  maps.inn = buildInterior('inn', 'The Sleeping Goose', [
    '###W#F##SSS#',
    '#..........#',
    '#.......ccc#',
    '#..........#',
    '#..........#',
    'd..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#####D######',
  ], { shelf: 'shelvesBar', exit: out(23.5, 26.5, Math.PI / 2, 'Brindlemere'), inner: { to: 'cellar', label: 'Cellar', tx: 1.5, tz: 1.5, ta: Math.PI / 2 } });
  for (const [x, z] of [[2.5, 2.6], [5.5, 3.4], [2.6, 7.4], [8.6, 6.6]]) {
    maps.inn.prop('table', x, z); maps.inn.prop('stool', x + 0.9, z); maps.inn.prop('stool', x - 0.9, z);
  }
  maps.inn.prop('barrel', 10.4, 7.6); maps.inn.prop('barrel', 10.4, 8.5); maps.inn.prop('barrel', 7.4, 1.4);
  maps.inn.prop('candle', 2.5, 2.4); maps.inn.prop('candle', 5.5, 3.2); maps.inn.prop('candle', 8.6, 6.4);
  maps.inn.addLight(5.5, 3.4, 6, 4, false); maps.inn.addLight(8.6, 6.6, 4, 4, false);

  maps.cellar = buildInterior('cellar', 'Inn Cellar', [
    '##########',
    'd........#',
    '#..##....#',
    '#........#',
    '#.....##.#',
    '#........#',
    '#.##.....#',
    '#........#',
    '##########',
  ], { wall: 'intStone', floor: 'flagstone', ceil: 'vault', light: 110, music: 'cellar', inner: { to: 'inn', label: 'The Sleeping Goose', tx: 1.5, tz: 5.5, ta: 0 } });
  for (const [x, z] of [[8.4, 1.5], [8.4, 2.5], [7.4, 1.5], [1.5, 7.5], [5.5, 7.4]]) maps.cellar.prop('barrel', x, z);
  for (const [x, z] of [[4.5, 5.6], [8.4, 7.4], [6.5, 1.4]]) maps.cellar.prop('crate', x, z);
  maps.cellar.prop('candle', 1.5, 3.5); maps.cellar.addLight(1.5, 3.5, 3.5, 5, false);

  maps.store = buildInterior('store', "Cedric's General Goods", [
    '##SSSSS##',
    '#.......#',
    '#.ccccc.#',
    '#.......#',
    'W.......W',
    '#.......#',
    '#.......#',
    '####D####',
  ], { shelf: 'shelvesStore', exit: out(40.5, 25.5, Math.PI / 2) });
  for (const [x, z] of [[1.5, 5.5], [7.5, 5.5], [7.5, 6.5]]) maps.store.prop('crate', x, z);
  maps.store.prop('barrel', 1.5, 6.5); maps.store.prop('sacks', 7.4, 3.6); maps.store.prop('candle', 4.5, 2.3);
  maps.store.addLight(4.5, 2.5, 4, 4, false);

  maps.bakery = buildInterior('bakery', "Hilda's Bakery", [
    '####D###',
    '#......#',
    '#......#',
    'W.cccc.#',
    '#......#',
    '#SS.FSS#',
    '########',
  ], { shelf: 'shelvesBakery', exit: out(22.5, 33.5, -Math.PI / 2) });
  maps.bakery.prop('sacks', 1.5, 1.5); maps.bakery.prop('sacks', 6.5, 1.6); maps.bakery.prop('table', 1.6, 4.4);

  maps.herbs = buildInterior('herbs', "Wren's Remedies", [
    '##SSS##',
    '#.....#',
    'S.....W',
    '#..c..#',
    '#.....#',
    '#.....#',
    '###D###',
  ], { shelf: 'shelvesHerbs', exit: out(13.5, 13.5, Math.PI / 2) });
  maps.herbs.prop('cauldron', 4.6, 1.5); maps.herbs.addLight(4.6, 1.5, 3, 5, false);
  maps.herbs.prop('herbs', 1.5, 4.5); maps.herbs.prop('herbs', 5.5, 4.5); maps.herbs.prop('table', 1.6, 1.6); maps.herbs.prop('candle', 1.6, 1.4);

  maps.chapel = buildInterior('chapel', 'Chapel of the Eight', [
    '#########',
    '#K.....K#',
    '#.......#',
    '#.......#',
    'W.......W',
    '#.......#',
    '#.......#',
    'W.......W',
    '#.......#',
    '#.......#',
    '#.......#',
    '#.......D',
    '#########',
  ], { wall: 'intStoneTall', floor: 'flagstone', ceil: 'vault', ceilH: 160, light: 150, music: 'chapel', exit: out(30.5, 17.5, 0) });
  // Fix the K shelves to the tall stone height
  maps.chapel.setWall(1, 1, 'booksTall'); maps.chapel.setWall(7, 1, 'booksTall');
  maps.chapel.setWall(0, 4, 'intStoneTall'); maps.chapel.setWall(8, 4, 'intStoneTall'); maps.chapel.setWall(0, 7, 'intStoneTall'); maps.chapel.setWall(8, 7, 'intStoneTall');
  maps.chapel.prop('altar', 4.5, 1.6); maps.chapel.prop('candle', 3.4, 1.5); maps.chapel.prop('candle', 5.6, 1.5);
  maps.chapel.addLight(4.5, 1.8, 4.5, 7, false);
  for (let z = 4; z <= 9; z += 1.6) { maps.chapel.prop('pew', 2.8, z); maps.chapel.prop('pew', 6.2, z); }
  for (const m of Object.values(maps)) m.bakeLights();
  return maps;
}
