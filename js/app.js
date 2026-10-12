'use strict';
// Bestiary viewer: UI wiring, animation clock, sprite cache and the scene loop.
(function () {
  const $ = (s) => document.querySelector(s);
  const ACTIONS = ['idle', 'walk', 'attack', 'pain', 'death'];
  const ACTION_LABELS = { idle: 'Idle', walk: 'Walk', attack: 'Attack', pain: 'Pain', death: 'Death' };
  const DIR_ARROWS = ['↓', '↘', '→', '↗', '↑', '↖', '←', '↙'];
  const DIR_NAMES = ['toward you', 'toward you, to the right', 'right', 'away, to the right', 'away', 'away, to the left', 'left', 'toward you, to the left'];
  const ZOOMS = { far: 1.25, mid: 1.6, near: 2, close: 2.5 };
  const FLICKERS = { steady: 'Steady', torch: 'Torchlight', glow: 'Glowing', strobe: 'Strobe', broken: 'Faulty' };
  const BLOOD = { red: [R.RED, 5, 10], bone: [R.BONE, 8, 13], green: [R.GREEN, 4, 9], ichor: [R.OLIVE, 6, 11], purple: [R.PURPLE, 5, 10], dust: [R.GRAY, 6, 11] };

  const prefs = (() => { try { return JSON.parse(localStorage.getItem('bestiary-prefs') || '{}'); } catch (e) { return {}; } })();
  const st = {
    cid: CREATURES.some((c) => c.id === prefs.cid) ? prefs.cid : CREATURES[0].id,
    action: 'idle', loopAction: 'idle', dir: 1, frame: 0, clock: 0, hold: 0,
    playing: true, speed: 1, repeat: prefs.repeat !== undefined ? prefs.repeat : true,
    env: ENVS[prefs.env] ? prefs.env : 'dungeon', light: null, flicker: prefs.flicker || 'torch',
    zoom: ZOOMS[prefs.zoom] ? prefs.zoom : 'near', aspect: prefs.aspect !== false, scroll: prefs.scroll !== false,
    fuzz: false, spin: false, spinClock: 0,
    mx: 0, mz: 0, time: 0, flash: 0, lightNow: 176, flick: 0,
    projectiles: [], particles: [],
  };
  const savePrefs = () => {
    try {
      localStorage.setItem('bestiary-prefs', JSON.stringify({ cid: st.cid, env: st.env, flicker: st.flicker, zoom: st.zoom, aspect: st.aspect, scroll: st.scroll, repeat: st.repeat }));
    } catch (e) { /* storage unavailable */ }
  };
  const creature = () => CREATURES.find((c) => c.id === st.cid);
  const act = () => creature().actions[st.action];

  // --- Sprite cache -------------------------------------------------------------------
  const sprites = new Map(), shapes = new Map();
  let cacheVersion = 0;
  const skey = (c, a, f, d) => `${c}|${a}|${f}|${d}`;
  function getShape(cid, a, f) {
    const k = `${cid}|${a}|${f}`;
    let s = shapes.get(k);
    if (!s) {
      s = buildFrame(CREATURES.find((c) => c.id === cid), a, f);
      shapes.set(k, s);
      if (shapes.size > 400) shapes.delete(shapes.keys().next().value);
    }
    return s;
  }
  function store(k, s) {
    delete s.depth;
    sprites.set(k, s);
    cacheVersion++;
    if (sprites.size > 1800) sprites.delete(sprites.keys().next().value);
    return s;
  }
  // Background rendering happens a few rows at a time; this is the sprite in progress.
  let job = null;
  function getSprite(cid, a, f, d) {
    const k = skey(cid, a, f, d);
    let s = sprites.get(k);
    if (s) return s;
    if (job && job.k === k) {
      // Needed right now: finish the half-rendered one.
      let r = job.gen.next();
      while (!r.done) r = job.gen.next();
      job = null;
      return store(k, r.value);
    }
    return store(k, renderSprite(getShape(cid, a, f), d * Math.PI / 4));
  }

  // Background prefetch: current action/facing first, then the rest of this creature.
  let prefetchGen = null;
  function* prefetchOrder() {
    const c = creature(), cid = c.id;
    const dirs = [st.dir, (st.dir + 1) & 7, (st.dir + 7) & 7, (st.dir + 2) & 7, (st.dir + 6) & 7, (st.dir + 3) & 7, (st.dir + 5) & 7, (st.dir + 4) & 7];
    const acts = [st.action, ...ACTIONS.filter((a) => a !== st.action)];
    for (const a of acts) for (let f = 0; f < c.actions[a].frames; f++) yield [cid, a, f, st.dir];
    for (const d of dirs) for (const a of acts) for (let f = 0; f < c.actions[a].frames; f++) yield [cid, a, f, d];
  }
  let pumpTimer = 0;
  function restartPrefetch() {
    prefetchGen = prefetchOrder();
    if (!pumpTimer) pumpTimer = setTimeout(pump, 30);
  }
  // Spend at most ~7 ms per slice so the animation keeps its frame rate.
  function pump() {
    pumpTimer = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 7) {
      if (!job) {
        if (!prefetchGen) return;
        const n = prefetchGen.next();
        if (n.done) { prefetchGen = null; return; }
        const [c, a, f, d] = n.value;
        const k = skey(c, a, f, d);
        if (sprites.has(k)) continue;
        job = { k, gen: spriteJob(getShape(c, a, f), d * Math.PI / 4) };
      }
      const r = job.gen.next();
      if (r.done) { store(job.k, r.value); job = null; }
    }
    pumpTimer = setTimeout(pump, 0);
  }

  // --- Frame buffer -------------------------------------------------------------------
  const view = $('#view');
  const vctx = view.getContext('2d');
  const img = vctx.createImageData(SCR_W, SCR_H);
  const out32 = new Uint32Array(img.data.buffer);
  const fb = new Uint8Array(SCR_W * SCR_H);
  const tint = new Uint32Array(256);

  function present(buf, ctx, image, o32, flash) {
    let pal = PAL32;
    if (flash > 0.01) {
      const k = Math.min(flash, 1) * 0.55;
      for (let i = 0; i < 256; i++) {
        const r = PAL[i * 3], g = PAL[i * 3 + 1], b = PAL[i * 3 + 2];
        tint[i] = (255 << 24) | (Math.round(b * (1 - k)) << 16) | (Math.round(g * (1 - k)) << 8) | Math.round(r + (255 - r) * k * 0.8);
      }
      pal = tint;
    }
    for (let i = 0; i < buf.length; i++) o32[i] = pal[buf[i]];
    ctx.putImageData(image, 0, 0);
  }

  // --- Simulation ---------------------------------------------------------------------
  const yawOf = () => st.dir * Math.PI / 4;
  const distance = () => FOCAL / ZOOMS[st.zoom];
  function toWorld(p) {
    const y = yawOf(), c = Math.cos(y), s = Math.sin(y);
    return [st.mx + p[0] * c + p[2] * s, p[1], st.mz - p[0] * s + p[2] * c];
  }

  function setAction(a, keepFrame) {
    const c = creature();
    if (!c.actions[a]) return;
    if (st.action === 'death' && a !== 'death' && st.frame > 0) {
      // Rise again: play the death in reverse, like an arch-vile resurrection.
      st.rising = a;
      st.playing = true;
      updateButtons();
      return;
    }
    st.rising = null;
    st.action = a;
    if (c.actions[a].loop) st.loopAction = a;
    if (!keepFrame) { st.frame = 0; st.clock = 0; st.hold = 0; onFrameEnter(); }
    restartPrefetch();
    updateButtons();
  }

  function onFrameEnter() {
    const c = creature(), A = act();
    if (A.emit && st.frame === A.emit.frame) {
      const shape = getShape(c.id, st.action, st.frame);
      const p = shape.points[A.emit.point] || [0, 40, 6];
      const w = toWorld(p), y = yawOf(), fx = FX[A.emit.fx];
      st.projectiles.push({ fx, x: w[0], y: w[1], z: w[2], vx: Math.sin(y) * fx.speed, vz: Math.cos(y) * fx.speed, age: 0, boom: -1, travel: 0 });
    }
    if ((st.action === 'pain' || st.action === 'death') && st.frame === 0) spray(st.action === 'death' ? 26 : 14);
  }

  function spray(n) {
    const c = creature(), [ramp, lo, hi] = BLOOD[c.blood || 'red'];
    const shape = getShape(c.id, st.action, 0);
    const p = toWorld(shape.points.chest || [0, (c.height || 50) * 0.65, 2]);
    const r = rng((st.time * 1000) | 0);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, sp = 20 + r() * 50;
      st.particles.push({
        x: p[0], y: p[1], z: p[2], vx: Math.cos(a) * sp, vy: 30 + r() * 70, vz: Math.sin(a) * sp * 0.7 + 15,
        col: ramp + Math.round(lerp(lo, hi, r())), size: r() < 0.3 ? 2 : 1, life: 1.6 + r() * 0.8,
      });
    }
  }

  function updateLight(dt) {
    const base = st.light === null ? ENVS[st.env].light : st.light;
    let l = base;
    st.flick += dt;
    const t = st.time;
    switch (st.flicker) {
      case 'torch': {
        const n = vnoise(t * 7, 3.1, 0) * 0.7 + vnoise(t * 19, 8.3, 1) * 0.3;
        l = base - 40 * n; break;
      }
      case 'glow': l = base - 56 * (0.5 + 0.5 * Math.sin(t * 2.4)); break;
      case 'strobe': l = (t % 1.0) < 0.12 ? base : base - 96; break;
      case 'broken': {
        const k = Math.floor(t * 9);
        l = hash3(k, 7, 7) < 0.22 ? base - 110 : base; break;
      }
    }
    // Projectiles light their surroundings a little.
    for (const p of st.projectiles) if (p.boom < 0 || p.boom < 3) l += p.fx.light;
    st.lightNow = clamp(l, 0, 255);
  }

  function update(dt) {
    st.time += dt;
    updateLight(dt);
    st.flash = Math.max(0, st.flash - dt * 2.2);
    const c = creature();

    if (st.spin && st.playing) {
      st.spinClock += dt * st.speed;
      if (st.spinClock > 0.9) { st.spinClock = 0; st.dir = (st.dir + 1) & 7; restartPrefetch(); updateButtons(); }
    }

    if (st.playing) {
      const A = act();
      if (st.rising) {
        st.clock += dt * A.fps * st.speed * 1.3;
        while (st.clock >= 1) {
          st.clock -= 1;
          if (st.frame > 0) st.frame--;
          else { const to = st.rising; st.rising = null; st.action = 'death'; setAction(to); break; }
        }
      } else if (st.hold > 0) {
        st.hold -= dt * st.speed;
        if (st.hold <= 0) { st.frame = 0; st.clock = 0; onFrameEnter(); }
      } else {
        st.clock += dt * A.fps * st.speed;
        while (st.clock >= 1) {
          st.clock -= 1;
          if (st.frame + 1 < A.frames) { st.frame++; onFrameEnter(); continue; }
          if (A.loop) { st.frame = 0; onFrameEnter(); continue; }
          // One-shot finished.
          if (st.action === 'death') { if (st.repeat) st.hold = 2.2; else st.clock = 0; break; }
          if (st.repeat) { st.hold = 0.55; break; }
          setAction(st.loopAction);
          break;
        }
      }
      // Walking carries the creature (and the camera) across the floor.
      if (A.travel && st.scroll && !st.rising) {
        const v = A.travel * A.fps / A.frames * st.speed;
        st.mx += Math.sin(yawOf()) * v * dt;
        st.mz += Math.cos(yawOf()) * v * dt;
      }
    }

    const camZ = st.mz + distance();
    for (const p of st.projectiles) {
      if (p.boom < 0) {
        const dx = p.vx * dt, dz = p.vz * dt;
        p.x += dx; p.z += dz; p.travel += Math.hypot(dx, dz); p.age += dt;
        const depth = camZ - p.z;
        if (depth < 22) { p.boom = 0; st.flash = 1; } else if (p.travel > 260) p.boom = 0;
      } else p.boom += dt * 14;
    }
    st.projectiles = st.projectiles.filter((p) => p.boom < p.fx.boom.length);
    for (const p of st.particles) {
      p.life -= dt;
      if (p.y > 0) {
        p.vy -= 260 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y <= 0) { p.y = 0; p.vx = p.vz = p.vy = 0; }
      }
    }
    st.particles = st.particles.filter((p) => p.life > 0);
    if (c.id !== st.lastCid) st.lastCid = c.id;
  }

  // --- Drawing ------------------------------------------------------------------------
  function draw() {
    const c = creature(), A = act();
    const D = distance();
    // Crouch the camera for close views so the creature's feet stay above the status bar.
    const eye = Math.min(EYE_H, (VIEW_H - 12 - HORIZON) / ZOOMS[st.zoom]);
    const scn = { env: ENVS[st.env], light: st.lightNow, camX: st.mx, camZ: st.mz + D, eye };
    const sh = c.shadow || [14, 8];
    scn.shadow = { x: st.mx, z: st.mz, rx: sh[0], rz: sh[1], k: c.float ? 4 : 7 };
    renderView(fb, scn);
    const env = envReady(scn.env);

    const spr = getSprite(c.id, st.action, st.frame, st.dir);
    const items = [{ depth: D, draw: () => {
      const p = project(scn, st.mx, 0, st.mz);
      drawSprite(fb, spr, Math.round(p.x), p.y, p.s, depthMap(env, st.lightNow, D), env.cmaps, st.fuzz, (st.time * 60) | 0);
    } }];
    for (const pr of st.projectiles) {
      items.push({ depth: scn.camZ - pr.z, draw: () => {
        const p = project(scn, pr.x, pr.y, pr.z);
        if (!p) return;
        const frames = pr.boom < 0 ? pr.fx.fly : pr.fx.boom;
        const f = pr.boom < 0 ? Math.floor(pr.age * 12) % frames.length : Math.min(frames.length - 1, Math.floor(pr.boom));
        drawSprite(fb, frames[f], p.x, p.y, p.s * 1.1, 0, env.cmaps, false, 0);
      } });
    }
    for (const pa of st.particles) {
      items.push({ depth: scn.camZ - pa.z, draw: () => {
        const p = project(scn, pa.x, pa.y, pa.z);
        if (!p) return;
        const map = depthMap(env, st.lightNow, p.depth);
        const sz = Math.max(1, Math.round(pa.size * p.s * 0.8));
        const col = env.cmaps[map * 256 + pa.col];
        for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
          const X = Math.round(p.x) + x, Y = Math.round(p.y) - y;
          if (X >= 0 && X < SCR_W && Y >= 0 && Y < VIEW_H) fb[Y * SCR_W + X] = col;
        }
      } });
    }
    items.sort((a, b) => b.depth - a.depth).forEach((it) => it.draw());

    const frameLetter = String.fromCharCode(65 + st.frame);
    drawStatusBar(fb, {
      code: c.code + frameLetter + (st.dir + 1), name: c.name, action: actionLabel(c, st.action) + (st.rising ? ' (RISING)' : ''),
      frame: st.frame, frames: A.frames, yaw: yawOf(), sub: `ROT ${st.dir + 1}/8`,
    });
    present(fb, vctx, img, out32, st.flash);

    if (sheetDirty()) drawSheet();
    $('#frame-size').textContent = `${spr.w} × ${spr.h} px`;
  }

  // --- Frame strip ----------------------------------------------------------------------
  const sheet = $('#sheet');
  const sctx = sheet.getContext('2d');
  let sheetSig = '';
  let sheetCells = [];
  const sheetDirty = () => sheetSig !== `${st.cid}|${st.action}|${st.dir}|${st.frame}|${cacheVersion}`;
  function drawSheet() {
    sheetSig = `${st.cid}|${st.action}|${st.dir}|${st.frame}|${cacheVersion}`;
    const c = creature(), A = act();
    const frames = [];
    for (let f = 0; f < A.frames; f++) frames.push(sprites.get(skey(c.id, st.action, f, st.dir)) || null);
    const ready = frames.filter(Boolean);
    const cellW = Math.max(36, ...ready.map((s) => Math.max(s.ax, s.w - s.ax) * 2 + 6));
    const up = Math.max(30, ...ready.map((s) => s.ay)), down = Math.max(2, ...ready.map((s) => s.h - s.ay));
    const H = up + down + 16, W = cellW * A.frames;
    if (sheet.width !== W || sheet.height !== H) { sheet.width = W; sheet.height = H; }
    const buf = new Uint8Array(W * H);
    const bg = R.STONE + 1, cell = R.STONE + 2, hi = R.STONE + 4;
    buf.fill(bg);
    sheetCells = [];
    frames.forEach((s, f) => {
      const x0 = f * cellW;
      sheetCells.push([x0, x0 + cellW]);
      const sel = f === st.frame;
      for (let y = 1; y < H - 1; y++) for (let x = x0 + 1; x < x0 + cellW - 1; x++) {
        const edge = y === 1 || y === H - 2 || x === x0 + 1 || x === x0 + cellW - 2;
        buf[y * W + x] = sel && edge ? R.GOLD + 11 : sel ? hi : (((x >> 2) + (y >> 2)) & 1 ? cell : cell + 1);
      }
      for (let x = x0 + 3; x < x0 + cellW - 3; x++) buf[(up + 2) * W + x] = sel ? R.GOLD + 6 : R.STONE + 5;
      const letter = String.fromCharCode(65 + f);
      drawText(buf, W, x0 + cellW / 2 - 2, H - 11, letter, sel ? R.GOLD + 14 : R.STONE + 9, null);
      if (!s) {
        drawText(buf, W, x0 + cellW / 2 - 8, up / 2, '...', R.STONE + 6, null);
        return;
      }
      const ox = Math.round(x0 + cellW / 2 - s.ax), oy = Math.round(up + 2 - s.ay);
      for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
        const v = s.data[j * s.w + i];
        if (v === 0xFFFF) continue;
        const X = ox + i, Y = oy + j;
        if (X >= 0 && Y >= 0 && X < W && Y < H) buf[Y * W + X] = v & 0xFF;
      }
    });
    const im = sctx.createImageData(W, H);
    const o = new Uint32Array(im.data.buffer);
    for (let i = 0; i < buf.length; i++) o[i] = PAL32[buf[i]];
    sctx.putImageData(im, 0, 0);
    const zoom = H <= 160 ? 2 : 1;
    sheet.style.width = W * zoom + 'px';
    sheet.style.height = H * zoom + 'px';
    $('#sheet-info').textContent = `${actionLabel(c, st.action)} · ${A.frames} frames · ${A.fps} fps · facing ${DIR_NAMES[st.dir]}`;
  }
  sheet.addEventListener('click', (e) => {
    const r = sheet.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * sheet.width;
    const f = sheetCells.findIndex(([a, b]) => x >= a && x < b);
    if (f >= 0) { st.playing = false; st.rising = null; st.hold = 0; st.frame = f; st.clock = 0; updateButtons(); }
  });

  // --- UI -------------------------------------------------------------------------------
  const actionLabel = (c, a) => (c.labels && c.labels[a]) || ACTION_LABELS[a];

  function thumb(c) {
    const s = getSprite(c.id, 'idle', 0, 1);
    const cv = document.createElement('canvas');
    cv.width = s.w; cv.height = s.h;
    const x = cv.getContext('2d'), im = x.createImageData(s.w, s.h);
    const o = new Uint32Array(im.data.buffer);
    for (let i = 0; i < s.data.length; i++) o[i] = s.data[i] === 0xFFFF ? 0 : PAL32[s.data[i] & 0xFF];
    x.putImageData(im, 0, 0);
    cv.className = 'thumb';
    cv.style.height = Math.round(s.h / (s.res || 1) * 1.1) + 'px';
    return cv;
  }

  function buildRoster() {
    const ul = $('#roster');
    ul.innerHTML = '';
    CREATURES.forEach((c, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'creature';
      b.id = 'cr-' + c.id;
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span class="thumb-well"></span><span class="cr-text"><span class="cr-name">${c.name}</span><span class="cr-code">${c.code} · ${i + 1}</span></span>`;
      b.addEventListener('click', () => selectCreature(c.id));
      li.appendChild(b);
      ul.appendChild(li);
    });
    // Thumbnails render progressively so the page appears at once.
    let i = 0;
    const next = () => {
      if (i >= CREATURES.length) return;
      const c = CREATURES[i++];
      document.querySelector(`#cr-${c.id} .thumb-well`).appendChild(thumb(c));
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  }

  function selectCreature(id) {
    if (id === st.cid) return;
    st.cid = id;
    st.rising = null;
    st.action = 'idle'; st.loopAction = 'idle';
    st.frame = 0; st.clock = 0; st.hold = 0;
    st.projectiles = []; st.particles = [];
    buildActions();
    updateCodex();
    restartPrefetch();
    updateButtons();
    savePrefs();
  }

  function buildActions() {
    const c = creature(), box = $('#actions');
    box.innerHTML = '';
    ACTIONS.forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn act';
      b.dataset.action = a;
      b.innerHTML = `<span>${actionLabel(c, a)}</span><kbd>${i + 1}</kbd>`;
      b.addEventListener('click', () => setAction(a));
      box.appendChild(b);
    });
  }

  function updateCodex() {
    const c = creature();
    $('#c-name').textContent = c.name;
    $('#c-lore').textContent = c.lore;
    $('#c-hp').textContent = c.stats.hp;
    $('#c-dmg').textContent = c.stats.dmg;
    $('#c-speed').textContent = c.stats.speed;
    $('#c-code').textContent = c.code;
    const total = ACTIONS.reduce((n, a) => n + c.actions[a].frames, 0);
    $('#c-frames').textContent = `${total} × 8 = ${total * 8}`;
  }

  function updateButtons() {
    CREATURES.forEach((c) => {
      const b = document.getElementById('cr-' + c.id);
      if (b) b.setAttribute('aria-pressed', String(c.id === st.cid));
    });
    document.querySelectorAll('#actions .act').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.action === (st.rising || st.action))));
    document.querySelectorAll('#compass .dir').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.dir === st.dir)));
    $('#spin').setAttribute('aria-pressed', String(st.spin));
    $('#play').textContent = st.playing ? 'Pause' : 'Play';
    $('#play').setAttribute('aria-pressed', String(!st.playing));
    view.parentElement.classList.toggle('aspect', st.aspect);
  }

  function buildCompass() {
    const box = $('#compass');
    // 3x3 grid, cell -> direction index (top-down view, bottom = toward the viewer).
    const layout = [5, 4, 3, 6, -1, 2, 7, 0, 1];
    layout.forEach((d) => {
      const b = document.createElement('button');
      b.type = 'button';
      if (d < 0) {
        b.id = 'spin'; b.className = 'btn dir spin'; b.textContent = '⟳';
        b.title = 'Turn continuously'; b.setAttribute('aria-label', 'Turn continuously');
        b.addEventListener('click', () => { st.spin = !st.spin; updateButtons(); });
      } else {
        b.className = 'btn dir'; b.dataset.dir = d; b.textContent = DIR_ARROWS[d];
        b.setAttribute('aria-label', 'Face ' + DIR_NAMES[d]);
        b.title = `Rotation ${d + 1}: facing ${DIR_NAMES[d]}`;
        b.addEventListener('click', () => { st.dir = d; st.spin = false; restartPrefetch(); updateButtons(); });
      }
      box.appendChild(b);
    });
  }

  function step(n) {
    st.playing = false; st.hold = 0; st.rising = null;
    const A = act();
    st.frame = (st.frame + n + A.frames) % A.frames;
    st.clock = 0;
    updateButtons();
  }

  function bindControls() {
    $('#play').addEventListener('click', () => { st.playing = !st.playing; updateButtons(); });
    $('#prev').addEventListener('click', () => step(-1));
    $('#next').addEventListener('click', () => step(1));
    $('#speed').addEventListener('change', (e) => { st.speed = +e.target.value; });
    const env = $('#env');
    Object.keys(ENVS).forEach((k) => env.add(new Option(ENVS[k].name, k)));
    env.value = st.env;
    env.addEventListener('change', (e) => {
      st.env = e.target.value; st.light = null;
      $('#light').value = ENVS[st.env].light; $('#light-val').textContent = ENVS[st.env].light;
      savePrefs();
    });
    $('#light').value = ENVS[st.env].light;
    $('#light-val').textContent = ENVS[st.env].light;
    $('#light').addEventListener('input', (e) => { st.light = +e.target.value; $('#light-val').textContent = e.target.value; });
    const fl = $('#flicker');
    Object.keys(FLICKERS).forEach((k) => fl.add(new Option(FLICKERS[k], k)));
    fl.value = st.flicker;
    fl.addEventListener('change', (e) => { st.flicker = e.target.value; savePrefs(); });
    const zm = $('#zoom');
    zm.value = st.zoom;
    zm.addEventListener('change', (e) => { st.zoom = e.target.value; savePrefs(); });
    const toggles = { '#opt-aspect': 'aspect', '#opt-scroll': 'scroll', '#opt-fuzz': 'fuzz', '#opt-repeat': 'repeat' };
    for (const [sel, k] of Object.entries(toggles)) {
      const el = $(sel);
      el.checked = st[k];
      el.addEventListener('change', () => { st[k] = el.checked; updateButtons(); savePrefs(); });
    }

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Text fields, dropdowns and sliders keep their own keys; checkboxes and buttons don't need digits or arrows.
      if (e.target.closest('select, textarea, input:not([type="checkbox"])')) return;
      const k = e.key;
      if (k >= '1' && k <= '5') { setAction(ACTIONS[+k - 1]); e.preventDefault(); }
      else if (k === 'ArrowLeft') { st.dir = (st.dir + 1) & 7; st.spin = false; restartPrefetch(); updateButtons(); e.preventDefault(); }
      else if (k === 'ArrowRight') { st.dir = (st.dir + 7) & 7; st.spin = false; restartPrefetch(); updateButtons(); e.preventDefault(); }
      else if (k === 'ArrowUp' || k === 'ArrowDown') {
        const i = CREATURES.findIndex((c) => c.id === st.cid);
        const n = (i + (k === 'ArrowDown' ? 1 : CREATURES.length - 1)) % CREATURES.length;
        selectCreature(CREATURES[n].id);
        document.getElementById('cr-' + CREATURES[n].id).focus();
        e.preventDefault();
      } else if (k === ' ' && !e.target.closest('button, input')) { st.playing = !st.playing; updateButtons(); e.preventDefault(); }
      else if (k === ',') step(-1);
      else if (k === '.') step(1);
    });
  }

  // Stone texture for the page chrome, generated from the same palette as the sprites.
  function stoneBackground() {
    const S = 96, cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const x = cv.getContext('2d'), im = x.createImageData(S, S);
    const o = new Uint32Array(im.data.buffer);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const l = 2.4 + (pfbm(i, j, S, 6, 33, 4) - 0.5) * 3.2 + (hash3(i, j, 4) - 0.5) * 0.9;
      o[j * S + i] = PAL32[R.STONE + clamp(Math.round(l), 0, 15)];
    }
    x.putImageData(im, 0, 0);
    document.documentElement.style.setProperty('--stone-tex', `url(${cv.toDataURL()})`);
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(tick);
  }

  stoneBackground();
  buildRoster();
  buildActions();
  buildCompass();
  bindControls();
  updateCodex();
  updateButtons();
  restartPrefetch();
  requestAnimationFrame(tick);
})();
