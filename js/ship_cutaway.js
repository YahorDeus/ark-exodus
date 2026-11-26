// ship_cutaway.js — живой 2D поперечный разрез Ковчега EXODUS-0:
// детальные интерьеры всех 7 отсеков + анимированные человечки с уникальными циклами работы!

const ROOM_ROLES = {
  reactor:      ['console', 'wrench', 'scanner', 'valve'],
  hydroponics:  ['water', 'shovel', 'harvest', 'console'],
  life_support: ['valve', 'scanner', 'wrench', 'console'],
  synthesizer:  ['weld', 'console', 'carry', 'wrench'],
  defense_bay:  ['console', 'carry', 'scanner', 'weld'],
  medbay:       ['scanner', 'console', 'water'],
  shuttle_bay:  ['marshal', 'wrench', 'carry']
};

const SUIT_COLORS = {
  reactor:      '#f59e0b',
  hydroponics:  '#4ade80',
  life_support: '#38bdf8',
  synthesizer:  '#fb923c',
  defense_bay:  '#60a5fa',
  medbay:       '#f472b6',
  shuttle_bay:  '#a78bfa'
};

export function renderShipCutawayScene(ctx, engine, assets, selectedCompId, hoveredId, vw, vh, time, flashes, getCompRect, updateAndDrawComets, dt) {
  const prev = engine.getTurnPreview();
  const rTier = engine.getReactorTierDef();
  const sc = engine.state.starCapture;
  const capturing = !!(sc && sc.active);

  const midY = vh * 0.50;
  const rightX = vw * 0.89;
  const leftX = vw * 0.055;
  const botY = vh * 0.86;

  ctx.save();

  // 1. Мощные ионные факелы двигателей слева
  const flameLen = (engine.state.fuel > 0 ? 54 : 18) * (0.86 + 0.14 * Math.sin(time * 11));
  for (const fy of [midY - vh * 0.14, midY, midY + vh * 0.14]) {
    const fg = ctx.createLinearGradient(leftX + 16, fy, Math.max(2, leftX - flameLen + 14), fy);
    fg.addColorStop(0, '#ffffff');
    fg.addColorStop(0.25, rTier.color);
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(leftX + 18, fy - 10);
    ctx.lineTo(Math.max(2, leftX - flameLen + 14), fy);
    ctx.lineTo(leftX + 18, fy + 10);
    ctx.closePath();
    ctx.fill();
  }

  // 2. Притягиваемая Звезда справа + гравитационный луч захвата
  if (sc && !sc.completed) {
    const sx = vw * 0.945;
    const sy = midY;
    const starCol = sc.targetTier === 4 ? '#c084fc' : (sc.targetTier === 3 ? '#38bdf8' : '#f97316');
    const r = capturing ? 28 + Math.sin(time * 8) * 3 : 22;

    if (capturing) {
      const beamGrad = ctx.createLinearGradient(rightX - 10, midY, sx, sy);
      beamGrad.addColorStop(0, 'rgba(251, 191, 36, 0.78)');
      beamGrad.addColorStop(1, hexToRgba(starCol, 0.92));
      ctx.strokeStyle = beamGrad;
      ctx.lineWidth = 15 + Math.sin(time * 12) * 3;
      ctx.beginPath();
      ctx.moveTo(rightX - 12, midY);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(rightX - 12, midY);
      ctx.lineTo(sx, sy);
      ctx.stroke();
    }

    const starImg = assets?.get('star_core');
    if (starImg) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(time * 0.35);
      const sSize = r * 3.1;
      ctx.drawImage(starImg, -sSize / 2, -sSize / 2, sSize, sSize);
      ctx.restore();
    }
    ctx.font = '800 10px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#fde68a';
    ctx.textAlign = 'center';
    ctx.fillText(capturing ? `ЗАХВАТ ${sc.turnsDone}/${sc.turnsRequired}` : '⭐ ЗВЕЗДА', sx - 8, sy - r - 14);
  }

  // 3. Детализированный 2D поперечный корпус Ковчега EXODUS-0 (SVG)
  const hullImg = assets?.get('ark_hull');
  if (hullImg) {
    ctx.drawImage(hullImg, vw * 0.04, vh * 0.08, vw * 0.87, vh * 0.84);
  }

  // Палубный коридор (центральная межпалубная переборка с бегущими огнями)
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(vw * 0.24, midY - 7, vw * 0.56, 14);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(vw * 0.24, midY - 7, vw * 0.56, 14);
  // Бегущие энерго-импульсы по коридору
  for (let i = 0; i < 6; i++) {
    const px = vw * 0.25 + (((time * 48 + i * 75) % (vw * 0.53)));
    ctx.fillStyle = prev.blackout ? '#ef4444' : rTier.color;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(px, midY - 2, 10, 4);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Силовой щит вокруг носа при работе Обороны
  if (prev.shieldBlock > 0 || flashes.shield > 0.05) {
    const alpha = Math.max(prev.shieldBlock > 0 ? 0.16 : 0, flashes.shield * 0.65);
    ctx.strokeStyle = `rgba(96, 165, 250, ${alpha})`;
    ctx.lineWidth = 4 + flashes.shield * 4;
    ctx.beginPath();
    ctx.arc(vw * 0.63, midY, Math.min(vw * 0.29, vh * 0.42), -Math.PI * 0.42, Math.PI * 0.42);
    ctx.stroke();
  }

  // 4. Отрисовка всех 7 отсеков как живых поперечных комнат с анимированными человечками!
  for (const def of engine.balance.compartments) {
    const r = getCompRect(def, vw, vh);
    drawCutawayRoom(ctx, engine, assets, def, r, selectedCompId === def.id, hoveredId === def.id, time, prev, rTier);
  }

  // 5. Анимация входящих комет/астероидов (при захвате звезды)
  updateAndDrawComets(ctx, vw, vh, dt);

  // 6. Верхняя подпись корабля и предупреждение о блэкауте
  ctx.font = '800 11px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(186, 230, 253, 0.78)';
  ctx.textAlign = 'left';
  ctx.fillText(`EXODUS-0 · ПОПЕРЕЧНЫЙ РАЗРЕЗ · РЕАКТОР: ${rTier.name.toUpperCase()}`, 18, 22);

  if (prev.blackout) {
    const blink = 0.55 + 0.45 * Math.sin(time * 8);
    ctx.fillStyle = `rgba(248, 113, 113, ${blink})`;
    ctx.textAlign = 'center';
    ctx.fillText(`⚡ НЕХВАТКА ЭНЕРГИИ (${prev.powerNet} МВт) — СНИМИ ЛЮДЕЙ, ВКЛЮЧИ ФОРСАЖ ИЛИ ЗАХВАТИ ЗВЕЗДУ`, vw * 0.48, botY + 20);
  }

  ctx.restore();
}

