// Dev tool: generates music for the game with the ElevenLabs Music API.
// Tracks land in game/music/<name>.mp3; every request is logged in assets/elevenlabs/log.json.
//   node tools/elevenlabs.js account                          plan and credits left
//   node tools/elevenlabs.js music <name> "<prompt>" [--seconds 120] [--format mp3_44100_96] [--model music_v1]
// The API key comes from ELEVEN_LABS_API_KEY (or, on Windows, the user environment in the registry).
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'https://api.elevenlabs.io/v1';
const root = path.join(__dirname, '..');

function apiKey() {
  for (const n of ['ELEVEN_LABS_API_KEY', 'ELEVENLABS_API_KEY']) if (process.env[n]) return process.env[n].trim();
  if (process.platform === 'win32') {
    try {
      const out = execSync('reg query HKCU\\Environment /v ELEVEN_LABS_API_KEY', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/ELEVEN_LABS_API_KEY\s+REG_\w+\s+(\S+)/);
      if (m) return m[1];
    } catch (e) { /* not set */ }
  }
  console.error('ELEVEN_LABS_API_KEY is not set.');
  process.exit(1);
}
const KEY = apiKey();

// Plan and credits, or null if the key isn't allowed to read them (restricted keys).
async function account(quiet) {
  const res = await fetch(`${BASE}/user/subscription`, { headers: { 'xi-api-key': KEY } });
  const j = await res.json();
  if (res.ok) return j;
  if (!quiet) console.log(`(can't read the plan: ${j.detail && j.detail.message || res.status})`);
  return null;
}

function record(entry) {
  const dir = path.join(root, 'assets', 'elevenlabs');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'log.json');
  const log = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
  log.push(Object.assign({ at: new Date().toISOString() }, entry));
  fs.writeFileSync(f, JSON.stringify(log, null, 2));
}

async function main() {
  const [cmd, name, ...rest] = process.argv.slice(2);
  const opt = (flag, d) => { const i = rest.indexOf(flag); if (i < 0) return d; const v = rest[i + 1]; rest.splice(i, 2); return v; };
  if (cmd === 'account') {
    const a = await account();
    if (a) console.log({ tier: a.tier, status: a.status, credits_used: a.character_count, credits_limit: a.character_limit, resets: a.next_character_count_reset_unix && new Date(a.next_character_count_reset_unix * 1000).toISOString() });
    return;
  }
  if (cmd === 'music') {
    const seconds = +opt('--seconds', 120), format = opt('--format', 'mp3_44100_96'), model = opt('--model', 'music_v1');
    const prompt = rest.join(' ');
    const before = await account(true);
    const body = { prompt, music_length_ms: Math.round(seconds * 1000), model_id: model, force_instrumental: true };
    console.log(`composing "${name}" (${seconds} s, ${model}) ...`);
    const t0 = Date.now();
    const res = await fetch(`${BASE}/music?output_format=${format}`, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.text();
      record({ name, status: 'failed', http: res.status, request: body, error: err.slice(0, 500) });
      throw new Error(`music -> HTTP ${res.status} ${err.slice(0, 500)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const out = path.join(root, 'game', 'music', `${name}.mp3`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    const after = before && await account(true);
    const used = after ? after.character_count - before.character_count : null;
    record({ name, status: 'success', request: body, format, bytes: buf.length, credits: used, seconds_taken: Math.round((Date.now() - t0) / 1000) });
    console.log(`  saved ${path.relative(root, out)} (${(buf.length / 1024).toFixed(0)} KB) in ${((Date.now() - t0) / 1000).toFixed(0)} s${after ? `, ${used} credits; ${after.character_limit - after.character_count} left` : ''}`);
    return;
  }
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 6).join('\n'));
}
main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
