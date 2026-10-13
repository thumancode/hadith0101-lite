#!/usr/bin/env node
/* render.js — timestamps.txt + audio.mp3 → <BASENAME>-<ratio>-<quality>.mp4
   Captures the HTML animation frame by frame with headless Chromium (Playwright) and encodes with FFmpeg.

   Usage
     node render.js                          all ratios, all qualities, full video
     node render.js --ratios 9x16,16x9       only these ratios
     node render.js --tiers fhd,hd           only these qualities (4k, fhd, hd)
     node render.js --test 10                render only the first 10 seconds
     node render.js --still 5,40,70          PNG stills (Full HD) at these seconds, for each selected ratio
     node render.js --workers 2              parallel browsers per ratio (default: min(4, CPU count))
     node render.js --prepare                only (re)generate lines.js and brand.js
*/
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

/* ------------------------------------------------------------------ constants */
const FPS = 30;
const ROOT = __dirname;
const AUDIO_FILE = 'audio.mp3';
const TIMESTAMPS_FILE = 'timestamps.txt';
const BRAND_FILE = 'brand.txt';

/* exact pixel sizes (section 1.1): [width, height] per ratio and quality */
const RATIOS = {
  '9x16': { fhd: [1080, 1920], '4k': [2160, 3840], hd: [720, 1280] },
  '16x9': { fhd: [1920, 1080], '4k': [3840, 2160], hd: [1280, 720] },
  '1x1':  { fhd: [1080, 1080], '4k': [2160, 2160], hd: [720, 720] },
  '4x5':  { fhd: [1080, 1350], '4k': [2160, 2700], hd: [720, 900] },
  '3x4':  { fhd: [1080, 1440], '4k': [2160, 2880], hd: [720, 960] },
  '4x3':  { fhd: [1440, 1080], '4k': [2880, 2160], hd: [960, 720] }
};
const RATIO_ORDER = ['9x16', '16x9', '1x1', '4x5', '3x4', '4x3'];
const TIERS = { '4k': { crf: 20 }, fhd: { crf: 18 }, hd: { crf: 20 } };
const TIER_ORDER = ['4k', 'fhd', 'hd'];
const SIZE_LIMIT = 1.9 * 1024 * 1024 * 1024;               // GitHub Release limit is 2 GiB per file

/* ------------------------------------------------------------------ small helpers */
function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }, opts || {}));
  if (r.error) throw new Error(cmd + ' could not be started: ' + r.error.message);
  return r;
}
const fmtBytes = (n) => {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + ' GiB';
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + ' MiB';
  return (n / 1024).toFixed(0) + ' KiB';
};

/* ------------------------------------------------------------------ input parsing */
function parseTimestamps() {
  const file = path.join(ROOT, TIMESTAMPS_FILE);
  if (!fs.existsSync(file)) throw new Error(TIMESTAMPS_FILE + ' not found');
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = [];
  raw.split(/\r?\n/).forEach((line, n) => {
    if (!line.trim()) return;
    const parts = line.split('|');
    if (parts.length < 3) throw new Error(TIMESTAMPS_FILE + ' line ' + (n + 1) + ': expected "start | end | text | tag"');
    const s = parseFloat(parts[0]);
    const e = parseFloat(parts[1]);
    if (!isFinite(s) || !isFinite(e) || e <= s) throw new Error(TIMESTAMPS_FILE + ' line ' + (n + 1) + ': bad start/end');
    let tag = '';
    let text;
    if (parts.length >= 4) { tag = parts[parts.length - 1].trim(); text = parts.slice(2, -1).join('|').trim(); }
    else { text = parts[2].trim(); }
    lines.push({ s: s, e: e, text: text, tag: tag });
  });
  if (!lines.length) throw new Error(TIMESTAMPS_FILE + ' has no lines');
  return lines;
}

function parseBrand() {
  const brand = {};
  const file = path.join(ROOT, BRAND_FILE);
  if (!fs.existsSync(file)) return brand;
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  raw.split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t || t.charAt(0) === '#') return;
    const i = t.indexOf('=');
    if (i < 0) return;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    if (['APP_NAME', 'PILL', 'FEATURES', 'CTA_BUTTON', 'BASENAME'].indexOf(key) >= 0 && val) brand[key] = val;
  });
  return brand;
}

