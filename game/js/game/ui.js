'use strict';
// HTML panels over the game view: title, character creation, dialogue, barter, inventory,
// journal, map, loot, reading, sleeping, pause and death.

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// *stage directions* in dialogue become italics.
const prose = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

function spriteCanvas(spr, cls) {
  const c = document.createElement('canvas');
  c.width = spr.w; c.height = spr.h;
  const x = c.getContext('2d'), im = x.createImageData(spr.w, spr.h), o = new Uint32Array(im.data.buffer);
  for (let i = 0; i < spr.data.length; i++) o[i] = spr.data[i] === 0xFFFF ? 0 : PAL32[spr.data[i] & 0xFF];
  x.putImageData(im, 0, 0);
  if (cls) c.className = cls;
  return c;
}
const iconEl = (id) => spriteCanvas(itemIcon(id), 'icon');

const UI = {
  panel: null, ctx: null, onClose: null,
  init(ctx) {
    this.ctx = ctx;
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
  },
  isOpen() { return !!this.panel; },
  show(id, opts = {}) {
    if (this.panel && this.panel !== id) $('#' + this.panel).hidden = true;
    this.panel = id;
    $('#' + id).hidden = false;
    this.onClose = opts.onClose || null;
    this.ctx.uiOpened(id);
    const f = $('#' + id + ' [autofocus], #' + id + ' button:not([hidden])');
    if (f && !opts.noFocus) setTimeout(() => f.focus(), 0);
  },
  close() {
    if (!this.panel) return;
    const id = this.panel;
    $('#' + id).hidden = true;
    this.panel = null;
    const cb = this.onClose; this.onClose = null;
    if (cb) cb();
    this.ctx.uiClosed(id);
  },

  // ---- Title and character creation ----
  title() {
    $('#btn-continue').hidden = !hasSave();
    this.show('title');
  },
  create() {
    const list = $('#bg-list');
    list.innerHTML = '';
    let chosen = 'farmhand';
    for (const [id, B] of Object.entries(BACKGROUNDS)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'card'; b.setAttribute('aria-pressed', String(id === chosen));
      b.innerHTML = `<strong>${esc(B.name)}</strong><span>${esc(B.desc)}</span>`;
      b.addEventListener('click', () => { chosen = id; list.querySelectorAll('.card').forEach((c) => c.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); });
      list.appendChild(b);
    }
    $('#create-form').onsubmit = (e) => {
      e.preventDefault();
      const name = $('#char-name').value.trim() || 'Ash';
      this.close();
      this.ctx.newGame(name, chosen);
    };
    this.show('create');
  },
  intro(name, onDone) {
    $('#intro-text').innerHTML = `<p>Brindlemere sits where the river bends below the mountains: a mill, a chapel, an inn called the Sleeping Goose, and fields running up to the Whisper Wood.</p>
      <p>You have lived here all your life, ${esc(name)}. You have hauled hay and mended fences and listened to Captain Bram's stories at the inn until you could tell them yourself.</p>
      <p>This morning you woke before dawn with the feeling you have had for a month now. It is time to find out whether any of the stories are true.</p>`;
    this.show('intro', { onClose: onDone });
  },

  // ---- Dialogue ----
  dialogue(ent) {
    const id = ent.id, C = CAST[id];
    this.talkId = id;
    const port = $('#dlg-portrait');
    port.innerHTML = '';
    port.appendChild(spriteCanvas(renderPortrait(ACTOR_DEFS()[id], 6), 'portrait'));
    $('#dlg-name').textContent = C.name;
    $('#dlg-title').textContent = C.title;
    this.dlgShow({ text: dlgGreeting(id) });
    this.show('dialogue', { onClose: () => { this.talkId = null; } });
  },
  dlgShow(node) {
    const id = this.talkId;
    $('#dlg-text').innerHTML = prose(node.text || '');
    const box = $('#dlg-topics');
    box.innerHTML = '';
    const add = (label, fn, cls) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'topic ' + (cls || ''); b.textContent = label;
      b.addEventListener('click', () => { sfx('click'); fn(); });
      box.appendChild(b);
      return b;
    };
    if (node.choices) {
      for (const c of node.choices) add(c.label, () => this.dlgShow(c.go()), 'choice');
    } else {
      for (const t of dlgTopics(id)) {
        const isQuest = t.id.startsWith('q_') || ['path', 'cat', 'wolves', 'wood'].includes(t.id);
        add(t.label, () => {
          const n = dlgSay(id, t.id);
          if (n.action === 'barter') { this.barter(id); return; }
          this.dlgShow(n);
          if (n.action === 'room') { addGold(-10); this.sleep('rent'); }
        }, isQuest ? 'quest' : '');
      }
      add('Goodbye', () => this.close(), 'bye');
    }
    const first = box.querySelector('button');
    if (first) first.focus();
  },

  // ---- Barter ----
  barter(npcId) {
    this.shopId = npcId;
    this.sel = null;
    $('#barter-name').textContent = CAST[npcId].name;
    this.barterRender();
    this.show('barter', { onClose: () => { if (this.talkId) this.dialogue(this.ctx.ents.find((e) => e.id === this.talkId)); } });
  },
  barterRender() {
    const id = this.shopId, sh = shopOf(id), buys = SHOPS[id].buys;
    $('#barter-gold').textContent = `${sh.gold} gold`;
    $('#barter-you').textContent = `${G.p.gold} gold`;
    const mk = (list, el, mode) => {
      el.innerHTML = '';
      if (!list.length) { el.innerHTML = `<li class="empty">${mode === 'buy' ? 'Sold out.' : 'Nothing they want.'}</li>`; return; }
      for (const [it, n] of list) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'row';
        const price = mode === 'buy' ? priceBuy(id, it) : priceSell(id, it);
        b.appendChild(iconEl(it));
        b.insertAdjacentHTML('beforeend', `<span class="nm">${esc(ITEMS[it].name)}${isEquipped(it) ? ' <i>(worn)</i>' : ''}</span><span class="qt">${n > 1 ? 'x' + n : ''}</span><span class="pr">${price}g</span>`);
        b.setAttribute('aria-pressed', String(this.sel && this.sel.id === it && this.sel.mode === mode));
        b.addEventListener('click', () => { this.sel = { id: it, mode }; this.barterRender(); });
        b.addEventListener('dblclick', () => { this.sel = { id: it, mode }; this.barterDo(); });
        li.appendChild(b); el.appendChild(li);
      }
    };
    const stock = Object.entries(sh.stock).filter(([, n]) => n > 0);
    const mine = Object.entries(G.inv).filter(([it, n]) => n > 0 && buys.includes(ITEMS[it].type) && ITEMS[it].value > 0);
    mk(stock, $('#barter-stock'), 'buy');
    mk(mine, $('#barter-mine'), 'sell');
    const d = $('#barter-detail'), act = $('#barter-act');
    if (this.sel) {
      const it = ITEMS[this.sel.id];
      const price = this.sel.mode === 'buy' ? priceBuy(id, this.sel.id) : priceSell(id, this.sel.id);
      d.innerHTML = `<strong>${esc(it.name)}</strong> ${itemStats(this.sel.id)}<br>${esc(it.desc || '')}`;
      act.hidden = false;
      act.textContent = this.sel.mode === 'buy' ? `Buy for ${price} gold` : `Sell for ${price} gold`;
    } else { d.textContent = 'Choose something to buy or sell. Double-click to trade at once.'; act.hidden = true; }
  },
  barterDo() {
    const id = this.shopId, sh = shopOf(id), s = this.sel;
    if (!s) return;
    if (s.mode === 'buy') {
      const p = priceBuy(id, s.id);
      if (!sh.stock[s.id]) return;
      if (G.p.gold < p) { notify("You can't afford that.", 'combat'); sfx('deny'); return; }
      G.p.gold -= p; sh.gold += p; sh.stock[s.id]--;
      addItem(s.id, 1, true); notify(`Bought ${ITEMS[s.id].name} for ${p} gold`, 'gold');
      if (!sh.stock[s.id]) this.sel = null;
    } else {
      const p = priceSell(id, s.id);
      if (sh.gold < p) { notify(`${CAST[id].name} can't afford it.`, 'combat'); sfx('deny'); return; }
      sh.gold -= p; G.p.gold += p; sh.stock[s.id] = (sh.stock[s.id] || 0) + 1;
      removeItem(s.id, 1, true); notify(`Sold ${ITEMS[s.id].name} for ${p} gold`, 'gold');
      if (!count(s.id)) this.sel = null;
    }
    sfx('coins');
    qCheckAll();
    this.barterRender();
  },

  // ---- Inventory ----
  inventory() {
    this.invTab = this.invTab || 'all';
    this.invSel = null;
    this.invRender();
    this.show('inventory');
  },
  invRender() {
    const tabs = $('#inv-tabs');
    tabs.innerHTML = '';
    for (const t of ['all', ...ITEM_ORDER]) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tab'; b.textContent = t === 'all' ? 'All' : ITEM_TYPE_LABEL[t];
      b.setAttribute('aria-pressed', String(this.invTab === t));
      b.addEventListener('click', () => { this.invTab = t; this.invRender(); });
      tabs.appendChild(b);
    }
    const list = $('#inv-list');
    list.innerHTML = '';
    const items = Object.entries(G.inv).filter(([it]) => this.invTab === 'all' || ITEMS[it].type === this.invTab)
      .sort((a, b) => ITEM_ORDER.indexOf(ITEMS[a[0]].type) - ITEM_ORDER.indexOf(ITEMS[b[0]].type) || ITEMS[a[0]].name.localeCompare(ITEMS[b[0]].name));
    if (!items.length) list.innerHTML = '<li class="empty">Nothing here.</li>';
    for (const [it, n] of items) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'row';
      b.appendChild(iconEl(it));
      b.insertAdjacentHTML('beforeend', `<span class="nm">${esc(ITEMS[it].name)}${isEquipped(it) ? ' <i>(equipped)</i>' : ''}</span><span class="qt">${n > 1 ? 'x' + n : ''}</span><span class="pr">${ITEMS[it].value ? ITEMS[it].value + 'g' : ''}</span>`);
      b.setAttribute('aria-pressed', String(this.invSel === it));
      b.addEventListener('click', () => { this.invSel = it; this.invRender(); });
      b.addEventListener('dblclick', () => { this.invSel = it; this.invPrimary(); });
      li.appendChild(b); list.appendChild(li);
    }
    // Detail
    const d = $('#inv-detail'), acts = $('#inv-acts');
    acts.innerHTML = '';
    if (this.invSel && G.inv[this.invSel]) {
      const it = ITEMS[this.invSel];
      d.innerHTML = '';
      d.appendChild(spriteCanvas(itemIcon(this.invSel), 'icon big'));
      d.insertAdjacentHTML('beforeend', `<div><strong>${esc(it.name)}</strong><br>${itemStats(this.invSel)}<p>${esc(it.desc || '')}</p></div>`);
      const btn = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = label; b.addEventListener('click', fn); acts.appendChild(b); };
      if (it.type === 'weapon' || it.type === 'armor') btn(isEquipped(this.invSel) ? 'Unequip' : 'Equip', () => this.invPrimary());
      if (it.type === 'food' || it.type === 'potion') btn(it.type === 'potion' ? 'Drink' : 'Eat', () => this.invPrimary());
      if (it.type !== 'quest') btn('Drop', () => { removeItem(this.invSel, 1); qCheckAll(); this.invRender(); });
    } else { d.textContent = 'Select an item.'; }
    // Character sheet
    const W = weaponItem();
    $('#char-sheet').innerHTML = `<h3>${esc(G.name)}</h3><p class="sub">${esc(bgOf().name)} · Level ${G.p.level}</p>
      <dl>
        <div><dt>Health</dt><dd>${Math.ceil(G.p.hp)} / ${maxHp()}</dd></div>
        <div><dt>Stamina</dt><dd>${Math.ceil(G.p.st)} / ${maxSt()}</dd></div>
        <div><dt>Weapon</dt><dd>${esc(W.name)}</dd></div>
        <div><dt>Damage</dt><dd>${W.dmg[0] + damageBonus()}–${W.dmg[1] + damageBonus()}</dd></div>
        <div><dt>Armour</dt><dd>${armorRating()}</dd></div>
        <div><dt>Gold</dt><dd>${G.p.gold}</dd></div>
        <div><dt>Experience</dt><dd>${G.p.xp} / ${xpForNext()}</dd></div>
        <div><dt>Kills</dt><dd>${G.stats.kills}</dd></div>
      </dl>`;
  },
  invPrimary() {
    const id = this.invSel, it = ITEMS[id];
    if (!it) return;
    if (it.type === 'weapon' || it.type === 'armor') { equip(id); sfx('click'); }
    else if (useItem(id)) sfx('eat');
    if (!G.inv[id]) this.invSel = null;
    this.invRender();
  },

  // ---- Journal ----
  journal() {
    const ids = QUEST_ORDER.filter((id) => G.quests[id]).sort((a, b) => (qDone(a) ? 1 : 0) - (qDone(b) ? 1 : 0));
    this.jSel = this.jSel && ids.includes(this.jSel) ? this.jSel : ids[0];
    const list = $('#j-list');
    list.innerHTML = '';
    if (!ids.length) list.innerHTML = '<li class="empty">No quests yet.</li>';
    for (const id of ids) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'row' + (qDone(id) ? ' done' : '');
      b.innerHTML = `<span class="nm">${esc(QUESTS[id].name)}</span><span class="qt">${qDone(id) ? 'Done' : ''}</span>`;
      b.setAttribute('aria-pressed', String(id === this.jSel));
      b.addEventListener('click', () => { this.jSel = id; this.journal(); });
      li.appendChild(b); list.appendChild(li);
    }
    const body = $('#j-body');
    if (this.jSel) {
      const q = G.quests[this.jSel], Q = QUESTS[this.jSel];
      const obj = !qDone(this.jSel) && Q.objective(q);
      body.innerHTML = `<h3>${esc(Q.name)}</h3>${obj ? `<p class="objective">${esc(obj)}</p>` : ''}` +
        q.log.slice().reverse().map((s, i) => `<p class="${i ? 'old' : ''}">${esc(Q.stages[s])}</p>`).join('');
    } else body.innerHTML = '<p>Talk to people around Brindlemere. Someone always needs something.</p>';
    if (this.panel !== 'journal') this.show('journal');
  },

  // ---- Map ----
  map() {
    const ctx = this.ctx, m = ctx.map;
    const cv = $('#map-canvas');
    const scale = m.outdoor ? 12 : 40;
    cv.width = m.w * scale; cv.height = m.h * scale;
    const g = cv.getContext('2d');
    const col = (r, l) => { const i = R[r] + l; return `rgb(${PAL[i * 3]},${PAL[i * 3 + 1]},${PAL[i * 3 + 2]})`; };
    const floorCol = { grass: col('GREEN', 5), meadow: col('GREEN', 6), dirt: col('BROWN', 7), cobble: col('STONE', 7), farmland: col('BROWN', 5), garden: col('OLIVE', 5), sand: col('STONE', 10), water: col('BLUE', 5), boards: col('BROWN', 8), flagstone: col('STONE', 6), straw: col('GOLD', 8) };
    for (let z = 0; z < m.h; z++) for (let x = 0; x < m.w; x++) {
      const w = m.wall[m.idx(x, z)];
      let c = floorCol[FLOORS[m.floor[m.idx(x, z)]].id];
      if (w) {
        const st = STYLES[w];
        c = st.id === 'cliff' ? col('GRAY', 3) : st.door ? col('GOLD', 9) : st.h < 50 ? col('STONE', 9) : st.id.startsWith('int') || st.id.startsWith('shelves') || st.id === 'fireplace' || st.id === 'booksTall' ? col('BROWN', 3) : col('RED', 4);
      }
      g.fillStyle = c; g.fillRect(x * scale, z * scale, scale, scale);
    }
    if (m.outdoor) {
      g.fillStyle = col('GREEN', 2);
      for (const p of m.props) if (p.type === 'pine' || p.type === 'oak' || p.type === 'birch') { g.beginPath(); g.arc(p.x / TILE * scale, p.z / TILE * scale, scale * 0.45, 0, TAU); g.fill(); }
    }
    // Labels for doors with names
    g.font = `${Math.max(10, scale * 1.6)}px VT323, monospace`; g.textAlign = 'center';
    for (const d of m.doors.values()) {
      if (!d.label || d.locked) continue;
      g.fillStyle = 'rgba(10,8,6,0.75)';
      const tw = g.measureText(d.label).width;
      g.fillRect((d.x + 0.5) * scale - tw / 2 - 3, (d.z + 0.5) * scale + scale * 0.9, tw + 6, scale * 1.9);
      g.fillStyle = col('GOLD', 13); g.fillText(d.label, (d.x + 0.5) * scale, (d.z + 0.5) * scale + scale * 2.3);
    }
    // Quest markers and the player
    for (const mk of questMarkers(m.id, m, ctx.ents)) {
      const x = mk.x / TILE * scale, z = mk.z / TILE * scale;
      g.fillStyle = col('GOLD', 15); g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, z + scale * 0.8); g.lineTo(x - scale * 0.8, z - scale * 0.6); g.lineTo(x + scale * 0.8, z - scale * 0.6); g.closePath(); g.stroke(); g.fill();
    }
    const px = Player.x / TILE * scale, pz = Player.z / TILE * scale, a = Player.ang;
    g.fillStyle = col('RED', 12); g.strokeStyle = '#000';
    g.beginPath(); g.moveTo(px + Math.cos(a) * scale * 1.3, pz + Math.sin(a) * scale * 1.3);
    g.lineTo(px + Math.cos(a + 2.5) * scale * 0.9, pz + Math.sin(a + 2.5) * scale * 0.9);
    g.lineTo(px + Math.cos(a - 2.5) * scale * 0.9, pz + Math.sin(a - 2.5) * scale * 0.9); g.closePath(); g.stroke(); g.fill();
    $('#map-title').textContent = m.name;
    this.show('mapview');
  },

  // ---- Loot ----
  loot(title, items, onTake) {
    this.lootItems = items; this.lootTake = onTake;
    $('#loot-title').textContent = title;
    this.lootRender();
    this.show('loot');
  },
  lootRender() {
    const list = $('#loot-list');
    list.innerHTML = '';
    const entries = Object.entries(this.lootItems).filter(([, n]) => n > 0);
    if (!entries.length) list.innerHTML = '<li class="empty">Empty.</li>';
    for (const [it, n] of entries) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'row';
      b.appendChild(iconEl(it));
      b.insertAdjacentHTML('beforeend', `<span class="nm">${esc(ITEMS[it].name)}</span><span class="qt">${n > 1 ? 'x' + n : ''}</span><span class="pr">Take</span>`);
      b.addEventListener('click', () => { this.lootTake(it, n); this.lootRender(); });
      li.appendChild(b); list.appendChild(li);
    }
    $('#loot-all').disabled = !entries.length;
  },
  lootAll() { for (const [it, n] of Object.entries(this.lootItems)) if (n > 0) this.lootTake(it, n); this.close(); },

  // ---- Reading ----
  read(title, html) {
    $('#reader-title').textContent = title;
    $('#reader-text').innerHTML = html;
    this.show('reader');
  },

  // ---- Sleep / wait ----
  sleep(mode) {
    this.sleepMode = mode;
    $('#sleep-title').textContent = mode === 'wait' ? 'Wait' : 'Sleep';
    $('#sleep-note').textContent = mode === 'wait' ? 'Pass the time. You heal slowly while you wait.' : 'A night in a proper bed restores your health and stamina.';
    const r = $('#sleep-hours');
    r.value = mode === 'wait' ? 1 : 8;
    const upd = () => { $('#sleep-val').textContent = `${r.value} hour${r.value > 1 ? 's' : ''} (until ${clockText(G.time + r.value * 60).split(', ')[1]})`; };
    r.oninput = upd; upd();
    this.show('sleep');
  },
  sleepDo() {
    const h = +$('#sleep-hours').value;
    const mode = this.sleepMode;
    this.close();
    this.ctx.passTime(h, mode !== 'wait');
  },

  // ---- Pause / death ----
  pause() { $('#btn-load').disabled = !hasSave(); $('#save-msg').textContent = ''; this.show('pause'); },
  dead() { $('#btn-dead-load').hidden = !hasSave(); this.show('dead'); },
};

