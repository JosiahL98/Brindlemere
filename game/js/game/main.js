'use strict';
// Brindlemere: boot, input, the frame loop, map transitions and interactions.
(function () {
  const canvas = $('#view');
  const g2d = canvas.getContext('2d');
  const img = g2d.createImageData(VW, VH);
  const out32 = new Uint32Array(img.data.buffer);
  const tint = new Uint32Array(256);

  // Stone texture for the panels, from the same palette as everything else.
  (function stoneBackground() {
    const S = 96, cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const x = cv.getContext('2d'), im = x.createImageData(S, S), o = new Uint32Array(im.data.buffer);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) o[j * S + i] = PAL32[R.STONE + clamp(Math.round(2.3 + (pfbm(i, j, S, 6, 33, 4) - 0.5) * 3.2 + (hash3(i, j, 4) - 0.5) * 0.9), 0, 15)];
    x.putImageData(im, 0, 0);
    document.documentElement.style.setProperty('--stone-tex', `url(${cv.toDataURL()})`);
  })();

  const MAPS = Object.assign({ town: buildTown() }, buildInteriors());
  let map = MAPS.town, ents = [], mode = 'title', t = 0, last = performance.now();
  let flash = 0, deadT = 0, combatT = 0, lastStep = 0, titleAng = 0;
  const particles = [];
  const perf = { render: 0 };
  const prefs = (() => { try { return Object.assign({ music: 0.55, sfx: 0.8, sens: 1, invert: false }, JSON.parse(localStorage.getItem('brindlemere-prefs') || '{}')); } catch (e) { return { music: 0.55, sfx: 0.8, sens: 1, invert: false }; } })();
  const savePrefs = () => { try { localStorage.setItem('brindlemere-prefs', JSON.stringify(prefs)); } catch (e) { /* storage unavailable */ } };

  const ctx = {
    get map() { return map; }, get ents() { return ents; },
    propGrid: null, talkingTo: null, lastHit: null, banner: null, inCombat: false, dead: false, ui: false,
    touch: matchMedia('(pointer: coarse)').matches,
    hurtPlayer(dmg, e) {
      const taken = Math.max(1, dmg - Math.floor(armorRating() * 0.6));
      G.p.hp -= taken; Player.sinceHurt = 0; flash = Math.min(1, flash + 0.5 + taken / 20);
      sfx('hurt');
      if (G.p.hp <= 0) die();
    },
    alert(e) { sfx('alert', e.type); combatT = 8; },
    sfx: (n, v) => sfx(n, v),
    bark(e, text) { notify(`${e.name}: "${text}"`, 'item'); },
    blood(e) {
      const col = e.type === 'mudcrab' ? R.OLIVE + 8 : R.RED + 7;
      const h = ACTOR_DEFS()[e.defId].height * 0.6;
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * TAU, s = 30 + Math.random() * 60;
        particles.push({ x: e.x, y: h, z: e.z, vx: Math.cos(a) * s, vy: 40 + Math.random() * 70, vz: Math.sin(a) * s, col: col + Math.floor(Math.random() * 4), life: 1.4 + Math.random(), size: Math.random() < 0.3 ? 2 : 1 });
      }
    },
    uiOpened() { ctx.ui = true; unlockPointer(); updateHint(); },
    uiClosed(id) {
      ctx.ui = UI.isOpen();
      if (id === 'dialogue') ctx.talkingTo = null;
      updateHint();
    },
    newGame(name, bg) {
      newState(name, bg);
      qSet('main', 10);
      G.messages = [];
      UI.intro(name, () => { startPlay(); });
    },
    passTime(hours, rest) {
      const mins = hours * 60;
      G.time += mins;
      if (rest) { G.p.hp = maxHp(); G.p.st = maxSt(); notify(`You slept for ${hours} hour${hours > 1 ? 's' : ''}. You feel rested.`, 'item'); }
      else { G.p.hp = Math.min(maxHp(), G.p.hp + maxHp() * 0.1 * hours); notify(`You waited ${hours} hour${hours > 1 ? 's' : ''}.`, 'item'); }
      enterMap(G.mapId, Player.x, Player.z, Player.ang, true);
      doSave(true);
    },
  };
  ctx.cmaps = null;

  // ---- Maps ----
  function enterMap(id, x, z, ang, quiet) {
    map = MAPS[id];
    G.mapId = id;
    Player.x = x; Player.z = z; Player.ang = ang; Player.pitch = 0;
    ents = populateMap(id);
    ctx.propGrid = buildPropGrid(map);
    const W = worldOf(id);
    for (const p of map.props) p.taken = !!(p.id && W.picked[p.id] && W.picked[p.id] > G.time);
    ctx.lastHit = null; ctx.talkingTo = null;
    if (!quiet) ctx.banner = { text: map.name, t: performance.now() };
    // Render the poses visible on arrival now, behind the fade; queue the rest nearest first.
    const near = ents.filter((e) => Math.hypot(e.x - x, e.z - z) < 900).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    for (const e of near) ActorSprites.warm(e.defId, e.act, 0, entRot(e, x, z));
    const byDist = ents.slice().sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    for (const e of byDist) ActorSprites.prefetch(e.defId, ['idle'], true);
    for (const e of byDist) ActorSprites.prefetch(e.defId, e.state === 'dead' ? ['death'] : [e.act]);
    for (const e of byDist) if (e.kind === 'enemy' || e.wander) ActorSprites.prefetch(e.defId, ['idle', 'walk']);
    for (const e of byDist) if (e.kind === 'enemy') ActorSprites.prefetch(e.defId, ['attack', 'pain', 'death']);
    for (const e of byDist) if (e.kind === 'npc') ActorSprites.prefetch(e.defId, ['talk']);
    for (const e of byDist) if (e.kind === 'npc' && CAST[e.id].fights) ActorSprites.prefetch(e.defId, ['attack']);
    // Prop models: queue the whole map's, and build the nearest now, behind the fade.
    warmProps(map, map.outdoor && outdoorEnv(hourOf()).night > 0.45);
    pumpProps(250);
  }
  function useDoor(door) {
    if (door.locked) { notify(door.locked, 'item'); sfx('deny'); return; }
    sfx('door');
    const fade = $('#fade');
    fade.classList.add('on');
    setTimeout(() => {
      enterMap(door.to, door.tx * TILE, door.tz * TILE, door.ta);
      doSave(true);
      fade.classList.remove('on');
    }, 260);
  }
  function startPlay() {
    mode = 'play';
    ctx.dead = false;
    enterMap(G.mapId, G.p.x, G.p.z, G.p.ang);
    $('#hud-hint').hidden = false;
    updateHint();
  }
  function die() {
    G.p.hp = 0; ctx.dead = true; deadT = 0;
    notify('You have died.', 'combat');
    setTimeout(() => UI.dead(), 1600);
  }
  function doSave(auto) {
    G.p.x = Player.x; G.p.z = Player.z; G.p.ang = Player.ang;
    const ok = saveGame();
    if (!auto) $('#save-msg').textContent = ok ? `Saved: ${clockText()}.` : 'Saving is unavailable in this browser.';
    return ok;
  }
  function doLoad() {
    if (!loadGame()) return false;
    UI.close();
    startPlay();
    notify('Game loaded.', 'item');
    return true;
  }

  // ---- Interaction ----
  function interact() {
    const T_ = Player.target;
    if (!T_ || ctx.dead) return;
    if (T_.kind === 'npc') { ctx.talkingTo = T_.e; UI.dialogue(T_.e); return; }
    if (T_.kind === 'door') { useDoor(T_.door); return; }
    if (T_.kind === 'cat') {
      ents = ents.filter((e) => e !== T_.e);
      G.flags.mittensTaken = true;
      addItem('mittens');
      qSet('mittens', qStage('mittens') >= 10 ? 20 : 5);
      sfx('pickup');
      return;
    }
    if (T_.kind === 'corpse') {
      const e = T_.e;
      UI.loot(e.name, e.loot, (it, n) => {
        addItem(it, n); e.loot[it] = 0;
        const L = worldOf(e.mapId).loot[e.sid]; if (L) L.items[it] = 0;
        sfx('pickup'); qCheckAll();
      });
      return;
    }
    if (T_.kind === 'pick') {
      const p = T_.p;
      p.taken = true;
      worldOf(map.id).picked[p.id] = G.time + 2 * 1440;
      addItem(p.pick);
      sfx('pickup'); qCheckAll();
      return;
    }
    if (T_.kind === 'read') { const r = READINGS[T_.p.read]; UI.read(r.title, r.html); return; }
    if (T_.kind === 'container') {
      const W = worldOf(map.id);
      const c = W.containers[T_.p.container] || (W.containers[T_.p.container] = { bread: 2, apple: 2, potion_heal: 1, leather_cap: 1 });
      UI.loot('Your chest', c, (it, n) => { addItem(it, n); c[it] = 0; sfx('pickup'); qCheckAll(); });
      return;
    }
    if (T_.kind === 'bed') { UI.sleep('bed'); }
  }
  function quickHeal() {
    const order = ['potion_heal', 'stew', 'pie', 'sweetroll', 'fish', 'bread', 'cheese', 'apple'];
    const id = order.find((i) => hasItem(i));
    if (!id) { notify('You have nothing to eat or drink.', 'combat'); return; }
    if (useItem(id)) sfx('eat');
  }

  // ---- Input ----
  const keys = new Set();
  const input = { fwd: 0, strafe: 0, turn: 0, run: false, attack: false, lookX: 0, lookY: 0 };
  let locked = false, attackQueued = false;
  // Where pointer lock is refused (some embedded frames), look by dragging instead.
  let dragLook = false, drag = null;
  const touchState = { mx: 0, my: 0, lookX: 0, lookY: 0, attack: false };
  function unlockPointer() { if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
  function noLock() { dragLook = true; updateHint(); }
  function lockPointer() {
    if (ctx.touch || dragLook) return;
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(noLock); } catch (e) { noLock(); }
  }
  function updateHint() {
    const h = $('#hud-hint');
    h.hidden = mode !== 'play' || ctx.ui || locked || ctx.touch || dragLook;
  }
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; updateHint(); });
  document.addEventListener('pointerlockerror', noLock);
  canvas.addEventListener('mousedown', (e) => { if (dragLook && mode === 'play' && !ctx.ui && e.button === 0) drag = { moved: 0 }; });
  document.addEventListener('mouseup', () => { if (drag && drag.moved < 6 && !ctx.ui) attackQueued = true; drag = null; });
  canvas.addEventListener('click', () => { if (mode === 'play' && !ctx.ui && !locked) lockPointer(); });
  $('#hud-hint').addEventListener('click', () => { if (mode === 'play' && !ctx.ui) lockPointer(); });
  document.addEventListener('mousemove', (e) => {
    if (drag) drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if ((!locked && !drag) || ctx.ui) return;
    input.lookX += e.movementX * 0.0024 * prefs.sens;
    input.lookY += e.movementY * 0.0024 * prefs.sens * (prefs.invert ? -1 : 1);
  });
  document.addEventListener('mousedown', (e) => { if (locked && !ctx.ui && e.button === 0) attackQueued = true; });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') && e.key !== 'Escape') return;
    const k = e.key.toLowerCase();
    if (mode !== 'play') return;
    if (k === 'escape') { e.preventDefault(); if (UI.isOpen()) UI.close(); else UI.pause(); return; }
    if (ctx.dead) return;
    if (UI.isOpen()) {
      if ((k === 'i' || k === 'tab') && UI.panel === 'inventory') { e.preventDefault(); UI.close(); }
      else if (k === 'j' && UI.panel === 'journal') UI.close();
      else if (k === 'm' && UI.panel === 'mapview') UI.close();
      else if ((k === 'e' || k === 'f') && UI.panel === 'loot') UI.lootAll();
      return;
    }
    keys.add(k);
    if (k === 'e' || k === 'f') interact();
    else if (k === 'i' || k === 'tab') { e.preventDefault(); UI.inventory(); }
    else if (k === 'j') UI.journal();
    else if (k === 'm') UI.map();
    else if (k === 't') { if (map.outdoor || map.id === 'home') UI.sleep('wait'); else notify("You can't wait here. Try outside, or rent a room.", 'item'); }
    else if (k === 'h') quickHeal();
    else if (k === ' ') { e.preventDefault(); attackQueued = true; }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  });
  document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  function readInput() {
    const k = (n) => keys.has(n);
    input.fwd = (k('w') || k('arrowup') ? 1 : 0) - (k('s') || k('arrowdown') ? 1 : 0) + touchState.my;
    input.strafe = (k('d') ? 1 : 0) - (k('a') ? 1 : 0) + touchState.mx;
    input.turn = (k('arrowright') ? 1 : 0) - (k('arrowleft') ? 1 : 0);
    input.run = k('shift');
    input.attack = attackQueued || touchState.attack;
    input.lookX += touchState.lookX; input.lookY += touchState.lookY;
    touchState.lookX = 0; touchState.lookY = 0; touchState.attack = false;
    attackQueued = false;
  }

  // Touch controls: a stick on the left, drag to look on the right, buttons for use and attack.
  if (ctx.touch) {
    $('#touch').hidden = false;
    const stick = $('#stick'), knob = $('#stick-knob');
    let sid = null, sx = 0, sy = 0, lid = null, lx = 0, ly = 0;
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; sx = e.clientX; sy = e.clientY; stick.setPointerCapture(sid); });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== sid) return;
      const dx = clamp((e.clientX - sx) / 40, -1, 1), dy = clamp((e.clientY - sy) / 40, -1, 1);
      touchState.mx = dx; touchState.my = -dy;
      knob.style.transform = `translate(${dx * 24}px, ${dy * 24}px)`;
    });
    const endStick = () => { sid = null; touchState.mx = 0; touchState.my = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
    const look = $('#look-pad');
    look.addEventListener('pointerdown', (e) => { lid = e.pointerId; lx = e.clientX; ly = e.clientY; look.setPointerCapture(lid); });
    look.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; touchState.lookX += (e.clientX - lx) * 0.006; touchState.lookY += (e.clientY - ly) * 0.005; lx = e.clientX; ly = e.clientY; });
    look.addEventListener('pointerup', () => { lid = null; });
    $('#t-attack').addEventListener('pointerdown', (e) => { e.preventDefault(); touchState.attack = true; });
    $('#t-use').addEventListener('click', () => interact());
    $('#t-menu').addEventListener('click', () => UI.pause());
    $('#t-inv').addEventListener('click', () => UI.inventory());
    $('#t-journal').addEventListener('click', () => UI.journal());
    $('#t-map').addEventListener('click', () => UI.map());
  }

  // ---- Buttons in the panels ----
  UI.init(ctx);
  $('#btn-new').addEventListener('click', () => { Sound.init(); Sound.play('title'); UI.close(); UI.create(); });
  $('#btn-continue').addEventListener('click', () => { Sound.init(); doLoad(); });
  $('#btn-controls').addEventListener('click', () => { Sound.init(); UI.show('controls', { onClose: () => (mode === 'title' ? UI.title() : null) }); });
  $('#intro-go').addEventListener('click', () => UI.close());
  $('#barter-act').addEventListener('click', () => UI.barterDo());
  $('#loot-all').addEventListener('click', () => UI.lootAll());
  $('#sleep-go').addEventListener('click', () => UI.sleepDo());
  $('#btn-resume').addEventListener('click', () => UI.close());
  $('#btn-save').addEventListener('click', () => doSave(false));
  $('#btn-load').addEventListener('click', () => doLoad());
  $('#btn-pause-controls').addEventListener('click', () => UI.show('controls', { onClose: () => UI.pause() }));
  $('#btn-quit').addEventListener('click', () => { UI.close(); mode = 'title'; G = null; UI.title(); });
  $('#btn-dead-load').addEventListener('click', () => doLoad());
  $('#btn-dead-title').addEventListener('click', () => { UI.close(); mode = 'title'; G = null; UI.title(); });
  const vol = (id, key) => { const el = $(id); el.value = prefs[key]; el.addEventListener('input', () => { prefs[key] = +el.value; Sound.setVolumes(prefs.music, prefs.sfx); savePrefs(); }); };
  vol('#opt-music', 'music'); vol('#opt-sfx', 'sfx'); vol('#opt-sens', 'sens');
  $('#opt-invert').checked = prefs.invert;
  $('#opt-invert').addEventListener('change', (e) => { prefs.invert = e.target.checked; savePrefs(); });
  on('quest', () => sfx('quest'));
  on('levelup', () => sfx('levelup'));
  on('kill', (e) => sfx('death', e.type));
  on('gold', (n) => { if (n > 0) sfx('coins'); });

  // ---- Frame loop ----
  function update(dt) {
    G.time += dt * MIN_PER_SEC;
    readInput();
    if (!ctx.dead) updatePlayer(dt, input, map, ents, ctx);
    input.lookX = 0; input.lookY = 0;
    updateEnts(dt, ents, map, Player, ctx);
    ctx.inCombat = ents.some((e) => e.kind === 'enemy' && (e.state === 'chase' || e.state === 'attack' || e.state === 'pain') && Math.hypot(e.x - Player.x, e.z - Player.z) < 700);
    if (ctx.inCombat) combatT = 6; else combatT -= dt;
    for (const p of particles) {
      p.life -= dt;
      if (p.y > 0) { p.vy -= 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y <= 0) { p.y = 0.2; p.vx = p.vz = 0; } }
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
    // Footsteps
    const step = Math.floor(Player.bobT / Math.PI);
    if (step !== lastStep) {
      lastStep = step;
      const f = map.floorAt(Math.floor(Player.x / TILE), Math.floor(Player.z / TILE));
      sfx('step', f.id);
    }
    // Things that happen while you're away (respawns) are handled on map entry; quests check on events.
    qCheckAll();
    Sound.play(pickMusic());
  }
  function pickMusic() {
    if (mode === 'title') return 'title';
    if (combatT > 0) return 'combat';
    if (!map.outdoor) return map.music;
    const h = hourOf();
    if (h >= 21 || h < 5.5) return 'night';
    const tx = Player.x / TILE, tz = Player.z / TILE;
    return tx > 17 && tx < 49 && tz > 12 && tz < 44 ? 'town' : 'wild';
  }

  function render(dt) {
    ActorSprites.beginFrame();
    let cam, env, hour;
    if (mode === 'title') {
      titleAng += dt * 0.08;
      hour = 19.2;
      cam = { x: 31.5 * TILE + Math.cos(titleAng) * 120, z: 30.5 * TILE + Math.sin(titleAng) * 120, ang: titleAng + Math.PI * 0.7, eye: 56, pitch: -0.05 };
      map = MAPS.town;
      env = outdoorEnv(hour);
    } else {
      hour = hourOf();
      cam = { x: Player.x, z: Player.z, ang: Player.ang, eye: Player.eye, pitch: Player.pitch };
      env = map.outdoor ? outdoorEnv(hour) : indoorEnv(map);
    }
    ctx.cmaps = env.cmaps;
    propBeginFrame();
    const sprites = gatherPropSprites(map, t, env.night, cam.x, cam.z);
    if (mode === 'play') for (const e of ents) {
      const spr = ActorSprites.get(e.defId, e.act, entFrame(e), entRot(e, cam.x, cam.z));
      if (spr) sprites.push({ spr, x: e.x, z: e.z });
    }
    renderWorld(map, cam, env, sprites, t);
    if (mode === 'play') {
      drawParticles(cam, env);
      if (!ctx.dead) {
        const tx = Math.floor(Player.x / TILE), tz = Math.floor(Player.z / TILE);
        const lm = map.inside(tx, tz) ? map.lightmap[map.idx(tx, tz)] + map.nightmap[map.idx(tx, tz)] * env.night : 0;
        const lvl = clamp(Math.round((255 - env.light) / 8 - 3 - lm), 0, 31);
        drawViewmodel(viewmodelFrames(G.eq.weapon, G.eq.body), Player.swing, Player.bobT, Player.moving, lvl, env.cmaps);
      }
      drawHud(Render.fb, Object.assign(ctx, { markers: questMarkers(map.id, map, ents) }));
    }
    present();
    ActorSprites.pump(mode === 'play' && !UI.isOpen() ? 5 : 10);
    pumpProps(mode === 'title' ? 8 : 3);
  }
  function drawParticles(cam, env) {
    for (const p of particles) {
      const q = projectPoint(cam, p.x, p.y, p.z);
      if (!q || q[2] < 6) continue;
      const [fx, fy, depth, s] = q, x = Math.round(fx), y = Math.round(fy);
      const size = Math.max(1, Math.round(p.size * s * 0.9));
      const c = env.cmaps[clamp(Math.round((255 - env.light) / 8 + depth * env.fogK), 0, 31) * 256 + p.col];
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        const X = x + i, Y = y - j;
        if (X >= 0 && X < VW && Y >= 0 && Y < VH && Render.zb[Y * VW + X] > depth) Render.fb[Y * VW + X] = c;
      }
    }
  }
  function present() {
    let pal = PAL32;
    const lowHp = mode === 'play' && G && G.p.hp / maxHp() < 0.25 ? 0.18 + 0.12 * Math.sin(t * 5) : 0;
    const k = Math.min(1, flash * 0.55 + lowHp + (ctx.dead ? Math.min(0.6, deadT) : 0));
    if (k > 0.01) {
      for (let i = 0; i < 256; i++) {
        const r = PAL[i * 3], g = PAL[i * 3 + 1], b = PAL[i * 3 + 2];
        tint[i] = (255 << 24) | (Math.round(b * (1 - k)) << 16) | (Math.round(g * (1 - k * 0.9)) << 8) | Math.round(r + (200 - r) * k * 0.6);
      }
      pal = tint;
    }
    const fb = Render.fb;
    for (let i = 0; i < fb.length; i++) out32[i] = pal[fb[i]];
    g2d.putImageData(img, 0, 0);
  }
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now; t += dt;
    flash = Math.max(0, flash - dt * 2);
    if (ctx.dead) deadT += dt;
    if (mode === 'play' && !UI.isOpen() && !ctx.dead) update(dt);
    else if (mode === 'play' && ctx.dead) updateEnts(dt, ents, map, Player, ctx);
    if (mode === 'title') Sound.play('title');
    const r0 = performance.now();
    try { render(dt); } catch (err) { console.error(err); }
    perf.render = perf.render * 0.9 + (performance.now() - r0) * 0.1;
    requestAnimationFrame(frame);
  }
  // Expose a little for debugging and tests.
  window.__game = { perf, ctx, MAPS, enterMap, get map() { return map; }, get ents() { return ents; }, Player, startPlay, interact, setMode: (m) => { mode = m; } };

  UI.title();
  // Use the title screen's idle time to get the first villager you meet ready.
  ActorSprites.prefetch('elsa', ['idle'], true);
  ActorSprites.prefetch('elsa', ['idle', 'talk']);
  loadBaked().catch((e) => console.error('baked villagers failed to load', e));
  requestAnimationFrame(frame);
})();
