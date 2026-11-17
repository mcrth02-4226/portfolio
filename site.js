/* Otamo Tipa: automatic media linking.
   Every placeholder on the pages has a name (for example event-1-photo-2).
   If a file with that name exists in the images folder (or the clips folder for videos),
   this script swaps the placeholder for it. Upload the file and it appears. */
(function () {
  var root = document.documentElement.getAttribute('data-root') || '';
  var IMG = ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG', 'WEBP'];
  var VID = ['mp4', 'MP4', 'webm', 'mov', 'MOV'];
  var ICO = ['png', 'ico', 'jpg', 'jpeg', 'webp', 'svg'];

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

  function fillImage(el) {
    var name = el.getAttribute('data-slot');
    tryImage(name, IMG, function (url) {
      if (!url) return;
      var img = document.createElement('img');
      img.src = url;
      img.alt = name.replace(/-/g, ' ') + ' by Otamo Tipa';
      img.className = el.className.replace(/\bph\b/, '').trim();
      img.loading = 'lazy';
      img.decoding = 'async';
      el.replaceWith(img);
    });
  }

  function fillVideo(el) {
    var name = el.getAttribute('data-video');
    var i = 0;
    (function next() {
      if (i >= VID.length) return;
      var url = root + 'clips/' + name + '.' + VID[i++];
      var v = document.createElement('video');
      v.muted = true;
      v.controls = true;
      v.setAttribute('playsinline', '');
      v.preload = 'metadata';
      v.onloadedmetadata = function () {
        var box = document.createElement('div');
        box.className = 'embed r9';
        box.appendChild(v);
        el.replaceWith(box);
      };
      v.onerror = next;
      v.src = url + '#t=0.1';
    })();
  }

  function run(el) {
    if (el.hasAttribute('data-video')) fillVideo(el); else fillImage(el);
  }

  // Tab icon: use images/favicon.(png, ico, jpg, jpeg, webp or svg) if it exists
  var link = document.querySelector('link[rel~="icon"]');
  if (link) {
    tryImage('favicon', ICO, function (url) {
      if (url) { link.removeAttribute('type'); link.href = url; }
    });
  }

  var els = document.querySelectorAll('[data-slot],[data-video]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { io.unobserve(e.target); run(e.target); }
      });
    }, { rootMargin: '800px 300px' });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(els, run);
  }
})();
