'use strict';
// Music and synthesised sound effects. Recorded tracks (game/music/) play when present; the
// generative dungeon-synth composers below are the fallback (Web Audio, no samples).
// Music is built from drones, choir pads, a recorder-like lead, plucked lute and harpsichord,
// bells and timpani, all through a long synthetic reverb. Each mood is a small composer.

const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const Sound = {
  ctx: null, master: null, music: null, sfxBus: null, verb: null, verbSend: null,
  musicVol: 0.55, sfxVol: 0.8, muted: false,
  track: null, trackName: null, timer: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -16; this.master.ratio.value = 3;
    const out = ctx.createGain(); out.gain.value = 0.9;
    this.master.connect(out); out.connect(ctx.destination);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol;
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfxVol;
    this.music.connect(this.master); this.sfxBus.connect(this.master);
    // Long dark reverb from a decaying noise impulse
    this.verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 4.5), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < 400 ? i / 400 : 1); }
    this.verb.buffer = ir;
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.55;
    const verbLP = ctx.createBiquadFilter(); verbLP.type = 'lowpass'; verbLP.frequency.value = 3200;
    this.verb.connect(verbLP); verbLP.connect(verbOut); verbOut.connect(this.master);
    this.timer = setInterval(() => this.tick(), 60);
  },
  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (this.music) { this.music.gain.setTargetAtTime(this.muted ? 0 : music, this.ctx.currentTime, 0.2); this.sfxBus.gain.setTargetAtTime(this.muted ? 0 : sfx, this.ctx.currentTime, 0.1); }
  },
  setMuted(m) { this.muted = m; this.setVolumes(this.musicVol, this.sfxVol); },
  files: {}, lastTick: 0,
  play(name) {
    if (!this.ctx || name === this.trackName) return;
    const now = this.ctx.currentTime;
    if (this.track) this.track.stop(now);
    this.trackName = name;
    this.track = null;
    if (!name) return;
    // A recording when there is one that loads, otherwise the generated composer.
    if (MUSIC_FILES.includes(name)) {
      const ft = this.files[name] || (this.files[name] = new FileTrack(this, name));
      if (!ft.failed) { ft.start(); this.track = ft; return; }
    }
    this.track = new Track(this, MUSIC[name]);
    this.track.start(now + 0.1);
  },
  tick() {
    if (!this.ctx) return;
    const t = performance.now(), dt = Math.min(0.25, (t - (this.lastTick || t)) / 1000);
    this.lastTick = t;
    for (const ft of Object.values(this.files)) ft.tick(dt);
    if (this.track instanceof FileTrack && this.track.failed) { const n = this.trackName; this.trackName = null; this.play(n); return; }
    if (this.track instanceof Track) this.track.schedule(this.ctx.currentTime + 0.4);
  },
};

