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
      document.querySelectorAll('[data-view]').forEach((b) => {
        b.addEventListener('click', () => o.onView(b.dataset.view));
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
      const bin = opts.bins.find((b) => b.id === cls);
      $('#card-bin').textContent = bin.label;
      const pos = (Math.log(g) - Math.log(0.5)) / (Math.log(25) - Math.log(0.5));
      $('#scale-marker').style.left = `${(pos * 100).toFixed(1)}%`;
      $('#scale-marker').style.background = t.swatch;
      document.querySelectorAll('.scale-zone').forEach((z) => z.classList.toggle('on', z.dataset.zone === cls));
      const btn = document.querySelectorAll('.marble')[i];
      if (btn) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
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
