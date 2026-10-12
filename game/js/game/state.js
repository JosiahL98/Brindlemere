'use strict';
// Game state: the player, inventory, equipment, time, quests and flags, and save/load.

const SAVE_KEY = 'brindlemere-save-v1';
const MIN_PER_SEC = 1;               // one real second is one game minute: a day lasts 24 minutes
const BACKGROUNDS = {
  farmhand: { name: 'Farmhand', desc: 'Years of hauling hay. +10 stamina, a wooden club, and calluses.', gold: 15, items: { wood_club: 1, apple: 2 }, weapon: 'wood_club', stamina: 10 },
  fisher: { name: "Fisher's Child", desc: 'Raised on the riverbank. A fishing knife, smoked trout, and a little more coin.', gold: 30, items: { fishing_knife: 1, fish: 2 }, weapon: 'fishing_knife' },
  smith: { name: "Smith's Apprentice", desc: 'Two winters at Tobin\'s anvil. +1 damage, a hammer, and a padded jerkin.', gold: 10, items: { smith_hammer: 1, padded_jerkin: 1, bread: 1 }, weapon: 'smith_hammer', body: 'padded_jerkin', damage: 1 },
};

let G = null; // the live game state

function newState(name, bg) {
  const B = BACKGROUNDS[bg] || BACKGROUNDS.farmhand;
  G = {
    version: 1, name: name || 'Traveller', background: bg,
    mapId: 'home', time: 7 * 60 + 40,
    p: { x: 2.9 * TILE, z: 1.9 * TILE, ang: 1.37, hp: 50, st: 60, level: 1, xp: 0, gold: B.gold },
    inv: Object.assign({ farm_clothes: 1 }, B.items),
    eq: { weapon: B.weapon || 'fists', body: B.body || 'farm_clothes', head: null },
    quests: {}, flags: {}, world: {}, shops: {}, stats: { kills: 0 },
    messages: [],
  };
  G.p.hp = maxHp(); G.p.st = maxSt();
  return G;
}

// ---- Derived stats ----
const bgOf = () => BACKGROUNDS[G.background] || BACKGROUNDS.farmhand;
function maxHp() { return 50 + (G.p.level - 1) * 10 + (G.flags.blessedUntil > G.time ? 10 : 0); }
function maxSt() { return 60 + (bgOf().stamina || 0) + (G.p.level - 1) * 5; }
function weaponItem() { return ITEMS[G.eq.weapon] || ITEMS.fists; }
function damageBonus() { return (G.p.level - 1) + (bgOf().damage || 0); }
function armorRating() { return ['body', 'head'].reduce((a, s) => a + (G.eq[s] ? ITEMS[G.eq[s]].armor || 0 : 0), 0); }
function xpForNext() { return 60 * G.p.level; }

// ---- Events (quests, sound and UI listen) ----
const _listeners = {};
function on(evt, fn) { (_listeners[evt] = _listeners[evt] || []).push(fn); }
function emit(evt, ...a) { for (const fn of _listeners[evt] || []) fn(...a); }

function notify(text, kind) {
  G.messages.push({ text, kind: kind || 'info', t: performance.now() });
  if (G.messages.length > 6) G.messages.shift();
}