function probeAudioSeconds() {
  const file = path.join(ROOT, AUDIO_FILE);
  if (!fs.existsSync(file)) throw new Error(AUDIO_FILE + ' not found');
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  const d = parseFloat(String(r.stdout).trim());
  if (r.status !== 0 || !isFinite(d)) throw new Error('ffprobe could not read the audio length: ' + r.stderr);
  return d;
}

/* The store badge PNG normally has a white margin. Find the bounding box of its real artwork so the
   page can show the whole badge without the margin. Falls back to "no crop" on any problem. */
function detectBadgeBox() {
  try {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const m = html.match(/<img[^>]*id="badge"[^>]*src="([^"]+)"/);
    if (!m) return null;
    const file = path.join(ROOT, m[1]);
    if (!fs.existsSync(file)) return null;
    const pr = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file]);
    const dim = String(pr.stdout).trim().split('x').map(Number);
    const w = dim[0], h = dim[1];
    if (!(w > 0 && h > 0)) return null;
    const fr = run('ffmpeg', ['-v', 'error', '-i', file, '-filter_complex',
      'color=c=white:s=' + w + 'x' + h + ':d=1[bg];[0:v]format=rgba[fg];[bg][fg]overlay=format=auto,format=rgb24',
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer' });
    const buf = fr.stdout;
    if (fr.status !== 0 || !buf || buf.length < w * h * 3) return null;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    const thr = 255 - 12;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 3;
        if (buf[o] < thr || buf[o + 1] < thr || buf[o + 2] < thr) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1);
    x1 = Math.min(w - 1, x1 + 1); y1 = Math.min(h - 1, y1 + 1);
    const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    if (box.w < 16 || box.h < 16) return null;
    return box;
  } catch (e) {
    console.warn('Badge crop detection skipped: ' + e.message);
    return null;
  }
}

/* writes lines.js and brand.js (JSON.stringify keeps every character) and returns the facts */
function prepare() {
  const lines = parseTimestamps();
  const brand = parseBrand();
  const audio = probeAudioSeconds();
  const lastEnd = Math.max.apply(null, lines.map((l) => l.e));
  const total = Math.ceil((Math.max(lastEnd, audio) + 2.0) * FPS) / FPS;
  const meta = { audio: Math.round(audio * 1000) / 1000, total: Math.round(total * 1000) / 1000 };
  const box = detectBadgeBox();
  if (box) meta.badge = box;

  fs.writeFileSync(path.join(ROOT, 'lines.js'),
    '/* generated by render.js from ' + TIMESTAMPS_FILE + ' — do not edit by hand */\n' +
    'const LINES = [\n' + lines.map((l) => '  ' + JSON.stringify(l)).join(',\n') + '\n];\n');
  fs.writeFileSync(path.join(ROOT, 'brand.js'),
    '/* generated by render.js from ' + BRAND_FILE + ' and the audio length — do not edit by hand */\n' +
    'const BRAND = ' + JSON.stringify(brand) + ';\n' +
    'const META = ' + JSON.stringify(meta) + ';\n');
  return { lines: lines, brand: brand, meta: meta, basename: brand.BASENAME || 'video' };
}

/* ------------------------------------------------------------------ CLI */
function parseArgs(argv) {
  const o = { ratios: RATIO_ORDER.slice(), tiers: TIER_ORDER.slice(), test: null, still: null, workers: null, prepareOnly: false };
  const need = (i, name) => { if (i + 1 >= argv.length) throw new Error(name + ' needs a value'); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ratios') { o.ratios = need(i, a).split(',').map((s) => s.trim()).filter(Boolean); i++; }
    else if (a === '--tiers') { o.tiers = need(i, a).split(',').map((s) => s.trim()).filter(Boolean); i++; }
    else if (a === '--test') { o.test = parseFloat(need(i, a)); i++; }
    else if (a === '--still') { o.still = need(i, a).split(',').map((s) => parseFloat(s)).filter((n) => isFinite(n)); i++; }
    else if (a === '--workers') { o.workers = parseInt(need(i, a), 10); i++; }
    else if (a === '--prepare') { o.prepareOnly = true; }
    else throw new Error('Unknown option: ' + a);
  }
  o.ratios.forEach((r) => { if (!RATIOS[r]) throw new Error('Unknown ratio: ' + r + ' (valid: ' + RATIO_ORDER.join(',') + ')'); });
  o.tiers.forEach((t) => { if (!TIERS[t]) throw new Error('Unknown quality: ' + t + ' (valid: ' + TIER_ORDER.join(',') + ')'); });
  if (o.test !== null && !(o.test > 0)) throw new Error('--test needs a number of seconds > 0');
  if (o.still && !o.still.length) throw new Error('--still needs times in seconds');
  if (o.workers !== null && !(o.workers >= 1)) throw new Error('--workers needs a number >= 1');
  return o;
}