// ---- Recorded music ------------------------------------------------------------------------
// Tracks made with tools/elevenlabs.js (game/music/<name>.mp3) play through plain audio
// elements, which work from file:// and on the published page alike. Each loops by
// crossfading its last seconds into its start; if a file won't load, the generated composer
// for that mood plays instead.
const MUSIC_FILES = ['title', 'town', 'night', 'wild', 'interior', 'cellar', 'chapel', 'combat'];
const MUSIC_FILE_GAIN = 0.55; // the recordings are mastered loud; this sits them under the effects
class FileTrack {
  constructor(engine, name) {
    this.e = engine; this.name = name;
    this.els = [0, 1].map(() => { const a = new Audio(); a.preload = 'auto'; return a; });
    this.cur = 0; this.level = 0; this.target = 0; this.failed = false; this.loaded = false;
    this.xfade = 10; // seconds of overlap at the loop point (the recordings fade out at the end)
    this.load().then((ok) => { this.loaded = ok; this.failed = !ok; if (ok && this.target > 0) this.start(); });
  }
  // The whole file when it's there (the game folder); otherwise the pieces the published page
  // carries it in (uploads there have a size limit), joined back together.
  async load() {
    if (await this.use(`music/${this.name}.mp3`)) return true;
    const parts = [];
    for (let i = 0; i < 8; i++) {
      try { const r = await fetch(`music/${this.name}-${i}.mp3`); if (!r.ok) break; parts.push(await r.arrayBuffer()); } catch (e) { break; }
    }
    return parts.length > 0 && this.use(URL.createObjectURL(new Blob(parts, { type: 'audio/mpeg' })));
  }
  use(url) {
    return new Promise((resolve) => {
      const a = this.els[0];
      const done = (ok) => { a.removeEventListener('canplay', yes); a.removeEventListener('error', no); if (ok) this.els[1].src = url; resolve(ok); };
      const yes = () => done(true), no = () => done(false);
      a.addEventListener('canplay', yes); a.addEventListener('error', no);
      a.src = url; a.load();
    });
  }
  start() {
    this.target = 1;
    if (!this.loaded) return; // plays once loading finishes
    const a = this.els[this.cur];
    if (a.paused) { a.currentTime = 0; a.volume = 0; a.play().catch(() => { this.failed = true; }); }
  }
  stop() { this.target = 0; }
  // Called every few dozen milliseconds: fades, loop crossfades, volume.
  tick(dt) {
    this.level = clamp(this.level + clamp(this.target - this.level, -dt / 2.5, dt / 3), 0, 1);
    const a = this.els[this.cur], b = this.els[1 - this.cur];
    if (this.target > 0 && a.duration && a.currentTime > a.duration - this.xfade && b.paused) { b.currentTime = 0; b.play().catch(() => {}); }
    let xa = 1, xb = 0;
    if (!b.paused) {
      xb = a.duration ? clamp((a.currentTime - (a.duration - this.xfade)) / this.xfade, 0, 1) : 1;
      if (a.ended || xb >= 1) { a.pause(); this.cur = 1 - this.cur; xb = 0; }
      xa = 1 - xb;
    }
    const vol = this.e.muted ? 0 : this.e.musicVol * MUSIC_FILE_GAIN * this.level;
    this.els[this.cur].volume = clamp(vol * xa, 0, 1);
    this.els[1 - this.cur].volume = clamp(vol * xb, 0, 1);
    if (this.target === 0 && this.level === 0) for (const el of this.els) if (!el.paused) el.pause();
  }
}

