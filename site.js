/* Otamo Tipa: automatic media linking, loading effect, clip thumbnails and the section menu.
   (Analytics lives in analytics.js.)

   FILE NAMES
   - Every empty box on the pages shows the exact file name it is waiting for (only once we know it is missing).
   - Upload a file with that name to the "images" folder (.webp, .jpg, .jpeg, .png, .JPG or .JPEG) and it appears by itself.
   - Short-form clips: thumbnails are images named short-form-1-thumbnail (images folder);
     the videos are short-form-1.mp4 (clips folder). The video loads only when someone clicks the thumbnail.
   - Alt text: alt/<same name as the image>.txt
   - Tab icon: images/favicon.webp (or .png, .ico, .jpg, .jpeg, .svg).
   Media loads only as you scroll near it, a few files at a time. */
(function () {
  'use strict';

  var MAX_AT_ONCE = 3;             // files loading at the same time
  var LOOK_AHEAD = '350px 150px';  // start loading this far before something scrolls into view
  var ALT_FILES = true;            // set to false to stop looking for alt text files
  var ANIMATE_AFTER = 120;         // ms: the focusing animation only shows if a photo takes longer than this

  var root = document.documentElement.getAttribute('data-root') || '';
  var IMG = ['webp', 'jpg', 'jpeg', 'png', 'JPG', 'JPEG'];
  var VID = ['mp4', 'MP4', 'webm', 'mov', 'MOV'];
  var ICO = ['webp', 'png', 'ico', 'jpg', 'jpeg', 'svg'];
  var lastImg = null, lastVid = null;       // remember which file type worked, try it first next time

  function track(name, data) { if (window.track) window.track(name, data); }
  function order(list, first) {
    return first ? [first].concat(list.filter(function (e) { return e !== first; })) : list;
  }
  function extOf(url) { return url.split('#')[0].split('?')[0].split('.').pop(); }
  function nextFrame(fn) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); }

  /* ---------- short memory (this browser tab only) so moving between pages does not repeat lookups ---------- */
  function cget(key) {
    try {
      var v = JSON.parse(sessionStorage.getItem('ot:' + key));
      if (!v) return null;
      var ttl = v.u === null ? 90000 : 600000;     // "not found" is remembered 90 s, a found file 10 min
      return (Date.now() - v.t > ttl) ? null : v;
    } catch (e) { return null; }
  }
  function cset(key, u) {
    try { sessionStorage.setItem('ot:' + key, JSON.stringify({ u: u, t: Date.now() })); } catch (e) {}
  }

  /* ---------- only a few downloads at once ---------- */
  var active = 0, queue = [], done = 0;
  function enqueue(job) { queue.push(job); pump(); }
  function pump() {
    while (active < MAX_AT_ONCE && queue.length) {
      active++;
      queue.shift()(function () { active--; done++; pump(); });
    }
    if (!active && !queue.length && done > 0) startFrames();   // the first photos are in: now the 360 view can load
  }

  /* ---------- heavy embeds (the 360 view): load right after the first photos, never before them ---------- */
  var framesStarted = false;
  function startFrames() {
    if (framesStarted) return;
    framesStarted = true;
    Array.prototype.forEach.call(document.querySelectorAll('iframe[data-src]'), function (f) {
      var box = f.parentNode;
      f.addEventListener('load', function () { box.classList.remove('is-loading'); f.classList.add('in'); }, { once: true });
      f.src = f.getAttribute('data-src');
    });
  }
  if (document.querySelector('iframe[data-src]')) setTimeout(startFrames, 3000);   // safety: never wait longer than this

  /* ---------- find an image: load it straight away, one request when the file type is guessed right ---------- */
  function tryLoad(url, ok, bad) {
    var im = new Image();
    im.decoding = 'async';
    im.onload = function () { ok(url); };
    im.onerror = bad;
    im.src = url;
  }
  function findImage(folder, name, exts, cb) {
    var key = folder + '/' + name, c = cget(key);
    if (c && c.u === null) { cb(null); return; }           // looked a moment ago: not there
    var all = order(exts, lastImg).map(function (e) { return root + folder + '/' + name + '.' + e; });
    var list = (c && c.u) ? [c.u].concat(all.filter(function (u) { return u !== c.u; })) : all;
    function found(url) { lastImg = extOf(url); cset(key, url); cb(url); }
    // 1) the most likely file type on its own (one request when the guess is right, which is nearly always)
    tryLoad(list[0], function () { found(list[0]); }, function () {
      // 2) otherwise try the other types all at once, so a missing file is settled in one extra round trip
      var rest = list.slice(1), pending = rest.length, hits = [];
      if (!pending) { cset(key, null); cb(null); return; }
      rest.forEach(function (url, i) {
        tryLoad(url, function () { hits.push([i, url]); settle(); }, settle);
      });
      function settle() {
        if (--pending) return;
        if (!hits.length) { cset(key, null); cb(null); return; }
        hits.sort(function (a, b) { return a[0] - b[0]; });
        found(hits[0][1]);
      }
    });
  }

  /* ---------- video lookup (only when someone clicks a clip): a tiny HEAD request ---------- */
  var headOK = true;
  function exists(url, cb) {
    function viaElement() {
      var v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = function () { cb(true); };
      v.onerror = function () { cb(false); };
      v.src = url;
    }
    if (!headOK || !window.fetch) { viaElement(); return; }
    fetch(url, { method: 'HEAD' }).then(function (r) {
      cb(r.ok && (r.headers.get('content-type') || '').indexOf('video') === 0);
    }).catch(function () { headOK = false; viaElement(); });
  }
  function findVideo(name, cb) {
    var list = order(VID, lastVid), i = 0;
    (function next() {
      if (i >= list.length) { cb(null); return; }
      var url = root + 'clips/' + name + '.' + list[i++];
      exists(url, function (ok) { if (ok) cb(url); else next(); });
    })();
  }

  /* ---------- alt text: alt/<same name as the image>.txt ---------- */
  function loadAlt(name, apply) {
    if (!ALT_FILES || !window.fetch) return;
    var key = 'alt/' + name, c = cget(key);
    if (c) { if (c.u) apply(c.u); return; }
    fetch(root + 'alt/' + name + '.txt').then(function (r) {
      var ct = (r.headers.get('content-type') || '').toLowerCase();
      if (!r.ok || ct.indexOf('text/html') > -1) return '';
      return r.text();
    }).then(function (t) {
      t = (t || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      cset(key, t || null);
      if (t) apply(t);
    }).catch(function () {});
  }

  /* ---------- photos ---------- */
  function fillImage(el, finish) {
    var name = el.getAttribute('data-slot');
    var timer = setTimeout(function () { el.classList.add('is-loading'); }, ANIMATE_AFTER);
    findImage('images', name, IMG, function (url) {
      clearTimeout(timer);
      if (!url) {                                            // not uploaded yet: only now is the file name shown
        el.classList.remove('is-loading');
        el.classList.add('missing');
        finish();
        return;
      }
      var img = document.createElement('img');
      img.src = url;                                         // already downloaded, so this is instant
      img.alt = name.replace(/-/g, ' ') + ' by Otamo Tipa';
      img.decoding = 'async';
      img.className = (el.className.replace(/\bph\b/, '').replace(/\bis-loading\b/, '') + ' reveal').trim();
      loadAlt(name, function (t) { img.alt = t; });
      el.replaceWith(img);
      nextFrame(function () { img.classList.add('in'); });
      finish();
    });
  }

  /* ---------- short-form clips: thumbnail first, the video loads on click ---------- */
  function fillClip(el, finish) {
    var name = el.getAttribute('data-clip');
    var ratio = el.getAttribute('data-ratio') || 'r43';
    var timer = setTimeout(function () { el.classList.add('is-loading'); }, ANIMATE_AFTER);
    findImage('images', name + '-thumbnail', IMG, function (thumb) {
      clearTimeout(timer);
      if (!thumb) { el.classList.remove('is-loading'); el.classList.add('missing'); finish(); return; }
      var clip = document.createElement('div');
      clip.className = 'clip ' + ratio;
      clip.setAttribute('role', 'button');
      clip.setAttribute('tabindex', '0');
      clip.setAttribute('aria-label', 'Play ' + name.replace(/-/g, ' '));
      var img = document.createElement('img');
      img.alt = '';
      img.src = thumb;
      img.className = 'reveal';
      var play = document.createElement('span');
      play.className = 'play';
      clip.appendChild(img);
      clip.appendChild(play);
      loadAlt(name + '-thumbnail', function (t) { clip.setAttribute('aria-label', 'Play: ' + t); });
      function go() { playClip(clip, name, thumb); }
      clip.addEventListener('click', go);
      clip.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
      el.replaceWith(clip);
      nextFrame(function () { img.classList.add('in'); });
      finish();
    });
  }

  function message(clip, text) {
    var msg = document.createElement('span');
    msg.className = 'msg';
    msg.textContent = text;
    clip.appendChild(msg);
  }

  function playClip(clip, name, thumb) {
    if (clip.classList.contains('is-loading') || clip.classList.contains('playing')) return;
    clip.classList.add('is-loading');
    track('clip_play', { clip: name });
    findVideo(name, function (url) {
      if (!url) { clip.classList.remove('is-loading'); message(clip, 'Video coming soon'); return; }
      lastVid = extOf(url);
      var v = document.createElement('video');
      v.setAttribute('playsinline', '');
      v.preload = 'auto';
      v.poster = thumb;
      v.addEventListener('canplay', function () {
        clip.classList.remove('is-loading');
        clip.classList.add('playing');
        v.controls = true;
        var play = clip.querySelector('.play');
        if (play) play.remove();
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      }, { once: true });
      v.onerror = function () {
        v.remove();
        clip.classList.remove('is-loading');
        message(clip, 'This video could not be loaded');
      };
      v.src = url;
      clip.appendChild(v);                       // video sits on top, hidden until it can play
    });
  }

  function run(el) {
    enqueue(function (finish) {
      if (el.hasAttribute('data-clip')) fillClip(el, finish); else fillImage(el, finish);
    });
  }

  /* ---------- tab icon ---------- */
  var link = document.querySelector('link[rel~="icon"]');
  if (link) {
    var iconHref = link.getAttribute('href') || '';
    // the page already points at images/favicon.webp, so only look further if that file is not the one in use
    findImage('images', 'favicon', ICO, function (url) {
      if (url && iconHref.indexOf(url.replace(root, '')) === -1) { link.removeAttribute('type'); link.href = url; }
    });
  }

  /* ---------- start: only things near the screen load ---------- */
  var els = document.querySelectorAll('[data-slot],[data-clip]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { io.unobserve(e.target); run(e.target); }
      });
    }, { rootMargin: LOOK_AHEAD });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(els, run);
  }

  /* ---------- section menu: the link for the section you are in stays bright, the others dim ---------- */
  (function () {
    var links = document.querySelectorAll('nav.sections a[href^="#"]');
    var items = [];
    Array.prototype.forEach.call(links, function (a) {
      var t = document.getElementById(a.getAttribute('href').slice(1));
      if (t) items.push({ a: a, t: t });
    });
    if (!items.length) return;
    var ticking = false, current = null, locked = null;
    function apply(pick) {
      if (pick === current) return;
      current = pick;
      items.forEach(function (it) {
        var on = it === pick;
        it.a.classList.toggle('is-current', on);
        if (on) it.a.setAttribute('aria-current', 'location'); else it.a.removeAttribute('aria-current');
      });
    }
    function update() {
      ticking = false;
      if (locked) { apply(locked); return; }
      var line = window.innerHeight * 0.4, pick = items[0];
      items.forEach(function (it) { if (it.t.getBoundingClientRect().top <= line) pick = it; });
      apply(pick);
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    // after you click a section link it stays highlighted, even for short sections at the very bottom of the page,
    // until you scroll yourself
    items.forEach(function (it) { it.a.addEventListener('click', function () { locked = it; apply(it); }); });
    ['wheel', 'touchmove', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, function () { locked = null; onScroll(); }, { passive: true });
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  })();
  /* ---------- "Jump to top": a timed, eased scroll, so you can watch the page glide up ---------- */
  (function () {
    var btn = document.querySelector('.bar .mid');
    if (!btn) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var raf = 0, restore = null;
    function stop() {                                  // any scroll of your own cancels the glide
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (restore) { restore(); restore = null; }
    }
    ['wheel', 'touchstart', 'keydown'].forEach(function (ev) { window.addEventListener(ev, stop, { passive: true }); });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var from = window.pageYOffset;
      if (from <= 0) return;
      if (reduce) { window.scrollTo(0, 0); return; }
      stop();
      var de = document.documentElement, prev = de.style.scrollBehavior;
      de.style.scrollBehavior = 'auto';                // we drive the scrolling ourselves
      restore = function () { de.style.scrollBehavior = prev; };
      var dur = Math.min(1600, Math.max(700, 350 + from * 0.12)), t0 = null;   // longer pages glide a little longer
      function step(now) {
        if (t0 === null) t0 = now;
        var p = Math.min(1, (now - t0) / dur), k = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        window.scrollTo(0, from * (1 - k));
        if (p < 1) raf = requestAnimationFrame(step); else { raf = 0; stop(); }
      }
      raf = requestAnimationFrame(step);
    });
  })();
})();