/* ------------------------------------------------------------------ capture */
async function capture(chromium, key, nFrames, dir, scale, workers) {
  const [vw, vh] = RATIOS[key].fhd;
  const url = pathToFileURL(path.join(ROOT, 'index.html')).href + '?ratio=' + key;
  const n = Math.max(1, Math.min(workers, nFrames));
  const per = Math.ceil(nFrames / n);
  let done = 0;
  let lastPrinted = -1;
  const started = Date.now();

  async function worker(from, to) {
    const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none', '--disable-lcd-text'] });
    try {
      const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: scale });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.error('[' + key + '] page error: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.warn('[' + key + '] ' + m.text()); });
      await page.goto(url);
      await page.waitForFunction('window.__ready === true || !!window.__error', null, { timeout: 180000 });
      const err = await page.evaluate('window.__error || null');
      if (err) throw new Error('page failed to start for ' + key + ': ' + err);
      for (let f = from; f < to; f++) {
        await page.evaluate((t) => window.renderAt(t), f / FPS);
        await page.screenshot({ path: path.join(dir, 'f' + String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 93 });
        done++;
        const pct = Math.floor((done / nFrames) * 100);
        if (pct !== lastPrinted && (pct % 5 === 0 || done === nFrames)) {
          lastPrinted = pct;
          const el = (Date.now() - started) / 1000;
          console.log('[' + key + '] frames ' + done + '/' + nFrames + ' (' + pct + '%)  ' + el.toFixed(0) + 's');
        }
      }
    } finally {
      await browser.close();
    }
  }

  const jobs = [];
  for (let w = 0; w < n; w++) {
    const from = w * per;
    const to = Math.min(nFrames, from + per);
    if (from < to) jobs.push(worker(from, to));
  }
  await Promise.all(jobs);
  const got = fs.readdirSync(dir).filter((f) => /^f\d{5}\.jpg$/.test(f)).length;
  if (got !== nFrames) throw new Error('[' + key + '] expected ' + nFrames + ' frames but found ' + got);
}

/* ------------------------------------------------------------------ encode */
function encode(basename, key, tier, dir, totalSec, crf) {
  const [W, H] = RATIOS[key][tier];
  const out = path.join(ROOT, basename + '-' + key + '-' + tier + '.mp4');
  /* JPEG frames are full-range BT.601 YUV: go through RGB so the colours end up right in BT.709 limited range */
  const vf = 'scale=' + W + ':' + H + ':flags=lanczos:in_range=pc,format=gbrp,' +
             'scale=out_color_matrix=bt709:out_range=tv:flags=lanczos,format=yuv420p';
  const args = ['-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.jpg'),
    '-i', path.join(ROOT, AUDIO_FILE),
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', vf,
    '-af', 'apad,atrim=0:' + totalSec.toFixed(3),
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium', '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart', '-shortest', out];
  const r = run('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'], encoding: undefined });
  if (r.status !== 0) throw new Error('FFmpeg failed for ' + path.basename(out) + ' (exit ' + r.status + ')');
  return out;
}