// ---- Instruments ----------------------------------------------------------------------------
function envGain(ctx, dest, t, a, sustain, dur, rel, peak) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(peak * sustain, t + a, Math.max(0.05, (dur - a) / 3));
  g.gain.setTargetAtTime(0.0001, t + dur, rel / 4);
  g.connect(dest);
  return g;
}
function osc(ctx, type, f, t, end, dest, detune) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune;
  o.connect(dest); o.start(t); o.stop(end); return o;
}
const INST = {
  // Choir/string pad: detuned saws through a dark filter, slow swell.
  pad(tr, t, freqs, dur, vol = 0.05, bright = 900) {
    const ctx = tr.ctx;
    for (const f of freqs) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(bright * 0.6, t); lp.frequency.linearRampToValueAtTime(bright, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(bright * 0.7, t + dur); lp.Q.value = 0.7;
      const g = envGain(ctx, lp, t, Math.min(1.8, dur * 0.4), 0.8, dur, 2.6, vol);
      lp.connect(tr.out); lp.connect(tr.send);
      for (const d of [-7, 6]) osc(ctx, 'sawtooth', f, t, t + dur + 3, g, d);
      osc(ctx, 'triangle', f / 2, t, t + dur + 3, g);
    }
  },
  // Choir "aah": saw through two formant filters with vibrato.
  choir(tr, t, f, dur, vol = 0.035) {
    const ctx = tr.ctx;
    const g = envGain(ctx, tr.send, t, 1.2, 0.85, dur, 2.5, vol);
    const g2 = ctx.createGain(); g2.gain.value = 0.4; g.connect(g2); g2.connect(tr.out);
    for (const [ff, q] of [[720, 6], [1180, 8], [2600, 10]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q; bp.connect(g);
      for (const d of [-9, 0, 8]) {
        const o = osc(ctx, 'sawtooth', f, t, t + dur + 3, bp, d);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 4.6 + Math.random(); const lg = ctx.createGain(); lg.gain.value = f * 0.004;
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 3);
      }
    }
  },
  // Recorder/flute lead: soft triangle with breath and vibrato.
  flute(tr, t, f, dur, vol = 0.06) {
    const ctx = tr.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.connect(tr.out); lp.connect(tr.send);
    const g = envGain(ctx, lp, t, 0.06, 0.75, dur, 0.35, vol);
    const o = osc(ctx, 'triangle', f, t, t + dur + 0.6, g);
    const o2 = osc(ctx, 'sine', f * 2, t, t + dur + 0.6, g); o2.detune.value = 3;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + dur * 0.6);
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency); lfo.start(t); lfo.stop(t + dur + 0.6);
  },
  // Plucked lute / harpsichord: bright saw with a fast filter decay.
  pluck(tr, t, f, vol = 0.05, decay = 0.9, bright = 3200) {
    const ctx = tr.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(bright, t); lp.frequency.exponentialRampToValueAtTime(320, t + decay * 0.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    lp.connect(g); g.connect(tr.out); g.connect(tr.send);
    osc(ctx, 'sawtooth', f, t, t + decay + 0.05, lp, 0); osc(ctx, 'square', f, t, t + decay + 0.05, lp, 4);
  },
  // Bell: inharmonic sine partials, long decay.
  bell(tr, t, f, vol = 0.04, decay = 4) {
    const ctx = tr.ctx;
    for (const [m, a] of [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.9, 0.12]]) {
      const g = ctx.createGain(); g.gain.setValueAtTime(vol * a, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay / Math.sqrt(m));
      g.connect(tr.out); g.connect(tr.send);
      osc(ctx, 'sine', f * m, t, t + decay, g);
    }
  },
  // Low horn call.
  horn(tr, t, f, dur, vol = 0.05) {
    const ctx = tr.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(900, t + 0.4); lp.frequency.linearRampToValueAtTime(500, t + dur);
    lp.connect(tr.out); lp.connect(tr.send);
    const g = envGain(ctx, lp, t, 0.35, 0.8, dur, 0.8, vol);
    osc(ctx, 'sawtooth', f, t, t + dur + 1, g, -4); osc(ctx, 'sawtooth', f, t, t + dur + 1, g, 5);
  },
  // Timpani / frame drum.
  drum(tr, t, f = 70, vol = 0.12) {
    const ctx = tr.ctx;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    g.connect(tr.out); g.connect(tr.send);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.8, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    o.connect(g); o.start(t); o.stop(t + 1);
    noiseBurst(ctx, t, 0.08, vol * 0.6, 900, g);
  },
  // Wind: filtered noise that breathes.
  wind(tr, t, dur, vol = 0.02) {
    const ctx = tr.ctx;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t); bp.frequency.linearRampToValueAtTime(700, t + dur / 2); bp.frequency.linearRampToValueAtTime(260, t + dur);
    const g = envGain(ctx, tr.out, t, dur * 0.4, 0.9, dur, dur * 0.3, vol);
    bp.connect(g);
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx); src.loop = true; src.connect(bp); src.start(t); src.stop(t + dur * 1.4);
  },
};
let _noise = null;
function noiseBuffer(ctx) {
  if (_noise) return _noise;
  _noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = _noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return _noise;
}
function noiseBurst(ctx, t, dur, vol, freq, dest, type = 'bandpass', freqEnd) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur); f.Q.value = 1;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

