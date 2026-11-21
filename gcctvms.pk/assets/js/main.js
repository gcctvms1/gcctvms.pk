// GCCTVMS Pakistan — site behaviour
document.documentElement.classList.remove('no-js');

// Where form submissions go (opens the visitor's email app).
// Swap for a form service or server endpoint when one is set up.
const LEAD_EMAIL = 'info@gcctvms.com';

// Sticky header shadow
const header = document.getElementById('header');
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Mobile menu
const burger = document.getElementById('burger');
const nav = document.getElementById('nav');
const setMenu = open => {
  nav.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
};
burger.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

// Dropdowns (Services, More): hover on desktop, tap/click on phones and keyboards
const dropdowns = [...document.querySelectorAll('.nav__item.has-menu')];
const closeDropdowns = except => dropdowns.forEach(d => {
  if (d === except) return;
  d.classList.remove('is-open');
  d.querySelector('.nav__toggle').setAttribute('aria-expanded', 'false');
});
dropdowns.forEach(item => {
  const btn = item.querySelector('.nav__toggle');
  btn.addEventListener('click', () => {
    const open = !item.classList.contains('is-open');
    closeDropdowns(item);
    item.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
  });
});
document.addEventListener('click', e => { if (!e.target.closest('.has-menu')) closeDropdowns(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDropdowns(); });

// Social dock: click the handle at the top to fold the icons away / bring them back (remembered between visits)
const dock = document.getElementById('dock');
if (dock) {
  const toggle = dock.querySelector('.dock__toggle');
  const icons = document.getElementById('dockIcons');
  const setDock = (min, save) => {
    dock.classList.toggle('is-min', min);
    icons.inert = min;
    toggle.setAttribute('aria-expanded', String(!min));
    toggle.setAttribute('aria-label', min ? 'Show social media links' : 'Hide social media links');
    toggle.title = min ? 'Show social links' : 'Hide social links';
    if (save) { try { localStorage.setItem('gc-dock-min', min ? '1' : '0'); } catch {} }
  };
  let startMin = false;
  try { startMin = localStorage.getItem('gc-dock-min') === '1'; } catch {}
  if (startMin) {
    dock.classList.add('no-anim');
    setDock(true, false);
    requestAnimationFrame(() => requestAnimationFrame(() => dock.classList.remove('no-anim')));
  } else setDock(false, false);
  toggle.addEventListener('click', () => setDock(!dock.classList.contains('is-min'), true));
  toggle.addEventListener('mouseenter', () => dock.classList.add('is-hover'));
  toggle.addEventListener('mouseleave', () => dock.classList.remove('is-hover'));
}

// Duplicate the partner logos so the marquee loops seamlessly
document.querySelectorAll('.marquee__track').forEach(track => {
  track.innerHTML += track.innerHTML;
  track.querySelectorAll('img').forEach((img, i, all) => { if (i >= all.length / 2) img.setAttribute('aria-hidden', 'true'); });
});

// Count-up numbers
const countUp = el => {
  const target = +el.dataset.count;
  const start = performance.now();
  const dur = 1600;
  const tick = now => {
    const p = Math.min((now - start) / dur, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

// Reveal-on-scroll and counters
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.classList.add('is-in');
      if (el.matches('[data-count]')) countUp(el);
      el.querySelectorAll('[data-count]').forEach(countUp);
      io.unobserve(el);
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  // Counters that aren't inside a fade-in section still count up when seen
  document.querySelectorAll('[data-count]').forEach(el => { if (!el.closest('.reveal')) io.observe(el); });
} else {
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-in'));
  document.querySelectorAll('[data-count]').forEach(el => { el.textContent = el.dataset.count; });
}

// Industry tabs (with arrow-key support)
const tabs = [...document.querySelectorAll('[role="tab"]')];
const selectTab = tab => {
  tabs.forEach(t => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  });
};
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', e => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    selectTab(next);
    next.focus();
  });
});

// FAQ: smooth open/close, one answer open at a time
const faqs = [...document.querySelectorAll('.accordion details')];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FAQ_MS = 380;
const FAQ_EASE = 'cubic-bezier(.4, 0, .2, 1)';

const animateHeight = (d, from, to, done) => {
  d._anim?.cancel();
  if (reduceMotion) { done?.(); return; }
  d._anim = d.animate({ height: [`${from}px`, `${to}px`] }, { duration: FAQ_MS, easing: FAQ_EASE });
  d._anim.onfinish = () => { d._anim = null; done?.(); };
};

const closedHeight = d => {
  const cs = getComputedStyle(d);
  return d.querySelector('summary').offsetHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
};

const openFaq = d => {
  const from = d.offsetHeight;
  d.open = true;
  d.classList.add('is-active');
  animateHeight(d, from, d.scrollHeight + (d.offsetHeight - d.clientHeight));
};

const closeFaq = d => {
  if (!d.open) return;
  d.classList.remove('is-active');
  animateHeight(d, d.offsetHeight, closedHeight(d), () => { d.open = false; });
};

faqs.forEach(d => {
  if (d.open) d.classList.add('is-active');
  d.querySelector('summary').addEventListener('click', e => {
    e.preventDefault();
    if (d.classList.contains('is-active')) closeFaq(d);
    else {
      faqs.forEach(o => { if (o !== d) closeFaq(o); });
      openFaq(d);
    }
  });
});

// Open an FAQ when its link (#id) is followed, e.g. from the FAQ page's question list
const openFaqFromHash = () => {
  const d = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (!d || !faqs.includes(d) || d.classList.contains('is-active')) return;
  faqs.forEach(o => { if (o !== d) closeFaq(o); });
  openFaq(d);
};
window.addEventListener('hashchange', openFaqFromHash);
openFaqFromHash();

// YouTube: load the player only when clicked
document.querySelectorAll('.video[data-yt]').forEach(box => {
  box.querySelector('.video__play').addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${box.dataset.yt}?autoplay=1&rel=0`;
    iframe.title = 'GCCTVMS video';
    iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    box.replaceChildren(iframe);
  });
});

// Forms
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const showStatus = (form, msg, ok) => {
  const s = form.querySelector('.form-status');
  s.textContent = msg;
  s.className = 'form-status ' + (ok ? 'ok' : 'err');
};
const openMail = (subject, body) => {
  window.location.href = `mailto:${LEAD_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

const quote = document.getElementById('quoteForm');
if (quote) quote.addEventListener('submit', e => {
  e.preventDefault();
  const f = quote.elements;
  let bad = null;
  [f.name, f.phone, f.email].forEach(el => {
    const invalid = !el.value.trim() || (el.type === 'email' && !isEmail(el.value));
    el.classList.toggle('is-invalid', invalid);
    if (invalid && !bad) bad = el;
  });
  if (bad) { bad.focus(); return showStatus(quote, 'Please fill in your name, phone and a valid email.', false); }
  openMail(`Quote request: ${f.service.value}`,
    `Name: ${f.name.value}\nPhone: ${f.phone.value}\nEmail: ${f.email.value}\nService: ${f.service.value}\n\n${f.message.value}`);
  showStatus(quote, 'Thanks! Your email app should open with your request ready to send.', true);
});

const news = document.getElementById('newsForm');
if (news) news.addEventListener('submit', e => {
  e.preventDefault();
  const email = news.elements.email.value.trim();
  if (!isEmail(email)) return showStatus(news, 'Please enter a valid email address.', false);
  openMail('Newsletter subscription', `Please add ${email} to the GCCTVMS newsletter.`);
  showStatus(news, 'Thanks for subscribing!', true);
});

document.getElementById('year').textContent = new Date().getFullYear();
