'use strict';
// Who lives in Brindlemere: appearance and where to find them. Dialogue lives in dialogue.js.

const CAST = {
  bram: {
    name: 'Captain Bram', title: 'Retired adventurer', map: 'inn', at: [9.6, 5.4], ang: Math.PI, wander: 0,
    look: { sex: 'm', age: 'old', build: 0.65, skin: 1, eyes: 'GRAY', hair: { style: 'bald', color: 'gray' }, beard: 'full', eyepatch: true, scar: true, stern: true,
      outfit: 'tunic', top: 'BROWN', topBias: -2.6, bottom: 'GRAY', bottomBias: -3, accent: 'RUST', held: 'mug' },
  },
  marta: {
    name: 'Marta', title: 'Innkeeper', map: 'inn', at: [9.5, 1.5], ang: Math.PI / 2, wander: 0,
    look: { sex: 'f', age: 'adult', build: 0.8, skin: 0, eyes: 'BLUE', hair: { style: 'bun', color: 'red' }, freckles: true,
      outfit: 'apron', top: 'GREEN', topBias: -1.6, bottom: 'BROWN', accent: 'BONE', hat: 'kerchief', hatColor: 'BONE' },
  },
  tobin: {
    name: 'Tobin', title: 'Blacksmith', map: 'town', at: [37.68, 34.73], ang: -2.27, wander: 0, work: true,
    fights: { hp: 70, dmg: [5, 8], reach: 40, speed: 165, cooldown: 1.2, shout: ['Get away from my forge!', 'Come on, then!'] },
    look: { sex: 'm', age: 'adult', build: 0.9, fat: 0.15, skin: 2, eyes: 'BROWN', hair: { style: 'long', color: 'black' }, beard: 'moustache', stubble: true, brow: 'black',
      outfit: 'smith', top: 'GRAY', topBias: -2.5, bottom: 'BROWN', bottomBias: -2.5, accent: 'GRAY', held: 'hammer', work: 'hammer' },
  },
  hilda: {
    name: 'Hilda', title: 'Baker', map: 'bakery', at: [4.5, 4.4], ang: -Math.PI / 2, wander: 0,
    look: { sex: 'f', age: 'adult', build: 0.6, skin: 1, eyes: 'GREEN', hair: { style: 'bun', color: 'blonde' }, freckles: true,
      outfit: 'apron', top: 'RED', topBias: -1.4, bottom: 'RED', bottomBias: -2.6, accent: 'BONE' },
  },
  godwin: {
    name: 'Godwin', title: 'Miller', map: 'town', at: [19.7, 42.8], ang: Math.PI, wander: 1.2,
    look: { sex: 'm', age: 'old', build: 0.5, skin: 0, eyes: 'BLUE', hair: { style: 'short', color: 'white' }, beard: 'moustache',
      outfit: 'tunic', top: 'BONE', topBias: -0.5, bottom: 'BROWN', accent: 'BONE', hat: 'cap', hatColor: 'BONE' },
  },
  agnes: {
    name: 'Agnes', title: 'Widow', map: 'town', at: [43.2, 39.2], ang: Math.PI, wander: 1.2,
    look: { sex: 'f', age: 'old', build: 0.4, skin: 0, eyes: 'GRAY', hair: { style: 'bun', color: 'white' }, shawl: 'PURPLE',
      outfit: 'dress', top: 'PURPLE', topBias: -2.4, bottom: 'GRAY', bottomBias: -2, basket: true },
  },
  wren: {
    name: 'Wren', title: 'Herbalist', map: 'herbs', at: [3.5, 2.4], ang: Math.PI / 2, wander: 0,
    look: { sex: 'f', age: 'young', build: 0.3, skin: 1, eyes: 'GREEN', hair: { style: 'long', color: 'chestnut' },
      outfit: 'dress', top: 'GREEN', topBias: -1.4, bottom: 'OLIVE', bottomBias: -1.8, accent: 'GOLD', basket: true },
  },
  alden: {
    name: 'Brother Alden', title: 'Priest of the Eight', map: 'chapel', at: [4.5, 3.0], ang: Math.PI / 2, wander: 0,
    look: { sex: 'm', age: 'adult', build: 0.45, skin: 1, eyes: 'BROWN', hair: { style: 'tonsure', color: 'brown' },
      outfit: 'robe', top: 'BROWN', topBias: -2.2, bottom: 'BROWN', bottomBias: -2.4, book: true },
  },
  odo: {
    name: 'Odo', title: 'Farmer', map: 'town', at: [14.2, 25.2], ang: 0, wander: 2.5, work: true,
    fights: { hp: 50, dmg: [3, 7], reach: 52, speed: 160, cooldown: 1.2, shout: ["Not my sheep, you don't!", 'Get off my land!'] },
    look: { sex: 'm', age: 'adult', build: 0.7, skin: 2, eyes: 'BROWN', hair: { style: 'messy', color: 'brown' }, stubble: true,
      outfit: 'tunic', top: 'OLIVE', topBias: -1.2, bottom: 'BROWN', hat: 'straw', accentColor: 'RED', held: 'pitchfork', work: 'rake' },
  },
  nell: {
    name: 'Nell', title: 'Fisherwoman', map: 'town', at: [47.5, 45.6], ang: Math.PI / 2, wander: 0, work: true,
    fights: { hp: 45, dmg: [3, 6], reach: 46, speed: 160, cooldown: 1.1, shout: ['Ha! Come here, you!', "I've gutted bigger than you."] },
    look: { sex: 'f', age: 'adult', build: 0.55, skin: 3, eyes: 'BROWN', hair: { style: 'braid', color: 'black' },
      outfit: 'tunic', top: 'BLUE', topBias: -1.6, bottom: 'BROWN', bottomBias: -2.2, hat: 'kerchief', hatColor: 'RUST', held: 'rod', work: 'fish' },
  },
  rolf: {
    name: 'Rolf', title: 'Town guard', map: 'town', at: [50.6, 28.9], ang: Math.PI, wander: 0,
    fights: { hp: 80, dmg: [5, 9], reach: 54, speed: 175, cooldown: 1.0, shout: ['For Brindlemere!', 'Stand back, I have it!', 'Back, you mangy brute!'] },
    look: { sex: 'm', age: 'adult', build: 0.65, skin: 1, eyes: 'BLUE', hair: { style: 'short', color: 'brown' }, beard: 'moustache',
      outfit: 'guard', bottom: 'GRAY', bottomBias: -2.6, hat: 'helmet', held: 'spear' },
  },
  cedric: {
    name: 'Cedric', title: 'Merchant', map: 'store', at: [4.5, 1.4], ang: Math.PI / 2, wander: 0,
    look: { sex: 'm', age: 'adult', build: 0.85, skin: 0, eyes: 'BROWN', hair: { style: 'short', color: 'black' }, beard: 'moustache', brow: 'black',
      outfit: 'tunic', top: 'PURPLE', topBias: -1.4, bottom: 'GRAY', bottomBias: -2.8, accent: 'GOLD', hat: 'cap', hatColor: 'PURPLE' },
  },
  pip: {
    name: 'Pip', title: 'Village child', map: 'town', at: [31.5, 31.8], ang: 0, wander: 5,
    look: { sex: 'm', age: 'child', build: 0.4, skin: 2, eyes: 'BLUE', hair: { style: 'messy', color: 'blonde' }, freckles: true,
      outfit: 'tunic', top: 'RED', topBias: -1.2, bottom: 'BROWN' },
  },
  elsa: {
    name: 'Elsa', title: 'Your mother', map: 'home', at: [3.4, 4.4], ang: -Math.PI / 2 - 0.2, wander: 0,
    look: { sex: 'f', age: 'adult', build: 0.5, skin: 1, eyes: 'BLUE', hair: { style: 'long', color: 'brown' },
      outfit: 'apron', top: 'BLUE', topBias: -1.6, bottom: 'BLUE', bottomBias: -2.8, accent: 'BONE' },
  },
};

let _actorDefs = null;
function ACTOR_DEFS() {
  if (_actorDefs) return _actorDefs;
  _actorDefs = {};
  for (const [id, c] of Object.entries(CAST)) _actorDefs[id] = typeof BAKED === 'object' && BAKED[id] ? bakedDef(id, c.look) : makePerson(id, c.look);
  // Animals baked from Tripo models keep their sculpted definition's shadow and the like; the
  // bake already has them at their in-game size.
  if (typeof BEASTS === 'object') for (const [id, b] of Object.entries(BEASTS)) _actorDefs[id] = typeof BAKED === 'object' && BAKED[id] ? Object.assign({}, b, bakedDef(id, null), { scale: 1 }) : b;
  return _actorDefs;
}