// ---- Composition helpers --------------------------------------------------------------------
class Track {
  constructor(engine, def) {
    this.e = engine; this.ctx = engine.ctx; this.def = def;
    this.out = this.ctx.createGain(); this.out.gain.value = 0;
    this.send = this.ctx.createGain(); this.send.gain.value = def.verb || 0.6;
    this.out.connect(engine.music); this.send.connect(engine.verb);
    this.beat = 0; this.nextT = 0; this.state = {}; this.drones = [];
  }
  start(t) {
    this.nextT = t;
    this.out.gain.setValueAtTime(0, t); this.out.gain.linearRampToValueAtTime(2.2 * (this.def.gain || 1), t + 3);
    if (this.def.drone) for (const [deg, oct, vol] of this.def.drone) this.droneNote(t, this.note(deg, oct), vol);
  }
  stop(t) {
    this.out.gain.cancelScheduledValues(t); this.out.gain.setValueAtTime(this.out.gain.value, t); this.out.gain.linearRampToValueAtTime(0, t + 2.5);
    this.send.gain.setTargetAtTime(0, t, 1);
    for (const o of this.drones) o.stop(t + 3);
    this.stopped = true;
  }
  droneNote(t, f, vol) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 4);
    lp.connect(g); g.connect(this.out); g.connect(this.send);
    for (const [type, d] of [['sawtooth', -5], ['sawtooth', 6], ['sine', 0]]) { const o = osc(ctx, type, f, t, t + 36000, lp, d); this.drones.push(o); }
    this.drones.push(lfo);
  }
  note(deg, oct = 0) {
    const m = MODES[this.def.mode];
    const o = Math.floor(deg / 7), d = ((deg % 7) + 7) % 7;
    return mtof(this.def.root + m[d] + 12 * (o + oct));
  }
  chord(deg, oct = 0, n = 3) { return Array.from({ length: n }, (_, i) => this.note(deg + i * 2, oct)); }
  schedule(until) {
    if (this.stopped) return;
    const spb = 60 / this.def.bpm;
    while (this.nextT < until) {
      this.def.gen(this, this.beat, this.nextT, spb, this.state);
      this.nextT += spb; this.beat++;
    }
  }
}
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
// A wandering melody: steps around the scale, holding a motif and varying it every few phrases.
function melody(st, len, range) {
  if (!st.motif || Math.random() < 0.3) {
    st.motif = [];
    let d = rnd([0, 2, 4, 7]);
    for (let i = 0; i < len; i++) { d = clamp(d + rnd([-2, -1, -1, 1, 1, 2, 0, 3, -3]), range[0], range[1]); st.motif.push(Math.random() < 0.15 ? null : d); }
  } else if (Math.random() < 0.5) {
    const i = Math.floor(Math.random() * st.motif.length);
    if (st.motif[i] !== null) st.motif[i] = clamp(st.motif[i] + rnd([-1, 1, 2, -2]), range[0], range[1]);
  }
  return st.motif;
}

