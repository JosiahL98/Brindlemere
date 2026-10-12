'use strict';
// Every item in Brindlemere. Prices are in gold; shops sell at a markup and buy at half value.

const ITEMS = {
  // ---- Weapons: dmg [min, max], swing time in seconds, reach in world units ----
  fists: { name: 'Bare Fists', type: 'weapon', model: 'fists', dmg: [1, 3], swing: 0.42, reach: 56, value: 0, hidden: true },
  rusty_dagger: { name: 'Rusty Dagger', type: 'weapon', model: 'dagger', tint: 'RUST', dmg: [2, 5], swing: 0.36, reach: 60, value: 8, desc: 'More rust than blade. Better than nothing, barely.' },
  fishing_knife: { name: 'Fishing Knife', type: 'weapon', model: 'dagger', dmg: [3, 5], swing: 0.34, reach: 58, value: 10, desc: 'Thin and sharp. Meant for trout, not wolves.' },
  wood_club: { name: 'Wooden Club', type: 'weapon', model: 'club', dmg: [3, 6], swing: 0.55, reach: 66, value: 5, desc: 'An ash branch with a knot at the end.' },
  smith_hammer: { name: "Apprentice's Hammer", type: 'weapon', model: 'hammer', dmg: [3, 7], swing: 0.58, reach: 62, value: 12, desc: 'Heavy enough to dent a helmet, if you can swing it.' },
  iron_dagger: { name: 'Iron Dagger', type: 'weapon', model: 'dagger', dmg: [4, 7], swing: 0.34, reach: 60, value: 30, desc: 'Quick and reliable.' },
  iron_sword: { name: 'Iron Shortsword', type: 'weapon', model: 'sword', dmg: [5, 9], swing: 0.48, reach: 74, value: 60, desc: 'Plain, honest steelwork from Tobin\'s forge.' },
  iron_axe: { name: 'Iron War Axe', type: 'weapon', model: 'axe', dmg: [6, 11], swing: 0.62, reach: 70, value: 75, desc: 'Bites deep. Slow to recover.' },
  iron_mace: { name: 'Iron Mace', type: 'weapon', model: 'mace', dmg: [6, 10], swing: 0.58, reach: 68, value: 70, desc: 'Flanged iron on an oak haft.' },
  steel_longsword: { name: 'Steel Longsword', type: 'weapon', model: 'longsword', dmg: [8, 13], swing: 0.56, reach: 84, value: 165, desc: 'A fine blade with a long reach.' },
  bram_sword: { name: "Bram's Old Sword", type: 'weapon', model: 'sword', tint: 'GOLD', dmg: [9, 14], swing: 0.46, reach: 78, value: 240, unique: true, desc: 'Notched from forty years of adventuring. It still remembers how.' },
  // ---- Apparel ----
  farm_clothes: { name: 'Farm Clothes', type: 'armor', slot: 'body', model: 'tunic', tint: 'OLIVE', armor: 0, value: 2, desc: 'Patched and comfortable.' },
  padded_jerkin: { name: 'Padded Jerkin', type: 'armor', slot: 'body', model: 'tunic', tint: 'BONE', armor: 2, value: 25, desc: 'Quilted linen. Turns a scratch.' },
  leather_armor: { name: 'Leather Armour', type: 'armor', slot: 'body', model: 'tunic', tint: 'BROWN', armor: 4, value: 55, desc: 'Boiled leather, cut for a working fighter.' },
  studded_leather: { name: 'Studded Leather', type: 'armor', slot: 'body', model: 'tunic', tint: 'RUST', armor: 6, value: 110, desc: 'Leather riveted with iron studs.' },
  chainmail: { name: 'Chainmail Shirt', type: 'armor', slot: 'body', model: 'mail', armor: 9, value: 240, desc: 'Heavy, noisy, and very reassuring.' },
  leather_cap: { name: 'Leather Cap', type: 'armor', slot: 'head', model: 'cap', armor: 1, value: 12, desc: 'Keeps the rain off. Mostly.' },
  iron_helm: { name: 'Iron Helm', type: 'armor', slot: 'head', model: 'helm', armor: 3, value: 60, desc: 'A simple kettle helm.' },
  // ---- Food and drink ----
  apple: { name: 'Apple', type: 'food', model: 'apple', heal: 5, value: 2, desc: 'Crisp, from the Weavers\' orchard.' },
  bread: { name: 'Loaf of Bread', type: 'food', model: 'bread', heal: 8, value: 3, desc: 'Still warm, if you bought it from Hilda.' },
  cheese: { name: 'Wedge of Cheese', type: 'food', model: 'cheese', heal: 6, value: 4, desc: 'Sharp and crumbly.' },
  sweetroll: { name: 'Honey Bun', type: 'food', model: 'sweetroll', heal: 12, value: 6, desc: 'Sticky, sweet, and gone in three bites.' },
  pie: { name: 'Apple Pie', type: 'food', model: 'pie', heal: 18, value: 10, desc: 'Hilda\'s pride.' },
  stew: { name: 'Crab Stew', type: 'food', model: 'stew', heal: 30, value: 15, desc: 'Marta\'s speciality, when there\'s crab to be had.' },
  fish: { name: 'Smoked Trout', type: 'food', model: 'fish', heal: 12, value: 6, desc: 'Caught and smoked by Nell.' },
  ale: { name: 'Mug of Ale', type: 'food', model: 'ale', stamina: 30, value: 3, desc: 'Brindlemere brown. Restores stamina.' },
  // ---- Potions ----
  potion_heal: { name: 'Minor Healing Potion', type: 'potion', model: 'potion', tint: 'RED', heal: 35, value: 25, desc: 'Tastes of copper and mint.' },
  potion_stamina: { name: 'Stamina Draught', type: 'potion', model: 'potion', tint: 'GREEN', stamina: 60, value: 20, desc: 'Bitter. Wakes you right up.' },
  // ---- Loot and ingredients ----
  rat_tail: { name: 'Rat Tail', type: 'misc', model: 'tail', value: 2, desc: 'Wren buys these. Don\'t ask why.' },
  crab_meat: { name: 'Mudcrab Meat', type: 'misc', model: 'meat', value: 4, desc: 'Pale and sweet. The main ingredient of crab stew.' },
  crab_shell: { name: 'Mudcrab Shell', type: 'misc', model: 'shell', value: 7, desc: 'Tough enough to make a buckler from.' },
  wolf_pelt: { name: 'Wolf Pelt', type: 'misc', model: 'pelt', value: 14, desc: 'Thick grey fur. Cedric pays well for these.' },
  wolf_fang: { name: 'Wolf Fang', type: 'misc', model: 'fang', value: 5, desc: 'A long yellow canine.' },
  bluebell: { name: 'Bluebell', type: 'misc', model: 'flower', value: 3, desc: 'A meadow flower used in calming tinctures.' },
  candle: { name: 'Tallow Candle', type: 'misc', model: 'candlei', value: 1, desc: 'Smells of mutton.' },
  // ---- Quest items ----
  flour_sack: { name: 'Sack of Flour', type: 'quest', model: 'sack', value: 0, desc: 'Godwin\'s finest, for Hilda\'s bakery.' },
  mittens: { name: 'Mittens', type: 'quest', model: 'cat', value: 0, desc: 'A ginger cat who would very much like to be put down.' },
  mudcrab_book: { name: 'On the Nature of Mudcrabs', type: 'quest', model: 'book', tint: 'GREEN', value: 0, desc: 'Property of the Chapel of the Eight. Long overdue.' },
};
const ITEM_ORDER = ['weapon', 'armor', 'food', 'potion', 'misc', 'quest'];
const ITEM_TYPE_LABEL = { weapon: 'Weapons', armor: 'Apparel', food: 'Food', potion: 'Potions', misc: 'Misc', quest: 'Quest' };