function drawCutawayRoom(ctx, engine, assets, def, r, isSel, isHov, time, prev, rTier) {
  const cst = engine.state.compartments[def.id];
  const lvl = def.levels[cst.level - 1];
  const maxW = engine.getMaxWorkers(def.id);
  const active = def.id === 'reactor' || cst.workers > 0;
  const floorY = r.y + r.h - 24;

  ctx.save();

  // Внешняя рамка отсека с клиппингом для чистоты интерьера
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 9);
  ctx.fillStyle = active ? '#0d172c' : '#090f1e';
  ctx.fill();

  ctx.save();
  roundRectPath(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 8);
  ctx.clip();

  // Верхняя шапка отсека (тёмная полоса)
  ctx.fillStyle = 'rgba(6, 10, 22, 0.88)';
  ctx.fillRect(r.x, r.y, r.w, 22);
  ctx.fillStyle = def.id === 'reactor' ? rTier.color : (active ? def.color : '#475569');
  ctx.fillRect(r.x, r.y, r.w, 2.5);

  // Задняя стена + пол комнаты
  const roomTop = r.y + 22;
  const roomH = floorY - roomTop;
  const wallGrad = ctx.createLinearGradient(0, roomTop, 0, floorY);
  wallGrad.addColorStop(0, active ? hexToRgba(def.color, 0.14) : 'rgba(15, 23, 42, 0.45)');
  wallGrad.addColorStop(1, 'rgba(8, 13, 26, 0.92)');
  ctx.fillStyle = wallGrad;
  ctx.fillRect(r.x, roomTop, r.w, roomH);

  // Металлический настил пола
  ctx.fillStyle = '#1b2740';
  ctx.fillRect(r.x, floorY, r.w, 5);
  ctx.fillStyle = 'rgba(7, 11, 22, 0.92)';
  ctx.fillRect(r.x, floorY + 5, r.w, r.y + r.h - (floorY + 5));

  // ===== УНИКАЛЬНЫЙ ИНТЕРЬЕР КАЖДОГО ОТСЕКА =====
  if (def.id === 'reactor') {
    drawReactorInterior(ctx, r, roomTop, floorY, time, rTier, engine.state.reactorTier, active);
  } else if (def.id === 'hydroponics') {
    drawHydroponicsInterior(ctx, r, roomTop, floorY, time, cst.level, active);
  } else if (def.id === 'life_support') {
    drawO2Interior(ctx, r, roomTop, floorY, time, active);
  } else if (def.id === 'synthesizer') {
    drawSynthesizerInterior(ctx, r, roomTop, floorY, time, active);
  } else if (def.id === 'defense_bay') {
    drawDefenseInterior(ctx, r, roomTop, floorY, time, engine.state.weaponStock || 0, active);
  } else if (def.id === 'medbay') {
    drawMedbayInterior(ctx, r, roomTop, floorY, time, active);
  } else if (def.id === 'shuttle_bay') {
    drawShuttleBayInterior(ctx, r, roomTop, floorY, time, engine, assets);
  }

  // ===== ЖИВЫЕ АНИМИРОВАННЫЕ ЧЕЛОВЕЧКИ (ПО ЧИСЛУ НАЗНАЧЕННЫХ РАБОТНИКОВ!) =====
  const roles = ROOM_ROLES[def.id] || ['console', 'wrench', 'scanner', 'carry'];
  const suitCol = SUIT_COLORS[def.id] || '#38bdf8';
  for (let i = 0; i < cst.workers; i++) {
    const frac = (i + 1) / (cst.workers + 1);
    const wx = r.x + 16 + frac * (r.w - 32);
    const role = roles[i % roles.length];
    drawAnimatedWorker(ctx, wx, floorY, role, suitCol, time + i * 1.15, r.h);
  }

  ctx.restore(); // конец clip

  // Внешняя подсветка контура при выборе / наведении
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 9);
  ctx.strokeStyle = isSel ? '#ffffff' : (isHov ? def.color : hexToRgba(def.color, active ? 0.65 : 0.25));
  ctx.lineWidth = isSel ? 2.5 : 1.5;
  ctx.stroke();

  // Заголовок комнаты и уровень
  const compact = r.w < 126;
  const title = compact ? def.short.replace('СИНТЕЗ ', '') : (r.w < 150 ? def.short : def.name);
  ctx.font = `800 ${compact ? 10 : 11}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = active ? '#f8fafc' : '#94a3b8';
  ctx.textAlign = 'left';
  ctx.fillText(title, r.x + 7, r.y + 15);

  ctx.font = '700 9.5px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'right';
  ctx.fillText(compact ? `У${cst.level}` : `Ур.${cst.level}`, r.x + r.w - 7, r.y + 15);

  // Нижняя строка: слоты людей и сводка выхода за ход
  const pCost = (def.basePowerUse || 0) + cst.workers * (lvl.powerPerWorker || def.powerPerWorker);
  let summary = 'Простой';
  let sumCol = '#64748b';
  if (def.id === 'reactor') { summary = `+${prev.powerGen}МВт`; sumCol = '#fde68a'; }
  else if (cst.workers > 0) {
    if (def.id === 'life_support') { summary = `+${prev.o2Gen} O₂`; sumCol = '#7dd3fc'; }
    else if (def.id === 'hydroponics') { summary = `+${prev.foodGen} Еда`; sumCol = '#86efac'; }
    else if (def.id === 'synthesizer') { summary = `+${prev.alloysGen} Спл`; sumCol = '#fdba74'; }
    else if (def.id === 'defense_bay') { summary = `+${prev.shieldGen}Щ/+${prev.weaponGen}Ор`; sumCol = '#93c5fd'; }
    else if (def.id === 'medbay') { summary = `+${cst.workers * lvl.moralePerWorker} Мор`; sumCol = '#f9a8d4'; }
    else if (def.id === 'shuttle_bay') { summary = `Шаттл ${engine.state.shuttles.length}/${lvl.maxShuttles}`; sumCol = '#d8b4fe'; }
  } else if (def.id === 'shuttle_bay') {
    summary = `Шаттл ${engine.state.shuttles.length}/${lvl.maxShuttles}`;
    sumCol = '#a78bfa';
  }

  // Точки слотов слева внизу
  const dotY = r.y + r.h - 9;
  const step = maxW >= 4 ? 10 : 12;
  for (let i = 0; i < maxW; i++) {
    ctx.fillStyle = i < cst.workers ? '#fbbf24' : 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();
    ctx.arc(r.x + 11 + i * step, dotY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.font = '700 9.5px Inter, system-ui, sans-serif';
  ctx.fillStyle = sumCol;
  ctx.textAlign = 'right';
  ctx.fillText(summary, r.x + r.w - 7, dotY + 3.5);

  ctx.restore();
}

// ===== ИНТЕРЬЕРЫ 7 ОТСЕКОВ =====

function drawReactorInterior(ctx, r, top, floorY, time, rTier, tier, active) {
  const cx = r.cx;
  const cy = top + (floorY - top) * 0.48;
  const rad = Math.min(r.w * 0.34, (floorY - top) * 0.36);

  // Стальные колонны удержания сверху и снизу
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(cx - 10, top, 20, cy - top - rad * 0.6);
  ctx.fillRect(cx - 10, cy + rad * 0.6, 20, floorY - (cy + rad * 0.6));

  // Магнитные кольца токамака
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = hexToRgba(rTier.color, 0.55);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, rad * 1.25, rad * 0.42, time * 0.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, rad * 1.25, rad * 0.42, -time * 0.8, 0, Math.PI * 2);
  ctx.stroke();

  // Сияние самой Звезды внутри Реактора!
  const pulse = rad * (0.85 + 0.14 * Math.sin(time * 5.5));
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, pulse * 1.45);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, rTier.color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, pulse * 1.45, 0, Math.PI * 2);
  ctx.fill();

  if (tier >= 3) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    const a = time * 3.0;
    ctx.beginPath();
    ctx.moveTo(-Math.cos(a) * rad * 1.35, -Math.sin(a) * rad * 1.35);
    ctx.lineTo(Math.cos(a) * rad * 1.35, Math.sin(a) * rad * 1.35);
    ctx.stroke();
  }
  ctx.restore();

  // Пульт управления реактором на полу
  ctx.fillStyle = '#334155';
  ctx.fillRect(r.x + 8, floorY - 14, 18, 14);
  ctx.fillStyle = active ? '#38bdf8' : '#475569';
  ctx.fillRect(r.x + 10, floorY - 12, 14, 6);
}

function drawHydroponicsInterior(ctx, r, top, floorY, time, level, active) {
  // Фитолампы под потолком + мягкий конус света
  ctx.fillStyle = active ? '#fef08a' : '#475569';
  ctx.fillRect(r.x + 14, top + 4, r.w - 28, 3);
  if (active) {
    const cone = ctx.createLinearGradient(0, top + 7, 0, floorY);
    cone.addColorStop(0, 'rgba(254, 240, 138, 0.20)');
    cone.addColorStop(1, 'rgba(74, 222, 128, 0.03)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(r.x + 14, top + 7);
    ctx.lineTo(r.x + r.w - 14, top + 7);
    ctx.lineTo(r.x + r.w - 4, floorY - 10);
    ctx.lineTo(r.x + 4, floorY - 10);
    ctx.closePath();
    ctx.fill();
  }

  // Ящик грядки с почвой
  const bedH = 11;
  ctx.fillStyle = '#3f2e21';
  ctx.fillRect(r.x + 6, floorY - bedH, r.w - 12, bedH);
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 6, floorY - bedH, r.w - 12, bedH);

  // Растущие сочные овощи и зелень (количество растёт с уровнем!)
  const plants = 3 + level * 2;
  for (let i = 0; i < plants; i++) {
    const px = r.x + 14 + (i / Math.max(1, plants - 1)) * (r.w - 28);
    const sway = Math.sin(time * 2.2 + i) * 1.5;
    const h = 12 + (i % 3) * 5 + (active ? 3 : 0);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, floorY - bedH);
    ctx.quadraticCurveTo(px + sway, floorY - bedH - h * 0.5, px + sway * 1.3, floorY - bedH - h);
    ctx.stroke();

    // Листики
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.ellipse(px - 3 + sway, floorY - bedH - h * 0.65, 4, 2.2, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(px + 3 + sway, floorY - bedH - h * 0.75, 4, 2.2, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Спелые овощи (красные томаты / оранжевая морковь / золотые плоды)
    if (i % 2 === 0) {
      ctx.fillStyle = i % 4 === 0 ? '#ef4444' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(px + sway, floorY - bedH - h * 0.55, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawO2Interior(ctx, r, top, floorY, time, active) {
  // Две прозрачные аква-колбы электролиза с пузырьками
  const tankW = Math.min(24, r.w * 0.22);
  const tankH = (floorY - top) - 10;
  for (const tx of [r.x + 10, r.x + r.w - tankW - 10]) {
    ctx.fillStyle = active ? 'rgba(14, 165, 233, 0.26)' : 'rgba(51, 65, 85, 0.25)';
    ctx.strokeStyle = active ? '#38bdf8' : '#475569';
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, tx, top + 6, tankW, tankH, 6);
    ctx.fill();
    ctx.stroke();

    // Всплывающие пузырьки O2
    if (active) {
      ctx.fillStyle = '#bae6fd';
      for (let b = 0; b < 4; b++) {
        const prog = ((time * 0.55 + b * 0.27 + tx * 0.03) % 1);
        const by = floorY - 6 - prog * (tankH - 10);
        const bx = tx + tankW * 0.3 + Math.sin(time * 4 + b) * 3 + (b % 2) * (tankW * 0.35);
        ctx.beginPath();
        ctx.arc(bx, by, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Вращающаяся турбина рециркуляции в центре
  const cx = r.cx;
  const cy = top + (floorY - top) * 0.44;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.rotate(active ? time * 3.8 : 0);
  ctx.fillStyle = active ? '#38bdf8' : '#475569';
  for (let k = 0; k < 4; k++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillRect(-1.5, -10, 3, 8);
  }
  ctx.restore();
}

function drawSynthesizerInterior(ctx, r, top, floorY, time, active) {
  // Рельса лазерной кран-балки под потолком
  ctx.fillStyle = '#475569';
  ctx.fillRect(r.x + 8, top + 6, r.w - 16, 3);

  const headX = r.x + 22 + (0.5 + 0.5 * Math.sin(time * 1.9)) * (r.w - 44);
  ctx.fillStyle = '#fb923c';
  ctx.fillRect(headX - 5, top + 9, 10, 7);

  // Лазерный луч синтеза и искра на столе
  const tableY = floorY - 12;
  ctx.fillStyle = '#334155';
  ctx.fillRect(r.x + 14, tableY, r.w - 28, 12);
  if (active) {
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.78)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(headX, top + 16);
    ctx.lineTo(headX, tableY);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(headX, tableY, 3 + Math.sin(time * 24) * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Стопка готовых слитков справа
  ctx.fillStyle = '#fb923c';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(r.x + r.w - 24, tableY - 5 - i * 5, 12, 3.5);
  }
}

function drawDefenseInterior(ctx, r, top, floorY, time, weaponStock, active) {
  // Рельсовая турель, плавно сканирующая космос
  const tx = r.x + r.w * 0.72;
  const ty = top + 18;
  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(active ? Math.sin(time * 1.6) * 0.35 - 0.15 : 0);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-10, -6, 16, 12);
  ctx.strokeStyle = '#fb923c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(6, -3); ctx.lineTo(22, -3);
  ctx.moveTo(6, 3);  ctx.lineTo(22, 3);
  ctx.stroke();
  ctx.restore();

  // Синий генератор энергощита слева
  const sx = r.x + 20;
  const sy = floorY - 18;
  const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 14);
  g.addColorStop(0, active ? '#93c5fd' : '#475569');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, 14, 0, Math.PI * 2);
  ctx.fill();

  // Стеллаж заряженных снарядов (отражает текущий weaponStock!)
  const shells = Math.min(6, Math.ceil(weaponStock / 5));
  for (let i = 0; i < shells; i++) {
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(r.x + r.w * 0.36 + i * 6, floorY - 12, 3.5, 10);
  }
}

function drawMedbayInterior(ctx, r, top, floorY, time, active) {
  // Настенный монитор с живой бегущей линией ЭКГ
  const mx = r.x + 12;
  const my = top + 7;
  const mw = r.w - 24;
  const mh = 18;
  ctx.fillStyle = '#091426';
  ctx.strokeStyle = '#f472b6';
  ctx.lineWidth = 1;
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeRect(mx, my, mw, mh);

  if (active) {
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < mw - 4; x += 3) {
      const phase = ((x + time * 35) % 28);
      let dy = 0;
      if (phase > 10 && phase < 13) dy = -5;
      else if (phase >= 13 && phase < 16) dy = 4;
      const py = my + mh / 2 + dy;
      if (x === 0) ctx.moveTo(mx + 2 + x, py);
      else ctx.lineTo(mx + 2 + x, py);
    }
    ctx.stroke();
  }

  // Медицинская кушетка
  ctx.fillStyle = '#334155';
  ctx.fillRect(r.cx - 18, floorY - 10, 36, 6);
  ctx.fillStyle = '#f472b6';
  ctx.fillRect(r.cx - 14, floorY - 13, 10, 3);
}

function drawShuttleBayInterior(ctx, r, top, floorY, time, engine, assets) {
  // Жёлто-чёрная полоса ангара
  ctx.fillStyle = '#fbbf24';
  for (let x = r.x + 8; x < r.x + r.w - 14; x += 14) {
    ctx.fillRect(x, floorY - 3, 7, 3);
  }

  const maxSh = engine.getCompLevelDef('shuttle_bay').maxShuttles;
  const inDock = maxSh - engine.state.shuttles.length;
  const shImg = assets?.get('ship_shuttle');
  if (inDock > 0 && shImg) {
    const hover = Math.sin(time * 2.4) * 1.8;
    ctx.drawImage(shImg, r.cx - 22, top + 8 + hover, 44, 44);
  } else {
    // Мигающий жёлтый маяк «ШАТТЛ В КОСМОСЕ»
    const blink = Math.sin(time * 6) > 0;
    ctx.fillStyle = blink ? '#fbbf24' : '#475569';
    ctx.beginPath();
    ctx.arc(r.cx, top + 20, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ===== АНИМИРОВАННЫЕ ЧЕЛОВЕЧКИ С 3-СЕКУНДНЫМИ ПОВТОРЯЮЩИМИСЯ ДЕЙСТВИЯМИ =====

function drawAnimatedWorker(ctx, x, floorY, role, suitColor, t, roomH) {
  const scale = roomH < 95 ? 0.84 : 1.0;
  const cyc = (t % 3.0) / 3.0; // плавный 3-секундный цикл 0..1
  const bob = Math.sin(t * 5) * 1.1;

  ctx.save();
  ctx.translate(x, floorY);
  ctx.scale(scale, scale);

  // Тень на полу
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ноги
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  const stepOff = role === 'carry' ? Math.sin(t * 7) * 2.5 : 0;
  ctx.beginPath();
  ctx.moveTo(-2, -9); ctx.lineTo(-3 - stepOff, -1);
  ctx.moveTo(2, -9);  ctx.lineTo(3 + stepOff, -1);
  ctx.stroke();

  // Торс (комбинезон отсека)
  const lean = (role === 'water' || role === 'shovel' || role === 'harvest')
    ? Math.sin(cyc * Math.PI * 2) * 0.22
    : 0;

  ctx.save();
  ctx.translate(0, -9 + bob * 0.5);
  ctx.rotate(lean);

  ctx.fillStyle = suitColor;
  roundRectPath(ctx, -4, -10, 8, 10, 3);
  ctx.fill();

  // Голова / шлем с визором
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(0, -14, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(0.5, -15.5, 3.2, 2.2);

  // Анимация рук и инструмента по роли!
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;

  if (role === 'water') {
    // Поливает грядку из лейки + голубые капли воды!
    const tilt = 0.3 + Math.sin(cyc * Math.PI * 2) * 0.35;
    ctx.beginPath();
    ctx.moveTo(2, -7); ctx.lineTo(9, -5 + tilt * 3);
    ctx.stroke();
    // Лейка
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(7, -7 + tilt * 3, 6, 4.5);
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(13, -5 + tilt * 3); ctx.lineTo(17, -7 + tilt * 5);
    ctx.stroke();
    // Падающие капельки воды
    if (Math.sin(cyc * Math.PI * 2) > -0.2) {
      ctx.fillStyle = '#67e8f9';
      for (let d = 0; d < 3; d++) {
        const dp = ((t * 2.5 + d * 0.33) % 1);
        ctx.beginPath();
        ctx.arc(17 + d * 1.4, -4 + dp * 13, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (role === 'shovel') {
    // Работает лопаткой (копает и подкидывает землю)
    const dig = Math.sin(cyc * Math.PI * 4);
    ctx.beginPath();
    ctx.moveTo(2, -7); ctx.lineTo(8, -3 + dig * 3);
    ctx.stroke();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(6, -10 + dig * 2); ctx.lineTo(12, 4 + dig * 3);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(10, 3 + dig * 3, 4.5, 3.5);
  } else if (role === 'harvest') {
    // Собирает овощи в руки
    const pick = Math.sin(cyc * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(-2, -7); ctx.lineTo(-8, -4 + pick * 3);
    ctx.moveTo(2, -7);  ctx.lineTo(8, -4 - pick * 2);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(8, -4 - pick * 2, 2.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (role === 'weld') {
    // Сварка с яркими искрами!
    ctx.beginPath();
    ctx.moveTo(2, -7); ctx.lineTo(11, -5);
    ctx.stroke();
    if (Math.sin(t * 14) > 0.2) {
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(13, -5, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fb923c';
      for (let s = 0; s < 3; s++) {
        ctx.fillRect(12 + Math.cos(t * 20 + s * 2) * 5, -5 + Math.sin(t * 18 + s) * 5, 1.8, 1.8);
      }
    }
  } else if (role === 'wrench') {
    // Подкручивает гаечным ключом
    const rot = Math.sin(cyc * Math.PI * 4) * 0.7;
    ctx.save();
    ctx.translate(3, -7);
    ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, -2); ctx.stroke();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(6, -2); ctx.lineTo(12, -5); ctx.stroke();
    ctx.restore();
  } else if (role === 'scanner') {
    // Водит голографическим сканером (луч)
    const sweep = Math.sin(cyc * Math.PI * 2) * 5;
    ctx.beginPath();
    ctx.moveTo(2, -7); ctx.lineTo(8, -8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.beginPath();
    ctx.moveTo(9, -8);
    ctx.lineTo(22, -16 + sweep);
    ctx.lineTo(22, -2 + sweep);
    ctx.closePath();
    ctx.fill();
  } else if (role === 'marshal') {
    // Диспетчер шлюза с двумя светящимися жезлами!
    const wave = Math.sin(cyc * Math.PI * 4) * 5;
    ctx.beginPath();
    ctx.moveTo(-3, -8); ctx.lineTo(-10, -14 + wave);
    ctx.moveTo(3, -8);  ctx.lineTo(10, -14 + wave);
    ctx.stroke();
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-10, -14 + wave); ctx.lineTo(-13, -18 + wave);
    ctx.moveTo(10, -14 + wave);  ctx.lineTo(13, -18 + wave);
    ctx.stroke();
  } else if (role === 'carry') {
    // Держит светящийся контейнер/снаряд
    ctx.beginPath();
    ctx.moveTo(-2, -7); ctx.lineTo(7, -6);
    ctx.moveTo(2, -7);  ctx.lineTo(7, -9);
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(6, -11, 6, 6);
  } else if (role === 'valve') {
    // Крутит маховик
    const spin = Math.sin(cyc * Math.PI * 4) * 3;
    ctx.beginPath();
    ctx.moveTo(2, -7); ctx.lineTo(8, -8 + spin);
    ctx.moveTo(-2, -7); ctx.lineTo(8, -5 - spin);
    ctx.stroke();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(9, -7, 4, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // console: быстро печатает на терминале
    const type = Math.sin(t * 16) * 1.5;
    ctx.beginPath();
    ctx.moveTo(2, -7); ctx.lineTo(9, -6 + type);
    ctx.moveTo(-1, -7); ctx.lineTo(8, -5 - type);
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexToRgba(hex, a) {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
