'use strict';
// Quests. Each stage has a journal entry; objective() is the short line under the compass;
// targets() returns where the compass and map should point ({npc} or {map, x, z} in tiles).

const NPC_TARGET = (id) => ({ npc: id });
const QUESTS = {
  main: {
    name: 'A New Path',
    stages: {
      10: "I'm done mucking out stables. I'm going to be an adventurer. Mother says old Captain Bram, who drinks at the Sleeping Goose, knows the trade better than anyone.",
      20: "Bram laughed at me, then told me no one hires a fighter who swings a farm tool. I need a proper weapon. Tobin sells them from his forge on the square.",
      30: "Wolves from the Whisper Wood have been taking Odo's sheep. Bram wants me to kill three of them and come back. The wood lies east of town, past the gate.",
      40: "Three wolves dead. Time to tell Bram.",
      100: "Bram gave me his old sword and told me I'm an adventurer now. The road beyond Brindlemere is waiting.",
    },
    objective(q) {
      return { 10: 'Speak to Captain Bram at the Sleeping Goose', 20: 'Get a proper weapon (Tobin sells them)', 30: `Kill wolves in the Whisper Wood (${q.data.wolves || 0}/3)`, 40: 'Return to Captain Bram' }[q.stage];
    },
    targets(q) {
      if (q.stage === 10 || q.stage === 40) return [NPC_TARGET('bram')];
      if (q.stage === 20) return [NPC_TARGET('tobin')];
      if (q.stage === 30) return [{ map: 'town', x: 55, z: 13 }];
      return [];
    },
    check(q) {
      if (q.stage === 20 && ownsProperWeapon()) qSet('main', 30);
    },
    onKill(q, kind) {
      if (q.stage === 30 && kind === 'wolf') {
        q.data.wolves = (q.data.wolves || 0) + 1;
        if (q.data.wolves >= 3) qSet('main', 40); else notify(`Wolves killed: ${q.data.wolves}/3`, 'quest');
      }
    },
  },
  rats: {
    name: 'Rats in the Cellar',
    stages: {
      10: "Marta, who keeps the Sleeping Goose, says rats have got into her cellar and are eating the cheese. She'll pay if I clear them out. The cellar door is at the back of the inn.",
      20: "The cellar is clear. Marta will want to hear it.",
      100: "I cleared the rats out of Marta's cellar. She paid me and swore she'd never charge me for stew again. I'll believe that when I see it.",
    },
    objective(q) { return { 10: `Kill the rats in the inn cellar (${q.data.rats || 0}/4)`, 20: 'Tell Marta the cellar is clear' }[q.stage]; },
    targets(q) { return q.stage === 10 ? [{ map: 'cellar', x: 5, z: 4 }] : q.stage === 20 ? [NPC_TARGET('marta')] : []; },
    onKill(q, kind, ent) {
      if (q.stage === 10 && kind === 'rat' && ent.mapId === 'cellar') {
        q.data.rats = (q.data.rats || 0) + 1;
        if (q.data.rats >= 4) qSet('rats', 20); else notify(`Cellar rats: ${q.data.rats}/4`, 'quest');
      }
    },
  },
  mittens: {
    name: 'Mittens Is Missing',
    stages: {
      5: "I found a ginger cat by the old mill. Her collar says MITTENS. Agnes, who lives past the smithy, keeps a ginger cat.",
      10: "Agnes has lost her cat, Mittens, again. She was last seen chasing mice down by Godwin's mill on the river.",
      20: "I've found Mittens. She doesn't want to be carried, but Agnes will want her home.",
      100: "Mittens is home and Agnes cried a little. She gave me honey buns and a few coins from her purse.",
    },
    objective(q) { return { 5: 'Return the cat to Agnes', 10: 'Find Mittens near the mill', 20: 'Bring Mittens to Agnes' }[q.stage]; },
    targets(q) { return q.stage === 10 ? [{ map: 'town', x: 21, z: 45 }] : q.stage === 5 || q.stage === 20 ? [NPC_TARGET('agnes')] : []; },
  },
  flour: {
    name: 'Flour for the Bakery',
    stages: {
      10: "Hilda's flour hasn't come from the mill and she has a hundred loaves to bake. She asked me to fetch a sack from Godwin, the miller, down by the river.",
      20: "Godwin gave me a sack of flour, along with a lecture about the river. Hilda is waiting.",
      100: "Hilda got her flour. She paid me in coin and warm bread.",
    },
    objective(q) { return { 10: 'Collect flour from Godwin at the mill', 20: 'Deliver the flour to Hilda' }[q.stage]; },
    targets(q) { return q.stage === 10 ? [NPC_TARGET('godwin')] : q.stage === 20 ? [NPC_TARGET('hilda')] : []; },
  },
  stew: {
    name: 'Crab Stew',
    stages: {
      10: "Nell the fisherwoman wants three pieces of mudcrab meat for a stew she's promised Marta. Mudcrabs lurk all along the riverbanks.",
      20: "I have the mudcrab meat. Nell is down at the dock.",
      100: "Nell took the meat, paid me, and gave me smoked trout for the road.",
    },
    objective(q) { return { 10: `Gather mudcrab meat (${Math.min(3, count('crab_meat'))}/3)`, 20: 'Bring the meat to Nell at the dock' }[q.stage]; },
    targets(q) { return q.stage === 10 ? [{ map: 'town', x: 24, z: 51 }, { map: 'town', x: 41, z: 51 }] : q.stage === 20 ? [NPC_TARGET('nell')] : []; },
    check(q) {
      if (q.stage === 10 && count('crab_meat') >= 3) qSet('stew', 20);
      else if (q.stage === 20 && count('crab_meat') < 3) qSet('stew', 10);
    },
  },
  flowers: {
    name: 'Bluebells for Wren',
    stages: {
      10: "Wren the herbalist needs five bluebells for a sleeping draught. They grow in the meadow north-west of town.",
      20: "I've picked five bluebells. Wren's shop is at the edge of the meadow.",
      100: "Wren traded me two healing potions for the bluebells, and told me not to drink both at once.",
    },
    objective(q) { return { 10: `Pick bluebells in the meadow (${Math.min(5, count('bluebell'))}/5)`, 20: 'Bring the bluebells to Wren' }[q.stage]; },
    targets(q) { return q.stage === 10 ? [{ map: 'town', x: 9, z: 6 }] : q.stage === 20 ? [NPC_TARGET('wren')] : []; },
    check(q) {
      if (q.stage === 10 && count('bluebell') >= 5) qSet('flowers', 20);
      else if (q.stage === 20 && count('bluebell') < 5) qSet('flowers', 10);
    },
  },
  book: {
    name: 'The Overdue Book',
    stages: {
      10: "Brother Alden lent a book, 'On the Nature of Mudcrabs', to Odo the farmer last winter. He would very much like it back.",
      20: "Odo handed over the book. I should return it to Brother Alden at the chapel.",
      100: "I returned the book to Brother Alden. He blessed me, which apparently counts as payment, and then paid me anyway.",
    },
    objective(q) { return { 10: 'Get the book back from Odo', 20: 'Return the book to Brother Alden' }[q.stage]; },
    targets(q) { return q.stage === 10 ? [NPC_TARGET('odo')] : q.stage === 20 ? [NPC_TARGET('alden')] : []; },
  },
};
const QUEST_ORDER = ['main', 'rats', 'mittens', 'flour', 'stew', 'flowers', 'book'];

function ownsProperWeapon() {
  return Object.keys(G.inv).some((id) => ITEMS[id] && ITEMS[id].type === 'weapon' && ITEMS[id].value >= 25);
}
// Called by the combat code when an enemy dies.
function questKill(kind, ent) {
  for (const id of QUEST_ORDER) if (qActive(id) && QUESTS[id].onKill) QUESTS[id].onKill(G.quests[id], kind, ent);
}
