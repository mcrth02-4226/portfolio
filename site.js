/* Otamo Tipa: automatic media linking, loading effect and clip thumbnails.
   (Analytics lives in analytics.js.)

   FILE NAMES
   - Every empty box on the pages shows the exact file name it is waiting for.
   - Upload a file with that name to the "images" folder (.jpg, .jpeg, .png or .webp) and it appears by itself.
   - Short-form clips: thumbnails are images named short-form-1-thumbnail (images folder);
     the videos are short-form-1.mp4 (clips folder). The video loads only when someone clicks the thumbnail.
   - Tab icon: images/favicon.png (or .ico, .jpg, .svg).
   Media loads only as you scroll near it, a few files at a time. */
(function () {
  var MAX_AT_ONCE = 3;             // files loading at the same time
  var LOOK_AHEAD = '350px 150px';  // start loading this far before something scrolls into view

  var root = document.documentElement.getAttribute('data-root') || '';
  var IMG = ['webp', 'jpg', 'jpeg', 'png', 'WEBP', 'JPG', 'JPEG', 'PNG'];
  var VID = ['mp4', 'MP4', 'webm', 'mov', 'MOV'];
  var ICO = ['png', 'ico', 'jpg', 'jpeg', 'webp', 'svg'];
  var lastImg = null, lastVid = null; // remember which extension worked, try it first next time

  function track(name, data) { if (window.track) window.track(name, data); }
  function order(list, first) {
    return first ? [first].concat(list.filter(function (e) { return e !== first; })) : list;
  }
  function extOf(url) { return url.split('#')[0].split('.').pop(); }

  // Only a few downloads at once
  var active = 0, queue = [];
  function enqueue(job) { queue.push(job); pump(); }
  function pump() {
    while (active < MAX_AT_ONCE && queue.length) {
      active++;
      queue.shift()(function () { active--; pump(); });
    }
  }

  // Does this file exist? A tiny HEAD request (no download). Falls back to loading the file
  // when HEAD isn't possible, for example when the site is opened from a local folder.
  var headOK = true;
  function exists(url, kind, cb) {
    function viaElement() {
      if (kind === 'image') {
        var im = new Image();
        im.onload = function () { cb(true); };
        im.onerror = function () { cb(false); };
        im.src = url;
      } else {
        var v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = function () { cb(true); };
        v.onerror = function () { cb(false); };
        v.src = url;
      }
    }
    if (!headOK || !window.fetch) { viaElement(); return; }
    fetch(url, { method: 'HEAD' }).then(function (r) {
      cb(r.ok && (r.headers.get('content-type') || '').indexOf(kind) === 0);
    }).catch(function () { headOK = false; viaElement(); });
  }
  function find(folder, name, exts, kind, cb) {
    var i = 0;
    (function next() {
      if (i >= exts.length) { cb(null); return; }
      var url = root + folder + '/' + name + '.' + exts[i++];
      exists(url, kind, function (ok) { if (ok) cb(url); else next(); });
    })();
  }

  /* ---------- alt text: put alt/<same name as the image>.txt in the repo to describe an image ---------- */
  var ALT_FILES = true;   // set to false to stop looking for alt text files
  function loadAlt(name, apply) {
    if (!ALT_FILES || !window.fetch) return;
    fetch(root + 'alt/' + name + '.txt').then(function (r) {
      var ct = (r.headers.get('content-type') || '').toLowerCase();
      if (!r.ok || ct.indexOf('text/html') > -1) return '';
      return r.text();
    }).then(function (t) {
      t = (t || '').replace(/\s+/g, ' ').trim();
      if (t) apply(t.slice(0, 300));
    }).catch(function () {});
  }

  /* ---------- photos ---------- */
  function fillImage(el, finish) {
    var name = el.getAttribute('data-slot');
    find('images', name, order(IMG, lastImg), 'image', function (url) {
      if (!url) { finish(); return; }            // not uploaded yet: the file name stays visible
      lastImg = extOf(url);
      el.classList.add('is-loading');            // the file exists: show the focusing animation
      var im = new Image();
      im.onload = function () {
        var img = document.createElement('img');
        img.src = url;
        img.alt = name.replace(/-/g, ' ') + ' by Otamo Tipa';
        img.className = (el.className.replace(/\bph\b/, '').replace(/\bis-loading\b/, '') + ' reveal').trim();
        img.decoding = 'async';
        loadAlt(name, function (t) { img.alt = t; });
        el.replaceWith(img);
        requestAnimationFrame(function () { requestAnimationFrame(function () { img.classList.add('in'); }); });
        finish();
      };
      im.onerror = function () { el.classList.remove('is-loading'); finish(); };
      im.src = url;
    });
  }

  /* ---------- short-form clips: thumbnail first, the video loads on click ---------- */
  function fillClip(el, finish) {
    var name = el.getAttribute('data-clip');
    var ratio = el.getAttribute('data-ratio') || 'r43';
    find('images', name + '-thumbnail', order(IMG, lastImg), 'image', function (thumb) {
      if (!thumb) { finish(); return; }
      lastImg = extOf(thumb);
      el.classList.add('is-loading');
      var im = new Image();
      im.onload = function () {
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
        requestAnimationFrame(function () { requestAnimationFrame(function () { img.classList.add('in'); }); });
        finish();
      };
      im.onerror = function () { el.classList.remove('is-loading'); finish(); };
      im.src = thumb;
    });
  }

  function playClip(clip, name, thumb) {
    if (clip.classList.contains('is-loading') || clip.classList.contains('playing')) return;
    clip.classList.add('is-loading');
    track('clip_play', { clip: name });
    find('clips', name, order(VID, lastVid), 'video', function (url) {
      if (!url) {
        clip.classList.remove('is-loading');
        var msg = document.createElement('span');
        msg.className = 'msg';
        msg.textContent = 'Video coming soon';
        clip.appendChild(msg);
        return;
      }
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
        var msg = document.createElement('span');
        msg.className = 'msg';
        msg.textContent = 'This video could not be loaded';
        clip.appendChild(msg);
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
    enqueue(function (finish) {
      find('images', 'favicon', ICO, 'image', function (url) {
        if (url) { link.removeAttribute('type'); link.href = url; }
        finish();
      });
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
    var ticking = false, current = null;
    function update() {
      ticking = false;
      var line = window.innerHeight * 0.4, pick = items[0];
      items.forEach(function (it) { if (it.t.getBoundingClientRect().top <= line) pick = it; });
      if (pick === current) return;
      current = pick;
      items.forEach(function (it) {
        var on = it === pick;
        it.a.classList.toggle('is-current', on);
        if (on) it.a.setAttribute('aria-current', 'location'); else it.a.removeAttribute('aria-current');
      });
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  })();
})();
