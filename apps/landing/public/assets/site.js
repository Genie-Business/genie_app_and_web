/* Shared behaviour for every page: reveals, parallax, nav theme, mobile menu,
 * download buttons, notify-me forms, the intro loader and the 3D gift. */

/* ---------------------------------------------------------------------------
 * DOWNLOAD LINKS — paste the real URLs here the day the app goes live.
 * Anything left empty shows a "Soon" tag and sends people to the notify form.
 * ------------------------------------------------------------------------- */
const STORES = {
  ios: '',      // e.g. 'https://apps.apple.com/ng/app/genie/id0000000000'
  android: '',  // e.g. 'https://play.google.com/store/apps/details?id=co.genieapps.genie'
  apk: '',      // optional direct Android download, e.g. '/assets/genie.apk'
};

const WAITLIST = ['/api/waitlist'];

const canvas = document.getElementById('bee');
const secs = [...document.querySelectorAll('main > section')];

/* ------------------------------------------------------------------ mobile menu */
const burger = document.querySelector('.nav__burger');
if (burger) {
  burger.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    burger.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('.menu a').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('menu-open')));
}

/* ------------------------------------------------------------------ scroll reveals + parallax + nav theme */
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); });
}, { threshold: .3 });
secs.forEach((s) => io.observe(s));

const par = [...document.querySelectorAll('[data-speed]')];
function onScroll() {
  const vh = innerHeight;
  par.forEach((el) => {
    const sec = el.closest('section');
    const p = -sec.getBoundingClientRect().top / vh;
    const sp = parseFloat(el.dataset.speed) || 0;
    const rot = parseFloat(el.dataset.rot) || 0;
    el.style.transform = `translate3d(0,${p * sp * vh}px,0) rotate(${p * rot}deg)`;
  });
  const y = vh * .06;
  let dark = false;
  for (const s of secs) {
    const r = s.getBoundingClientRect();
    if (r.top <= y && r.bottom > y) { dark = s.dataset.theme === 'dark'; break; }
  }
  document.body.classList.toggle('on-dark', dark);
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
onScroll();

// smooth in-page anchors (links to other pages navigate normally)
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const t = document.querySelector(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    t.scrollIntoView({ behavior: 'smooth' });
  });
});

// the video only plays while it's on screen
const vid = document.querySelector('.vid__media');
if (vid) {
  const vio = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) vid.play().catch(() => {}); else vid.pause(); });
  }, { threshold: .1 });
  vio.observe(vid);
}

/* ------------------------------------------------------------------ download buttons */
document.querySelectorAll('[data-store]').forEach((a) => {
  const url = STORES[a.dataset.store];
  if (url) {
    a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.classList.remove('soon');
  } else {
    a.classList.add('soon');
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const input = (a.closest('section') || document).querySelector('form.wl input');
      if (input) { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => input.focus({ preventScroll: true }), 450); }
    });
  }
});
document.querySelectorAll('[data-apk]').forEach((a) => {
  if (STORES.apk) { a.href = STORES.apk; a.hidden = false; } else a.hidden = true;
});

/* ------------------------------------------------------------------ notify-me forms */
document.querySelectorAll('form.wl').forEach((wl) => {
  const msg = wl.querySelector('.wl__msg');
  const btn = wl.querySelector('button');
  const say = (t, err) => { msg.textContent = t; msg.classList.toggle('err', !!err); };
  wl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = wl.email.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { say('Enter a valid email address.', true); wl.email.focus(); return; }
    btn.disabled = true; say('Saving your spot…');
    let done = false;
    for (const url of WAITLIST) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, source: 'site-3d:' + (document.body.dataset.page || 'page') }) });
        if (res.status === 404 || res.status === 405) continue; // no proxy here — try the API directly
        const j = await res.json().catch(() => ({}));
        if (res.ok) { say(j?.data?.message || 'You’re on the list — we’ll email you the moment genie is live.'); wl.email.value = ''; }
        else say(j?.error?.message || 'Something went wrong — please try again.', true);
        done = true; break;
      } catch { /* network/CORS — try the next endpoint */ }
    }
    if (!done) say('Couldn’t reach genie just now — please try again in a moment.', true);
    btn.disabled = false;
  });
});

/* ------------------------------------------------------------------ loader (home page only) */
const loader = document.getElementById('loader');
let revealed = false;
function reveal() {
  if (revealed) return;
  revealed = true;
  if (loader) loader.classList.add('done');
  document.body.classList.add('loaded');
  canvas.classList.add('ready');
}
if (loader) {
  setTimeout(reveal, 2500);
  Promise.all([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise((r) => setTimeout(r, 900)),
    new Promise((r) => { const im = new Image(); im.onload = im.onerror = r; im.src = '/assets/bg-light.jpg'; }),
  ]).then(reveal);
} else {
  document.body.classList.add('loaded');
}

/* ------------------------------------------------------------------ the 3D gift */
const parseFly = (s) => {
  const [x, y, sc, yaw, pitch, roll] = s.split(',').map(Number);
  return { x, y, s: sc, yaw, pitch, roll };
};
// data-follow (0–1): how strongly the gift tracks the pointer while that section is on screen.
const followOf = (el) => { const f = parseFloat(el.dataset.follow); return Number.isFinite(f) ? f : .5; };
const kd = secs.map((s) => ({ ...parseFly(s.dataset.fly || '0,0,1,120,6,0'), f: followOf(s) }));
const km = secs.map((s) => ({ ...parseFly(s.dataset.flyM || s.dataset.fly || '0,0,.7,120,6,0'), f: followOf(s) }));
let topsCache = [];
const measure = () => { topsCache = secs.map((s) => s.getBoundingClientRect().top + scrollY); };
measure();
addEventListener('resize', measure);
addEventListener('load', measure);
if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);

import('./gift.js')
  .then((m) => {
    m.initGift({ canvas, kd, km, tops: () => topsCache });
    if (!loader) canvas.classList.add('ready');
  })
  .catch((err) => { console.warn('3D gift unavailable:', err); canvas.style.display = 'none'; reveal(); });
