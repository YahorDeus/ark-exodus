// main.js — точка входа ARK EXODUS v2 (пошаговая модель)

import { SoundEngine } from './audio.js';
import { AssetStore } from './assets.js';
import { ArkEngine } from './engine.js';
import { ArkRenderer } from './renderer.js';
import { ArkUI } from './ui.js';

async function boot() {
  const assets = new AssetStore();
  const [res] = await Promise.all([
    fetch('data/ark_balance.json'),
    assets.loadAll()
  ]);
  const balance = await res.json();

  const sound = new SoundEngine();
  const engine = new ArkEngine(balance, sound);
  const canvas = document.getElementById('ark-canvas');
  const renderer = new ArkRenderer(canvas, assets);
  const ui = new ArkUI(engine, renderer, sound, assets);

  function resize() {
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(() => resize()).observe(document.getElementById('canvas-wrap'));

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const hit = renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top, engine, ui.viewMode);
    renderer.hoveredId = hit ? hit.id : null;
    canvas.style.cursor = hit ? 'pointer' : 'default';
  });

  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const hit = renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top, engine, ui.viewMode);
    if (!hit) return;
    sound.playClick();
    if (hit.kind === 'comp') ui.selection.compId = hit.id;
    else if (hit.kind === 'node') ui.selection.nodeId = hit.id;
    else if (hit.kind === 'galaxy') ui.selection.galaxyId = hit.id;
    ui.refresh();
  });

  // Колёсико мыши на Canvas: плавное отдаление/приближение Корабль ↔ Система ↔ Галактика (как в Spore!)
  let lastWheelZoom = 0;
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const now = performance.now();
    if (now - lastWheelZoom < 360) return;
    lastWheelZoom = now;
    const order = ['ship', 'system', 'galaxy'];
    const idx = order.indexOf(ui.viewMode);
    if (e.deltaY > 0 && idx < 2) {
      sound.playClick();
      ui.setViewMode(order[idx + 1]);
    } else if (e.deltaY < 0 && idx > 0) {
      sound.playClick();
      ui.setViewMode(order[idx - 1]);
    }
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (document.getElementById('app').classList.contains('hidden')) return;
    if (e.code === 'Digit1') ui.setViewMode('ship');
    else if (e.code === 'Digit2') ui.setViewMode('system');
    else if (e.code === 'Digit3') ui.setViewMode('galaxy');
    else if (e.code === 'Space' || e.code === 'Enter') {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
      e.preventDefault();
      ui.triggerEndTurn();
    }
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!document.getElementById('app').classList.contains('hidden')) {
      resize();
      renderer.render(engine, ui.viewMode, ui.selection, dt);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch(err => console.error('Ошибка запуска ARK EXODUS:', err));
