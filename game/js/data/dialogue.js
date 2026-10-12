'use strict';
// Conversation: greetings, topics and choices for everyone in Brindlemere, plus the shops.
// A node is { text, choices?: [{ label, go }], action?: 'barter' | 'room' | 'close' }.

const RUMORS = [
  "They say the North Road's still blocked by the rockslide. Nobody's come through in a month.",
  "Wolves have been bolder lately. Something's driving them out of the deep wood.",
  "Hilda's pies sell out by noon. Get there early.",
  "Cedric tells everyone he's from Wayrest. Godwin swears he's from a turnip farm two valleys over.",
  "There are mudcrabs all along the river this year. Good eating, if you can get past the claws.",
  "Bram used to be a famous adventurer, they say. Now he's a famous drinker.",
  "Somebody's been picking the bluebells in the meadow. Wren will want to know who.",
  "Old Agnes talks to her cat more than she talks to people. Can't say I blame her.",
];
const ADVICE = [
  'Eat before a fight, not after. A full stomach mends faster.',
  "Wolves circle. Don't let them get behind you.",
  'If you are losing, walk away. The wolf will still be there tomorrow, and so will you.',
  "Sell what you don't need. A pelt in the pack is gold you haven't spent yet.",
  "Sleep in a bed when you can. The ground doesn't heal you, it only gives you a stiff back.",
];
const TOWN_INFO = "Brindlemere is a market village on the river. Farms to the west, the Whisper Wood to the east, and mountains all around. The North Road's closed by a rockslide, so it's quieter than usual.";
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const say = (text, o) => Object.assign({ text }, o || {});
const choice = (label, go) => ({ label, go });

// Shops: starting stock and how much gold the merchant carries. Restocked every two days.
const SHOPS = {
  cedric: { gold: 420, buys: ['weapon', 'armor', 'food', 'potion', 'misc'], stock: { bread: 3, cheese: 4, apple: 6, candle: 5, potion_heal: 2, potion_stamina: 2, leather_cap: 1, padded_jerkin: 1, iron_dagger: 1 } },
  tobin: { gold: 520, buys: ['weapon', 'armor'], stock: { iron_dagger: 2, iron_sword: 2, iron_axe: 1, iron_mace: 1, steel_longsword: 1, leather_armor: 1, studded_leather: 1, chainmail: 1, iron_helm: 1, leather_cap: 1 } },
  hilda: { gold: 140, buys: ['food'], stock: { bread: 8, sweetroll: 6, pie: 3, apple: 5 } },
  marta: { gold: 220, buys: ['food', 'misc'], stock: { ale: 10, stew: 2, cheese: 4, bread: 3, fish: 2 } },
  wren: { gold: 260, buys: ['potion', 'misc'], stock: { potion_heal: 5, potion_stamina: 3 } },
  nell: { gold: 110, buys: ['food', 'misc'], stock: { fish: 6 } },
};
function shopOf(id) {
  let sh = G.shops[id];
  if (!sh || G.time - sh.restocked > 2 * 1440) {
    const base = SHOPS[id];
    sh = G.shops[id] = { gold: base.gold, stock: Object.assign({}, base.stock), restocked: G.time, bought: sh ? sh.bought : {} };
  }
  return sh;
}
function priceBuy(npc, id) {
  let p = Math.ceil(ITEMS[id].value * 1.3);
  if (npc === 'tobin' && G.flags.tobinDiscount) p = Math.ceil(p * 0.85);
  return Math.max(1, p);
}
function priceSell(npc, id) { return Math.max(1, Math.floor(ITEMS[id].value * 0.5)); }

// Shared topics
const T = {
  about: { label: 'About you' },
  town: { label: 'Brindlemere' },
  rumors: { label: 'Rumors' },
  advice: { label: 'Advice' },
  barter: { label: 'Barter' },
};

