/* Flower garden that grows out of the letters of the email on the contact page.
   Inspired by Type Garden by Akshat Agarwal (type-garden.vercel.app). This is an original, much simpler
   implementation written for this site: it shares the idea, not the code.

   - Computers: hover (or tab to) the email and stems, leaves and roses grow out of its letters; move away and they wither.
   - Phones and tablets (no hover): the garden grows by itself about one second after the page loads.
   Change the colours or the timing in the settings just below. */
(function () {
  'use strict';

  /* ---------- settings ---------- */
  var COL = { rose: '#FF1400', stem: '#3257FF', line: '#FFB4A8', vein: '#000000' };  // vein = page background
  var AUTO_DELAY = 1000;      // ms after load before it grows by itself on touch screens
  var TOTAL_MS = 1000;        // how long the whole garden takes to grow, in milliseconds
  var WITHER_SPEED = 2;       // withering is this many times faster than growing
  var GROW_MS = 3600;         // inner timing (the shape of the animation); TOTAL_MS squeezes it all into the time above

  var mail = document.querySelector('.mail');
  if (!mail || !mail.firstChild || mail.firstChild.nodeType !== 3) return;

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- two canvases: one behind the email, one in front, so stems weave through the letters ---------- */
  function makeCanvas(cls) {
    var c = document.createElement('canvas');
    c.className = 'garden ' + cls;
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    return c;
  }
  var back = makeCanvas('back'), front = makeCanvas('front');
  var ctx = [back.getContext('2d'), front.getContext('2d')];
  var W = 0, H = 0, dpr = 1;
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    [back, front].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
  }

  /* ---------- small helpers ---------- */
  function rng(seed) {                       // seeded random numbers, so a garden can be rebuilt identically on resize
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeOut(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t)); }              // slow start, steady middle, soft landing
  function hash(n) { var x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }

  /* ---------- where the letters are ---------- */
  function measure() {
    var tn = mail.firstChild, fs = parseFloat(getComputedStyle(mail).fontSize), out = [];
    for (var i = 0; i < tn.length; i++) {
      var r = document.createRange();
      r.setStart(tn, i); r.setEnd(tn, i + 1);
      var b = r.getBoundingClientRect();
      if (!b.width) continue;
      out.push({ ch: tn.data[i], x: b.left + b.width / 2, w: b.width, cy: (b.top + b.bottom) / 2 });
    }
    return { fs: fs, letters: out };
  }

  /* ---------- building a garden ---------- */
  var seed = 1, stems = [], uid = 0, END = GROW_MS + 1400, K = 1;

  function vine(x, y, dir, len, amp, waves, ph, bend) {
    var n = 34, step = len / n, pts = [[x, y]];
    for (var i = 1; i <= n; i++) {
      var u = i / n, a = dir + bend * u + amp * Math.sin(u * Math.PI * waves + ph) * Math.min(1, u * 3);
      x += Math.cos(a) * step; y += Math.sin(a) * step;
      pts.push([x, y]);
    }
    return pts;
  }
  function pointAt(pts, u) {
    var i = Math.max(1, Math.min(pts.length - 2, Math.round(u * (pts.length - 1))));
    return { x: pts[i][0], y: pts[i][1], a: Math.atan2(pts[i + 1][1] - pts[i - 1][1], pts[i + 1][0] - pts[i - 1][0]) };
  }

  function build() {
    var m = measure(), U = Math.max(m.fs, Math.min(56, window.innerWidth * 0.1)), r = rng(seed), n = m.letters.length;
    var dens = window.innerWidth < 600 ? 0.55 : 1;      // fewer flowers on small screens so the email stays readable
    stems = []; uid = 0;
    var bandTop = 0, bandBot = 0;
    if (n) { bandTop = m.letters[0].cy - m.fs * 0.55; bandBot = m.letters[0].cy + m.fs * 0.55; }
    var lineW = Math.max(1.4, U * 0.022);

    function addStem(o) {
      var pts = vine(o.x, o.y, o.dir, o.len, o.amp, o.waves, o.ph, o.bend);
      var st = { id: ++uid, pts: pts, d0: o.d0, dur: Math.max(900, o.len / U * 1100), w: lineW, layer: o.layer, leaves: [], rose: null };
      var nl = Math.floor(r() * 3), side = r() < 0.5 ? -1 : 1;
      for (var i = 0; i < nl; i++) {
        var u = 0.25 + r() * 0.55, p = pointAt(pts, u); side = -side;
        st.leaves.push({ x: p.x, y: p.y, a: p.a + side * (0.6 + r() * 0.5), L: U * (0.2 + r() * 0.22), bend: (r() - 0.5), u: u });
      }
      var tip = pointAt(pts, 1), kind = o.tip || (r() < 0.42 * dens ? 'rose' : r() < 0.55 ? 'fan' : r() < 0.6 ? 'leaf' : 'curl');
      if (kind === 'rose') {
        var inBand = tip.y > bandTop && tip.y < bandBot;
        st.rose = { x: tip.x, y: tip.y, R: U * (0.2 + r() * 0.24), rot: (r() - 0.5), ph: r() * 6.28, turns: 1.6 + r() * 0.9 };
        if (inBand) st.layer = 0;                                    // never cover the email with a rose
      } else if (kind === 'fan') {
        for (var j = 0; j < 2; j++) st.leaves.push({ x: tip.x, y: tip.y, a: tip.a + (j - 0.5) * 0.9, L: U * (0.22 + r() * 0.2), bend: (j - 0.5), u: 0.97 });
      } else if (kind === 'leaf') {
        st.leaves.push({ x: tip.x, y: tip.y, a: tip.a, L: U * (0.2 + r() * 0.18), bend: (r() - 0.5), u: 0.97 });
      } else {                                                       // curl: a little spiral at the end
        var sgn = r() < 0.5 ? -1 : 1, rad = U * (0.07 + r() * 0.05), cx = tip.x - Math.sin(tip.a) * sgn * rad, cy = tip.y + Math.cos(tip.a) * sgn * rad;
        var a0 = Math.atan2(tip.y - cy, tip.x - cx);
        for (var k = 1; k <= 14; k++) { var q = k / 14, th = a0 + sgn * q * Math.PI * 1.6, rr = rad * (1 - 0.5 * q); pts.push([cx + Math.cos(th) * rr, cy + Math.sin(th) * rr]); }
      }
      stems.push(st);
    }

    m.letters.forEach(function (l, i) {
      var d0 = (i / Math.max(1, n)) * GROW_MS * 0.55 + r() * 200, base = l.cy + m.fs * 0.3, top = l.cy - m.fs * 0.3;
      var ups = (l.ch === '.' || l.ch === '@') ? 1 : 1 + (r() < 0.55 * dens ? 1 : 0);
      for (var k = 0; k < ups; k++) {
        addStem({ x: l.x + (r() - 0.5) * l.w * 0.6, y: base - r() * m.fs * 0.4, dir: -Math.PI / 2 + (r() - 0.5) * 0.8, len: U * (0.9 + r() * 1.7),
          amp: 0.3 + r() * 0.4, waves: 1 + r() * 1.5, ph: r() * 6.28, bend: (r() - 0.5) * 1.1, d0: d0 + k * 120, layer: r() < 0.3 ? 1 : 0, tip: i === 0 && k === 0 ? 'rose' : null });
      }
      if (r() < 0.4 * dens) {
        addStem({ x: l.x + (r() - 0.5) * l.w * 0.5, y: top + r() * m.fs * 0.3, dir: Math.PI / 2 + (r() - 0.5) * 0.9, len: U * (0.4 + r() * 0.4),
          amp: 0.3 + r() * 0.3, waves: 1 + r(), ph: r() * 6.28, bend: (r() - 0.5), d0: d0 + 100, layer: 0, tip: r() < 0.5 ? 'curl' : 'leaf' });
      }
    });
    END = 600;
    stems.forEach(function (st) { END = Math.max(END, st.d0 + st.dur * 0.8 + 2400); });   // when the last rose has fully opened
    K = Math.max(1, END / TOTAL_MS);                                                          // play the whole thing in TOTAL_MS
  }

  /* ---------- drawing ---------- */
  function strokeFrac(g, pts, f) {
    var n = pts.length - 1, end = f * n, i, x, y;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (i = 1; i < Math.floor(end); i++) g.lineTo(pts[i][0], pts[i][1]);
    var k = Math.min(n - 1, Math.floor(end)), t = end - k;
    x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t; y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t;
    g.lineTo(x, y); g.stroke();
  }
  function drawLeaf(g, x, y, a, L, bend) {
    if (L < 0.6) return;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = COL.stem; g.beginPath(); g.moveTo(0, 0);
    g.quadraticCurveTo(L * 0.45, -L * (0.3 + bend * 0.2), L, 0);
    g.quadraticCurveTo(L * 0.45, L * (0.3 - bend * 0.2), 0, 0); g.fill();
    if (L > 8) { g.strokeStyle = COL.vein; g.lineWidth = Math.max(0.8, L * 0.03); g.beginPath(); g.moveTo(L * 0.1, 0); g.lineTo(L * 0.82, 0); g.stroke(); }
    g.restore();
  }
  var PETALS = [[0, -0.3, 0.52, 0.5, 0], [-0.46, -0.04, 0.55, 0.55, -0.35], [0.46, -0.04, 0.55, 0.55, 0.35], [-0.38, 0.28, 0.57, 0.44, 0.2], [0.38, 0.28, 0.57, 0.44, -0.2], [0, 0.38, 0.5, 0.36, 0]];
  function drawRose(g, ro, t) {              // t = milliseconds since the stem has almost reached its tip
    if (t <= 0) return;
    var R = ro.R, bud = easeOut(t / 700);       // first a small closed bud
    g.save(); g.translate(ro.x, ro.y); g.rotate(ro.rot + (1 - easeOut(t / 2600)) * 0.5);
    g.fillStyle = COL.rose;
    for (var i = 0; i < PETALS.length; i++) {   // then the petals unfold one after another, back to front
      var q = PETALS[i], sc = (0.2 + 0.8 * easeOut((t - 300 - i * 150) / 950)) * bud;
      if (sc <= 0.02) continue;
      g.beginPath(); g.ellipse(q[0] * R * sc, q[1] * R * sc, q[2] * R * sc, q[3] * R * sc, q[4], 0, Math.PI * 2); g.fill();
    }
    var fr = easeOut((t - 1400) / 1000);        // finally the swirl draws itself
    if (R > 4 && fr > 0) {
      g.strokeStyle = COL.line; g.lineWidth = Math.max(0.9, R * 0.05); g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      var last = Math.floor(60 * fr);
      for (var j = 0; j <= last; j++) {
        var u = j / 60, th = ro.ph + u * ro.turns * Math.PI * 2, rr = R * (0.08 + 0.55 * u), x = Math.cos(th) * rr, y = Math.sin(th) * rr * 0.75 - 0.1 * R;
        if (j) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
    g.restore();
  }

  var T = 0, dir = 0, running = false, last = 0, step = -1;
  function draw(now) {
    for (var c = 0; c < 2; c++) { ctx[c].setTransform(dpr, 0, 0, dpr, 0, 0); ctx[c].clearRect(0, 0, W, H); }
    if (T <= 0) return;
    var boil = Math.floor(now / 120), amp = Math.max(0.5, (stems[0] ? stems[0].w : 1) * 0.35);
    for (var layer = 0; layer < 2; layer++) {
      var g = ctx[layer];
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (var i = 0; i < stems.length; i++) {
        var st = stems[i]; if (st.layer !== layer) continue;
        var f = easeInOut((T - st.d0) / st.dur); if (f <= 0) continue;
        g.save();
        g.translate((hash(st.id + boil * 7.1) - 0.5) * amp * 2, (hash(st.id * 3.3 + boil * 2.7) - 0.5) * amp * 2);
        g.strokeStyle = COL.stem; g.lineWidth = st.w;
        strokeFrac(g, st.pts, f);
        for (var k = 0; k < st.leaves.length; k++) {
          var lf = st.leaves[k], sc = easeOut((T - (st.d0 + st.dur * lf.u)) / 1000);
          if (sc > 0.01) drawLeaf(g, lf.x, lf.y, lf.a, lf.L * sc, lf.bend);
        }
        if (st.rose) drawRose(g, st.rose, T - (st.d0 + st.dur * 0.8));
        g.restore();
      }
    }
  }
  function tick(now) {
    var dt = Math.min(64, now - last); last = now;
    if (reduce) T = dir > 0 ? END : 0; else T += (dir > 0 ? dt : -dt * WITHER_SPEED) * K;
    if (T > END) T = END;
    if (T <= 0 && dir < 0) { T = 0; draw(now); dir = 0; running = false; return; }
    draw(now);
    if (dir > 0 && T >= END) setTimeout(function () { requestAnimationFrame(tick); }, 120);   // fully grown: redraw gently
    else requestAnimationFrame(tick);
  }
  function kick(d) {
    dir = d;
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  }

  /* ---------- start and stop ---------- */
  function start() {
    var go = function () {
      if (T === 0) { seed = Math.floor(Math.random() * 1e9) + 1; size(); build(); }
      kick(1);
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
  }
  function stop() { if (running || T > 0) kick(-1); }

  size();
  if (canHover) {
    mail.addEventListener('mouseenter', start);
    mail.addEventListener('mouseleave', stop);
    mail.addEventListener('focus', start);
    mail.addEventListener('blur', stop);
  } else {
    setTimeout(start, AUTO_DELAY);           // phones: grows by itself shortly after the page opens
  }
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { size(); if (T > 0) { build(); if (!running) draw(performance.now()); } }, 150);
  });
})();
