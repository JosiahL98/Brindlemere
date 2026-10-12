'use strict';
// Villagers baked from 3D models (tools/tripo.js, then tools/bake-mesh.js) instead of being
// sculpted at runtime. Each file in data/baked/ adds an entry: per-action timing, a sprite
// index, and every frame's palette indices (0 = transparent) as one deflated blob.

const BAKED = {};
// The first-person arm and weapons (tools/bake-viewmodel.js): sprites placed in screen
// coordinates, filled in by data/baked/viewmodel.js.
const BAKED_VM = {};

// The actor definition the rest of the game sees: same shape as makePerson's, but nothing to
// build, since every frame already exists.
function bakedDef(id, look) {
  const B = BAKED[id];
  const actions = {};
  for (const [name, a] of Object.entries(B.actions)) actions[name] = { frames: a.frames, fps: a.fps, loop: a.loop !== false, hit: a.hit, travel: a.travel, pose: () => ({}) };
  return { id, look, baked: true, res: B.res, height: B.height, actions, build: () => {}, portrait: null };
}

// Unpacks every baked villager into the sprite cache. Resolves once all are ready.
async function loadBaked() {
  for (const [id, B] of Object.entries(BAKED)) {
    const raw = await bakedData(B);
    let off = 0;
    const take = (w, h) => {
      const data = new Uint16Array(w * h);
      for (let i = 0; i < w * h; i++) { const v = raw[off + i]; data[i] = v ? v : 0xFFFF; }
      off += w * h;
      return data;
    };
    for (const [action, frame, rot, w, h, ax, ay] of B.index) {
      ActorSprites.pinned.set(ActorSprites.key(id, action, frame, rot), { w, h, ax, ay, res: B.res, data: take(w, h) });
    }
    const [w, h, ax, ay, res] = B.portrait;
    ACTOR_DEFS()[id].portrait = { w, h, ax, ay, res, data: take(w, h) };
    delete B.data; // the cache holds it now
  }
  if (BAKED_VM.data || BAKED_VM.parts) {
    const raw = await bakedData(BAKED_VM);
    let off = 0;
    BAKED_VM.sprites = {};
    for (const [kind, id, set, frame, w, h, x0, y0] of BAKED_VM.index) {
      const data = new Uint16Array(w * h);
      for (let i = 0; i < w * h; i++) { const v = raw[off + i]; data[i] = v ? v : 0xFFFF; }
      off += w * h;
      BAKED_VM.sprites[`${kind}:${id}:${set}:${frame}`] = { w, h, x0, y0, data };
    }
    delete BAKED_VM.data;
    if (typeof _vmCache !== 'undefined') _vmCache.clear(); // drop any sculpted stand-ins
  }
}
// The pixel data is inline in the local game; the published build fetches it from text pieces
// (file-0.txt, file-1.txt, ...) to keep each upload small.
async function bakedData(B) {
  if (B.data) return inflate(B.data);
  const parts = [];
  for (let i = 0; i < B.parts; i++) parts.push(await (await fetch(`${B.file}-${i}.txt`)).text());
  return inflate(parts.join(''));
}
async function inflate(b64) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Uint8Array(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
}
