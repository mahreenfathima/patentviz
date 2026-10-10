#!/usr/bin/env node
// patentviz: turn one patent into a 60s Vox-style explainer, built from real SerpApi data.
// Flow: keyword -> Google Patents search -> pick one -> Patents Details + Trends + Search + Images
//       -> Gemini writes narration & captions -> Gemini TTS -> video.html -> MP4 + PDF export.
// 16:9 only, light theme only. Node 18+, no npm dependencies. Needs Python + Playwright + ffmpeg for export.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exec, spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const env = process.env;
// Every GEMINI_API_KEY, GEMINI_API_KEY_2, _3, _4 ... in .env (plus GOOGLE_API_KEY) joins the rotation pool.
const KEYS = [...new Set([
  ...Object.keys(env).filter(k => /^GEMINI_API_KEY(_?\d+)?$/.test(k)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(k => env[k]),
  env.GOOGLE_API_KEY
].filter(Boolean))];
const MODEL = env.VOX_MODEL || 'gemini-2.5-flash';
const TTS_MODEL = env.VOX_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const VOICE = env.GEMINI_TTS_VOICE || 'Kore';
const GEMINI = env.GEMINI_BASE || 'https://generativelanguage.googleapis.com';
const SERP_KEY = env.SERPAPI_API_KEY || env.SERPAPI_KEY || '';
const SERP = env.SERPAPI_BASE || 'https://serpapi.com/search.json';
const GROQ_KEY = env.GROQ_API_KEY || '';
const GROQ_MODEL = env.GROQ_MODEL || 'qwen/qwen3.8-27b'; // llama-3.1-8b-instant is not available to the current Groq key
const REMBG_BIN = env.REMBG_BIN || 'rembg';
const REMBG_MODEL = env.REMBG_MODEL || 'isnet-general-use';
const REMBG_ON = env.VOX_REMBG !== '0';
const W = 1920, H = 1080, ASPECT = '16x9';

// ---------- decorative console ----------
const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', accent: '\x1b[38;2;232;69;44m', red: '\x1b[31m' };
const bold = s => C.bold + s + C.reset;
const dim = s => C.dim + s + C.reset;
const ok = s => '\x1b[32m' + s + C.reset;
const warn = s => '\x1b[33m' + s + C.reset;
const err = s => C.red + s + C.reset;
function banner() {
  const line = '━'.repeat(58);
  console.log('\n' + C.accent + line + C.reset);
  console.log(C.bold + '  📜  P A T E N T   V I Z' + C.reset);
  console.log(dim('  one patent → one ~50s explainer, built on real SerpApi data'));
  console.log(dim(`  keys: Gemini ×${KEYS.length}${GROQ_KEY ? ', Groq' : ''}${SERP_KEY ? ', SerpApi' : ''} · format: 16:9`));
  console.log(C.accent + line + C.reset);
}
let callNo = 0;
const serpLog = [];
function logCall(engine, q) {
  callNo++;
  const tag = { google_patents: 'Patents Search', google_patents_details: 'Patents Details', google_trends: 'Trends', google: 'Search', google_images: 'Images' }[engine] || engine;
  process.stdout.write(`  ${C.accent}▸${C.reset} SerpApi #${callNo}  ${bold(tag.padEnd(16))} ${dim(q)} `);
  return { done: (summary) => { console.log(ok('✓ ' + summary)); serpLog.push({ n: callNo, engine, q, summary }); },
    fail: (e) => console.log(err('✗ ' + e)) };
}
function serpSummary() {
  console.log('\n' + dim('  ─ SerpApi calls used in this build ─'));
  for (const c of serpLog) console.log(`   ${C.accent}${c.n}.${C.reset} ${c.engine}  ${dim(c.q)}  → ${c.summary}`);
  console.log(dim(`  (${serpLog.length} calls — logged for the README, not shown on screen)\n`));
}

const lines = readline.createInterface({ input: process.stdin, output: process.stdout })[Symbol.asyncIterator]();
const ask = async (q, d = '') => {
  process.stdout.write(`${q}${d ? dim(` [${d}]`) : ''} `);
  const { value, done } = await lines.next();
  if (done) { console.log(''); process.exit(0); }
  return (value ?? '').trim() || d;
};
async function pick(title, opts) {
  console.log('\n' + bold(title));
  opts.forEach((o, i) => console.log(`  ${C.accent}${i + 1})${C.reset} ${o.label}${o.note ? dim('  ' + o.note) : ''}`));
  for (;;) {
    const a = await ask('>', '1');
    const n = +a;
    if (n >= 1 && n <= opts.length) return n - 1;
    console.log(warn('Type a number from the list.'));
  }
}
if (!KEYS.length) { console.log(err('No Gemini API key found.') + ' Put GEMINI_API_KEY=... in .env (GEMINI_API_KEY_2 is optional, used as a fallback on rate limits).'); process.exit(1); }
if (!SERP_KEY) { console.log(err('No SerpApi key found.') + ' Patent Vid needs SERPAPI_API_KEY in .env.'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
const slugify = s => String(s || 'patent').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'patent';
const esc = s => String(s ?? '');
const escXml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);

// Runs a Python script, trying python3/python/py in turn (spawnSync's PATH lookup differs
// by platform — Windows usually has no "python3", so that alone made export look "broken").
function runPython(args, opts = {}) {
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  let lastErr = null;
  for (const cmd of candidates) {
    const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
    if (!r.error) return r;
    lastErr = r.error;
  }
  console.log(err(`  Could not find a Python interpreter (tried ${candidates.join(', ')}): ${lastErr?.message || 'not found'}`));
  console.log(dim(`  Install Python 3, or run manually: python3 ${args.join(' ')}`));
  return { status: 1 };
}

// ---------- SerpApi ----------
// A spawnSync call (rembg, ffmpeg, python) blocks Node's event loop for its whole duration,
// which can leave the fetch client's connection pool in a bad state right afterwards — so
// every network call here gets one retry on a transient network error (not on a clean HTTP
// error response, which is a real answer and shouldn't be retried).
async function retryFetch(url, opts, tries = 2) {
  let lastErr;
  for (let t = 0; t < tries; t++) {
    try { return await fetch(url, opts); }
    catch (e) { lastErr = e; if (t < tries - 1) await sleep(500); }
  }
  throw lastErr;
}
async function serp(params) {
  const u = new URL(SERP);
  for (const [k, v] of Object.entries({ ...params, api_key: SERP_KEY })) if (v != null) u.searchParams.set(k, v);
  const r = await retryFetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
function patentIdFrom(result) {
  if (result.patent_id) return result.patent_id;
  try { return new URL(result.serpapi_link || '').searchParams.get('patent_id') || ''; } catch { return ''; }
}
async function searchPatents(q, inventor = '') {
  const l = logCall('google_patents', q + (inventor ? ` [inventor: ${inventor}]` : ''));
  try {
    const j = await serp({ engine: 'google_patents', q, inventor: inventor || undefined });
    const res = (j.organic_results || j.results || []).filter(r => patentIdFrom(r)).slice(0, 6);
    l.done(`${res.length} patents found`);
    return res;
  } catch (e) { l.fail(e.message); throw e; }
}
async function patentDetails(patentId) {
  const l = logCall('google_patents_details', patentId);
  try {
    const j = await serp({ engine: 'google_patents_details', patent_id: patentId });
    l.done(`${(j.claims || []).length} claims, ${(j.images || []).length} images, ${(j.inventors || []).length} inventors`);
    return j;
  } catch (e) { l.fail(e.message); throw e; }
}
async function trendsFor(q) {
  const l = logCall('google_trends', q);
  try {
    const j = await serp({ engine: 'google_trends', q, data_type: 'TIMESERIES' });
    const pts = (j.interest_over_time?.timeline_data || []).map(d => ({
      l: d.date || '', v: Array.isArray(d.values) ? (+d.values[0]?.extracted_value || +d.values[0]?.value || 0) : 0
    }));
    l.done(pts.length ? `${pts.length} data points` : 'no data (topic too narrow)');
    return pts;
  } catch (e) { l.fail(e.message); return []; }
}
async function plainExplainer(q) {
  const l = logCall('google', `${q} explained`);
  try {
    const j = await serp({ engine: 'google', q: `${q} explained` });
    const snippet = j.answer_box?.snippet || j.answer_box?.answer || j.organic_results?.[0]?.snippet || '';
    l.done(snippet ? 'answer found' : 'no snippet');
    return snippet;
  } catch (e) { l.fail(e.message); return ''; }
}
async function searchImages(q, n = 8, tbs = '') {
  const l = logCall('google_images', q + (tbs ? ` [${tbs}]` : ''));
  try {
    const j = await serp({ engine: 'google_images', q, tbs: tbs || undefined });
    const res = (j.images_results || []).filter(r => r.original || r.thumbnail).slice(0, n).map(r => ({ original: r.original, thumbnail: r.thumbnail }));
    l.done(res.length ? `${res.length} candidates` : 'no images found');
    return res;
  } catch (e) { l.fail(e.message); return []; }
}

// ---------- Gemini, with multi-key rotation and quota backoff ----------
let keyIdx = 0;
function parseRetrySeconds(msg) { const m = /retry in\s*([\d.]+)\s*s/i.exec(msg || ''); return m ? +m[1] : null; }
async function geminiFetch(modelPath, body) {
  let lastErr = 'unknown error';
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < KEYS.length; k++) {
      const i = (keyIdx + k) % KEYS.length;
      let r, j;
      try {
        r = await retryFetch(`${GEMINI}/v1beta/models/${modelPath}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEYS[i] }, body: JSON.stringify(body) });
        j = await r.json();
      } catch (e) { lastErr = e.message; continue; }
      if (r.ok) { keyIdx = i; return j; }
      const msg = j.error?.message || `HTTP ${r.status}`;
      lastErr = msg;
      const isQuota = r.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(msg);
      if (!isQuota) throw new Error(msg);
      if (KEYS.length > 1 && k < KEYS.length - 1) { process.stdout.write(dim(`(key ${i + 1} rate-limited, trying key ${((i + 1) % KEYS.length) + 1}) `)); continue; }
    }
    const wait = Math.min(30, parseRetrySeconds(lastErr) || 8);
    process.stdout.write(dim(`(rate-limited on all keys, waiting ${wait}s) `));
    await sleep(wait * 1000);
  }
  throw new Error(lastErr);
}
async function gem(system, user, label = 'thinking') {
  process.stdout.write(dim(`\n  ✎ ${label}... `));
  let u = user;
  for (let t = 0; t < 2; t++) {
    const j = await geminiFetch(`${MODEL}:generateContent`, {
      systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: u }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
    });
    const txt = (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
    try { const out = JSON.parse(txt.replace(/^\s*```(?:json)?|```\s*$/g, '').trim()); console.log(ok('done')); return out; }
    catch { u += '\n\nReturn ONLY one valid JSON object, nothing else.'; }
  }
  console.log(''); throw new Error('Model did not return valid JSON');
}
async function gemVision(prompt, imgPath) {
  const mime = imgPath.endsWith('.png') ? 'image/png' : imgPath.endsWith('.gif') ? 'image/gif' : 'image/jpeg';
  const j = await geminiFetch(`${MODEL}:generateContent`, { contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: fs.readFileSync(imgPath).toString('base64') } }] }] });
  return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
}
function parseWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let p = 12, fmt = null, data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), sz = buf.readUInt32LE(p + 4), body = p + 8;
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    if (id === 'data') data = buf.subarray(body, Math.min(buf.length, body + sz));
    p = body + sz + (sz % 2);
  }
  if (!fmt || !data) throw new Error('bad WAV header');
  return { ...fmt, data };
}
function makeWav({ ch, rate, bits, data }) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * ch * bits / 8, 28); h.writeUInt16LE(ch * bits / 8, 32); h.writeUInt16LE(bits, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const bps = w => w.rate * w.ch * w.bits / 8;
const durOf = w => w.data.length / bps(w);
const splitSents = t => String(t || '').split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
let lastTTS = 0;
async function speak(text) {
  const wait = 1600 - (Date.now() - lastTTS); // pace calls — free TTS tiers allow very few requests/minute
  if (wait > 0) await sleep(wait);
  lastTTS = Date.now();
  const j = await geminiFetch(`${TTS_MODEL}:generateContent`, {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } }
  });
  const part = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData);
  if (!part) throw new Error('TTS returned no audio');
  const mime = part.inlineData.mimeType || '', raw = Buffer.from(part.inlineData.data, 'base64');
  return /wav/i.test(mime) ? parseWav(raw) : { ch: 1, rate: +(mime.match(/rate=(\d+)/)?.[1] || 24000), bits: 16, data: raw };
}
// Reading-speed duration for silent scenes — and the floor for voiced ones — so every
// subtitle has time to be read, not just time to be heard.
const readDur = s => { const words = (s.narration || '').split(/\s+/).filter(Boolean).length; const b = words ? num(1.4 + words / 2.2, 4.5, 10, 4.5) : num(s.dur, 3, 8, 4.5); return Math.max(b, s.minDur || 0); };
async function buildAudio(dirOf, scenes, voice) {
  if (!voice) return { file: null, timing: scenes.map(s => ({ dur: readDur(s) })) };
  const cache = path.join(dirOf, 'audio'); fs.mkdirSync(cache, { recursive: true });
  const clips = []; let fmt = null;
  for (let i = 0; i < scenes.length; i++) {
    const text = String(scenes[i].narration || '').trim();
    if (!text) { clips.push(null); continue; }
    const h = crypto.createHash('sha1').update(VOICE + '|' + TTS_MODEL + '|' + text).digest('hex').slice(0, 12);
    const f = path.join(cache, `s${i + 1}-${h}.wav`);
    if (!fs.existsSync(f)) {
      process.stdout.write(dim(`  🔊 voice: scene ${i + 1}... `));
      try { fs.writeFileSync(f, makeWav(await speak(text))); console.log(ok('done')); }
      catch (e) { console.log(warn('failed (' + e.message + ') — using subtitle only for this scene')); clips.push(null); continue; }
    }
    const w = parseWav(fs.readFileSync(f)); clips.push({ w, text }); fmt = fmt || w;
  }
  const timing = []; let t = 0;
  scenes.forEach((s, i) => {
    const cl = clips[i], L = cl ? durOf(cl.w) : 0;
    const dur = Math.round(Math.max(readDur(s), L > 0 ? L + 0.6 : 0) * 10) / 10;
    timing.push({ start: +t.toFixed(2), dur }); t += dur;
  });
  if (!fmt) return { file: null, timing };
  const B = bps(fmt), block = fmt.ch * fmt.bits / 8;
  const out = Buffer.alloc(Math.ceil(t * B / block) * block);
  clips.forEach((cl, i) => { if (!cl) return; const off = Math.round((timing[i].start + 0.25) * B / block) * block; cl.w.data.copy(out, off, 0, Math.min(cl.w.data.length, out.length - off)); });
  fs.mkdirSync(path.join(dirOf, 'voice'), { recursive: true });
  fs.writeFileSync(path.join(dirOf, 'voice', 'voiceover.wav'), makeWav({ ...fmt, data: out }));
  return { file: 'voice/voiceover.wav', timing };
}

// ---------- images: real patent drawings, else real photos via SerpApi Google Images ----------
let rembgOk = null;
function rembgReady() {
  if (rembgOk === null) { if (!REMBG_ON) rembgOk = false; else { const r = spawnSync(REMBG_BIN, ['--help'], { stdio: 'ignore' }); rembgOk = !r.error && r.status === 0; } }
  return rembgOk;
}
function removeBg(src) {
  const out = src.replace(/\.[^.]+$/, '') + '.png', tmp = out + '.tmp.png';
  const r = spawnSync(REMBG_BIN, ['i', '-m', REMBG_MODEL, src, tmp], { encoding: 'utf8', timeout: 600000 });
  if (r.error || r.status !== 0 || !fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch {} return { ok: false }; }
  fs.renameSync(tmp, out);
  if (out !== src && fs.existsSync(src)) fs.unlinkSync(src);
  return { ok: true, file: path.basename(out) };
}
async function downloadImage(url, dest) {
  const r = await retryFetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}
function pngInfo(p) {
  try {
    const b = fs.readFileSync(p);
    if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.toString('ascii', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        i += 2 + b.readUInt16BE(i + 2); }
    }
  } catch {}
  return null;
}

// Runs cli/cutout.py (Pillow). Returns the parsed JSON line it prints, or null if Python/Pillow is missing.
function pyCutout(src, dst, haveAlpha) {
  const script = path.join(ROOT, 'cli', 'cutout.py');
  if (!fs.existsSync(script)) return null;
  for (const cmd of process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']) {
    const r = spawnSync(cmd, [script, src, dst, ...(haveAlpha ? ['--have-alpha'] : [])], { encoding: 'utf8', timeout: 120000 });
    if (r.error) continue;
    try { return JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { return { ok: false, why: (r.stderr || 'python error').slice(-120) }; }
  }
  return null;
}
// Background removal: rembg when installed (best for busy backgrounds), else a plain-background
// flood fill. Always trims to the subject. Returns null when the background can't be removed safely.
function makeCutout(raw, dst) {
  if (rembgReady()) {
    const rb = removeBg(raw);
    if (rb.ok) {
      const rbPath = path.join(path.dirname(raw), rb.file), r = pyCutout(rbPath, dst, true);
      if (r?.ok) return { file: path.basename(dst), ratio: +(r.w / r.h).toFixed(3) };
      if (r === null) { const info = pngInfo(rbPath); return { file: rb.file, ratio: info ? +(info.w / info.h).toFixed(3) : 1.2 }; }
    }
  }
  if (!fs.existsSync(raw)) return null;
  const r = pyCutout(raw, dst, false);
  if (r?.ok) return { file: path.basename(dst), ratio: +(r.w / r.h).toFixed(3) };
  if (r?.why) process.stdout.write(dim(`(${r.why}) `));
  return null;
}
// Finds up to n product images via Google Images. First asks for vector illustrations (clip art),
// which are clean and cut out easily; SVGs are used as they are; anything else goes through the
// background remover. Falls back to any image if no illustrations come back.
async function fetchPhotos(query, destBase, n = 1, label = 'photo', tbs = 'itp:clipart') {
  let cands = await searchImages(query, 10, tbs);
  if (!cands.length && tbs) cands = await searchImages(query, 10);
  const got = []; let spare = null;
  const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', accept: 'image/*' };
  for (const cd of cands) {
    if (got.length >= n) break;
    for (const url of [cd.original, cd.thumbnail].filter(Boolean)) {
      try {
        const r = await retryFetch(url, { headers: UA });
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || !/^image\/(jpeg|png|webp|svg)/.test(ct)) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 4000) continue;
        const idx = got.length + 1;
        if (ct.includes('svg')) {
          const file = `${destBase}-${idx}.svg`; fs.writeFileSync(file, buf);
          const vb = /viewBox="([^"]+)"/.exec(buf.toString('utf8'))?.[1]?.split(/[\s,]+/).map(Number);
          const ratio = vb && vb[2] && vb[3] ? +(vb[2] / vb[3]).toFixed(3) : 1;
          console.log(dim(`  🖼  ${label} ${idx}: `) + ok('vector (svg)'));
          got.push({ file: path.basename(file), ratio, cut: true, svg: true }); break;
        }
        const raw = `${destBase}-${idx}-raw${ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : '.jpg'}`;
        fs.writeFileSync(raw, buf);
        process.stdout.write(dim(`  🖼  ${label} ${idx}: `));
        const res = makeCutout(raw, `${destBase}-${idx}.png`);
        if (res) { console.log(ok('background removed')); got.push({ ...res, cut: true }); break; }
        console.log(warn('background not removable, trying another'));
        const info = pngInfo(raw);
        if (!spare) spare = { file: path.basename(raw), ratio: info ? +(info.w / info.h).toFixed(3) : 1.4, cut: false };
      } catch (e) { /* try next url */ }
    }
  }
  if (!got.length && spare) { console.log(warn(`  no clean cutout found for ${label}; using the image as it is`)); got.push(spare); }
  return got;
}
// Vision: where are the invention-relevant parts on the image? Returns [{t,x,y}] (x,y = % of the image).
// kind: 'photo' (a real product photo) or 'drawing' (the patent's own line-art figure, with numbered
// reference signs) — the prompt is tuned per kind so the model only points at things actually drawn
// there, rather than inventing marks that aren't really visible.
async function findHotspots(imgPath, abstract, hints, kind = 'photo') {
  // Margin kept wider than the raw 0-100 range (12-88, not 6-94): the tour camera zooms IN on
  // each point, and a pin too close to the edge gets its label chip pushed out of the crop.
  const clean = v => (Array.isArray(v) ? v : []).filter(p => p && typeof p.label === 'string' && +p.x >= 12 && +p.x <= 88 && +p.y >= 12 && +p.y <= 88)
    .map(p => ({ t: p.label.trim().slice(0, 26), x: +p.x, y: +p.y })).filter((p, i, a) => a.slice(0, i).every(q => Math.hypot(q.x - p.x, q.y - p.y) > 18)).slice(0, kind === 'drawing' ? 4 : 3);
  const prompt = kind === 'drawing'
    ? `This is a figure from a patent filing, shown in an explainer about that patent. Patent abstract: ${abstract.slice(0, 600)}\nFeature hints: ${(hints || []).join('; ')}\nThe figure carries reference numerals (such as 110, 120, 140) and/or short text labels for its parts. Pick up to 4 DISTINCT parts that relate to the invention and are drawn in this figure. For each, use the label as printed (e.g. "MCU 140", "Motion Sensors 120", or the box's text) and give its location as a percent of the image width/height from the top-left, on the part itself. Return ONLY JSON: [{"label":"...","x":0-100,"y":0-100}]. Return [] only if the figure has no labelled parts at all.`
    : `This product photo is shown in an explainer about a patent. Patent abstract: ${abstract.slice(0, 600)}\nFeature hints: ${(hints || []).join('; ')}\nPick up to 3 DISTINCT parts or features you can actually see that relate to the invention. Return ONLY JSON: [{"label":"2-3 word name","x":0-100,"y":0-100}] where x,y is the part's location as a percent of image width/height from the top-left. If you cannot see relevant parts, return [].`;
  try {
    const mime = imgPath.endsWith('.png') ? 'image/png' : imgPath.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const j = await geminiFetch(`${MODEL}:generateContent`, { contents: [{ role: 'user', parts: [
      { text: prompt },
      { inlineData: { mimeType: mime, data: fs.readFileSync(imgPath).toString('base64') } }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } });
    const txt = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').replace(/^\s*```(?:json)?|```\s*$/g, '').trim();
    return clean(JSON.parse(txt));
  } catch { return []; }
}

// Builds a STATIC annotated patent figure as one SVG: the (background-free) drawing in the middle,
// a dot on each labelled part, a thin line out to a pill that sits OUTSIDE the drawing. This is now
// only the fallback (used when fewer than 2 labelled parts were found, so there is nothing to tour);
// with 2+ parts the video animates the labels in with a zooming tour instead.
// pts = [{t, x, y}] with x,y as % of the drawing. Returns { file, ratio } or null.
function annotateDrawing(imgPath, pts, pal, outPath) {
  const info = pngInfo(imgPath);
  if (!info || !pts.length) return null;
  const Hd = 600, Wd = Math.round(Hd * info.w / info.h);
// was: const FS = 32, PH = 56, PX = 22, GAP = 40, SEP = 14;
    const FS = 28, PH = 50, PX = 20, GAP = 36, SEP = 12;  
    const pillW = t => Math.round(String(t).length * FS * 0.62 + PX * 2);
// was: const items = pts.map(p => ({ t: p.t, side: ...
    const items = pts.map(p => ({ t: String(p.t).slice(0, 22), side: p.x < 50 ? 'L' : 'R', px: p.x / 100 * Wd, py: p.y / 100 * Hd, w: pillW(String(p.t).slice(0, 22)) }));  for (const side of ['L', 'R']) {
    const col = items.filter(i => i.side === side).sort((a, b) => a.py - b.py);
    let last = -1e9;
    col.forEach(i => { i.cy = Math.max(i.py, last + PH + SEP, PH / 2 + 4); last = i.cy; });
    let lim = Hd - PH / 2 - 4;
    for (let k = col.length - 1; k >= 0; k--) { col[k].cy = Math.min(col[k].cy, lim); lim = col[k].cy - PH - SEP; }
  }
  const maxW = side => Math.max(0, ...items.filter(i => i.side === side).map(i => i.w));
  const padL = maxW('L') ? maxW('L') + GAP + 8 : 8, padR = maxW('R') ? maxW('R') + GAP + 8 : 8;
  const totalW = padL + Wd + padR;
  const ext = path.extname(imgPath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
  const data = fs.readFileSync(imgPath).toString('base64');
  let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${totalW} ${Hd}" width="${totalW}" height="${Hd}">`;
  s += `<image x="${padL}" y="0" width="${Wd}" height="${Hd}" xlink:href="data:${mime};base64,${data}"/>`;
  const edgeX = i => i.side === 'L' ? padL - GAP : padL + Wd + GAP;
  items.forEach(i => { s += `<line x1="${padL + i.px}" y1="${i.py}" x2="${edgeX(i)}" y2="${i.cy}" stroke="${pal.ink}" stroke-width="3" stroke-linecap="round"/>`; });
  items.forEach(i => { s += `<circle cx="${padL + i.px}" cy="${i.py}" r="9" fill="${pal.accent}" stroke="${pal.ink}" stroke-width="3"/>`; });
  items.forEach(i => {
    const x = i.side === 'L' ? edgeX(i) - i.w : edgeX(i);
    s += `<rect x="${x}" y="${i.cy - PH / 2}" width="${i.w}" height="${PH}" rx="${PH / 2}" fill="${pal.hi}" stroke="${pal.ink}" stroke-width="3"/>`;
    s += `<text x="${x + i.w / 2}" y="${i.cy + FS * 0.35}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${FS}" fill="${pal.ink}">${escXml(i.t)}</text>`;
  });
  s += '</svg>';
  fs.writeFileSync(outPath, s);
  return { file: path.basename(outPath), ratio: +(totalW / Hd).toFixed(3) };
}

// ---------- one continuous journey, light editorial style ----------
// Each stop is a camera position on one board. Every stop gets a soft colour block behind it,
// a product sticker (vector illustration or cutout), and a clear piece of information. The camera
// glides, arcs and whips between stops, so the video reads as one connected piece.
//
// LAYOUT RULES (so everything lines up):
//  • The camera sits at y:31 with a 16:9 view at zoom 1, so the visible window is about 100 wide
//    (cam.x ± 50) and y ≈ 3–59. Everything for a stop must sit inside that window.
//  • Every section label ("01 — THE PROBLEM") sits on the same row, y = LABEL_Y.
//  • Stops run left to right in the default order: hook 50, problem 150, invention 250,
//    blueprint 350, steps 460, momentum 600, people 700, numbers 800, closing 900.
const ASP = 16 / 9;
const wFit = (maxW, maxH, ratio) => Math.min(maxW, maxH * ratio);   // width (units) so height <= maxH
const LABEL_Y = 8;
function buildScenes(o) {
  const { title, number, assignee, inventors, filingDate, grantDate, claimsTotal, trends, N, headline, productName, problemLine, steps, caption1, photos, drawings, hotspots, drawingHotspots, annotated, holderLogo, inventorPhoto, focusKey } = o;
  const P1 = photos[0], P2 = photos[1] || photos[0], P3 = photos[2], P4 = photos[3], D1 = drawings[0];
  const fy = (filingDate || '').slice(0, 4), gy = (grantDate || '').slice(0, 4);
  let n = 0; const lab = t => `0${++n} — ${t}`;
  const cam = (x, z = 1, move = 'glide') => ({ x, y: 31, z, move, drift: [0.6, 0], push: 1.02 });
  // The 'cardv'/'cardh' card decos render as a fixed near-white card, so text sitting on one of
  // those cards uses a fixed dark ink.
  const CARD_INK = '#1b1a17';
  const B = {}; let cur = [];
  const blk = k => { cur = B[k] = []; };
  const add = (narration, cm, layers, text, extra = {}) => cur.push({ narration, cam: cm, layers, text, ...extra });
  const blob = (x, y, w, col, extra = {}) => ({ k: 'deco', type: 'blob', x, y, w, c: col, clean: 1, spin: 25, spinD: 40, in: 'fade', z: 1, ...extra });

  blk('hook');
  // 1 — HOOK: the product as a sticker, a bold headline, a highlighted word
  const hero = P1 ? { id: P1.id, ratio: P1.ratio } : D1 ? { id: 'd1', ratio: D1.ratio } : null;
  const hw = hero ? wFit(34, 38, hero.ratio) : 0;
  // headline occupies x 10–56 (mw 46); the sticker's left edge is at 77 - 17 = 60 at most, so they never touch
  add(N.hook, cam(50, 1, 'cut'), [
    blob(77, 31, 44, 'sky'),
    { k: 'deco', type: 'streaks', x: 58, y: 16, w: 9, c: 'ink', clean: 1, draw: 1, dd: .6, at: .4, z: 6 },
    ...(hero ? [{ a: hero.id, fx: 'sticker', x: 77, y: 31, w: hw, r: -5, in: 'pop', at: .5, z: 5 }] : []),
    { k: 'deco', type: 'sparkle', x: 92, y: 14, w: 5, c: 'accent', clean: 1, spin: 90, spinD: 6, at: .9, z: 6 },
    // small second sticker: tucked bottom-centre, clear of the text column (ends ~56) and the hero (starts ~60)
    ...(P3 && hero ? [{ a: P3.id, fx: 'sticker', x: 50, y: 51, w: wFit(11, 11, P3.ratio), r: 8, in: 'pop', at: .9, z: 3 }] : [])
  ], [
    { t: (headline || title).toUpperCase(), s: 'mt', x: hero ? 10 : 50, y: 26, fs: hero ? 5.2 : 6, mw: hero ? 46 : 72, al: hero ? 'l' : undefined, stag: .05 },
    { t: `PATENT ${number}`, s: 'tg', x: hero ? 10 : 50, y: 46, fs: 1.3, al: hero ? 'l' : undefined, at: 1.3 }
  ]);

  blk('problem');
  // 2 — PROBLEM: mint block, the problem in big type, kept inside the circle
  add(N.problem, cam(150, 1, 'zoom'), [
    blob(150, 30, 72, 'mint', { spin: -15, spinD: 50 }),
    { k: 'deco', type: 'streaks', x: 128, y: 13, w: 8, c: 'ink', clean: 1, draw: 1, dd: .6, at: .35, z: 6 },
    { k: 'deco', type: 'sparkle', x: 112, y: 46, w: 4, c: 'accent', clean: 1, spin: 90, spinD: 5, at: .7, z: 6 },
    { k: 'deco', type: 'sparkle', x: 188, y: 16, w: 3.5, c: 'ink', clean: 1, spin: -90, spinD: 5, at: .9, z: 6 },
    { k: 'deco', type: 'underline', x: 150, y: 41, w: 34, c: 'accent', clean: 1, draw: 1, dd: .8, at: 1.3, z: 6 }
  ], [
    { t: lab('THE PROBLEM'), s: 'ml', x: 150, y: LABEL_Y, fs: 1.5, in: 'fade' },
    { t: problemLine || title, s: 'mt', x: 150, y: 27, fs: 4.2, mw: 46, stag: .05, in: 'fade' }
  ]);

  blk('invention');
  // 3 — INVENTION: the camera tours the real product, part by part, labels as sticker chips
  if (P1) {
    const tour = hotspots.length >= 2, pr = P1.ratio;
    const tw = tour ? Math.min(30, 35 * pr) : wFit(34, 40, pr);
    add(N.invention, cam(250, 1, 'spiral'), [
      blob(250, 33, 46, 'sky'),
      ...(tour ? [{ k: 'tour', a: P1.id, ratio: pr, x: 250, y: 33, w: tw, pts: hotspots, at: .3, zoom: 1.25, move: 1, hold: 1.3, fs: 1.3, z: 3 }]
              : [{ a: P1.id, fx: 'sticker', x: 250, y: 33, w: tw, in: 'pop', at: .4, z: 3 }])
    ], [
      { t: lab('THE INVENTION'), s: 'ml', x: 250, y: LABEL_Y - 1, fs: 1.5, in: 'fade' },
      { t: (productName || title).toUpperCase(), s: 'tg', x: 250, y: LABEL_Y + 5, fs: 2.4, mw: 60, in: 'fade', at: .2 }
    ], { minDur: tour ? 1.8 + hotspots.length * 2.4 : 0 });
  }

  blk('blueprint');
  // 4 — PATENT DRAWING: the filing's own line art (background removed) on a lilac block.
  // Shown as ONE still image: a dot on each labelled part, a thin line out to a pill that sits
  // outside the drawing. No zoom and no clipping container, so labels can never be cut off.
  if (D1) {
    const layers = [blob(350, 30, 54, 'lilac')];
    if (annotated) layers.push({ a: 'd1a', fx: 'glow', x: 350, y: 29, w: wFit(48, 28, annotated.ratio), in: 'pop', at: .3, z: 4 });
    else layers.push({ a: 'd1', fx: D1.cut ? 'glow' : 'card', x: 350, y: 29, w: wFit(40, 28, D1.ratio), in: 'fade', at: .3, z: 4 });
    add(N.blueprint, cam(350, 1, 'swing'), layers, [
      { t: lab('FROM THE PATENT FILING'), s: 'ml', x: 350, y: LABEL_Y, fs: 1.4, in: 'fade' },
      ...(caption1 ? [{ t: caption1, s: 'mb', x: 350, y: 49, fs: 1.5, mw: 60, in: 'fade', at: 1.1 }] : [])
    ]);
  }

  blk('steps');
  // 5 — HOW IT WORKS: three cards on a dashed track; the camera rides from card to card.
  // The camera sits at z 2.2 here (view ≈ 45 wide, y ≈ 18–44), so the label has to sit above the
  // first card's stop (x 420) and inside that window (y 21), not at the track's centre.
  if ((steps || []).length >= 2) {
    const items = steps.slice(0, 3).map(x => ({ t: x.t, d: x.d })), tx = 460;
    add((N.steps || [])[0] || '', cam(420, 2.2, 'arc'), [
      blob(tx, 30, 134, 'mint'),
      { k: 'steps', x: tx, y: 30, w: 120, fs: 1.5, gap: 4.6, items, at: .3, z: 5 }
    ], [{ t: lab('HOW IT WORKS'), s: 'tg', x: 420, y: 21, fs: 1.6, in: 'fade' }]);
    add((N.steps || [])[1] || '', cam(tx, 2.2, 'whip'), [], []);
    add((N.steps || [])[2] || '', cam(500, 2.2, 'whip'), [], []);
  }

  blk('momentum');
  // 6 — MOMENTUM: real Google Trends data on a white card
  if (trends.length >= 2) {
    add(N.momentum, cam(600, 1, 'drop'), [
      blob(600, 32, 70, 'mint', { spin: 15 }),
      { k: 'chart', type: 'line', flat: 1, title: 'Search interest over time', data: trends, x: 600, y: 32, w: 52, hgt: 26, at: .4 }
    ], [{ t: lab('THE MOMENTUM'), s: 'tg', x: 600, y: LABEL_Y, fs: 1.6, in: 'fade' }]);
  }

  blk('people');
  // 7 — WHO MADE IT. Sits at x 700 (between momentum and the numbers) so the camera keeps moving forward.
  add(N.people || N.invention || '', cam(700, 1, 'arc'), [
    blob(700, 30, 52, 'lilac', { spin: -10, spinD: 40 }),
    // Both found: two photos side by side, centred. One found: it gets the centre and more room.
    ...(inventorPhoto && holderLogo ? [
      { a: 'inventor', fx: 'card', x: 676, y: 27, w: wFit(16, 18, inventorPhoto.ratio), r: -3, in: 'pop', at: .3, z: 4 },
      { a: 'holder', fx: 'card', x: 724, y: 27, w: wFit(16, 18, holderLogo.ratio), r: 3, in: 'pop', at: .6, z: 5 }] : []),
    ...(holderLogo && !inventorPhoto ? [{ a: 'holder', fx: 'card', x: 700, y: 27, w: wFit(28, 24, holderLogo.ratio), r: 0, in: 'pop', at: .6, z: 5 }] : []),
    ...(inventorPhoto && !holderLogo ? [{ a: 'inventor', fx: 'card', x: 700, y: 27, w: wFit(24, 24, inventorPhoto.ratio), r: 0, in: 'pop', at: .3, z: 4 }] : []),
    { k: 'deco', type: 'sparkle', x: 734, y: 14, w: 4, c: 'accent', clean: 1, spin: 90, spinD: 5, at: .8, z: 6 }
  ], [
    { t: lab('WHO MADE IT'), s: 'ml', x: 700, y: LABEL_Y, fs: 1.5, in: 'fade' },
    { t: (inventors.slice(0, 3).join(', ') + (inventors.length > 3 ? ' et al.' : '')) || 'Inventors not listed', s: 'mt', x: 700, y: 42, fs: 2.4, mw: 56, stag: .03, in: 'fade' },
    { t: assignee ? 'Holder: ' + assignee : '', s: 'tg', x: 700, y: 50, fs: 1.2, at: 1.2 }
  ]);

  blk('numbers');
  // 8 — NUMBERS: three white cards with the real counts, icons drawn on. Centred on x 800.
  const stats = [];
  if (claimsTotal) stats.push({ v: claimsTotal, l: 'CLAIMS IN THE FILING' });
  if (inventors.length) stats.push({ v: inventors.length, l: inventors.length > 1 ? 'INVENTORS' : 'INVENTOR' });
  if (fy && gy && +gy > +fy) stats.push({ v: +gy - +fy, l: 'YEARS TO GRANT' });
  if (stats.length) {
    const xs = stats.length === 3 ? [772, 800, 828] : stats.length === 2 ? [786, 814] : [800];
    const icons = ['doc', 'bulb', 'cal'], layers = [];
    stats.forEach((st, i) => {
      const x = xs[i];
      layers.push({ k: 'deco', type: 'cardv', x, y: 31, w: 22, shadow: 1, in: 'pop', at: .2 + i * .2, z: 3 });
      layers.push({ k: 'deco', type: 'underline', x, y: 29.8, w: 9, c: 'accent', clean: 1, draw: 1, dd: .6, at: .9 + i * .2, z: 5 });
      layers.push({ k: 'deco', type: icons[i], x, y: 42, w: 4.4, c: 'ink', clean: 1, draw: 1, dd: .8, at: 1.2 + i * .2, z: 5 });
    });
    add(N.numbers, cam(800, 1, 'arc'), layers, [
      { t: lab('BY THE NUMBERS'), s: 'tg', x: 800, y: LABEL_Y, fs: 1.6, in: 'fade' },
      ...stats.flatMap((st, i) => [
        { t: '0', s: 'ms', x: xs[i], y: 24.5, fs: 9.5, c: CARD_INK, count: { to: st.v, d: 1.4 }, in: 'fade', at: .4 + i * .25, z: 6 },
        { t: st.l, s: 'ml', x: xs[i], y: 34.5, fs: 1.15, mw: 20, c: CARD_INK, in: 'fade', at: .7 + i * .25, z: 6 }
      ])
    ]);
  }

  blk('closing');
  // 9 — CLOSE. The layout adapts to what was found:
  //  • holder logo and/or inventor photo found → link card on the left, product in the middle,
  //    the photos stacked on the right. Everything fits the 100-wide view around the camera (x 920 → 870–970).
  //  • neither found → the card is centred with larger text and the product sticker peeks out of
  //    its corner, so the frame never looks half-empty.
  // Everything stays inside the visible band (y ≈ 3–59).
  const subLine = [assignee || (inventors[0] ? 'Inventor: ' + inventors[0] : ''), number].filter(Boolean).join(' · ');
  if (holderLogo || inventorPhoto) {
    const photoLayers = [];
    if (inventorPhoto) photoLayers.push({ a: 'inventor', fx: 'card', x: 962, y: 17, w: wFit(9, 11, inventorPhoto.ratio), r: -4, in: 'pop', at: 1.0, z: 6 });
    if (holderLogo) photoLayers.push({ a: 'holder', fx: 'card', x: 960, y: 43, w: wFit(12, 11, holderLogo.ratio), r: 5, in: 'pop', at: 1.2, z: 6 });
    const hero = P2 ? { id: P2.id, ratio: P2.ratio } : P4 ? { id: P4.id, ratio: P4.ratio } : null;
    add(N.closing, cam(920, 1, 'zoom'), [
      blob(942, 31, 36, 'hi', { spin: 20, spinD: 35 }),
      { k: 'deco', type: 'cardh', x: 899, y: 31, w: 50, shadow: 1, in: 'pop', at: .2, z: 3 },
      { k: 'deco', type: 'sparkle', x: 882, y: 14, w: 4, c: 'accent', clean: 1, spin: 90, spinD: 5, at: .6, z: 6 },
      { k: 'deco', type: 'sparkle', x: 950, y: 52, w: 3.5, c: 'ink', clean: 1, spin: -90, spinD: 5, at: 1.1, z: 6 },
      ...(hero ? [{ a: hero.id, fx: 'sticker', x: 942, y: 31, w: wFit(22, 20, hero.ratio), in: 'pop', at: .5, z: 5 }] : []),
      ...photoLayers
    ], [
      { t: 'FULL PATENT LINKED BELOW', s: 'mt', x: 880, y: 21, fs: 2.4, mw: 38, al: 'l', stag: .03, at: .4, c: CARD_INK },
      { t: subLine, s: 'tg', x: 880, y: 30, fs: 1.2, al: 'l', at: 1, c: CARD_INK },
      { t: 'Educational summary — not legal advice', s: 'mb', x: 880, y: 40, fs: 1.1, mw: 38, al: 'l', at: 1.5, c: CARD_INK }
    ]);
  } else {
    add(N.closing, cam(900, 1, 'zoom'), [
      blob(900, 30, 54, 'hi', { spin: 20, spinD: 35 }),
      { k: 'deco', type: 'cardh', x: 900, y: 31, w: 52, shadow: 1, in: 'pop', at: .2, z: 3 },
      { k: 'deco', type: 'sparkle', x: 868, y: 14, w: 4, c: 'accent', clean: 1, spin: 90, spinD: 5, at: .6, z: 6 },
      { k: 'deco', type: 'sparkle', x: 934, y: 48, w: 3.5, c: 'ink', clean: 1, spin: -90, spinD: 5, at: 1.1, z: 6 },
      ...(P2 ? [{ a: P2.id, fx: 'sticker', x: 936, y: 15, w: wFit(13, 15, P2.ratio), r: 8, in: 'pop', at: .5, z: 5 }] : [])
    ], [
      { t: 'FULL PATENT LINKED BELOW', s: 'mt', x: 900, y: 21, fs: 2.6, mw: 44, stag: .03, at: .4, c: CARD_INK },
      { t: subLine, s: 'tg', x: 900, y: 30, fs: 1.4, at: 1, c: CARD_INK },
      { t: 'Educational summary — not legal advice', s: 'mb', x: 900, y: 38, fs: 1.3, mw: 44, at: 1.5, c: CARD_INK }
    ]);
  }

  const ORDER = {
    how: ['hook', 'problem', 'invention', 'blueprint', 'steps', 'momentum', 'numbers', 'closing'],
    why: ['hook', 'problem', 'momentum', 'steps', 'invention', 'blueprint', 'numbers', 'closing'],
    who: ['hook', 'people', 'blueprint', 'invention', 'numbers', 'closing'],
    balanced: ['hook', 'problem', 'invention', 'blueprint', 'steps', 'momentum', 'people', 'numbers', 'closing']
  };
  const S2 = (ORDER[focusKey] || ORDER.balanced).flatMap(k => B[k] || []);
  for (const sc of S2) sc.text = sc.text.filter(x => x.t);
  let ln = 0;
  for (const sc of S2) for (const x of sc.text) if (/^0\d — /.test(x.t)) x.t = `0${++ln} — ${x.t.replace(/^0\d — /, '')}`;
  const P0 = COLOR_PAL;
  for (const sc of S2) {
    const bl = (sc.layers || []).find(l => l.k === 'deco' && l.type === 'blob');
    const under = bl && P0[bl.c] ? P0[bl.c] : P0.stage;
    for (const x of sc.text) {
      const bg = x.s === 'tg' ? P0.hi : under;   // a 'tg' tag has its own yellow block
      if (!x.c) x.c = contrastOf(P0.ink, bg) >= contrastOf(CARD_INK, bg) ? P0.ink : CARD_INK;
    }
  }
  return S2;
}

// ---------- files / engine output ----------
let SLUG = '';
const dirOf = () => path.join(ROOT, 'projects', SLUG);
function emit(P) {
  fs.writeFileSync(path.join(dirOf(), 'project.js'), 'window.PROJECT = ' + JSON.stringify(P, null, 1) + ';\n');
  const gsap = fs.readFileSync(path.join(ROOT, 'engine', 'vendor', 'gsap.min.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'engine', 'index.html'), 'utf8')
    .replace('<script src="vendor/gsap.min.js"></script>', () => `<script>${gsap}</script>`)
    .replace('<script>\n(async', () => '<script>window.VOX_BASE="./";</script>\n<script>\n(async');
  fs.writeFileSync(path.join(dirOf(), 'video.html'), html);
  return pathToFileURL(path.join(dirOf(), 'video.html')).href;
}
const openUrl = url => exec(`${process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'} "${url}"`, () => {});
// Opens a local file (like the PDF) with the system's default app, using the plain file path.
// A file:// URL is fine for the HTML video (it opens in the browser) but is unreliable for PDFs
// on some systems, so the PDF goes through the real path instead.
const openPath = p => exec(`${process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'} "${p}"`, e => {
  if (e) console.log(warn(`  Could not auto-open the PDF (${e.message.split('\n')[0]}). Open it manually: ${p}`));
});

// ---------- infographic PDF (Groq for text, Playwright for the render) ----------
function svgChart(data, type, title, pal) {
  pal = pal || { accent: '#e8452c', ink: '#1b1a17' };
  const d = (data || []).filter(x => x && Number.isFinite(x.v)).slice(0, 10);
  if (!d.length) return '';
  const VW = 1000, VH = 340, L0 = 70, TOP = 56, BOT = 50, CW = VW - 2 * L0, CH = VH - TOP - BOT;
  const n = d.length, mx = Math.max(...d.map(x => x.v), 1);
  let s = `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">`;
  s += `<text x="${L0}" y="30" style="font:700 20px Georgia,serif;fill:${pal.ink}">${esc(title)}</text>`;
  if (type === 'line' && n > 1) {
    const pts = d.map((x, i) => [L0 + i / (n - 1) * CW, TOP + CH - x.v / mx * CH]);
    s += `<path d="M${pts.map(p => p.join(',')).join('L')}" fill="none" stroke="${pal.accent}" stroke-width="4"/>`;
    pts.forEach(p => s += `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${pal.ink}"/>`);
    s += `<text x="${L0}" y="${VH - BOT + 28}" style="font:13px Georgia;fill:${pal.ink}">${esc(d[0]?.l)}</text><text x="${VW - L0}" y="${VH - BOT + 28}" text-anchor="end" style="font:13px Georgia;fill:${pal.ink}">${esc(d[n - 1]?.l)}</text>`;
  } else {
    const bw = CW / n * .6;
    d.forEach((x, i) => { const cx = L0 + (i + .5) * CW / n, h = x.v / mx * CH, y = TOP + CH - h;
      s += `<rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="${h}" fill="${pal.accent}"/><text x="${cx}" y="${y - 8}" text-anchor="middle" style="font:700 15px Georgia;fill:${pal.ink}">${x.v}</text><text x="${cx}" y="${VH - BOT + 24}" text-anchor="middle" style="font:12px Georgia;fill:${pal.ink}">${esc(String(x.l).slice(0, 14))}</text>`; });
  }
  return s + '</svg>';
}
let groqModel = null;
async function groqPickModel() {
  // Groq retires models over time. Ask the key which chat models it can use, prefer a small Llama.
  try {
    const r = await retryFetch('https://api.groq.com/openai/v1/models', { headers: { authorization: `Bearer ${GROQ_KEY}` } });
    const ids = ((await r.json()).data || []).map(m => m.id).filter(id => !/whisper|guard|tts|embed|vision|orpheus/i.test(id));
    return ids.find(id => /llama/i.test(id) && /8b/i.test(id)) || ids.find(id => /llama/i.test(id)) || ids[0] || null;
  } catch { return null; }
}
async function groq(system, user) {
  if (!GROQ_KEY) return null;
  let model = groqModel || GROQ_MODEL;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await retryFetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({ model, temperature: 0.5, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
      });
      const j = await r.json();
      if (!r.ok) {
        const msg = j.error?.message || `HTTP ${r.status}`;
        if (attempt === 0 && /model|not found|decommission|deprecat|access/i.test(msg)) {
          const alt = await groqPickModel();
          if (alt && alt !== model) { console.log(dim(`(Groq: "${model}" not available to this key, using "${alt}") `)); model = groqModel = alt; continue; }
        }
        throw new Error(msg);
      }
      return JSON.parse(j.choices[0].message.content);
    } catch (e) {
      if (attempt === 1 || !/model/i.test(e.message)) { console.log(warn(`  Groq skipped (model "${model}": ${e.message})`)); return null; }
    }
  }
  return null;
}
function buildInfographicHtml(d) {
  const pal = d.palette || { paper: '#f2ead8', ink: '#1b1a17', accent: '#e8452c', hi: '#ffd23f', sky: '#9fd0ff', mint: '#a8e6cf', lilac: '#cdbdff' };
  const cardBg = '#fffdf5';
  const cardShadow = '0 6px 18px rgba(0,0,0,.18)';
  const mutedText = '#5a5248';
  const page = body => `<section class="pg">${body}</section>`;
  const bullets = (arr) => `<ul>${(arr || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>`;
  const img = (src, style) => src ? `<img src="${esc(src)}" style="${style}" />` : '';
  const blob = (c, x, y, w) => `<svg style="position:absolute;left:${x}px;top:${y}px;z-index:0;pointer-events:none" width="${w}" height="${w}" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="${c}" opacity="0.5"/></svg>`;

  const css = `
  <style>
  @page{size:1280px 720px;margin:0}
  *{box-sizing:border-box}
  body{margin:0;font-family:Georgia,'Times New Roman',serif;color:${pal.ink}}
  .pg{width:1280px;height:720px;padding:64px 72px;page-break-after:always;position:relative;overflow:hidden;
      background:${pal.paper};background-image:radial-gradient(rgba(0,0,0,.07) 1.5px,transparent 2px);background-size:20px 20px}
  .pg:last-child{page-break-after:avoid}
  .pg > *{position:relative;z-index:1}
  .kicker{font:700 16px/1 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:${pal.accent};margin-bottom:10px}
  h1{font-size:46px;margin:0 0 14px;line-height:1.08}
  h2{font:700 24px Arial,sans-serif;background:${pal.ink};color:${pal.paper};display:inline-block;padding:8px 16px;margin:0 0 20px}
  .meta{font:14px Arial,sans-serif;color:${mutedText};margin-bottom:28px}
  ul{font-size:20px;line-height:1.5;padding-left:24px}
  li{margin-bottom:10px}
  .cols{display:flex;gap:48px}
  .col{flex:1}
  .card{background:${cardBg};box-shadow:${cardShadow};padding:24px 28px;margin-bottom:16px;border-radius:6px}
  .statrow{display:flex;gap:40px;margin:24px 0}
  .sbox{text-align:center}
  .sbox b{display:block;font:700 40px Arial,sans-serif;color:${pal.ink}}
  .sbox span{font:13px Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:${mutedText}}
  .footer{position:absolute;bottom:40px;left:72px;right:72px;font:13px Arial,sans-serif;color:${mutedText};border-top:2px solid ${pal.ink};padding-top:10px}
  .stamp{position:absolute;top:60px;right:72px;border:3px solid ${pal.accent};color:${pal.accent};padding:8px 16px;transform:rotate(6deg);font:700 14px Arial,sans-serif;text-transform:uppercase}
  .hero{position:absolute;top:54px;right:72px;width:300px;height:380px;border-radius:12px;overflow:hidden;background:${cardBg};box-shadow:${cardShadow};display:flex;align-items:center;justify-content:center}
  .corner{position:absolute;width:200px;height:200px;border-radius:12px;overflow:hidden;background:${cardBg};box-shadow:${cardShadow};display:flex;align-items:center;justify-content:center}
  </style>`;

  const p1 = page(`
    ${blob(pal.sky, 900, -60, 420)}
    ${blob(pal.hi, -80, 520, 300)}
    <div class="kicker">Patent explainer</div>
    <h1 style="max-width:${d.heroImage ? 700 : 900}px">${esc(d.title)}</h1>
    <div class="meta">${esc(d.number)} ${d.assignee ? '· ' + esc(d.assignee) : ''} ${d.filingDate ? '· filed ' + esc(d.filingDate) : ''}</div>
    <div class="card" style="max-width:${d.heroImage ? 620 : 820}px;font-size:22px;line-height:1.5">${esc(d.oneLiner)}</div>
    <div class="statrow">
      <div class="sbox"><b>${d.claimsTotal}</b><span>Claims filed</span></div>
      <div class="sbox"><b>${d.inventors.length || '—'}</b><span>Inventors</span></div>
      <div class="sbox"><b>${esc((d.grantDate || d.filingDate || '').slice(0, 4) || '—')}</b><span>${d.grantDate ? 'Granted' : 'Filed'}</span></div>
    </div>
    ${d.heroImage ? `<div class="hero">${img(d.heroImage, 'max-width:86%;max-height:86%;object-fit:contain')}</div>` : ''}
    <div class="footer">Generated from SerpApi Google Patents data — not legal advice. Full patent: ${esc(d.link)}</div>`);

  const p2 = page(`
    ${blob(pal.mint, 1040, 420, 260)}
    <h2>The problem</h2>
    <p style="font-size:20px;line-height:1.6;max-width:640px">${esc(d.problem)}</p>
    <div class="cols" style="margin-top:28px">
      <div class="col">
        <h2 style="margin-top:0">How it works</h2>
        ${bullets(d.howItWorks)}
      </div>
      ${d.drawingImage ? `<div class="col card" style="display:flex;align-items:center;justify-content:center">${img(d.drawingImage, 'max-width:100%;max-height:320px;object-fit:contain')}</div>` : ''}
    </div>
    <div class="stamp">Patent ${esc(d.number)}</div>`);

  const chartSvg = svgChart(d.trends, d.chartType || 'line', 'Search interest over time', pal);
  const p3 = page(`
    ${blob(pal.lilac, -100, -80, 320)}
    <h2>Why it matters</h2>
    ${bullets(d.whyItMatters)}
    <div class="card" style="margin-top:20px;max-width:900px">
      ${chartSvg || `<p style="font-size:16px;color:${mutedText};margin:0">No search-interest data available for this topic.</p>`}
    </div>
    ${d.secondImage ? `<div class="corner" style="bottom:60px;right:72px">${img(d.secondImage, 'max-width:80%;max-height:80%;object-fit:contain')}</div>` : ''}`);

  const p4 = page(`
    ${blob(pal.sky, 980, 480, 260)}
    <h2>Inventors & filing</h2>
    <div class="cols">
      <div class="col card" style="display:flex;gap:18px;align-items:flex-start">
        ${d.holderImage ? `<img src="${esc(d.holderImage)}" style="width:64px;height:64px;object-fit:contain;flex:none" />` : ''}
        ${d.inventorImage ? `<img src="${esc(d.inventorImage)}" style="width:64px;height:64px;object-fit:cover;border-radius:50%;flex:none" />` : ''}
        <div>
          <b>Inventors</b><br>${esc(d.inventorsLine || 'Not disclosed')}<br><br>
          <b>Assignee</b><br>${esc(d.assignee || (d.inventors[0] ? 'Inventor: ' + d.inventors[0] : '—'))}<br><br>
          <b>Country / type</b><br>${esc(d.country)} ${esc(d.type)}
        </div>
      </div>
      <div class="col card">
        <b>Filed</b> ${esc(d.filingDate || '—')}<br>
        <b>Granted</b> ${esc(d.grantDate || '—')}<br><br>
        <b>Built with SerpApi</b><br>
        <ul style="font-size:15px">${d.serpLog.map(c => `<li>${esc(c.engine)} — ${esc(c.summary)}</li>`).join('')}</ul>
      </div>
    </div>
    <div class="footer">${esc(d.link)}</div>`);

  return `<!doctype html><html><head><meta charset="utf-8">${css}</head><body>${p1}${p2}${p3}${p4}</body></html>`;
}

async function buildPdf(facts) {
  console.log(dim('\n  📄 writing the infographic PDF...'));
  const groqData = await groq(
    'You write a plain-language patent infographic. Return ONLY JSON: {"oneLiner":"<=20 words","problem":"2-3 plain sentences","howItWorks":["4-6 short bullets"],"whyItMatters":["3 short bullets"]}. Use ONLY the given facts. No invented numbers or legal claims.',
    JSON.stringify({ title: facts.title, abstract: facts.abstract, claims: facts.claims, searchSnippet: facts.explainer }));
  const d = {
    ...facts,
    oneLiner: groqData?.oneLiner || facts.narr0 || facts.title,
    problem: groqData?.problem || facts.problemText || facts.abstract.slice(0, 220),
    howItWorks: groqData?.howItWorks?.length ? groqData.howItWorks : facts.steps,
    whyItMatters: groqData?.whyItMatters?.length ? groqData.whyItMatters : ['See the full patent for complete claims and scope.'],
    inventorsLine: facts.inventors.join(', ')
  };
  const htmlPath = path.join(dirOf(), 'infographic.html');
  fs.writeFileSync(htmlPath, buildInfographicHtml(d));
  const pdfPath = path.join(dirOf(), `${SLUG}-infographic.pdf`);
  const pdfScript = path.join(ROOT, 'cli', 'pdf.py');
  if (!fs.existsSync(pdfScript)) console.log(warn(`  cli/pdf.py not found at ${pdfScript}. Save it there (see setup notes), then re-run.`));
  const r = fs.existsSync(pdfScript) ? runPython([pdfScript, htmlPath, pdfPath]) : { status: 1 };
  if (r.status === 0 && fs.existsSync(pdfPath)) { console.log(ok(`  PDF ready: projects/${SLUG}/${SLUG}-infographic.pdf`)); openPath(pdfPath); }
  else console.log(warn(`  PDF render skipped. Run manually: python3 cli/pdf.py "${htmlPath}" "${pdfPath}"`));
}

// ---------- main ----------
banner();
const q0 = await ask(bold('\nPatent number or keyword (e.g. "US11734097B1" or "retrieval augmented generation"):'));
if (!q0) process.exit(0);

const normNum = s => String(s).replace(/[\s,.\-\/]/g, '');
const isNum = s => /^[A-Z]{2}\d{6,}[A-Z0-9]*$/i.test(normNum(s));

// ---------- finding the patent: web search first, then Groq, then Google Patents ----------
// Why web first: a famous old patent often has an unexpected title (Bell's telephone patent is not
// called "telephone"), so a keyword search on Google Patents can't find it, and Groq alone can't be
// trusted to recall exact numbers. A normal web search does know which patent people mean, and its
// snippets often name the patent number or title. Flow for a keyword search:
//   1. Google web search "{words} {inventor} patent"            (1 SerpApi call)
//   2. a patent number is pulled out of the results by pattern (no AI, nothing can be made up)
//   3. Groq reads the web results and writes ONE patent-style query using the real wording found
//   4. Google Patents is searched at most TWICE in total (see findCandidates for how the two are used);
//      a number found on the web is confirmed by one of those two searches and goes to the top, marked with a star.
const patKey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[A-Z]\d?$/, ''); // US11734097B1 -> US11734097
const resultKey = r => { const id = patentIdFrom(r); return patKey(id.split('/')[1] || id); };

// Pulls patent numbers out of plain text: Google Patents links, "Patent No. 174,465", "US174465A".
function extractPatentNumbers(text) {
  const found = [];
  const add = s => {
    const n = String(s).replace(/[,\s.]/g, '').toUpperCase();
    const full = /^[A-Z]{2}/.test(n) ? n : 'US' + n;
    if (/^[A-Z]{2}\d{5,}[A-Z0-9]*$/.test(full) && !found.includes(full)) found.push(full);
  };
  for (const m of text.matchAll(/patents\.google\.com\/patent\/([A-Z]{2}\d{5,}[A-Z0-9]*)/gi)) add(m[1]);
  for (const m of text.matchAll(/\b(?:U\.?S\.?\s*)?Pat(?:ent)?\.?\s*(?:No\.?|Number|#)?\s*(\d{1,2}(?:,\d{3}){1,2}|\d{6,8})\b/gi)) add(m[1]);
  for (const m of text.matchAll(/\bUS\s?(\d{1,2}(?:,\d{3}){1,2}|\d{6,8}[A-Z]\d?)\b/g)) add(m[1]);
  return found.slice(0, 2);
}
// The inventor goes into the web query as plain words (not a strict filter), so old records
// with missing inventor data don't cause a miss.
async function webPatentHints(q, inventor = '') {
  const query = `${q} ${inventor} patent`.replace(/\s+/g, ' ').trim();
  const l = logCall('google', query);
  try {
    const j = await serp({ engine: 'google', q: query });
    const items = (j.organic_results || []).slice(0, 8).map(r => ({ title: r.title || '', snippet: r.snippet || '', link: r.link || '' }));
    const text = [j.answer_box?.snippet || '', ...items.map(x => `${x.title} ${x.snippet} ${x.link}`)].join('\n');
    const nums = extractPatentNumbers(text);
    l.done(`${items.length} results, ${nums.length} patent number${nums.length === 1 ? '' : 's'} spotted`);
    return { items, nums };
  } catch (e) { l.fail(e.message); return { items: [], nums: [] }; }
}
// Groq reads the web results and writes ONE patent-style query (3-8 words), using the real
// title/wording found there when the results reveal it. Returns [] if Groq is missing or fails.
async function expandQueries(q, inventor = '', webItems = []) {
  const g = await groq(
    'You help find a specific patent on Google Patents. The user typed a product name, brand, title or rough description. You may also get web search results about it. Return ONLY JSON: {"queries":["..."]} with exactly 1 search query (3-8 words) using the wording a patent would use. If the web results reveal the real title or wording of the patent (an old patent can have a very different title from the common name), base the query on that wording; otherwise use technical wording (e.g. "wearable finger biometric sensor ring" instead of a brand name). If a company is named, include it. Do NOT put the inventor name in the query (it is applied as a separate filter). Never invent patent numbers.',
    JSON.stringify({ input: q, inventor: inventor || undefined,
      webResults: webItems.slice(0, 6).map(x => ({ title: x.title.slice(0, 120), snippet: x.snippet.slice(0, 220) })) }));
  const qs = (g?.queries || []).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, 100));
  return [...new Set(qs)].filter(x => x.toLowerCase() !== q.toLowerCase()).slice(0, 1);
}
async function findCandidates(q, inventor = '') {
  const web = await webPatentHints(q, inventor);
  const alt = (await expandQueries(q, inventor, web.items))[0] || '';
  if (alt) console.log(dim(`  ✎ also searching: ${alt}`));
  // HARD CAP: at most TWO Google Patents searches per round, however they are split.
  //  • a patent number was spotted on the web: search 1 = that number (confirms it), search 2 = Groq's
  //    query (or your own words if Groq gave none), narrowed by the inventor if you gave one
  //  • no number spotted: search 1 = your words, narrowed by the inventor; search 2 = Groq's query,
  //    NOT narrowed (with the inventor's name added as a keyword) — so a filter that wrongly
  //    excludes an old record can't leave you with nothing
  const plan = [];
  if (web.nums[0]) {
    plan.push({ q: web.nums[0], inv: '', num: true });
    plan.push({ q: alt || q, inv: inventor });
  } else {
    plan.push({ q, inv: inventor });
    if (alt) plan.push({ q: inventor ? `${alt} ${inventor}` : alt, inv: '' });
  }
  const lists = [], hinted = [];
  for (const p of plan.slice(0, 2)) {
    let rs = [];
    try { rs = await searchPatents(p.q, p.inv); } catch { /* already logged */ }
    if (p.num) {
      // keep only a result that really is the number from the web (unconfirmed numbers are dropped)
      const m = rs.find(r => resultKey(r) === patKey(p.q) || patKey(r.publication_number || r.patent_number) === patKey(p.q));
      if (m) { m.__web = true; hinted.push(m); }
    } else lists.push(rs);
  }
  // confirmed web find first, then each search's best hits interleaved, de-duplicated
  const seen = new Set(), out = [];
  for (const r of hinted) { const k = resultKey(r); if (k && !seen.has(k)) { seen.add(k); out.push(r); } }
  for (let i = 0; i < 6; i++) for (const l of lists) {
    const r = l[i]; if (!r) continue;
    const k = resultKey(r);
    if (k && !seen.has(k)) { seen.add(k); out.push(r); }
  }
  return out.slice(0, 10);
}

let chosen, patentId, det, query = q0;
for (;;) {
  if (isNum(query)) {
    // a patent number goes straight to the patent search, no web search or Groq involved
    const nq = normNum(query);
    let results = [];
    try { results = await searchPatents(nq); } catch {}
    const m = results.find(r => (r.patent_number || r.publication_number || '').replace(/\D/g, '') === nq.replace(/\D/g, '')) || results[0];
    if (m) {
      try { det = await patentDetails(patentIdFrom(m)); chosen = m; patentId = patentIdFrom(m); break; }
      catch { console.log(warn('Could not load that patent.')); }
    } else console.log(warn('No matching patent found for that number.'));
  } else {
    // Optional: if the user knows who invented it, that narrows the search a lot. Enter skips it.
    const inventorQ = await ask(bold('Inventor name, if you know it (press Enter to skip):'));
    const results = await findCandidates(query, inventorQ);
    if (!results.length) console.log(warn('No patents found for that search.'));
    const opts = results.map(r => ({
      label: `${r.title || '(untitled)'}`,
      note: `${r.__web ? '★ found via web search  ·  ' : ''}${r.assignee || r.inventor || ''}  ·  ${r.publication_number || r.patent_number || ''}  ·  ${r.filing_date || r.priority_date || ''}`
    }));
    opts.push({ label: 'None of these — search again', note: 'type different words or a patent number' });
    let picked = false;
    while (!picked) {
      const i = await pick('Pick a patent for the video:', opts);
      if (i >= results.length) break;
      try { det = await patentDetails(patentIdFrom(results[i])); chosen = results[i]; patentId = patentIdFrom(chosen); picked = true; }
      catch { console.log(warn('Could not load that one, pick another.')); }
    }
    if (picked) break;
  }
  query = await ask(bold('New search (words or patent number):'));
  if (!query) process.exit(0);
}

const title = det.title || chosen.title || 'Untitled patent';
const number = det.publication_number || chosen.publication_number || chosen.patent_number || patentId.split('/')[1] || '';
const assignee = det.assignee || chosen.assignee || '';
const inventors = (det.inventors || []).map(i => i.name || i).filter(Boolean);
const filingDate = det.filing_date || chosen.filing_date || '';
const grantDate = det.grant_date || chosen.grant_date || '';
const country = det.country || '';
const ptype = det.type || '';
const abstract = det.abstract || chosen.snippet || '';
const claimsTotal = (det.claims || []).length;
const claims = (det.claims || []).slice(0, 4).map(c => (typeof c === 'string' ? c : c.text || '')).filter(Boolean);
const link = det.google_patents_details_url || chosen.patent_link || `https://patents.google.com/patent/${number}`;
const patentImages = (det.images || []).slice(0, 2);

SLUG = slugify(`${number || title}`);
fs.mkdirSync(path.join(dirOf(), 'assets'), { recursive: true });
fs.writeFileSync(path.join(dirOf(), 'source.json'), JSON.stringify({ title, number, assignee, inventors, filingDate, grantDate, country, ptype, abstract, claims, claimsTotal, link, patentImages, fetchedAt: new Date().toISOString() }, null, 1));

console.log(`\n${bold(title)}\n${dim(number + (assignee ? '  ·  ' + assignee : '') + (filingDate ? '  ·  filed ' + filingDate : ''))}`);

// drawings — the patent's own figures (used for the blueprint scene). The white page background is
// removed with cli/cutout.py (plain-background flood fill — rembg would damage thin line art).
const drawings = [], A = {};
for (let i = 0; i < patentImages.length; i++) {
  try {
    process.stdout.write(dim(`  🖼  downloading patent drawing ${i + 1}/${patentImages.length}... `));
    const rawExt = path.extname(new URL(patentImages[i]).pathname) || '.png';
    const raw = path.join(dirOf(), 'assets', `drawing-${i + 1}-raw${rawExt}`);
    const png = path.join(dirOf(), 'assets', `drawing-${i + 1}.png`);
    await downloadImage(patentImages[i], raw);
    let file = path.basename(raw), cut = false, ratio;
    const cr = pyCutout(raw, png, false);
    if (cr?.ok && fs.existsSync(png)) { file = path.basename(png); cut = true; ratio = +(cr.w / cr.h).toFixed(3); }
    else { const info = pngInfo(raw); ratio = info ? +(info.w / info.h).toFixed(3) : 1.3; }
    A[`d${i + 1}`] = { file, label: `Patent drawing ${i + 1}`, kind: cut ? 'cutout' : 'photo', ratio, fromPatent: true, tint: false };
    drawings.push({ id: `d${i + 1}`, ratio, cut });
    console.log(ok(cut ? 'ok, background removed' : 'ok (background kept)'));
  } catch (e) { console.log(warn('skipped (' + e.message + ')')); }
}

const focusQ = await pick('What should the video focus on?', [
  { label: 'How it works', note: 'the mechanism, step by step' },
  { label: 'Why it matters', note: 'the problem it solves, market context' },
  { label: 'Who made it', note: 'inventors, assignee, filing story' },
  { label: 'Balanced mix', note: 'a bit of everything' }
]);
const focus = ['how it works', 'why it matters and the problem it solves', 'the inventors and filing story', 'a balanced mix of mechanism, motivation and people'][focusQ];
const theme = 'light'; // light mode only
const vo = await pick('Voiceover', [{ label: 'Yes, narrated (Gemini TTS) + subtitles' }, { label: 'No, silent — subtitles only' }]);
const voice = vo === 0;

// All palettes are light (paper) backgrounds with a dark ink. "Custom" must stay LAST in this list.
const COLOR_PRESETS = [
  { label: 'Sunny', note: 'cream paper, coral and butter yellow',
    pal: { paper: '#fbf5e9', stage: '#fbf5e9', ink: '#1d1b2e', accent: '#ff5b3a', hi: '#ffd23f', sky: '#9fd0ff', mint: '#a8e6cf', lilac: '#cdbdff' } },
  { label: 'Ocean', note: 'soft blue paper, coral and sun',
    pal: { paper: '#f1f7fb', stage: '#f1f7fb', ink: '#10243e', accent: '#ff6f4f', hi: '#ffd166', sky: '#8fd3ff', mint: '#9ff0d8', lilac: '#b9c4ff' } },
  { label: 'Berry', note: 'blush paper, raspberry and lilac',
    pal: { paper: '#fdf3f6', stage: '#fdf3f6', ink: '#2a1630', accent: '#f2446d', hi: '#ffe066', sky: '#a6c8ff', mint: '#b5f0d0', lilac: '#d7b8ff' } },
  { label: 'Peach', note: 'warm peach paper, burnt orange and honey',
    pal: { paper: '#fff1e6', stage: '#fff1e6', ink: '#2b1a14', accent: '#e8590c', hi: '#ffc857', sky: '#9ad0f5', mint: '#b8e6c8', lilac: '#d8c3f5' } },
  { label: 'Forest', note: 'sage paper, deep green ink, terracotta accent',
    pal: { paper: '#f1f5ec', stage: '#f1f5ec', ink: '#14301f', accent: '#e76f51', hi: '#f4d35e', sky: '#a8d8ea', mint: '#b7e4c7', lilac: '#d0c4f0' } },
  { label: 'Lavender', note: 'pale violet paper, electric purple and lemon',
    pal: { paper: '#f6f2fd', stage: '#f6f2fd', ink: '#241a3d', accent: '#7c4dff', hi: '#ffe08a', sky: '#a5d8ff', mint: '#b2f2d5', lilac: '#d0bfff' } },
  { label: 'Mint', note: 'fresh mint paper, watermelon red and sun',
    pal: { paper: '#effaf5', stage: '#effaf5', ink: '#0f2e2a', accent: '#ff6b6b', hi: '#ffe066', sky: '#a0d8ef', mint: '#96e6c0', lilac: '#cbb8ff' } },
  { label: 'Citrus', note: 'lemon-cream paper, tangerine and lime',
    pal: { paper: '#fffbea', stage: '#fffbea', ink: '#262210', accent: '#f76707', hi: '#ffe03d', sky: '#99d9ff', mint: '#b5eab0', lilac: '#e0c3fc' } },
  { label: 'Terracotta', note: 'sand paper, clay red and mustard',
    pal: { paper: '#f7efe6', stage: '#f7efe6', ink: '#33211a', accent: '#c8553d', hi: '#f2c14e', sky: '#9cc5d8', mint: '#a9d6b8', lilac: '#cdb4db' } },
  { label: 'Slate', note: 'cool grey paper, signal red and amber',
    pal: { paper: '#f3f4f6', stage: '#f3f4f6', ink: '#111827', accent: '#ef4444', hi: '#fcd34d', sky: '#93c5fd', mint: '#86efac', lilac: '#c4b5fd' } },
  { label: 'Custom', note: 'choose the accent, highlight and paper colours' }
];
const colorQ = await pick('Colours', COLOR_PRESETS.map(p => ({ label: p.label, note: p.note })));
const hexOk = v => /^#?[0-9a-f]{6}$/i.test(v) ? (v[0] === '#' ? v : '#' + v) : null;
async function askHex(label, d) {
  for (;;) { const v = hexOk((await ask(`${label} (hex)`, d)).trim()); if (v) return v; console.log(warn('Use a 6-digit hex colour, e.g. #ff5b3a.')); }
}
// ---------- contrast guard ----------
// Whatever colours end up in the palette (a preset's or hand-typed hex), the body text colour and
// the accent colour must actually read against the page background. This nudges them toward
// black/white (WCAG relative-luminance contrast) so a light "paper" paired with a light "ink"
// can't slip through and render invisible text in the video or the PDF.
const hexToRgb = hex => { const c = hex.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; };
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const relLum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrastOf = (a, b) => { const L1 = relLum(hexToRgb(a)) + 0.05, L2 = relLum(hexToRgb(b)) + 0.05; return L1 > L2 ? L1 / L2 : L2 / L1; };
function ensureContrast(hex, bgHex, min = 4.5) {
  if (contrastOf(hex, bgHex) >= min) return hex;
  const target = relLum(hexToRgb(bgHex)) > 0.5 ? '#14120f' : '#faf6ea'; // near-black / near-cream
  const [r, g, b] = hexToRgb(hex), [tr, tg, tb] = hexToRgb(target);
  for (let i = 1; i <= 10; i++) {
    const f = i / 10, mix = rgbToHex([r + (tr - r) * f, g + (tg - g) * f, b + (tb - b) * f]);
    if (contrastOf(mix, bgHex) >= min) return mix;
  }
  return target;
}
const ensureReadablePalette = pal => ({ ...pal, ink: ensureContrast(pal.ink, pal.paper, 4.5), accent: ensureContrast(pal.accent, pal.paper, 3) });

let COLOR_PAL = COLOR_PRESETS[colorQ].pal;
if (!COLOR_PAL) {
  const accent = await askHex('Accent colour', '#ff5b3a');
  const hi = await askHex('Highlight colour', '#ffd23f');
  const paper = await askHex('Paper (background) colour', '#fbf5e9');
  COLOR_PAL = { paper, stage: paper, ink: '#1d1b2e', accent, hi, sky: '#9fd0ff', mint: '#a8e6cf', lilac: '#cdbdff' };
}
COLOR_PAL = ensureReadablePalette(COLOR_PAL);
const trendsRawAll = await trendsFor(title.split(' ').slice(0, 4).join(' '));
const trendsRaw = trendsRawAll.filter(p => p.l && Number.isFinite(p.v));
const TREND_MAX = 6; // a handful of points reads clean; the raw series is often 50+ weekly buckets
const trends = trendsRaw.length <= TREND_MAX ? trendsRaw
  : trendsRaw.filter((_, i) => i % Math.ceil(trendsRaw.length / TREND_MAX) === 0).slice(0, TREND_MAX);
const trendChartType = trends.length > 0 && trends.length <= 4 ? 'bar' : 'line';
const explainer = await plainExplainer(title);
const yearsToGrant = filingDate && grantDate && +grantDate.slice(0, 4) > +filingDate.slice(0, 4) ? +grantDate.slice(0, 4) - +filingDate.slice(0, 4) : 0;

const gi = await gem(
  `You write the script for a ~55 second patent explainer that plays as ONE continuous camera journey through 8 stops. Focus: ${focus}. Return ONLY JSON:
{"headline":"punchy on-screen hook, <=7 words, plain words; wrap ONE key word in *asterisks*",
 "productName":"what the thing is, <=4 words",
 "problemLine":"<=14 words naming the problem; wrap 1-2 key words in *asterisks*",
 "steps":[{"t":"<=3 words","d":"<=9 words"},{"t":"","d":""},{"t":"","d":""}],
 "caption1":"<=14 words describing what the patent drawing shows",
 "imageQuery":"query for a flat vector illustration (clip art) of the real-world product this patent covers, white background, no text",
 "imageQuery2":"query for a second, different vector illustration of it",
 "narration":{"hook":"1 short sentence","problem":"1-2 short sentences","invention":"1-2 short sentences about the product","blueprint":"1 sentence about the patent drawing","steps":["one short sentence for step 1","one short sentence for step 2","one short sentence for step 3"],"momentum":"1 sentence about search interest over time","numbers":"1 sentence using ONLY the given counts","people":"1-2 short sentences naming the inventors and holder, using ONLY the given names","closing":"1 short closing sentence pointing to the full patent"}}
Use ONLY the facts given. No invented numbers, no legal claims beyond the abstract/claims. Plain spoken language, one idea per sentence; every sentence is also a subtitle, so keep each short. Give most of the words to the chosen focus: how it works = the steps and mechanism; why it matters = the problem and search interest; who made it = the inventors, holder and filing story; balanced = a bit of each. Educational, not legal advice.`,
  JSON.stringify({ title, assignee, inventors, filingDate, grantDate, abstract, claims, searchSnippet: explainer, claimsTotal, inventorCount: inventors.length, yearsToGrant, trendsAvailable: trends.length >= 2, hasDrawing: !!drawings.length, focus }),
  'writing the script');
const N = gi.narration || {};

// Product images from Google Images (vector illustrations first), backgrounds removed
const photos = [];
const ph = await fetchPhotos(gi.imageQuery || title, path.join(dirOf(), 'assets', 'photo'), 2, 'product image');
photos.push(...ph.slice(0, 2));
if (gi.imageQuery2) { const p2 = await fetchPhotos(gi.imageQuery2, path.join(dirOf(), 'assets', 'photo-b'), 2, 'second image'); photos.push(...p2.slice(0, 2)); }
photos.forEach((p, k) => { A[`p${k + 1}`] = { file: p.file, label: 'Product image (Google Images, not from the patent)', kind: p.cut ? 'cutout' : 'photo', ratio: p.ratio, tint: !p.cut && !p.svg }; });
if (!photos.length) console.log(warn('  No product image could be used — the invention scene will be skipped.'));

// The invention tour is shown on photos[0] (p1), so the pin positions must be measured on that
// same image. (Before, they were measured on photos[1] and drawn on photos[0], so the pins landed
// in the wrong places.)
let hotspots = [];
if (photos.length && !photos[0].svg) {
  const tourImg = photos[0];
  process.stdout.write(dim('  ◎ locating key parts on the image... '));
  hotspots = await findHotspots(path.join(dirOf(), 'assets', tourImg.file), abstract, gi.steps?.map(x => x.t));
  console.log(hotspots.length ? ok(`${hotspots.length} parts found`) : warn('none found (camera tour skipped)'));
}
let caption1 = gi.caption1 || '';
let annotated = null;
let drawingHotspots = [];
if (drawings.length) {
  const dPath = path.join(dirOf(), 'assets', A.d1.file);
  try { const v = await gemVision('In 12 words or fewer, plainly describe what this patent drawing shows.', dPath); if (v) caption1 = v; } catch {}
  process.stdout.write(dim('  ◎ locating labeled parts on the patent drawing... '));
  drawingHotspots = await findHotspots(dPath, abstract, gi.steps?.map(x => x.t), 'drawing');
  if (!drawingHotspots.length) drawingHotspots = await findHotspots(dPath, abstract, gi.steps?.map(x => x.t), 'drawing');
    if (drawingHotspots.length) {
    annotated = annotateDrawing(dPath, drawingHotspots, COLOR_PAL, path.join(dirOf(), 'assets', 'drawing-annotated.svg'));
    if (annotated) A.d1a = { file: annotated.file, label: 'Annotated patent drawing', kind: 'cutout', ratio: annotated.ratio, tint: false };
  }
  console.log(annotated ? ok(`${drawingHotspots.length} parts labelled`) : warn('none found (plain drawing shown instead)'));
}

// ---------- people & company photos ----------
// Ordinary web photos (never clip art), saved as they are. Tries each query in turn and takes the
// first image that downloads; returns null if none does. (Holder logo is only attempted for a
// company assignee; the inventor photo is a name+company search, so check it is the right person.)
const UA_P = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', accept: 'image/*' };
async function findPhoto(queries, destBase) {
  for (const q of queries) {
    const cands = await searchImages(q, 10, '');
    for (const cd of cands) {
      for (const url of [cd.original, cd.thumbnail].filter(Boolean)) {
        try {
          const r = await retryFetch(url, { headers: UA_P });
          const ct = r.headers.get('content-type') || '';
          if (!r.ok || !/^image\/(jpeg|png|webp|gif)/.test(ct)) continue;
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length < 3000) continue;
          const ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : ct.includes('gif') ? '.gif' : '.jpg';
          const file = destBase + ext;
          fs.writeFileSync(file, buf);
          const info = pngInfo(file);
          return { file: path.basename(file), ratio: info ? +(info.w / info.h).toFixed(3) : 1 };
        } catch { /* try the next one */ }
      }
    }
  }
  return null;
}
const assetDir = path.join(dirOf(), 'assets');
let holderLogo = null, inventorPhoto = null;
if (assignee) {
  process.stdout.write(dim(`  🏢 finding a photo of ${assignee}... `));
  holderLogo = await findPhoto([`${assignee} logo`, `${assignee} company`], path.join(assetDir, 'holder'));
  console.log(holderLogo ? ok('found') : warn('no photo found'));
}
const inv1 = inventors[0] || '';
if (inv1) {
  process.stdout.write(dim(`  👤 finding a photo of ${inv1}... `));
  inventorPhoto = await findPhoto([`${inv1} ${assignee}`.trim(), `${inv1} inventor`], path.join(assetDir, 'inventor'));
  console.log(inventorPhoto ? ok('found — check it is the right person') : warn('no photo found'));
}
if (holderLogo) A.holder = { file: holderLogo.file, label: `${assignee}`, kind: 'photo', ratio: holderLogo.ratio, tint: false };
if (inventorPhoto) A.inventor = { file: inventorPhoto.file, label: inv1, kind: 'photo', ratio: inventorPhoto.ratio, tint: false };

const palette = COLOR_PAL;
const problemLine = gi.problemLine || (abstract.split(/(?<=[.!?])\s/)[0] || title).slice(0, 110);
const rawScenes = buildScenes({
  title, number, assignee, inventors, filingDate, grantDate, claimsTotal, link, trends, N,
  headline: gi.headline, productName: gi.productName, problemLine,
  steps: (gi.steps || []).filter(x => x && x.t), caption1, photos: photos.map((p, k) => ({ id: `p${k + 1}`, ratio: p.ratio })), drawings, hotspots, drawingHotspots, annotated, holderLogo, inventorPhoto, focusKey: ['how', 'why', 'who', 'balanced'][focusQ]
});
const tm = await buildAudio(dirOf(), rawScenes, voice);
rawScenes.forEach((s, i) => { s.dur = tm.timing[i].dur; s.sub = s.narration || ''; });

const P = {
  title, mode: 'world', world: { bg: 'stage' }, aspect: ASPECT, aspects: [ASPECT], theme,
  palette, fonts: { head: 'Bricolage Grotesque:wght@400;700;800', text: 'Bricolage Grotesque:wght@400;500;700', ui: 'Bricolage Grotesque:wght@400;500;700' }, boil: 8, audio: tm.file,
  assets: A, scenes: rawScenes
};
const url = emit(P);

console.log('\n' + C.accent + '━'.repeat(58) + C.reset);
console.log(bold('  Your patent video is ready (16:9)'));
console.log(`  ${url}?aspect=${ASPECT}`);
console.log(dim(`  Full patent: ${link}`));
serpSummary();
openUrl(`${url}?aspect=${ASPECT}`);

// ---------- optional MP4 export ----------
const exp = await ask(bold('Export an MP4 now with ffmpeg? (y/n)'), 'y');
if (/^y/i.test(exp)) {
  console.log(dim('\n  Rendering 16:9... this captures every frame, so it takes a few minutes.'));
  const r = runPython([path.join(ROOT, 'cli', 'export.py'), SLUG, '--aspect', ASPECT]);
  if (r.status !== 0) console.log(warn(`  Export skipped or failed. Run manually: python3 cli/export.py ${SLUG} --aspect ${ASPECT}`));
}

// ---------- optional infographic PDF ----------
const pdfAsk = await ask(bold('Build a 4-page infographic PDF too? (y/n)'), 'y');
if (/^y/i.test(pdfAsk)) {
  const d1File = drawings[0] ? A[drawings[0].id]?.file : '';
  const d2File = drawings[1] ? A[drawings[1].id]?.file : '';
  await buildPdf({
    title, number, assignee, inventors, filingDate, grantDate, country, type: ptype, abstract, claims, claimsTotal, link, trends,
    chartType: trendChartType, palette, explainer, problemText: problemLine.replace(/\*/g, ''),
    steps: (gi.steps || []).map(x => x.t + (x.d ? ': ' + x.d : '')), narr0: N.hook || '', serpLog,
    heroImage: photos[0] ? `assets/${photos[0].file}` : (d1File ? `assets/${d1File}` : ''),
    drawingImage: d1File ? `assets/${d1File}` : '',
    secondImage: photos[1] ? `assets/${photos[1].file}` : (d2File ? `assets/${d2File}` : ''),
    holderImage: holderLogo ? `assets/${holderLogo.file}` : '',
    inventorImage: inventorPhoto ? `assets/${inventorPhoto.file}` : ''
  });
}

console.log(ok(`\nDone. Files in projects/${SLUG}/\n`));
process.exit(0);
