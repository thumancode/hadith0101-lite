/* scenes.js — deterministic timeline engine.
   window.renderAt(t) draws the identical frame for the same t every time.
   No setTimeout, no CSS animation/transition, no requestAnimationFrame, no Date.now(), no Math.random()
   (a seeded generator is used for the wave). The layout is chosen once at load from ?ratio=<key>.

   Data comes from: layout.js (LAYOUTS), lines.js (LINES), brand.js (BRAND, META). */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ helpers */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const smooth = (k) => k * k * (3 - 2 * k);
  const $ = (id) => document.getElementById(id);

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fail(msg) {
    window.__error = msg;
    try {
      document.body.innerHTML =
        '<pre style="margin:0;padding:24px;color:#fff;background:#900;font:28px monospace;white-space:pre-wrap">' +
        String(msg).replace(/</g, '&lt;') + '</pre>';
    } catch (e) { /* ignore */ }
    throw new Error(msg);
  }

  /* ------------------------------------------------------------------ layout */
  const ratioKey = new URLSearchParams(location.search).get('ratio') || '9x16';
  if (!Object.prototype.hasOwnProperty.call(LAYOUTS, ratioKey)) fail('Unknown ratio key: ' + ratioKey);
  const L = LAYOUTS[ratioKey];

  document.documentElement.style.setProperty('--W', L.w + 'px');
  document.documentElement.style.setProperty('--H', L.h + 'px');

  /* ------------------------------------------------------------------ data / timeline */
  if (!LINES || !LINES.length) fail('lines.js has no lines');
  const TOTAL = META.total;
  const LAST = LINES[LINES.length - 1];
  const HAS_STORE = LAST.tag === 'store';
  const T_FINAL = HAS_STORE ? LAST.s : LAST.e;          // the final scene starts here
  const CARD_LINES = HAS_STORE ? LINES.slice(0, -1) : LINES.slice();
  const T_END = TOTAL + 100;                            // "until the end of the video"
  const FADE_SCENE = 0.5;                               // header/card/wave/lattice out, final scene in

  /* colours: the tag selects gold or mint (mint = default for unknown tags) */
  const GOLD = { card: [228, 197, 90], wave: [228, 197, 90] };
  const MINT = { card: [123, 220, 178], wave: [114, 206, 166] };
  const GOLD_TAGS = ['respectful', 'solemn', 'serious', 'store'];
  const palette = (tag) => (GOLD_TAGS.indexOf(tag) >= 0 ? GOLD : MINT);
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const rgb = (c) => 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';

  /* ------------------------------------------------------------------ track engine */
  /* track(el, start, end, {a:'rise'|'pop'|'fade', i:inDur, o:outDur, dy, s0, k, fn})
     The element is visible for start <= t <= end. In-animation over [start, start+i],
     out-animation (fade) over [end-o, end]. fn(t, el) runs every frame while visible.
     IMPORTANT: visibility is set to 'inherit' (never 'visible') so a child can never stay on
     screen after its hidden parent scene has ended. */
  const tracks = [];
  function track(el, start, end, o) {
    o = o || {};
    const a = o.a || 'fade';
    const tr = {
      el: el, start: start, end: end, a: a,
      i: o.i == null ? 0.4 : o.i,
      o: o.o == null ? 0 : o.o,
      dy: o.dy == null ? 28 : o.dy,
      s0: o.s0 == null ? (a === 'pop' ? 0.9 : 1) : o.s0,
      k: o.k == null ? 1 : o.k,
      fn: o.fn || null
    };
    tracks.push(tr);
    return tr;
  }

  function applyTrack(tr, t) {
    const el = tr.el;
    if (t < tr.start || t > tr.end) {
      el.style.visibility = 'hidden';
      return;
    }
    const pin = tr.i > 0 ? clamp((t - tr.start) / tr.i, 0, 1) : 1;
    const pout = tr.o > 0 ? clamp((tr.end - t) / tr.o, 0, 1) : 1;
    const ein = easeOut(pin);
    let op = (tr.a === 'fade' ? pin : ein) * pout;
    let ty = 0, sc = 1;
    if (tr.a === 'rise') {
      ty = tr.dy * (1 - ein);
      sc = lerp(tr.s0, 1, ein);
    } else if (tr.a === 'pop') {
      sc = lerp(tr.s0, 1, ein);
    }
    el.style.visibility = 'inherit';
    el.style.opacity = String(op * tr.k);
    el.style.transform = (ty === 0 && sc === 1) ? 'none' : 'translateY(' + ty + 'px) scale(' + sc + ')';
    if (tr.fn) tr.fn(t, el);
  }

  /* ------------------------------------------------------------------ text helpers */
  const AR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const isArabicWord = (w) => AR_RE.test(w);

  /* One span per WORD (never per letter), so complex scripts shape correctly.
     Not-yet-visible words stay in the layout (opacity 0) so nothing re-wraps. */
  function buildWords(txtEl, text) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const spans = [];
    let allArabic = words.length > 0;
    words.forEach(function (w, i) {
      if (i > 0) txtEl.appendChild(document.createTextNode(' '));
      const sp = document.createElement('span');
      const ar = isArabicWord(w);
      if (!ar) allArabic = false;
      sp.className = 'w' + (ar ? ' ar' : '');
      sp.textContent = w;
      txtEl.appendChild(sp);
      spans.push(sp);
    });
    if (allArabic) txtEl.classList.add('rtl');
    return spans;
  }

  /* word i starts at t0 + 0.86*(t1-t0) * (characters before it / all characters) */
  function wordTimes(spans, t0, t1) {
    const wts = spans.map(function (s) { return Array.from(s.textContent).length; });
    const sum = wts.reduce(function (a, b) { return a + b; }, 0) || 1;
    const span = 0.86 * (t1 - t0);
    let cum = 0;
    return spans.map(function (s, i) {
      const st = t0 + span * (cum / sum);
      cum += wts[i];
      return st;
    });
  }

  function updateWords(spans, times, t) {
    for (let i = 0; i < spans.length; i++) {
      const p = clamp((t - times[i]) / 0.28, 0, 1);
      const e = easeOut(p);
      spans[i].style.opacity = String(e);
      spans[i].style.transform = p >= 1 ? 'none' : 'translateY(' + (14 * (1 - e)) + 'px)';
    }
  }

  /* shrink a single-line inline-block span until it fits maxW */
  function fitSpan(span, maxW, startSize, minSize) {
    let size = startSize;
    span.style.fontSize = size + 'px';
    while (size > minSize && span.offsetWidth > maxW) {
      size -= 1;
      span.style.fontSize = size + 'px';
    }
    return size;
  }

  /* ------------------------------------------------------------------ lattice (CSS drawn in style.css) */
  const latIn = $('lattice-in');
  track($('lattice'), 0, T_FINAL + FADE_SCENE, {
    a: 'fade', i: 0, o: FADE_SCENE, k: 0.05,
    fn: function (t) {
      const d = 20 * clamp(t / TOTAL, 0, 1);               // <= 20 px over the whole video
      latIn.style.transform = 'translate(' + d + 'px,' + d + 'px)';
    }
  });
  track($('bg-final'), T_FINAL, T_END, { a: 'fade', i: FADE_SCENE, o: 0 });

  /* ------------------------------------------------------------------ header */
  const hdrIcon = $('hdr-icon');
  const hdrName = $('hdr-name');
  const hdrPill = $('hdr-pill');
  const HAS_NAME = !!BRAND.APP_NAME;
  const HAS_PILL = !!BRAND.PILL;
  if (HAS_NAME) hdrName.firstElementChild.textContent = BRAND.APP_NAME; else hdrName.remove();
  if (HAS_PILL) hdrPill.firstElementChild.textContent = BRAND.PILL; else hdrPill.remove();

  track($('header'), 0, T_FINAL + FADE_SCENE, { a: 'fade', i: 0, o: FADE_SCENE });

  function place(el, x, y, w, h) {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (w != null) el.style.width = w + 'px';
    if (h != null) el.style.height = h + 'px';
  }

  function layoutHeader() {
    const H = L.header;
    const maxW = L.w - 2 * L.safe;
    const nameSpan = HAS_NAME ? hdrName.firstElementChild : null;
    const pillSpan = HAS_PILL ? hdrPill.firstElementChild : null;

    function setPill(h, font) {
      pillSpan.style.fontSize = font + 'px';
      const k = h / 80;
      const pw = Math.min(maxW, Math.max(295 * k, pillSpan.offsetWidth + 90 * k));
      hdrPill.style.width = pw + 'px';
      hdrPill.style.height = h + 'px';
      hdrPill.style.lineHeight = (h - 3) + 'px';
      hdrPill.style.fontSize = font + 'px';
      hdrPill.style.borderRadius = (h / 2) + 'px';
      return pw;
    }

    if (H.mode === 'stacked') {
      const s = H.icon.size;
      place(hdrIcon, (L.w - s) / 2, H.icon.y, s, s);
      hdrIcon.style.borderRadius = (s * 44 / 190) + 'px';
      if (HAS_NAME) {
        const size = fitSpan(nameSpan, maxW, H.name.size, 20);
        place(hdrName, 0, H.name.y - size * 0.7, L.w, size * 1.4);
        hdrName.style.fontSize = size + 'px';
        hdrName.style.lineHeight = (size * 1.4) + 'px';
        hdrName.style.textAlign = 'center';
      }
      if (HAS_PILL) {
        const pw = setPill(H.pill.h, H.pill.font);
        place(hdrPill, (L.w - pw) / 2, H.pill.y, null, null);
      }
    } else {
      /* wide ratios: one centred row  [icon] [name] [pill] */
      const R = H.row;
      const cy = R.y + R.h / 2;
      let pillW = 0;
      if (HAS_PILL) pillW = setPill(H.pill.h, H.pill.font);
      let nameSize = H.name.size;
      const rowWidth = function () {
        let w = R.icon;
        if (HAS_NAME) w += R.gap + nameSpan.offsetWidth;
        if (HAS_PILL) w += R.gap + pillW;
        return w;
      };
      if (HAS_NAME) {
        nameSpan.style.fontSize = nameSize + 'px';
        while (nameSize > 16 && rowWidth() > maxW) {      // shrink, never wrap or clip
          nameSize -= 1;
          nameSpan.style.fontSize = nameSize + 'px';
        }
      }
      let x = (L.w - rowWidth()) / 2;
      place(hdrIcon, x, cy - R.icon / 2, R.icon, R.icon);
      hdrIcon.style.borderRadius = (R.icon * 44 / 190) + 'px';
      x += R.icon;
      if (HAS_NAME) {
        x += R.gap;
        const nw = nameSpan.offsetWidth;
        place(hdrName, x, cy - nameSize * 0.7, nw + 2, nameSize * 1.4);
        hdrName.style.fontSize = nameSize + 'px';
        hdrName.style.lineHeight = (nameSize * 1.4) + 'px';
        hdrName.style.textAlign = 'left';
        x += nw;
      }
      if (HAS_PILL) {
        x += R.gap;
        place(hdrPill, x, cy - H.pill.h / 2, null, null);
      }
    }
  }

  /* ------------------------------------------------------------------ progress bar */
  const progress = $('progress');
  const progressFill = $('progress-fill');
  place(progress, 0, L.progress.y, L.w, L.progress.h);
  progressFill.style.backgroundSize = L.w + 'px 100%';

  /* ------------------------------------------------------------------ sound-wave */
  const WAVE_N = 28;
  const bars = [];
  (function buildWave() {
    const host = $('wave');
    const W = L.wave;
    const rnd = mulberry32(20240607);                       // same seed in every ratio
    const x0 = (L.w - ((WAVE_N - 1) * W.pitch + W.bar)) / 2;
    for (let j = 0; j < WAVE_N; j++) {
      const el = document.createElement('div');
      el.className = 'bar';
      el.style.left = (x0 + j * W.pitch) + 'px';
      el.style.width = W.bar + 'px';
      el.style.borderRadius = (W.bar / 2) + 'px';
      host.appendChild(el);
      bars.push({
        el: el,
        f1: 1.0 + rnd() * 0.9, f2: 1.8 + rnd() * 1.5, f3: 3.0 + rnd() * 2.2,
        p1: rnd() * 6.283185, p2: rnd() * 6.283185, p3: rnd() * 6.283185
      });
    }
    track(host, 0, T_FINAL + FADE_SCENE, { a: 'fade', i: 0, o: FADE_SCENE });
  })();

  /* speaking gain: 1.0 while a line is spoken (smoothed over ~0.15 s), 0.35 in the gaps */
  function speakGain(t) {
    let g = 0;
    for (let i = 0; i < LINES.length; i++) {
      const c = LINES[i];
      if (t < c.s - 0.1 || t > c.e + 0.1) continue;
      const a = smooth(clamp((t - (c.s - 0.075)) / 0.15, 0, 1));
      const b = 1 - smooth(clamp((t - (c.e - 0.075)) / 0.15, 0, 1));
      g = Math.max(g, Math.min(a, b));
    }
    return 0.35 + 0.65 * g;
  }

  /* accent cross-fades (~0.5 s) into the next line's colour, starting inside the gap */
  function accentAt(t) {
    let idx = -1;
    for (let i = 1; i < LINES.length; i++) {
      if (t >= LINES[i].s - 0.5) idx = i; else break;
    }
    const first = palette(LINES[0].tag);
    if (idx < 0) return first;
    const a = palette(LINES[idx - 1].tag);
    const b = palette(LINES[idx].tag);
    const k = smooth(clamp((t - (LINES[idx].s - 0.5)) / 0.5, 0, 1));
    return { card: mix(a.card, b.card, k), wave: mix(a.wave, b.wave, k) };
  }

  function updateWave(t) {
    const W = L.wave;
    const g = speakGain(t);
    const col = rgb(accentAt(t).wave);
    for (let j = 0; j < bars.length; j++) {
      const b = bars[j];
      let v = 0.5 * Math.sin(6.283185 * b.f1 * t + b.p1) +
              0.3 * Math.sin(6.283185 * b.f2 * t + b.p2) +
              0.2 * Math.sin(6.283185 * b.f3 * t + b.p3);
      v = clamp(v * 1.3, -1, 1);
      const h = W.min + (W.max - W.min) * (0.5 + 0.5 * g * v);
      b.el.style.height = h + 'px';
      b.el.style.top = (W.cy - h / 2) + 'px';
      b.el.style.background = col;
    }
  }

  /* ------------------------------------------------------------------ line cards */
  const cardData = [];
  (function buildCards() {
    const host = $('cards');
    const C = L.card;
    const D = L.badge;
    CARD_LINES.forEach(function (c, idx) {
      const pal = palette(c.tag);
      const el = document.createElement('div');
      el.className = 'card';
      place(el, C.x, C.y, C.w, C.h);
      el.style.setProperty('--accent', rgb(pal.card));

      const inner = document.createElement('div');
      inner.className = 'inner';
      const txt = document.createElement('div');
      txt.className = 'txt';
      txt.style.fontSize = L.text.size + 'px';
      txt.style.lineHeight = String(L.text.lh / L.text.size);
      const spans = buildWords(txt, c.text);
      inner.appendChild(txt);
      el.appendChild(inner);

      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.textContent = '\u275D';
      badge.style.width = D + 'px';
      badge.style.height = D + 'px';
      badge.style.fontSize = Math.round(D * 0.62) + 'px';
      badge.style.left = ((C.w - 6) / 2 - D / 2) + 'px';  // centred on the card's top edge
      badge.style.top = (-1.5 - D / 2) + 'px';
      el.appendChild(badge);
      host.appendChild(el);

      /* in/out windows. Normal: in = [s-0.10, s+0.30], out = [e, e+0.30].
         If two lines are closer than 0.40 s, the hand-over is tightened around the middle p of the
         gap so the outgoing card is fully gone before the incoming one starts (never two cards). */
      let inStart = c.s - 0.10, inEnd = c.s + 0.30;
      let outStart = c.e, outEnd = c.e + 0.30;
      const prev = CARD_LINES[idx - 1];
      const next = CARD_LINES[idx + 1];
      if (next) {
        const g = next.s - c.e;
        if (g < 0.40) { const p = c.e + g / 2; outStart = p - 0.22; outEnd = p - 0.02; }
      }
      if (prev) {
        const g = c.s - prev.e;
        if (g < 0.40) { const p = prev.e + g / 2; inStart = p - 0.02; inEnd = p + 0.30; }
      }

      const times = wordTimes(spans, c.s, c.e);
      cardData.push({ el: el, inner: inner, txt: txt, spans: spans, line: c });
      track(el, inStart, outEnd, {
        a: 'rise', dy: 24, s0: 0.96,
        i: inEnd - inStart, o: outEnd - outStart,
        fn: function (t) { updateWords(spans, times, t); }
      });
    });
  })();

  /* fit each card's text ONCE: start at the profile size, shrink 2 px at a time (floor 44, hard floor 36) */
  function fitCards() {
    cardData.forEach(function (cd) {
      const innerW = cd.inner.clientWidth;
      const innerH = cd.inner.clientHeight;
      const ratio = L.text.lh / L.text.size;
      const fits = function () { return cd.txt.offsetHeight <= innerH && cd.txt.scrollWidth <= innerW + 1; };
      let size = L.text.size;
      const set = function () {
        cd.txt.style.fontSize = size + 'px';
        cd.txt.style.lineHeight = String(ratio);
      };
      set();
      while (!fits() && size > 44) { size -= 2; set(); }
      while (!fits() && size > 36) { size -= 2; set(); }
      if (size < 44) console.warn('Line shrunk below 44 px (' + size + ' px): ' + cd.line.text);
      if (!fits()) console.warn('Line still does not fit at the hard floor: ' + cd.line.text);
    });
  }

  /* ------------------------------------------------------------------ final scene */
  const stack = $('stack');
  const fIcon = $('f-icon'), fName = $('f-name'), fFeat = $('f-feat');
  const fBtn = $('f-btn'), fCap = $('f-cap'), fBadge = $('f-badge');
  const badgeImg = $('badge');
  const capTxt = fCap.querySelector('.txt');
  const FINAL_MAXW = 880;

  const HAS_FEAT = !!BRAND.FEATURES;
  const HAS_BTN = !!BRAND.CTA_BUTTON;
  if (HAS_NAME) fName.firstElementChild.textContent = BRAND.APP_NAME; else fName.remove();
  if (HAS_FEAT) fFeat.firstElementChild.textContent = BRAND.FEATURES; else fFeat.remove();
  if (HAS_BTN) fBtn.firstElementChild.textContent = BRAND.CTA_BUTTON; else fBtn.remove();

  let capSpans = null;
  let capTimes = null;
  if (HAS_STORE) capSpans = buildWords(capTxt, LAST.text); else fCap.remove();

  function layoutFinal() {
    if (HAS_NAME) fitSpan(fName.firstElementChild, FINAL_MAXW, 70, 28);
    if (HAS_FEAT) fitSpan(fFeat.firstElementChild, FINAL_MAXW, 40, 22);
    if (HAS_BTN) fitSpan(fBtn.firstElementChild, FINAL_MAXW - 200, 40, 22);

    /* store badge: show the whole badge, cropped only to its own artwork (no white margin) */
    let hasBadge = badgeImg.naturalWidth > 0;
    if (hasBadge) {
      const nw = badgeImg.naturalWidth, nh = badgeImg.naturalHeight;
      const cr = (META.badge && META.badge.w > 0 && META.badge.h > 0) ? META.badge : { x: 0, y: 0, w: nw, h: nh };
      const innerH = 110 - 4;                               // 2 px gold outline on each side
      const sc = innerH / cr.h;
      fBadge.style.width = (Math.round(cr.w * sc) + 4) + 'px';
      badgeImg.style.width = (nw * sc) + 'px';
      badgeImg.style.height = (nh * sc) + 'px';
      badgeImg.style.left = (-cr.x * sc) + 'px';
      badgeImg.style.top = (-cr.y * sc) + 'px';
    } else {
      fBadge.remove();
    }

    /* items in stacking order, with their entrance preset */
    const items = [{ el: fIcon, a: 'pop' }];
    if (HAS_NAME) items.push({ el: fName, a: 'rise' });
    if (HAS_FEAT) items.push({ el: fFeat, a: 'rise' });
    if (HAS_BTN) items.push({ el: fBtn, a: 'pop' });
    if (HAS_STORE) items.push({ el: fCap, a: 'fade', cap: true });
    if (hasBadge) items.push({ el: fBadge, a: 'rise' });

    stack.firstElementChild.style.marginTop = '0px';

    /* measure the group (unscaled), scale it uniformly, centre it */
    const gw = stack.offsetWidth || 1;
    const gh = stack.offsetHeight || 1;
    const s = Math.min(1, 0.80 * L.h / gh, 0.92 * L.w / gw);
    const complete = HAS_NAME && HAS_FEAT && HAS_BTN;
    const top = (L.final.top != null && complete) ? L.final.top : (L.h - gh * s) / 2;
    stack.style.left = ((L.w - gw * s) / 2) + 'px';
    stack.style.top = top + 'px';
    stack.style.transform = s === 1 ? 'none' : 'scale(' + s + ')';

    /* staggered entrance: icon, name, features, button, caption, badge — 0.15 s apart */
    let d = 0.30;
    items.forEach(function (it) {
      const start = T_FINAL + d;
      const opts = { a: it.a, i: 0.40, dy: 22 };
      if (it.cap) {
        const t0 = start + 0.05;
        const t1 = Math.max(t0 + 1.0, LAST.e);
        capTimes = wordTimes(capSpans, t0, t1);
        opts.fn = function (t) { updateWords(capSpans, capTimes, t); };
      }
      track(it.el, start, T_END, opts);
      d += 0.15;
    });
  }

  /* ------------------------------------------------------------------ renderAt */
  function renderAt(t) {
    t = Number(t);
    if (!isFinite(t)) t = 0;
    for (let i = 0; i < tracks.length; i++) applyTrack(tracks[i], t);
    updateWave(t);
    progressFill.style.width = (L.w * clamp(t / TOTAL, 0, 1)) + 'px';
  }
  window.renderAt = renderAt;
  window.__ready = false;

  /* ------------------------------------------------------------------ init */
  async function decodeImages() {
    const imgs = Array.prototype.slice.call(document.images);
    await Promise.all(imgs.map(function (img) {
      if (typeof img.decode === 'function') return img.decode().catch(function () { /* broken image: handled later */ });
      return Promise.resolve();
    }));
  }

  (async function init() {
    try {
      void document.body.offsetWidth;                       // force layout so fonts start loading
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await decodeImages();
      layoutHeader();
      fitCards();
      layoutFinal();
      renderAt(0);
      window.__ready = true;
    } catch (e) {
      window.__error = String((e && e.stack) || e);
      console.error(e);
    }
  })();
})();
