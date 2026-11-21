/* Otamo Tipa: website analytics (no cookies).
   Two free tools can be switched on by pasting an ID below. Leave a value empty to keep that tool off.
   1) Cloudflare Web Analytics: visitors, countries, devices, browsers, referrers, pages.
   2) Umami (cloud.umami.is): the same, plus the clicks and scrolling tracked at the bottom of this file. */
(function () {
  'use strict';

  var CF_TOKEN = '';   // Cloudflare Web Analytics token, for example a32f0c...
  var UMAMI_ID = '';   // Umami "Website ID", for example 1b2c3d4e-....
  var UMAMI_SRC = 'https://cloud.umami.is/script.js';

  var pending = [];
  function addScript(src, attrs, onload) {
    var s = document.createElement('script');
    s.defer = true;
    s.src = src;
    Object.keys(attrs).forEach(function (k) { s.setAttribute(k, attrs[k]); });
    if (onload) s.onload = onload;
    document.head.appendChild(s);
  }

  // Not while previewing from a local folder or localhost (keeps your numbers clean),
  // and only after the page has finished loading so analytics never slow down the first view.
  var LOCAL = location.protocol === 'file:' || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
  function whenReady(fn) {
    function go() { if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 3000 }); else setTimeout(fn, 1500); }
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
  }
  if (!LOCAL) whenReady(function () {
    if (CF_TOKEN) {
      addScript('https://static.cloudflareinsights.com/beacon.min.js', { 'data-cf-beacon': JSON.stringify({ token: CF_TOKEN }) });
    }
    if (UMAMI_ID) {
      addScript(UMAMI_SRC, { 'data-website-id': UMAMI_ID }, function () {
        pending.splice(0).forEach(function (p) { send(p[0], p[1]); });
      });
    }
  });

  function send(name, data) {
    if (window.umami && window.umami.track) {
      if (data) window.umami.track(name, data); else window.umami.track(name);
    }
  }
  // site.js calls this for events such as clip_play
  window.track = function (name, data) {
    if (!UMAMI_ID || LOCAL) return;
    if (window.umami && window.umami.track) send(name, data); else pending.push([name, data]);
  };

  /* ---- things tracked automatically (only shows up if Umami is switched on) ---- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    var h = a.getAttribute('href') || '';
    if (h.indexOf('mailto:') === 0) window.track('email_click');
    else if (h.indexOf('instagram.com') > -1) window.track('instagram_click');
    else if (a.classList.contains('full')) window.track('image_link_click', { to: h });
    else if (a.closest('nav')) window.track('nav_click', { to: h });
  });

  var depthDone = {};
  function onScroll() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    if (max <= 0) return;
    var pct = Math.round((window.scrollY / max) * 100);
    [25, 50, 75, 100].forEach(function (m) {
      if (pct >= m && !depthDone[m]) { depthDone[m] = true; window.track('scroll_depth', { percent: m }); }
    });
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    setTimeout(function () { ticking = false; onScroll(); }, 400);
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !seen[en.target.id]) {
          seen[en.target.id] = true;
          window.track('section_view', { section: en.target.id });
        }
      });
    }, { threshold: 0.35 });
    document.addEventListener('DOMContentLoaded', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.label[id],.event[id],.hero[id],footer[id]'), function (el) { io.observe(el); });
    });
  }
})();