function encodeWithGuard(basename, key, tier, dir, totalSec) {
  let bump = 0;
  let out = encode(basename, key, tier, dir, totalSec, TIERS[tier].crf);
  let size = fs.statSync(out).size;
  while (size > SIZE_LIMIT && bump < 8) {
    bump += 2;
    console.warn('WARNING: ' + path.basename(out) + ' is ' + fmtBytes(size) + ' (> 1.9 GiB). Re-encoding with CRF ' + (TIERS[tier].crf + bump) + '.');
    out = encode(basename, key, tier, dir, totalSec, TIERS[tier].crf + bump);
    size = fs.statSync(out).size;
  }
  if (size > SIZE_LIMIT) console.warn('WARNING: ' + path.basename(out) + ' is still larger than 1.9 GiB; GitHub may refuse it.');
  return out;
}

/* ------------------------------------------------------------------ stills */
async function stills(chromium, basename, ratios, times) {
  const made = [];
  for (const key of ratios) {
    const [vw, vh] = RATIOS[key].fhd;
    const url = pathToFileURL(path.join(ROOT, 'index.html')).href + '?ratio=' + key;
    const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none', '--disable-lcd-text'] });
    try {
      const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(url);
      await page.waitForFunction('window.__ready === true || !!window.__error', null, { timeout: 180000 });
      const err = await page.evaluate('window.__error || null');
      if (err) throw new Error('page failed to start for ' + key + ': ' + err);
      for (const t of times) {
        await page.evaluate((x) => window.renderAt(x), t);
        const file = path.join(ROOT, basename + '-' + key + '-still-' + String(t).replace('.', '_') + 's.png');
        await page.screenshot({ path: file, type: 'png' });
        made.push(file);
        console.log('still: ' + path.basename(file));
      }
    } finally {
      await browser.close();
    }
  }
  return made;
}

/* ------------------------------------------------------------------ main */
async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const info = prepare();
  const total = info.meta.total;
  console.log('Lines: ' + info.lines.length + ' | audio ' + info.meta.audio + ' s | video ' + total + ' s (' + Math.round(total * FPS) + ' frames @ ' + FPS + ' fps)');
  if (opt.prepareOnly) { console.log('lines.js and brand.js written.'); return; }

  const { chromium } = require('playwright');

  if (opt.still) {
    await stills(chromium, info.basename, opt.ratios, opt.still);
    return;
  }

  const seconds = opt.test ? Math.min(opt.test, total) : total;
  const nFrames = Math.round(seconds * FPS);
  const encodeSec = nFrames / FPS;
  const workers = opt.workers || Math.max(1, Math.min(4, os.cpus().length));
  const scale = opt.tiers.indexOf('4k') >= 0 ? 2 : 1;
  const created = [];

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
  try {
    const free = fs.statfsSync(tmpRoot);
    const freeBytes = Number(free.bavail) * Number(free.bsize);
    console.log('Free disk space in ' + os.tmpdir() + ': ' + fmtBytes(freeBytes) + ' | workers: ' + workers + ' | capture scale: ' + scale + 'x');

    for (const key of opt.ratios) {
      const [vw, vh] = RATIOS[key].fhd;
      const need = nFrames * vw * vh * scale * scale * 0.2;   // rough JPEG size estimate
      if (need * 1.2 > freeBytes) console.warn('WARNING: ' + key + ' may need about ' + fmtBytes(need) + ' of frames but only ' + fmtBytes(freeBytes) + ' is free.');

      const dir = path.join(tmpRoot, key);
      fs.mkdirSync(dir, { recursive: true });
      console.log('=== ' + key + ': capturing ' + nFrames + ' frames (' + (vw * scale) + 'x' + (vh * scale) + ') ===');
      await capture(chromium, key, nFrames, dir, scale, workers);

      for (const tier of opt.tiers) {
        console.log('=== ' + key + ': encoding ' + tier + ' ===');
        created.push(encodeWithGuard(info.basename, key, tier, dir, encodeSec));
      }
      fs.rmSync(dir, { recursive: true, force: true });          // free the disk as soon as this ratio is done
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log('\nCreated files:');
  created.forEach((f) => console.log('  ' + path.basename(f).padEnd(40) + fmtBytes(fs.statSync(f).size)));
}

if (require.main === module) {
  main().catch((e) => {
    console.error('\nERROR: ' + (e && e.stack ? e.stack : e));
    process.exit(1);
  });
}

module.exports = { prepare, parseTimestamps, parseBrand, RATIOS, TIERS };