const MUSIC = {
  title: {
    bpm: 54, root: 50, mode: 'aeolian', verb: 0.8, drone: [[0, -1, 0.05]],
    gen(tr, b, t, spb, st) {
      const prog = [0, 5, 2, 6], bar = Math.floor(b / 4), ch = prog[bar % 4];
      if (b % 4 === 0) { INST.pad(tr, t, tr.chord(ch, -1), spb * 4.2, 0.04, 1100); if (bar % 2 === 0) INST.choir(tr, t, tr.note(ch + 4, 0), spb * 8, 0.022); }
      if (bar >= 2 && b % 8 === 0) st.mel = melody(st, 8, [0, 9]);
      if (st.mel && bar >= 2) { const n = st.mel[b % 8]; if (n !== null && (b % 2 === 0 || Math.random() < 0.35)) INST.flute(tr, t, tr.note(n, 1), spb * (b % 2 ? 0.9 : 1.8), 0.05); }
      if (b % 16 === 12) INST.bell(tr, t, tr.note(rnd([4, 7, 9]), 1), 0.03, 5);
    },
  },
  town: {
    bpm: 72, root: 55, mode: 'dorian', verb: 0.55, gain: 1.3,
    gen(tr, b, t, spb, st) {
      const prog = [0, 3, 0, 6, 0, 3, 4, 0], bar = Math.floor(b / 4), ch = prog[bar % 8];
      if (b % 4 === 0) INST.pad(tr, t, tr.chord(ch, -1), spb * 4.2, 0.025, 800);
      // lute arpeggio in eighths
      for (let h = 0; h < 2; h++) {
        const idx = (b % 4) * 2 + h, pat = [0, 2, 4, 2, 7, 4, 2, 4][idx];
        INST.pluck(tr, t + h * spb / 2, tr.note(ch + pat, 0), 0.032, 0.9, 2600);
      }
      if (b % 8 === 0) st.mel = melody(st, 8, [2, 11]);
      if (st.mel && bar % 4 >= 1) { const n = st.mel[b % 8]; if (n !== null && Math.random() < 0.85) INST.flute(tr, t, tr.note(n, 1), spb * 0.9, 0.045); }
    },
  },
  night: {
    bpm: 46, root: 45, mode: 'aeolian', verb: 0.9, drone: [[0, -1, 0.06], [4, -1, 0.03]],
    gen(tr, b, t, spb, st) {
      const bar = Math.floor(b / 4), ch = [0, 5, 0, 3][bar % 4];
      if (b % 8 === 0) INST.pad(tr, t, tr.chord(ch, -1), spb * 8.5, 0.03, 600);
      if (b % 8 === 4 && Math.random() < 0.6) INST.choir(tr, t, tr.note(ch + 2, 0), spb * 6, 0.016);
      if (Math.random() < 0.18) INST.bell(tr, t, tr.note(rnd([0, 2, 4, 7, 9]), 2), 0.02, 5);
      if (b % 16 === 0) INST.wind(tr, t, spb * 14, 0.018);
    },
  },
  wild: {
    bpm: 58, root: 52, mode: 'phrygian', verb: 0.85, drone: [[0, -2, 0.06], [4, -2, 0.035]],
    gen(tr, b, t, spb, st) {
      const bar = Math.floor(b / 4), ch = [0, 1, 0, 6][bar % 4];
      if (b % 8 === 0) INST.pad(tr, t, tr.chord(ch, -1), spb * 8.5, 0.032, 700);
      if (b % 16 === 8) INST.horn(tr, t, tr.note(rnd([0, 4, 1]), -1), spb * 3, 0.04);
      if (b % 16 === 0) INST.wind(tr, t, spb * 15, 0.02);
      if (b % 8 === 0) st.mel = melody(st, 8, [0, 7]);
      if (bar % 4 >= 2 && st.mel) { const n = st.mel[b % 8]; if (n !== null && Math.random() < 0.6) INST.flute(tr, t, tr.note(n, 0), spb * 1.8, 0.035); }
      if (b % 16 === 15 && Math.random() < 0.5) INST.drum(tr, t, 55, 0.08);
    },
  },
  interior: {
    bpm: 92, root: 50, mode: 'mixolydian', verb: 0.35, gain: 1.8,
    gen(tr, b, t, spb, st) {
      const prog = [0, 6, 3, 0, 0, 6, 4, 0], bar = Math.floor(b / 4), ch = prog[bar % 8];
      INST.pluck(tr, t, tr.note(ch, -1), 0.04, 0.6, 1800);
      INST.pluck(tr, t + spb / 2, tr.note(ch + (b % 2 ? 4 : 2), 0), 0.028, 0.5, 2800);
      if (b % 8 === 0) st.mel = melody(st, 8, [4, 12]);
      if (st.mel && bar % 2 === 1) { const n = st.mel[(b * 2) % 8]; if (n !== null) { INST.flute(tr, t, tr.note(n, 1), spb * 0.45, 0.04); if (Math.random() < 0.5) INST.flute(tr, t + spb / 2, tr.note(n + rnd([-1, 1]), 1), spb * 0.45, 0.035); } }
      if (b % 2 === 0) INST.drum(tr, t, 90, 0.035);
    },
  },
  cellar: {
    bpm: 48, root: 41, mode: 'phrygian', verb: 0.95, drone: [[0, -1, 0.07], [1, 0, 0.012]],
    gen(tr, b, t) {
      if (b % 12 === 0) INST.pad(tr, t, [tr.note(0, 0), tr.note(1, 0), tr.note(4, 0)], 9, 0.02, 500);
      if (Math.random() < 0.22) INST.bell(tr, t + Math.random() * 0.5, tr.note(rnd([7, 8, 11, 14]), 1), 0.012, 1.6);
    },
  },
  chapel: {
    bpm: 50, root: 53, mode: 'lydian', verb: 1.0, gain: 1.5,
    gen(tr, b, t, spb) {
      const bar = Math.floor(b / 4), ch = [0, 4, 3, 0][bar % 4];
      if (b % 4 === 0) { INST.choir(tr, t, tr.note(ch, 0), spb * 4.4, 0.02); INST.choir(tr, t, tr.note(ch + 2, 0), spb * 4.4, 0.016); INST.pad(tr, t, tr.chord(ch, -1), spb * 4.4, 0.025, 600); }
      if (b % 16 === 14) INST.bell(tr, t, tr.note(ch + 4, 1), 0.025, 6);
    },
  },
  combat: {
    bpm: 112, root: 52, mode: 'phrygian', verb: 0.45, drone: [[0, -2, 0.05]],
    gen(tr, b, t, spb, st) {
      const bar = Math.floor(b / 4);
      if (b % 2 === 0) INST.drum(tr, t, 52, b % 4 === 0 ? 0.14 : 0.09);
      if (b % 4 === 3) INST.drum(tr, t + spb / 2, 60, 0.07);
      const ost = [0, 0, 1, 0, 0, 0, 3, 1];
      INST.pluck(tr, t, tr.note(ost[b % 8], -1), 0.05, 0.3, 1200);
      INST.pluck(tr, t + spb / 2, tr.note(ost[b % 8], -1), 0.03, 0.25, 1000);
      if (b % 16 === 0) INST.horn(tr, t, tr.note(rnd([0, 1, 4]), -1), spb * 3.5, 0.05);
      if (bar % 2 === 1 && b % 4 === 0) INST.pad(tr, t, tr.chord(rnd([0, 1, 6]), -1), spb * 4, 0.02, 1200);
    },
  },
};

