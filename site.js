/* Otamo Tipa: automatic media linking.
   Every placeholder has a name (for example event-1-photo-2).
   If a file with that name exists in the images folder (or the clips folder for videos),
   this script swaps the placeholder for it. Upload the file and it appears.
   Media only loads as you scroll near it, a few at a time, so pages open fast. */
(function () {
  var root = document.documentElement.getAttribute('data-root') || '';
  var IMG = ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG', 'WEBP'];
  var VID = ['mp4', 'MP4', 'webm', 'mov', 'MOV'];
  var ICO = ['png', 'ico', 'jpg', 'jpeg', 'webp', 'svg'];
  var MAX_AT_ONCE = 3;     // how many files load at the same time
  var LOOK_AHEAD = '350px 150px'; // start loading this far before something scrolls into view
  var lastImg = null, lastVid = null; // remember which extension worked, try it first next time

  function order(list, first) {
    return first ? [first].concat(list.filter(function (e) { return e !== first; })) : list;
  }
  function extOf(url) { return url.split('#')[0].split('.').pop(); }

  // Simple queue: only a few things download at once
  var active = 0, queue = [];
  function enqueue(job) { queue.push(job); pump(); }
  function pump() {
    while (active < MAX_AT_ONCE && queue.length) {
      active++;
      queue.shift()(function () { active--; pump(); });
    }
  }

  function tryImage(name, exts, done) {
    var i = 0;
    (function next() {
      if (i >= exts.length) { done(null); return; }
      var url = root + 'images/' + name + '.' + exts[i++];
      var im = new Image();
      im.onload = function () { done(url); };
      im.onerror = next;
      im.src = url;
    })();
  }

  function fillImage(el, finish) {
    var name = el.getAttribute('data-slot');
    tryImage(name, order(IMG, lastImg), function (url) {
      if (url) {
        lastImg = extOf(url);
        var img = document.createElement('img');
        img.src = url;
        img.alt = name.replace(/-/g, ' ') + ' by Otamo Tipa';
        img.className = el.className.replace(/\bph\b/, '').trim();
        img.decoding = 'async';
        el.replaceWith(img);
      }
      finish();
    });
  }

  function fillVideo(el, finish) {
    var name = el.getAttribute('data-video');
    var exts = order(VID, lastVid), i = 0;
    (function next() {
      if (i >= exts.length) { finish(); return; }
      var ext = exts[i++];
      var v = document.createElement('video');
      v.muted = true;
      v.controls = true;
      v.setAttribute('playsinline', '');
      v.preload = 'metadata';          // only fetch the first frame until someone presses play
      v.onloadedmetadata = function () {
        lastVid = ext;
        var box = document.createElement('div');
        box.className = 'embed ' + (el.getAttribute('data-ratio') || 'r43');
        box.appendChild(v);
        el.replaceWith(box);
        finish();
      };
      v.onerror = next;
      v.src = root + 'clips/' + name + '.' + ext + '#t=0.1';
    })();
  }

  function run(el) {
    enqueue(function (finish) {
      if (el.hasAttribute('data-video')) fillVideo(el, finish); else fillImage(el, finish);
    });
  }

  // Tab icon: use images/favicon.(png, ico, jpg, jpeg, webp or svg) if it exists
  var link = document.querySelector('link[rel~="icon"]');
  if (link) {
    enqueue(function (finish) {
      tryImage('favicon', ICO, function (url) {
        if (url) { link.removeAttribute('type'); link.href = url; }
        finish();
      });
    });
  }

  var els = document.querySelectorAll('[data-slot],[data-video]');
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
})();