// ---- Inventory ----
function count(id) { return G.inv[id] || 0; }
function hasItem(id, n = 1) { return count(id) >= n; }
function addItem(id, n = 1, silent) {
  G.inv[id] = count(id) + n;
  if (!silent) notify(`${ITEMS[id].name}${n > 1 ? ' x' + n : ''} added`, 'item');
  emit('inventory', id, n);
}
function removeItem(id, n = 1, silent) {
  const left = count(id) - n;
  if (left > 0) G.inv[id] = left; else delete G.inv[id];
  for (const slot of ['weapon', 'body', 'head']) if (G.eq[slot] === id && !hasItem(id)) G.eq[slot] = slot === 'weapon' ? 'fists' : null;
  if (!silent) notify(`${ITEMS[id].name}${n > 1 ? ' x' + n : ''} removed`, 'item');
  emit('inventory', id, -n);
}
function addGold(n, silent) {
  G.p.gold = Math.max(0, G.p.gold + n);
  if (!silent && n) notify(`${n > 0 ? '+' : ''}${n} gold`, 'gold');
  emit('gold', n);
}
function equip(id) {
  const it = ITEMS[id];
  if (it.type === 'weapon') G.eq.weapon = G.eq.weapon === id ? 'fists' : id;
  else if (it.type === 'armor') G.eq[it.slot] = G.eq[it.slot] === id ? null : id;
  emit('equip', id);
}
function isEquipped(id) { return G.eq.weapon === id || G.eq.body === id || G.eq.head === id; }
function useItem(id) {
  const it = ITEMS[id];
  if (!it || (it.type !== 'food' && it.type !== 'potion')) return false;
  if (it.heal) G.p.hp = Math.min(maxHp(), G.p.hp + it.heal);
  if (it.stamina) G.p.st = Math.min(maxSt(), G.p.st + it.stamina);
  removeItem(id, 1, true);
  notify(`${it.type === 'potion' ? 'Drank' : 'Ate'} ${it.name}${it.heal ? ` (+${it.heal} health)` : ''}${it.stamina ? ` (+${it.stamina} stamina)` : ''}`, 'item');
  emit('use', id);
  return true;
}

// ---- Experience ----
function addXp(n) {
  G.p.xp += n;
  while (G.p.xp >= xpForNext()) {
    G.p.xp -= xpForNext();
    G.p.level++;
    G.p.hp = maxHp(); G.p.st = maxSt();
    notify(`You are now level ${G.p.level}. Health, stamina and damage increased.`, 'level');
    emit('levelup', G.p.level);
  }
}

// ---- Quests ----
function qState(id) { return G.quests[id]; }
function qStage(id) { return G.quests[id] ? G.quests[id].stage : 0; }
function qDone(id) { return qStage(id) >= 100; }
function qActive(id) { const s = qStage(id); return s > 0 && s < 100; }
function qSet(id, stage) {
  const Q = QUESTS[id];
  let q = G.quests[id];
  const fresh = !q;
  if (!q) q = G.quests[id] = { stage: 0, log: [], data: {}, started: G.time };
  if (q.stage === stage) return;
  q.stage = stage;
  if (Q.stages[stage]) q.log.push(stage);
  if (stage >= 100) {
    q.done = G.time;
    notify(`Quest complete: ${Q.name}`, 'quest');
    emit('quest', id, 'done');
  } else {
    notify(`${fresh ? 'Quest started' : 'Quest updated'}: ${Q.name}`, 'quest');
    emit('quest', id, fresh ? 'start' : 'update');
  }
  if (Q.onStage) Q.onStage(q, stage);
}
function qData(id) { return (G.quests[id] && G.quests[id].data) || {}; }
// Ask every active quest whether its stage should advance (after kills, pickups, purchases...).
function qCheckAll() {
  for (const id of Object.keys(QUESTS)) if (qActive(id) && QUESTS[id].check) QUESTS[id].check(G.quests[id]);
}

// ---- Time ----
function hourOf(t = G.time) { return (t / 60) % 24; }
function dayOf(t = G.time) { return Math.floor(t / 1440) + 1; }
const DAY_NAMES = ['Morndas', 'Tirdas', 'Middas', 'Turdas', 'Fredas', 'Loredas', 'Sundas'];
function clockText(t = G.time) {
  const h = Math.floor(hourOf(t)), m = Math.floor(t % 60);
  return `${DAY_NAMES[(dayOf(t) - 1) % 7]}, ${h}:${String(m).padStart(2, '0')}`;
}

// ---- World bookkeeping (things that change in a map) ----
function worldOf(mapId) { return G.world[mapId] || (G.world[mapId] = { dead: {}, picked: {}, loot: {}, containers: {} }); }

// ---- Save / load (browser storage; failures are reported, not thrown) ----
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function saveGame() {
  try {
    const copy = Object.assign({}, G, { messages: [] });
    localStorage.setItem(SAVE_KEY, JSON.stringify(copy));
    return true;
  } catch (e) { return false; }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    G = JSON.parse(raw);
    G.messages = [];
    return true;
  } catch (e) { return false; }
}