function finishQuest(id, reward) {
  qSet(id, 100);
  if (reward.take) for (const [it, n] of Object.entries(reward.take)) removeItem(it, n, true);
  if (reward.gold) addGold(reward.gold);
  if (reward.items) for (const [it, n] of Object.entries(reward.items)) addItem(it, n);
  if (reward.xp) addXp(reward.xp);
}

const PEOPLE = {
  elsa: {
    greet: () => qDone('main') ? 'My child, the adventurer. Your father would have been proud. Terrified, but proud.'
      : G.flags.elsaPath ? 'Be careful out there. And come home for supper.'
      : "You're up early. Couldn't sleep? You've had that faraway look for a month now.",
    topics: ['path', 'about', 'town', 'rumors'],
    about: "Me? I've kept this house standing and you fed for eighteen years. That's adventure enough for anyone.",
    town: "Brindlemere's a good, quiet place. Too quiet for some, I suppose. I can see it in your face.",
    rumors: ['Agnes is beside herself. That cat of hers has wandered off again.', "Hilda says the flour's late from the mill. If there's no bread tomorrow there'll be a riot on the square.", 'Odo was in the square shouting about wolves again.'],
    extra: {
      path: {
        label: 'I want to be an adventurer',
        when: () => !G.flags.elsaPath,
        say: () => say("I knew this day was coming. Your father had that same look before he marched off to the war in the south. He came home with a limp and a hundred stories, and he told every one of them twice.", {
          choices: [
            choice("I'll be careful.", () => { G.flags.elsaPath = true; return say("You'd better be. Go and see Captain Bram at the Sleeping Goose. He's an old drunk, but he's seen more of the world than anyone in this valley. And take what's in the chest by your bed. It isn't much, but it's yours."); }),
            choice("I have to try.", () => { G.flags.elsaPath = true; return say("I know, love. I know. Go and see Captain Bram at the Sleeping Goose, he'll set you straight. And take what's in the chest by your bed."); }),
          ],
        }),
      },
    },
  },
  bram: {
    greet: () => ({ 10: "Hmph. Elsa's whelp. You've got the look of someone about to ask me something stupid.", 20: 'Still breathing? Good. Still unarmed? Less good.', 30: 'Back already? Those wolves won\'t kill themselves.', 40: 'Well? Out with it.', 100: 'Ah, the adventurer! Sit, sit. Marta, another ale for my apprentice!' })[qStage('main')] || 'Hmph.',
    topics: ['q_main', 'q_wolves', 'q_done', 'about', 'advice', 'town', 'rumors'],
    about: "Forty years with a sword. I fought trolls in the north and pirates in the south, and a goblin chieftain who took my eye as a keepsake. Now I drink Marta's ale and tell lies to farmers. The lies get better every year.",
    town: "Brindlemere? Nothing happens here. That's why I came.",
    rumors: ["Marta thinks I don't know she waters the ale. I know. I drink it anyway.", "Rolf calls himself a guard. I've seen scarecrows with better instincts."],
    extra: {
      q_main: {
        label: 'I want to be an adventurer',
        when: () => qStage('main') === 10,
        say: () => say("*He sets down his mug.* An adventurer. You. Do you know what adventuring is? It's being cold, and wet, and hungry, and then something tries to eat you.", {
          choices: [
            choice("I'm serious.", () => {
              qSet('main', ownsProperWeapon() ? 30 : 20);
              return say(ownsProperWeapon()
                ? "Serious, are you? You've at least got a real blade, I'll give you that. Then here's your test: wolves have been taking Odo's sheep. Go east, into the Whisper Wood, kill three of them, and come back. Then we'll talk."
                : "Serious, are you? Then here's your first lesson: nobody hires a fighter who swings a farm tool. Get a proper blade from Tobin at the forge. Then go east into the Whisper Wood. Wolves have been taking Odo's sheep. Kill three and come back. Then we'll talk.");
            }),
            choice('Maybe you\'re right.', () => say('Ha. Come back when your spine grows in.')),
          ],
        }),
      },
      q_wolves: {
        label: 'The wolves',
        when: () => qStage('main') === 20 || qStage('main') === 30,
        say: () => say(qStage('main') === 20
          ? "Weapon first. Tobin's forge is on the square. Tell him I sent you, he'll knock something off the price. Don't let him sell you the axe, it pulls to the left."
          : "East gate, then follow the path into the wood. They hunt in threes. Don't let them get behind you. And eat something before you go. Nobody fights well hungry."),
      },
      q_done: {
        label: 'The wolves are dead',
        when: () => qStage('main') === 40,
        say: () => {
          finishQuest('main', { gold: 50, items: { bram_sword: 1 }, xp: 60 });
          return say("*He looks at you for a long moment, then reaches under the bench for a sword in a worn scabbard.* This blade went with me through the Jerall passes, the pirate coast, and one very unpleasant wedding. It's notched and old, and so am I. Take it. You're an adventurer now, gods help you. And take some coin, you'll need a good meal.");
        },
      },
    },
  },
  marta: {
    greet: () => qDone('rats') ? 'My favourite rat-catcher! Sit anywhere.' : qStage('rats') === 10 ? 'Any luck with those rats?' : 'Welcome to the Sleeping Goose! Ale\'s cold, stew\'s hot, and the beds are nearly flea-free.',
    topics: ['barter', 'room', 'q_rats', 'about', 'town', 'rumors'],
    shop: true,
    about: "I've run the Goose for twenty years. My mother ran it before me. I'll die behind this bar and they'll serve drinks over my body.",
    town: "Every soul in Brindlemere comes through that door sooner or later. Usually later, and usually thirsty.",
    rumors: ["Bram's been telling that goblin story again. The goblin gets bigger every time.", "Nell's promised me a crab stew. If she ever catches a crab."],
    extra: {
      room: {
        label: 'Rent a room (10 gold)',
        say: () => G.p.gold >= 10 ? say('Ten gold, and the room upstairs is yours for the night. Sleep well.', { action: 'room' }) : say("Ten gold for the room, love, and you haven't got it. The stable's free, if you don't mind the horse."),
      },
      q_rats: {
        label: 'Rats in the cellar',
        when: () => !qDone('rats'),
        say: () => {
          const s = qStage('rats');
          if (s === 0) return say("Rats. In my cellar. Big as cats, some of them, and they've been at the cheese. Bram won't go down there. Says it's beneath him. I'll pay thirty gold to whoever clears them out.", {
            choices: [
              choice("I'll do it.", () => { qSet('rats', 10); return say("Bless you. The cellar door's at the back, past the bar. Mind the third step, it bites."); }),
              choice('Not right now.', () => say("If you change your mind, they're not going anywhere. That's rather the problem.")),
            ],
          });
          if (s === 10) return say("Still squeaking down there. I can hear them through the floor.");
          finishQuest('rats', { gold: 30, items: { stew: 1 }, xp: 25 });
          return say("They're gone? All of them? *She counts coins into your hand.* Thirty gold, as promised, and here's a bowl of stew. Hot, mind.");
        },
      },
    },
  },
  tobin: {
    greet: () => qStage('main') === 20 ? '*Clang.* Bram sent you, didn\'t he? He sends someone every few years.' : '*Clang.* Buying, or gawking?',
    topics: ['barter', 'q_bram', 'about', 'advice', 'town', 'rumors'],
    shop: true,
    about: 'My father was smith here, and his father before him. Iron\'s in the blood. So\'s soot.',
    advice: "A blade's only as good as the arm behind it. And the arm's only as good as the breakfast inside it.",
    town: 'Quiet village, steady work. Horseshoes, hinges, the odd sword for a dreamer.',
    rumors: ['Cedric owes me for a set of hinges. Has done since spring.'],
    extra: {
      q_bram: {
        label: 'Bram sent me',
        when: () => qStage('main') >= 10 && !G.flags.tobinDiscount,
        say: () => { G.flags.tobinDiscount = true; return say("Ha! Bram. He bought his first blade from my father. Tell you what: anything on the rack, I'll take a bit off the price for you. Don't tell Marta, she'll want a discount too."); },
      },
    },
  },
  hilda: {
    greet: () => qStage('flour') === 10 ? 'Any sign of that flour?' : qDone('flour') ? "There's my flour hero! Bread's on the house. Well, it's two crowns. But it's a nice house." : 'Morning! Mind the flour, it gets everywhere.',
    topics: ['barter', 'q_flour', 'about', 'town', 'rumors'],
    shop: true,
    about: 'I\'ve been baking since I could reach the oven. Mother says I came into the world covered in flour, and I\'ve not been clean since.',
    town: 'Everybody in Brindlemere eats my bread. Even Cedric, though he says it\'s better in Wayrest.',
    rumors: ['Pip stole a honey bun yesterday and thought I didn\'t see. I let him have it. He looked so pleased with himself.'],
    extra: {
      q_flour: {
        label: 'Flour delivery',
        when: () => !qDone('flour'),
        say: () => {
          const s = qStage('flour');
          if (s === 0) return say("Godwin's late with my flour. Again. I've a hundred loaves to bake and the whole square to feed. Would you run down to the mill and fetch a sack? I'll pay you in coin and bread.", {
            choices: [
              choice("I'll fetch it.", () => { qSet('flour', 10); return say("You're a treasure. The mill's down on the river, west of the bridge. You'll hear it before you see it."); }),
              choice('Not right now.', () => say("Then pray for rain, love. That river's too slow to turn a millstone.")),
            ],
          });
          if (s === 10) return say('No flour yet? Godwin will be standing by his mill, glaring at the river.');
          finishQuest('flour', { take: { flour_sack: 1 }, gold: 15, items: { bread: 3 }, xp: 20 });
          return say('The flour! Oh, thank the Eight. Here, take this, and these loaves. Still warm.');
        },
      },
    },
  },
  godwin: {
    greet: () => 'Eh? Speak up, the wheel\'s loud.',
    topics: ['q_flour', 'cat', 'about', 'town', 'rumors'],
    about: "Forty years of grinding grain. You know what I've learned? Nothing. Grain doesn't teach you anything.",
    town: 'Everything in Brindlemere starts at my mill. Bread, ale, gossip. Mostly gossip.',
    rumors: ['That river\'s lower every year. One day the wheel will stop and I\'ll finally get some sleep.'],
    extra: {
      q_flour: {
        label: "Hilda's flour",
        when: () => qStage('flour') === 10,
        say: () => { addItem('flour_sack'); qSet('flour', 20); return say("Hilda sent you, did she? The river's been low, so the wheel's been slow, so the stones have been slow, so the flour's been slow. Everything's slow. Here. *He heaves a sack onto your shoulder.* Tell her if she wants it faster she can pray for rain."); },
      },
      cat: {
        label: 'Seen a ginger cat?',
        when: () => qStage('mittens') < 20 && !hasItem('mittens'),
        say: () => say("That ginger menace of Agnes's? She's been round the mill all week. Mice everywhere since the wheel slowed. Look along the riverbank, just past the wheel."),
      },
    },
  },
  agnes: {
    greet: () => qDone('mittens') ? "Mittens sends her regards. Well, she ignores you, but I'm sure she's grateful." : hasItem('mittens') ? 'Is that... is that my Mittens?' : "Have you seen my Mittens? Ginger, about so big, answers to nothing.",
    topics: ['q_mittens', 'about', 'town', 'rumors'],
    about: 'My husband kept the bees, back when he was alive. Now I keep the cat, and the cat keeps me. Mostly awake.',
    town: "I've lived in Brindlemere seventy years. It hasn't changed. Neither have I, much.",
    rumors: ['That Pip is a menace. A sweet menace. He carried my basket home last week and only ate one apple.'],
    extra: {
      q_mittens: {
        label: 'Mittens',
        when: () => !qDone('mittens'),
        say: () => {
          if (hasItem('mittens')) {
            finishQuest('mittens', { take: { mittens: 1 }, gold: 15, items: { sweetroll: 2 }, xp: 20 });
            return say('Mittens! Oh, my sweet girl, look at the state of you. Thank you, thank you. Here, honey buns, I baked them this morning, and a little something from my purse.');
          }
          if (qStage('mittens') === 0) return say('My Mittens is gone again. She does this, the little wretch, but it\'s been three days. Last I saw she was chasing mice down by the mill. Would you look for her? My knees won\'t manage the riverbank.', {
            choices: [
              choice("I'll find her.", () => { qSet('mittens', 10); return say('Bless you. She likes being picked up about as much as she likes baths, so be firm.'); }),
              choice("I'm busy.", () => say("Of course. Everyone's busy. Even the cat.")),
            ],
          });
          return say('No sign of her? Try the riverbank by the mill. She loves the mice there.');
        },
      },
    },
  },
  wren: {
    greet: () => 'Careful, that jar bites. Only joking. Mostly.',
    topics: ['barter', 'q_flowers', 'about', 'advice', 'rumors'],
    shop: true,
    about: 'My grandmother taught me everything that grows in this valley. Which plants heal, which plants kill, and which do both depending on the dose.',
    advice: "If a wolf bites you, eat something. If a wolf bites you twice, drink something. If a wolf bites you three times, stop fighting wolves.",
    rumors: ['Brother Alden asked me for something to help him sleep. I gave him one of his own sermons.'],
    extra: {
      q_flowers: {
        label: 'Bluebells',
        when: () => !qDone('flowers'),
        say: () => {
          const s = qStage('flowers');
          if (s === 0) return say("I need bluebells for a sleeping draught. Five of them. They grow in the meadow just north and west of here, around the old oaks. Bring me five and I'll pay you in potions, which are worth more than coin around here.", {
            choices: [
              choice("I'll gather them.", () => { qSet('flowers', 10); return say("Pick them whole, stem and all. And don't eat them, whatever Pip tells you."); }),
              choice('Not now.', () => say('They\'ll keep. Flowers are patient. Unlike customers.')),
            ],
          });
          if (count('bluebell') < 5) return say(`You have ${count('bluebell')}. I need five. The meadow's north-west, around the oaks.`);
          finishQuest('flowers', { take: { bluebell: 5 }, gold: 10, items: { potion_heal: 2 }, xp: 20 });
          return say("Five, and barely bruised. Here, two healing potions. Don't drink them both at once or you'll see colours.");
        },
      },
    },
  },
  alden: {
    greet: () => 'Peace of the Eight upon you.',
    topics: ['blessing', 'q_book', 'about', 'town', 'rumors'],
    about: 'I came to Brindlemere to tend a quiet chapel. It is very quiet. I have done a great deal of tending.',
    town: 'A small flock, but a faithful one. Mostly faithful. Odo comes for the singing and leaves before the sermon.',
    rumors: ['Marta brings me a jug of ale every Sundas "for the altar". The altar is very grateful.'],
    extra: {
      blessing: {
        label: 'Receive a blessing',
        say: () => {
          if (G.flags.blessedDay === dayOf()) return say('You have had your blessing today, child. The Eight are generous, not indulgent.');
          G.flags.blessedDay = dayOf();
          G.flags.blessedUntil = G.time + 1440;
          G.p.hp = maxHp();
          notify('Blessed by the Eight: +10 health for a day', 'quest');
          return say('*He places a hand on your head.* May the Eight watch over you, and may you have the sense to let them. *Warmth spreads through you.*');
        },
      },
      q_book: {
        label: 'The overdue book',
        when: () => !qDone('book'),
        say: () => {
          const s = qStage('book');
          if (s === 0) return say("There is a small matter, if you're willing. Last winter I lent Odo the farmer a book, 'On the Nature of Mudcrabs'. A fine work. He has not returned it. I have asked him four times. I fear I'm becoming the sort of priest who keeps a list.", {
            choices: [
              choice("I'll get it back.", () => { qSet('book', 10); return say('Bless you. Gently, mind. Odo is a good man. He simply has the memory of a turnip.'); }),
              choice('Not now.', () => say('Of course. It has waited a year. It can wait a little longer.')),
            ],
          });
          if (!hasItem('mudcrab_book')) return say('Odo is usually out in his fields, west of the square. He will have a reason. He always has a reason.');
          finishQuest('book', { take: { mudcrab_book: 1 }, gold: 20, xp: 25 });
          G.p.hp = maxHp();
          return say("My book! And hardly a stain on it. Is that... jam? Never mind. Bless you, child. *You feel restored.* And take this for your trouble.");
        },
      },
    },
  },
  odo: {
    greet: () => qDone('main') ? "You killed those wolves? Not a sheep lost since. You're welcome at my table any time." : 'Wolves took another sheep last night. Three this month!',
    topics: ['wolves', 'q_book', 'about', 'town', 'rumors'],
    about: 'I grow barley and turnips, and I keep sheep, for as long as the wolves let me.',
    town: "Good soil, bad wolves. Could be worse. Could be all wolves and no soil.",
    rumors: ['Godwin says the river\'s getting lower every year. Godwin also says the moon is a cheese, so.'],
    extra: {
      wolves: {
        label: 'The wolves',
        say: () => say("They come out of the Whisper Wood at dusk. Rolf says it's not his job. Bram says he's retired. Somebody ought to do something."),
      },
      q_book: {
        label: "Alden's book",
        when: () => qStage('book') === 10,
        say: () => say("Alden's book? I've been meaning to give it back. It's been very useful. *He glances at his kitchen table, which is propped up on one side by something book-shaped.*", {
          choices: [
            ...(G.p.gold >= 10 ? [choice('[Pay 10 gold] For your trouble.', () => { addGold(-10); addItem('mudcrab_book'); qSet('book', 20); return say('Well, if you insist. *He wiggles it out from under the table leg.* Tell him I read every word. I read some of them.'); })] : []),
            choice("It belongs to the chapel, Odo.", () => { addItem('mudcrab_book'); qSet('book', 20); return say("Aye, aye. Fine. *He pulls it free and the table lurches.* The table will have to learn to stand on its own."); }),
            choice('Never mind.', () => say('Right you are.')),
          ],
        }),
      },
    },
  },
  nell: {
    greet: () => "Shh! You'll scare the fish. ...Oh, they're gone. Thanks.",
    topics: ['barter', 'q_stew', 'about', 'advice', 'rumors'],
    shop: true,
    about: "I was born on that riverbank and I'll probably drown in it. The river and I have an understanding.",
    advice: "Mudcrabs are slow, but their claws aren't. Hit them, step back, hit them again.",
    rumors: ["There's a ginger cat stalking the mice down by the mill. Agnes's, I'd wager."],
    extra: {
      q_stew: {
        label: 'Crab stew',
        when: () => !qDone('stew'),
        say: () => {
          const s = qStage('stew');
          if (s === 0) return say("I promised Marta a crab stew for the inn and I've no crab. Mudcrabs are all along the riverbanks, but I've only the one rod and they've got two claws each. Bring me three pieces of mudcrab meat and I'll pay you fair.", {
            choices: [
              choice("I'll get your crab.", () => { qSet('stew', 10); qCheckAll(); return say("Good. Go for the legs. Not theirs, yours. Keep moving."); }),
              choice('Not now.', () => say("Suit yourself. The crabs aren't going anywhere. Well, sideways.")),
            ],
          });
          if (count('crab_meat') < 3) return say(`That's ${count('crab_meat')}. I need three. They sun themselves on the banks either side of the bridge.`);
          finishQuest('stew', { take: { crab_meat: 3 }, gold: 25, items: { fish: 2 }, xp: 25 });
          return say("That's three! Here's your coin, and some smoked trout for the road. Stew'll be at the Goose tomorrow.");
        },
      },
    },
  },
  rolf: {
    greet: () => hourOf() > 20 || hourOf() < 6 ? "Late to be wandering, isn't it?" : 'Halt! ...Oh, it\'s you. Carry on.',
    topics: ['wood', 'about', 'advice', 'town', 'rumors'],
    about: 'Guard of Brindlemere, eight years now. Mostly I guard against boredom. I\'m losing.',
    advice: 'Keep your guard up and your back to something solid.',
    town: "Quiet. Too quiet, Bram says. I like quiet. Quiet doesn't bite.",
    rumors: ["Don't tell anyone, but I keep honey buns in my helmet. It's warm in there."],
    extra: {
      wood: {
        label: 'The Whisper Wood',
        say: () => say("Wolves. Lots of them. I'm paid to guard the gate, not the forest. If you're going in, stay on the path, and don't go at night."),
      },
    },
  },
  cedric: {
    greet: () => "Welcome, welcome! Cedric's General Goods: if I don't have it, you don't need it.",
    topics: ['barter', 'pelts', 'about', 'town', 'rumors'],
    shop: true,
    about: 'I came from Wayrest with a cart and a dream. The cart broke. The dream is mostly intact.',
    town: 'A charming village! Small, rustic, utterly lacking in competition.',
    rumors: ['Tobin says I owe him for some hinges. I say the hinges squeaked. We are at an impasse.'],
    extra: {
      pelts: {
        label: 'Do you buy pelts?',
        say: () => say('Wolf pelts? Yes! Fourteen gold a piece. Well, seven to you. I do have to make a living.'),
      },
    },
  },
  pip: {
    greet: () => qDone('main') ? 'You killed the wolves! Bram said! Can I hold your sword? Just for a second?' : 'Are you an adventurer? You look like an adventurer. Have you killed a dragon?',
    topics: ['dragons', 'about', 'rumors'],
    about: "I'm Pip. I'm eight. I'm going to be a knight. Or a baker. Or a knight who bakes.",
    rumors: ['Brother Alden snores in the chapel when he thinks nobody\'s there.', "Agnes's cat ran off towards the mill. She's always running off. The cat, not Agnes.", 'Rolf hides honey buns in his helmet. I saw.'],
    extra: {
      dragons: { label: 'Dragons?', say: () => say("Brother Alden says there aren't any dragons any more. But Bram says he saw one, a little one, and it ate his eye. Or was that a goblin?") },
    },
  },
};

// ---- Engine ----
function dlgGreeting(id) { return PEOPLE[id].greet(); }
function dlgTopics(id) {
  const P = PEOPLE[id];
  const out = [];
  for (const t of P.topics) {
    const x = (P.extra && P.extra[t]) || T[t];
    if (!x) continue;
    if (t === 'advice' && !P.advice && !P.extra?.advice) continue;
    if (x.when && !x.when()) continue;
    out.push({ id: t, label: x.label });
  }
  return out;
}
function dlgSay(id, topic) {
  const P = PEOPLE[id];
  const x = P.extra && P.extra[topic];
  if (x) return x.say();
  if (topic === 'barter') return { text: '', action: 'barter' };
  if (topic === 'about') return say(P.about);
  if (topic === 'town') return say(P.town || TOWN_INFO);
  if (topic === 'advice') return say(P.advice || pick(ADVICE));
  if (topic === 'rumors') return say(pick([...(P.rumors || []), ...RUMORS]));
  return say('...');
}