// ---- Sound effects ----------------------------------------------------------------------------
function sfx(name, variant) {
  const S = Sound, ctx = S.ctx;
  if (!ctx) return;
  const t = ctx.currentTime + 0.01, out = S.sfxBus;
  const tone = (type, f0, f1, dur, vol, dest = out) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  };
  switch (name) {
    case 'swing': noiseBurst(ctx, t, variant === 'fists' ? 0.12 : 0.2, 0.35, 1800, out, 'bandpass', 380); break;
    case 'hit':
      tone('sine', 140, 55, 0.18, 0.5); noiseBurst(ctx, t, 0.07, 0.4, 1400, out);
      if (variant === 'mudcrab') noiseBurst(ctx, t, 0.12, 0.35, 3200, out, 'highpass');
      break;
    case 'hurt': tone('sawtooth', 190, 110, 0.22, 0.12); tone('sine', 110, 50, 0.25, 0.4); break;
    case 'alert':
      if (variant === 'wolf') { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(85, t); o.frequency.linearRampToValueAtTime(70, t + 0.7); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75); const trem = ctx.createOscillator(); trem.frequency.value = 22; const tg = ctx.createGain(); tg.gain.value = 0.12; trem.connect(tg); tg.connect(g.gain); o.connect(lp); lp.connect(g); g.connect(out); o.start(t); trem.start(t); o.stop(t + 0.8); trem.stop(t + 0.8); }
      else if (variant === 'rat') { tone('sine', 1800, 2900, 0.1, 0.12); }
      else { noiseBurst(ctx, t, 0.04, 0.3, 3000, out); noiseBurst(ctx, t + 0.09, 0.04, 0.3, 3000, out); }
      break;
    case 'death':
      if (variant === 'wolf') tone('sine', 900, 380, 0.35, 0.15);
      else if (variant === 'rat') tone('sine', 2400, 900, 0.25, 0.12);
      else noiseBurst(ctx, t, 0.3, 0.4, 2500, out, 'highpass');
      break;
    case 'pickup': tone('triangle', 660, null, 0.09, 0.15); setTimeout(() => sfx('blip2'), 70); break;
    case 'blip2': tone('triangle', 990, null, 0.12, 0.12); break;
    case 'coins': for (let i = 0; i < 4; i++) { const tt = t + i * 0.05; const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1700 + Math.random() * 900; const g = ctx.createGain(); g.gain.setValueAtTime(0.1, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.15); o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.2); } break;
    case 'door': { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(115, t + 0.45); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 4; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(bp); bp.connect(g); g.connect(out); o.start(t); o.stop(t + 0.55); tone('sine', 90, 50, 0.2, 0.3); break; }
    case 'quest': [0, 3, 7, 12].forEach((s, i) => setTimeout(() => { if (!Sound.ctx) return; const tt = Sound.ctx.currentTime; for (const [m, a] of [[1, 1], [2.76, 0.4]]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(74 + s) * m; const g = ctx.createGain(); g.gain.setValueAtTime(0.12 * a, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.6); o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 1.7); } }, i * 110)); break;
    case 'levelup': [0, 4, 7, 12, 16].forEach((s, i) => setTimeout(() => sfx('note', 62 + s), i * 90)); break;
    case 'note': { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(variant); const g = ctx.createGain(); g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); o.connect(g); g.connect(out); o.start(t); o.stop(t + 1); break; }
    case 'eat': for (let i = 0; i < 3; i++) noiseBurst(ctx, t + i * 0.12, 0.06, 0.18, 700, out); break;
    case 'step': noiseBurst(ctx, t, 0.05, variant === 'boards' ? 0.13 : 0.07, variant === 'boards' ? 500 : variant === 'cobble' ? 1500 : 900, out, 'bandpass'); break;
    case 'click': tone('square', 1200, null, 0.03, 0.05); break;
    case 'deny': tone('square', 220, 160, 0.15, 0.06); break;
  }
}
