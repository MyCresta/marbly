import { densityClass } from './marbles.js';

const $ = (sel) => document.querySelector(sel);

export function createUI() {
  const loader = $('#loader');
  const bar = $('#loader-bar');
  const status = $('#loader-status');
  let opts = null;
  let hintTimer = 9;
  let hintHidden = false;

  const api = {
    progress(p, text) {
      bar.style.transform = `scaleX(${p})`;
      if (text) status.textContent = text;
    },
    ready() {
      loader.classList.add('done');
      document.body.classList.add('ready');
      setTimeout(() => loader.remove(), 1200);
    },
    init(o) {
      opts = o;
      const row = $('#marbles');
      o.types.forEach((t, i) => {
        const b = document.createElement('button');
        b.className = 'marble';
        b.type = 'button';
        b.setAttribute('aria-label', `${t.name}, ${(t.density / 1000).toFixed(2)} grams per cubic centimetre`);
        b.innerHTML = `<img src="${o.thumbs[i]}" alt="" draggable="false"><span class="key">${i + 1}</span>`;
        b.addEventListener('click', () => {
          api.select(i);
          o.onSelect(i);
        });
        b.addEventListener('dblclick', () => o.onDrop());
        row.appendChild(b);
      });
      $('#drop').addEventListener('click', () => { o.onDrop(); api.flashDrop(); });
      $('#drop-all').addEventListener('click', () => o.onDropAll());
      $('#auto').addEventListener('click', () => api.toggleAuto());
      $('#clear').addEventListener('click', () => o.onClear());
      const courseBtn = $('#course-btn');
      const menu = $('#course-menu');
      const closeMenu = () => {
        document.body.classList.remove('menu-open');
        courseBtn.setAttribute('aria-expanded', 'false');
      };
      courseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !document.body.classList.contains('menu-open');
        document.body.classList.toggle('menu-open', open);
        courseBtn.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', closeMenu);
      o.courses.forEach((c) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'course-item';
        item.dataset.course = c.id;
        item.setAttribute('role', 'menuitem');
        item.innerHTML = `<strong>${c.name}</strong><span>${c.blurb}</span>`;
        item.addEventListener('click', () => {
          closeMenu();
          o.onCourse(c.id);
        });
        menu.appendChild(item);
      });
      const wind = $('#wind');
      wind.addEventListener('click', () => {
        const on = wind.getAttribute('aria-pressed') !== 'true';
        wind.setAttribute('aria-pressed', String(on));
        o.onWind(on);
      });
      const snd = $('#sound');
      snd.addEventListener('click', () => {
        const on = snd.getAttribute('aria-pressed') !== 'true';
        snd.setAttribute('aria-pressed', String(on));
        o.onSound(on);
      });
      const fs = $('#fullscreen');
      if (!document.fullscreenEnabled) fs.hidden = true;
      fs.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      });
      $('#card-toggle').addEventListener('click', () => document.body.classList.toggle('card-open'));
      api.select(o.selected);
    },
    select(i) {
      const t = opts.types[i];
      document.querySelectorAll('.marble').forEach((el, k) => el.classList.toggle('active', k === i));
      const g = t.density / 1000;
      $('#card-name').textContent = t.name;
      $('#card-substance').textContent = t.substance;
      $('#card-density').textContent = g < 10 ? g.toFixed(2) : g.toFixed(1);
      $('#card-mass').textContent = `${opts.massOf(t).toFixed(1)} g`;
      $('#card-bounce').textContent = t.restitution > 0.75 ? 'Lively' : t.restitution > 0.52 ? 'Crisp' : 'Soft';
      $('#card-grip').textContent = t.friction > 0.6 ? 'Grippy' : t.friction > 0.3 ? 'Even' : 'Slick';
      const cls = densityClass(t.density);
      $('#card-roll').textContent = t.rolling <= 3.5 ? 'Easy' : t.rolling <= 4.4 ? 'Smooth' : t.rolling <= 5.5 ? 'Draggy' : 'Sticky';
      const pos = (Math.log(g) - Math.log(0.5)) / (Math.log(25) - Math.log(0.5));
      $('#scale-marker').style.left = `${(pos * 100).toFixed(1)}%`;
      $('#scale-marker').style.background = t.swatch;
      document.querySelectorAll('.scale-zone').forEach((z) => z.classList.toggle('on', z.dataset.zone === cls));
      const btn = document.querySelectorAll('.marble')[i];
      if (btn) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    },
    setCourse(course) {
      $('#course-name').textContent = course.name;
      document.querySelectorAll('.course-item').forEach((el) => el.classList.toggle('active', el.dataset.course === course.id));
      const nav = $('#views');
      nav.innerHTML = '';
      for (const v of [...course.views, { id: 'follow', label: 'Follow' }]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.view = v.id;
        b.textContent = v.label;
        b.addEventListener('click', () => opts.onView(v.id));
        nav.appendChild(b);
      }
      api.setView('overview');
      $('#results').hidden = !course.race;
      $('#wind').hidden = !course.fan;
    },
    raceResults(status, rows) {
      $('#results-status').textContent = status;
      const list = $('#results-list');
      list.innerHTML = rows.map((r) => `<li class="${r.time === null ? 'pending' : ''}"><img src="${r.thumb}" alt=""><span class="nm">${r.name}</span><span class="tm">${r.time === null ? (r.dnf ? 'stopped' : '…') : r.time.toFixed(2) + ' s'}</span></li>`).join('');
    },
    setView(name) {
      document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    },
    toggleAuto() {
      const el = $('#auto');
      const on = el.getAttribute('aria-pressed') !== 'true';
      el.setAttribute('aria-pressed', String(on));
      opts.onAuto(on);
    },
    flashDrop() {
      const el = $('#drop');
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
      api.hideHint();
    },
    hideHint() {
      if (hintHidden) return;
      hintHidden = true;
      $('#hint').classList.add('gone');
    },
    tick(dt) {
      if (hintHidden) return;
      hintTimer -= dt;
      if (hintTimer < 0) api.hideHint();
    },
  };
  return api;
}
