// Dev tool: generates, rigs and animates villager models with the Tripo API (v3).
// Files land in assets/tripo/<name>/ with a tasks.json log of every task and its cost.
//   node tools/tripo.js balance
//   node tools/tripo.js text <name> "<prompt>" [--neg "<negative prompt>"] [--seed N]
//   node tools/tripo.js rig <name> [--type quadruped] [--model v]  rigs the latest model (type from the rig check)
//   node tools/tripo.js animate <name> idle walk ...     preset animations on the rig; a bare name is a
//                                                        biped preset, quadruped:walk etc. are used as given
//   node tools/tripo.js task <task_id>                   raw task status
// The API key comes from TRIPO_API_KEY (or, on Windows, the user environment in the registry).
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'https://openapi.tripo3d.ai/v3';
const root = path.join(__dirname, '..');

function apiKey() {
  if (process.env.TRIPO_API_KEY) return process.env.TRIPO_API_KEY.trim();
  if (process.platform === 'win32') {
    try {
      const out = execSync('reg query HKCU\\Environment /v TRIPO_API_KEY', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/TRIPO_API_KEY\s+REG_\w+\s+(\S+)/);
      if (m) return m[1];
    } catch (e) { /* not set */ }
  }
  console.error('TRIPO_API_KEY is not set.');
  process.exit(1);
}
const KEY = apiKey();

async function api(method, route, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== 0) throw new Error(`${method} ${route} -> HTTP ${res.status} ${JSON.stringify(json)}`);
  return json.data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(taskId) {
  let last = '';
  for (;;) {
    const t = await api('GET', `/tasks/${taskId}`);
    const line = `${t.status} ${t.progress ?? ''}`;
    if (line !== last) { process.stdout.write(`  ${taskId}: ${line}\n`); last = line; }
    if (t.status === 'success') return t;
    if (['failed', 'cancelled', 'banned', 'expired'].includes(t.status)) throw new Error(`task ${taskId} ${t.status}: ${JSON.stringify(t)}`);
    await sleep(3000);
  }
}
async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url.split('?')[0]}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`  saved ${path.relative(root, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

const dirOf = (name) => { const d = path.join(root, 'assets', 'tripo', name); fs.mkdirSync(d, { recursive: true }); return d; };
const logOf = (name) => { const f = path.join(dirOf(name), 'tasks.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []; };
function record(name, entry) {
  const log = logOf(name);
  log.push(Object.assign({ at: new Date().toISOString() }, entry));
  fs.writeFileSync(path.join(dirOf(name), 'tasks.json'), JSON.stringify(log, null, 2));
}
const latest = (name, kind) => logOf(name).filter((e) => e.kind === kind && e.status === 'success').pop();

async function run(name, kind, route, body, files) {
  const before = await api('GET', '/account/balance');
  const { task_id } = await api('POST', route, body);
  console.log(`${kind} task ${task_id} (balance ${before.balance} credits)`);
  try {
    const t = await waitFor(task_id);
    const o = t.output || {};
    const saved = [];
    for (const [key, file] of Object.entries(files(o))) {
      if (!key) continue;
      await download(key, path.join(dirOf(name), file));
      saved.push(file);
    }
    record(name, { kind, task_id, status: 'success', credits: t.credits_consumed, request: body, files: saved });
    console.log(`  credits used: ${t.credits_consumed}`);
    return t;
  } catch (e) {
    record(name, { kind, task_id, status: 'failed', request: body, error: String(e.message || e) });
    throw e;
  }
}

async function main() {
  const [cmd, name, ...rest] = process.argv.slice(2);
  const opt = (flag) => { const i = rest.indexOf(flag); if (i < 0) return undefined; const v = rest[i + 1]; rest.splice(i, 2); return v; };
  if (cmd === 'balance') { console.log(await api('GET', '/account/balance')); return; }
  if (cmd === 'task') { console.log(JSON.stringify(await api('GET', `/tasks/${name}`), null, 2)); return; }
  if (cmd === 'text') {
    const neg = opt('--neg'), seed = opt('--seed');
    const body = {
      prompt: rest.join(' '), model: 'v3.1-20260211', texture: true, pbr: false,
      texture_quality: 'standard', face_limit: 60000,
      // De-lit albedo, so the game's own lighting is the only lighting.
      texture_version: 'v3.5-20260815', delight: true,
    };
    if (neg) body.negative_prompt = neg;
    if (seed) body.model_seed = +seed;
    const n = logOf(name).filter((e) => e.kind === 'text').length + 1;
    await run(name, 'text', '/generation/text-to-model', body, (o) => ({ [o.model_url]: `model-${n}.glb`, [o.rendered_image_url]: `preview-${n}.${(o.rendered_image_url || '').split('?')[0].split('.').pop() || 'webp'}` }));
    return;
  }
  if (cmd === 'rig') {
    const src = latest(name, 'text');
    if (!src) throw new Error(`no finished model for ${name}`);
    const type = opt('--type'), model = opt('--model');
    const check = await run(name, 'rigcheck', '/animations/rig-check', { input: src.task_id }, () => ({}));
    console.log('  rig check:', JSON.stringify(check.output));
    const rigType = type || (check.output && check.output.rig_type) || 'biped';
    // v1.0 rigs bipeds only; v2.5 also does animals (quadruped, hexapod, octopod, ...).
    await run(name, 'rig', '/animations/rig', { input: src.task_id, model: model || (rigType === 'biped' ? 'v1.0-20240301' : 'v2.5-20260210'), rig_type: rigType, spec: 'tripo', out_format: 'glb' }, (o) => ({ [o.model_url]: 'rigged.glb' }));
    return;
  }
  if (cmd === 'animate') {
    const src = latest(name, 'rig');
    if (!src) throw new Error(`no rig for ${name}`);
    for (const a of rest) {
      const preset = a.includes(':') ? a : `biped:${a}`, file = a.includes(':') ? a.split(':').pop() : a;
      await run(name, 'animate', '/animations/retarget', { input: src.task_id, animation: `preset:${preset}`, out_format: 'glb', bake_animation: true, export_with_geometry: true, animate_in_place: true },
        (o) => ({ [o.model_url || (o.model_urls && Object.values(o.model_urls)[0])]: `anim-${file}.glb` }));
    }
    return;
  }
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 9).join('\n'));
}
main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