function itemStats(id) {
  const it = ITEMS[id];
  if (it.type === 'weapon') return `<span class="stats">Damage ${it.dmg[0]}–${it.dmg[1]} · Reach ${Math.round(it.reach / 10)} · ${it.swing < 0.4 ? 'Fast' : it.swing < 0.55 ? 'Average' : 'Slow'}</span>`;
  if (it.type === 'armor') return `<span class="stats">Armour ${it.armor} · ${it.slot === 'head' ? 'Head' : 'Body'}</span>`;
  if (it.heal || it.stamina) return `<span class="stats">${it.heal ? `+${it.heal} health` : ''}${it.heal && it.stamina ? ' · ' : ''}${it.stamina ? `+${it.stamina} stamina` : ''}</span>`;
  if (it.type === 'quest') return '<span class="stats">Quest item</span>';
  return `<span class="stats">Worth ${it.value} gold</span>`;
}

const READINGS = {
  notice: { title: 'Notice board', html: `<p><strong>WOLVES!</strong> Three sheep taken this month. Anyone handy with a blade, see Captain Bram at the Sleeping Goose. — Odo</p>
    <p><strong>LOST:</strong> Ginger cat, answers to MITTENS (does not answer). Reward. — Agnes, by the smithy</p>
    <p>Fresh bread daily at Hilda's. Honey buns Fredas only. Pies until they're gone.</p>
    <p>Chapel of the Eight: service at dawn on Sundas. Brother Alden asks that whoever has his book return it.</p>` },
  northroad: { title: 'Signpost', html: '<p><strong>NORTH ROAD.</strong> Closed by rockslide until further notice. Travellers to Dragonstar must go round by the south. — By order of the Reeve</p>' },
  southroad: { title: 'Signpost', html: '<p><strong>SOUTH ROAD</strong> to Fenwick, 3 days. The bridge at Fenwick is out. Ford at your own risk.</p>' },
  woodroad: { title: 'Signpost', html: '<p><strong>WHISPER WOOD.</strong> Wolves have been seen on this path. Do not travel alone or after dark. — Rolf, Town Guard</p>' },
};
