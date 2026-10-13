# Bestiary and Brindlemere

Two browser projects that share one procedural sprite engine, in the style of *The Elder Scrolls: Arena*, *Daggerfall* and *DOOM*:

- **Brindlemere** (`game/`) is a small first-person RPG. You are a villager who decides to become an adventurer, in one town with its outskirts.
- **Bestiary** (the repo root) is a sprite viewer. Pick a creature, then watch it idle, walk, attack, flinch and die from any of eight rotations.

Neither needs a build step or anything installed. Open `game/index.html` or `index.html` in a browser.

The game is published to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`. It builds the single-file game (`node tools/build.js --game`) and serves it at the site root, with the bestiary at `bestiary.html`.

## Brindlemere

You wake up in your mother's house in Brindlemere, a valley town under a purple sky, and decide you're done with farm work. Old Captain Bram at the Sleeping Goose knows the adventuring trade. Talk to him and the main quest, *A New Path*, takes it from there.

### What's in it

- **One town and its outskirts.** A 64×64-tile valley with a market square, an inn, a smithy, a chapel, a mill on the river, farms, a meadow and the Whisper Wood. Six buildings have interiors, and the inn has a cellar.
- **Fourteen villagers.** Each has a sculpted face and a dialogue portrait. They wander, work (Tobin hammers at his anvil), turn to face you, and call out as you pass. If a wild animal attacks near them, the armed ones (Rolf the guard, Tobin, Odo and Nell) join the fight and the rest run for it. Nobody in town can be killed: badly hurt, they fall back and recover.
- **Skyrim-style dialogue.** A greeting, then topics: *About you*, *Brindlemere*, *Rumors*, *Barter*, plus quest topics, some with choices (including paying someone off).
- **Shops.** Cedric's general goods, Tobin's forge, Hilda's bakery, Marta's inn, Wren's remedies and Nell the fisherwoman. Each has its own stock, gold, and the kinds of goods it will buy. You can also rent a room at the inn.
- **Seven quests.** The main quest, plus six about town life: *Rats in the Cellar*, *Mittens Is Missing*, *Flour for the Bakery*, *Crab Stew*, *Bluebells for Wren* and *The Overdue Book*. Quest targets show on the compass and the map.
- **Weak enemies on the outskirts.** Giant rats in the western fields and the inn cellar, mudcrabs along the river, and wolves in the Whisper Wood. Kills give XP and loot. Enemies respawn after a while.
- **RPG basics.** Health, stamina and running, levelling, weapons and armour, food and potions, a journal, a map, sleeping and waiting, and saving and loading. Saves go to `localStorage`, and the game autosaves at doors.
- **Day and night.** One real second is one game minute. The sky, fog and lighting follow the hour. At night, lamps and windows light up and the stars come out.
- **Music.** Eight dungeon-synth and dark-ambient tracks, composed with the [ElevenLabs](https://elevenlabs.io/) Music API: title, town, night, wilderness, interiors, cellar, chapel and combat (`game/music/`). Each loops by crossfading its end into its start. If a recording can't load, a generative version of that mood plays instead, synthesised live with the Web Audio API (drones, pads, choir, flute, lute, bells, horn and drums through a long reverb). The sound effects are synthesised too.

### Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look around, including straight up and down. Click the view to capture the cursor, or drag if your browser won't capture it |
| Arrow keys | Move and turn without a mouse |
| `Shift` | Run |
| Click | Attack |
| `Space` | Jump |
| `E` or `F` | Talk, open, pick up, search |
| `I` or `Tab` | Inventory |
| `J` | Journal |
| `M` | Map |
| `T` | Wait |
| `H` | Eat or drink something to heal |
| `Esc` | Menu, save and load, volume, mouse settings |

On touch screens, an on-screen stick, a look pad and buttons appear.

### How the game draws

- **The world** is drawn into a 320×200, 256-colour frame buffer (`game/js/render.js`). Each pixel casts its own ray through the tile grid, so the camera can tilt all the way up or down with true perspective, not the usual raycaster shear. Walls can have several heights, and rays drop onto the tops of low walls. Lighting goes through 32 DOOM-style colormaps per fog colour, plus a baked lightmap from fireplaces and street lamps.
- **Textures** are generated at load time, not loaded from files (`game/js/textures.js`).
- **Most villagers, beasts, props, item icons and portraits** are sculpted from signed-distance primitives and ray-marched, like the bestiary's creatures.
- **Some assets are baked from 3D models** generated with [Tripo](https://www.tripo3d.ai/). These cover every villager and animal, rigged and animated (villagers who never leave their counter use their idle loop for talking). They also cover the first-person arms, each modelled already holding its weapon. `tools/bake-mesh.js` and `tools/bake-viewmodel.js` render them with three.js in headless Chrome, using the game's camera tilt and light direction, 4× supersampled. They are then snapped to the palette with dithering and dark outlines, and stored compressed in `game/js/data/baked/`. The source models live in `assets/tripo/`, and the game itself never loads them.
- **Villagers** use a shared body builder (`game/js/actors/people.js`). It covers proportions by sex, age and build, and faces with cheekbones, lids, lashes, brows, noses, lips and stubble. It also covers hairstyles and beards, and outfits from aprons to an open-shirted smith.
- **Actor sprites render on demand.** Each one is ray-marched a few rows per frame within a small time budget, while the nearest finished pose stands in. The poses you see when entering a map are rendered behind the door fade.

### Game files

```
game/index.html             page, panels and script order
game/css/game.css           UI styling
game/js/textures.js         procedural wall, floor and window textures
game/js/world.js            map format, the town and the interiors
game/js/render.js           raycaster, sky, time of day, sprite drawing
game/js/actors/props.js     trees, lamps, stalls, furniture and other props
game/js/actors/people.js    villager bodies, faces, hair, clothes, animation, portraits
game/js/actors/beasts.js    wolf, giant rat, mudcrab, cat
game/js/actors/gear.js      item models and inventory icons
game/js/data/items.js       items, prices and stats
game/js/data/cast.js        who lives where and what they look like
game/js/data/quests.js      quest stages, objectives and compass targets
game/js/data/dialogue.js    dialogue, rumours and shops
game/js/data/baked.js       unpacks the baked villagers and first-person sprites
game/js/data/baked/*.js     baked sprite data (generated)
game/js/game/state.js       game state, inventory, quests API, saving
game/js/game/actors.js      sprite cache, spawning, NPC and enemy AI, combat
game/js/game/player.js      movement, stamina, attacks, interaction targets
game/js/game/viewmodel.js   first-person arm and weapon (baked, with a sculpted fallback)
game/js/game/hud.js         compass, bars, prompts and notifications
game/js/game/audio.js       music (recordings, with a generative fallback) and sound effects
game/music/*.mp3            the recorded soundtrack
game/js/game/ui.js          dialogue, barter, inventory, journal, map and other panels
game/js/game/main.js        game loop, input, doors and the title screen
```

### Game tools

These need Node 18 or newer.

```sh
node tools/gameshot.js --map town --at 31,30,270 --hour 10   # render a view -> PNG
node tools/actorpreview.js marta idle walk --dirs 0,1,2      # villager or beast sprite sheet
node tools/portraits.js elsa bram tobin                      # dialogue portraits
node tools/validate.js                                       # spawns, NPCs, props and doors not in walls or water
node tools/build.js --game                                   # single file -> dist/brindlemere.html
```

Making and baking 3D assets needs a Tripo API key in `TRIPO_API_KEY` (on Windows the user environment variable is read too), and `npm install` inside `tools/` for three.js and puppeteer-core:

```sh
node tools/tripo.js balance                                  # credits left
node tools/tripo.js text elsa "<description>"                # model -> assets/tripo/elsa/model-N.glb
node tools/tripo.js rig elsa                                 # rig the latest model
node tools/tripo.js animate elsa idle walk agree             # preset animations
node tools/bake-mesh.js tobin                                # -> game/js/data/baked/tobin.js
node tools/bake-viewmodel.js [--preview]                     # -> game/js/data/baked/viewmodel.js
node tools/viewer.js                                         # the motion viewer, in the browser
```

Each villager's and animal's height, held pole and actions are in `tools/bake/bakes.mjs`; the first-person arm, its attacks and its models are in `tools/bake/arm.mjs`.

The **motion viewer** (`tools/viewer.js`, or `npm run viewer` in `tools/`) shows every baked model moving. It lists the first-person arm with each weapon, and every villager and animal. Each one is posed live in 3D by the same code the bakers use, beside the frame the game shows at that moment. The arm is shown through the game's camera and from outside, with guides for the head, shoulder, forearm, palm and weapon. Villagers' scripted moves show where each wrist is sent, and Tobin's anvil stands where it is in town. There are controls to play at game speed or slower, scrub, and step frame by frame. Edits to `tools/bake/*.mjs` show up when the page is reloaded.

Every Tripo task and its credit cost is logged in `assets/tripo/<name>/tasks.json`.

First-person models that already hold their weapon (`assets/tripo/fp-*`) are posed from three points read off their reference views: the elbow end, the centre of the fist and the weapon's tip. These are set in `tools/bake/arm.mjs`.

```sh
node tools/model-views.js assets/tripo/fp-club/model-1.glb  # front, side and top views with a grid
```

Music needs an ElevenLabs key in `ELEVEN_LABS_API_KEY`:

```sh
node tools/elevenlabs.js music town "<description>" --seconds 120   # -> game/music/town.mp3
node tools/build.js --game --fragment out.html --split-music dir/    # ~700 KB pieces for hosts that limit uploads
```

## Bestiary

### Creatures

| Creature | Notable frames |
| --- | --- |
| Skeleton Warrior | Rusty sword, chattering jaw, collapses into a pile of bones |
| Orc Brute | Two-handed overhead club smash, falls on its face |
| Fallen Knight | Plumed great helm with eyes glowing through the visor, heraldic shield, cape |
| Fire Fiend | Conjures a fireball in its claw and throws it as a projectile |
| Gazer | Floating eye that blinks and looks around, charges and spits a bolt, deflates when it dies |
| Giant Cave Spider | Eight IK legs on an alternating gait, rears up to bite, legs curl when it dies |
| Lich | Hovering robes, staff orb that flares when casting, collapses into an empty heap |
| Dark Elf | Twin curved blades and a spinning whirl attack |

Each creature has 5 actions and 36–38 frames, and every frame exists in 8 rotations, so about 300 sprites per creature.

### Controls

| Key | Action |
| --- | --- |
| `1`–`5` | Idle, walk, attack, pain, death |
| `←` `→` | Turn the creature |
| `↑` `↓` | Previous / next creature |
| `Space` | Pause |
| `,` `.` | Step one frame |

Click any frame in the strip under the viewport to pause on it. Choosing another action after a death plays the death backwards first, so the creature gets back up.

Scene options include three locations (Dungeon, Tech Base, Inferno), DOOM-style sector lighting (torch flicker, glow, strobe, faulty), viewing distance, 4:3 pixel aspect, and the spectre fuzz effect.

### How the sprites are made

Nothing is drawn by hand and no image files are loaded. Each frame is built at runtime, a bit like DOOM's clay-model sprites:

1. **Pose.** A creature defines its actions as functions of time. Humanoids share a rig with forward and inverse kinematics (`js/rig.js`). The gazer and spider have their own.
2. **Sculpt.** The pose is turned into 50–150 signed-distance primitives: spheres, tapered capsules, ellipsoids, rounded boxes and tori. They are blended, carved and clipped (`js/sdf.js`). Faces combine sculpted features (brows, sockets, snouts, teeth, tusks) with details painted in head space (war paint, scars, tattoos, kohl), so the paint follows the head as it turns.
3. **Rasterise.** Each sprite pixel is ray-marched at two pixels per world unit, with a slight downward camera tilt. At the default viewing distance that is one sprite pixel per pixel of the 320×200 screen. Lighting includes soft self-shadows and ambient occlusion.
4. **Quantise.** Light becomes a step on one of 16 sixteen-shade colour ramps (`js/palette.js`). Grit noise and ordered dithering are added, then silhouette and crease edges are darkened.
5. **Display.** The scene renders into an 8-bit frame buffer, where light levels and distance fog go through 32 colormaps as in DOOM (`js/scene.js`). Eyes, fire and magic are fullbright and ignore the colormaps.

Sprites render on demand and are cached. The rest of the current creature fills in during idle time, a few rows at a time, so playback stays smooth (roughly 15–40 ms of work per sprite).

### Files

```
index.html            page and script order
css/style.css         UI styling
js/math.js            vectors, frames, IK, noise
js/palette.js         palette ramps and colormaps
js/sdf.js             primitives, materials, sprite rasteriser
js/materials.js       shared materials
js/rig.js             creature registry, humanoid rig, gait and pose helpers
js/creatures/*.js     one file per creature
js/fx.js              fireball / magic / plasma sprites
js/font.js            5×7 bitmap font for the status bar
js/scene.js           floor/ceiling/sky renderer, sprite scaling, status bar
js/app.js             UI, animation clock, cache, projectiles and particles
tools/preview.js      renders sprite sheets to PNG with Node
tools/build.js        bundles everything into one HTML file
```

### Tools

These need Node 18 or newer.

```sh
node tools/preview.js orc walk attack --dirs 0,2 --scale 4   # sheet -> tools/out/preview.png
node tools/preview.js orc idle --scale 8 --band 40,64        # close-up of the heads only
node tools/build.js                                          # single file -> dist/bestiary.html
```

To add a creature, create `js/creatures/<name>.js` and call `defineCreature` with `idle`, `walk`, `attack`, `pain` and `death` actions (see `skeleton.js`). Then add a `<script>` tag for it in `index.html` before `fx.js`.
