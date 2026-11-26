// renderer.js — Бесшовный 3-масштабный Canvas 2D рендерер ARK EXODUS:
// 0.0: 2D поперечный разрез Ковчега с живыми интерьерами и человечками
// 1.0: Псевдо-3D Тактическая карта Системы под углом ~55° (ножки высоты Z, 3D-дуги шаттлов)
// 2.0: Псевдо-3D Спиральная Галактика под углом ~55° в стиле Spore!

import { renderShipCutawayScene } from './ship_cutaway.js';

const MODE_TO_ZOOM = { ship: 0, system: 1, galaxy: 2 };
const TILT_55 = 0.56; // cos(55°) — угол обзора сверху-под-углом

export class ArkRenderer {
  constructor(canvas, assets = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;
    this.time = 0;

    // Непрерывный бесшовный зум камеры (0 = корабль, 1 = система, 2 = галактика)
    this.zoomLevel = 0;
    this.targetZoom = 0;

    this.jumpFlash = 0;
    this.shieldFlash = 0;
    this.hullFlash = 0;
    this.hoveredId = null;

    this.incomingComets = [];
    this.sparks = [];

    // Фоновые звёзды космоса
    this.stars = [];
    for (let i = 0; i < 165; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() < 0.8 ? 0.9 + Math.random() * 1.1 : 1.8 + Math.random() * 1.2,
        speed: 0.003 + Math.random() * 0.01,
        alpha: 0.25 + Math.random() * 0.75,
        phase: Math.random() * Math.PI * 2
      });
    }

    // 3D спиральные рукава Галактики (как в Spore!)
    this.galaxyDust = [];
    const arms = 4;
    for (let i = 0; i < 360; i++) {
      const arm = i % arms;
      const dist = Math.pow(Math.random(), 0.78); // 0..1 от центра диска
      const spiralAngle = (arm * (Math.PI * 2) / arms) + dist * 3.4 + (Math.random() - 0.5) * (0.45 + dist * 0.4);
      const colPool = ['#fde68a', '#bae6fd', '#c4b5fd', '#f0abfc', '#ffffff'];
      this.galaxyDust.push({
        dist,
        angle: spiralAngle,
        r: Math.random() < 0.85 ? 1.1 + Math.random() * 1.3 : 2.3 + Math.random() * 1.4,
        alpha: (1 - dist * 0.65) * (0.35 + Math.random() * 0.55),
        color: colPool[i % colPool.length]
      });
    }
  }

  setViewTarget(mode) {
    this.targetZoom = MODE_TO_ZOOM[mode] ?? 0;
  }

  triggerJumpFlash() {
    this.jumpFlash = 1.0;
  }

  triggerCometBarrage(hadShield, netDamage) {
    this.shieldFlash = hadShield ? 1.0 : 0;
    this.hullFlash = netDamage > 0 ? 1.0 : 0;
    for (let i = 0; i < 9; i++) {
      this.incomingComets.push({
        x: 1.06 + Math.random() * 0.28,
        y: 0.14 + Math.random() * 0.72,
        tx: 0.72 + Math.random() * 0.16,
        ty: 0.26 + Math.random() * 0.48,
        progress: 0,
        speed: 1.45 + Math.random() * 0.75,
        isComet: i % 2 === 0
      });
    }
  }

  // ===== КООРДИНАТЫ И 3D-ПРОЕКЦИИ =====

  getCompRect(def, vw, vh) {
    const padX = Math.max(20, vw * 0.045);
    const padY = Math.max(26, vh * 0.075);
    const areaW = vw - padX * 2;
    const areaH = vh - padY * 2;
    const w = def.w * areaW;
    const h = def.h * areaH;
    const cx = padX + def.x * areaW;
    const cy = padY + def.y * areaH;
    return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy };
  }

  getSystem3DPos(node, vw, vh) {
    const cx = vw * 0.5;
    const cy = vh * 0.54;
    const rx = Math.min(vw * 0.41, 340);
    const ry = rx * TILT_55;

    // Нормализованное положение на орбитальном диске (-1..1)
    const ox = Math.cos(node.angle) * (node.dist / 0.42);
    const oy = Math.sin(node.angle) * (node.dist / 0.42);
    const depth = (oy + 1) * 0.5; // 0 (далеко сверху) .. 1 (близко снизу)
    const perspScale = 0.84 + depth * 0.30;

    const baseX = cx + ox * rx * (0.92 + depth * 0.16);
    const baseY = cy + oy * ry;
    const elev = (node.type === 'comet' ? 38 : (node.type === 'capsule' ? 34 : (node.type === 'nebula' ? 22 : 28))) * perspScale;

    return { baseX, baseY, x: baseX, y: baseY - elev, elev, perspScale, depth };
  }

  getGalaxy3DPos(sys, vw, vh) {
    const cx = vw * 0.5;
    const cy = vh * 0.55;
    // Преобразуем (layer 0..6, col 0..2) в наклонённую 3D-плоскость 55° с перспективой!
    const u = (sys.layer / 6) * 2 - 1; // -1 (левый край) .. +1 (правый край)
    const v = (sys.col / 2) * 2 - 1;   // -1 (дальний край) .. +1 (ближний край)

    const depth = (v + 1) * 0.5; // 0..1
    const persp = 0.82 + depth * 0.32;
    const spanX = (vw * 0.41) * persp;
    const spanY = (vh * 0.25);

    const baseX = cx + u * spanX;
    const baseY = cy + v * spanY - Math.cos(u * Math.PI * 0.5) * 14;
    // Индивидуальная высота Z звёздной системы над диском галактики (как в Spore!)
    const elev = (sys.starCapture ? 44 : (22 + ((sys.layer * 7 + sys.col * 11) % 18))) * persp;

    return { baseX, baseY, x: baseX, y: baseY - elev, elev, persp, depth };
  }

  hitTest(mx, my, engine, viewMode) {
    const dpr = window.devicePixelRatio || 1;
    const vw = this.canvas.width / dpr;
    const vh = this.canvas.height / dpr;

    if (viewMode === 'ship') {
      for (const def of engine.balance.compartments) {
        const r = this.getCompRect(def, vw, vh);
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          return { kind: 'comp', id: def.id };
        }
      }
    } else if (viewMode === 'system') {
      for (const node of engine.state.nodes) {
        if (node.gone) continue;
        const p = this.getSystem3DPos(node, vw, vh);
        if (Math.hypot(mx - p.x, my - p.y) <= 38 * p.perspScale) {
          return { kind: 'node', id: node.id };
        }
      }
    } else if (viewMode === 'galaxy') {
      for (const sys of engine.balance.galaxyMap) {
        const p = this.getGalaxy3DPos(sys, vw, vh);
        if (Math.hypot(mx - p.x, my - p.y) <= 28 * p.persp) {
          return { kind: 'galaxy', id: sys.id };
        }
      }
    }
    return null;
  }

  // ===== ГЛАВНЫЙ ЦИКЛ ОТРИСОВКИ С БЕСШОВНЫМ ЗУМОМ =====

  render(engine, viewMode, selection, dt) {
    this.time += dt;
    this.targetZoom = MODE_TO_ZOOM[viewMode] ?? 0;

    // Плавный кинематографический зум камеры
    const diff = this.targetZoom - this.zoomLevel;
    if (Math.abs(diff) < 0.002) {
      this.zoomLevel = this.targetZoom;
    } else {
      this.zoomLevel += diff * (1 - Math.exp(-7.5 * dt));
    }

    if (this.jumpFlash > 0) this.jumpFlash = Math.max(0, this.jumpFlash - dt * 1.4);
    if (this.shieldFlash > 0) this.shieldFlash = Math.max(0, this.shieldFlash - dt * 1.6);
    if (this.hullFlash > 0) this.hullFlash = Math.max(0, this.hullFlash - dt * 1.8);

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const vw = this.canvas.width / dpr;
    const vh = this.canvas.height / dpr;
    const sys = engine.getSystem();

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Глубокий звёздный фон (живой параллакс при зуме!)
    const bg = ctx.createRadialGradient(vw * 0.5, vh * 0.5, 40, vw * 0.5, vh * 0.5, Math.max(vw, vh) * 0.9);
    bg.addColorStop(0, '#0f1830');
    bg.addColorStop(1, '#040711');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, vw, vh);

    const neb = ctx.createRadialGradient(vw * 0.72, vh * 0.3, 20, vw * 0.72, vh * 0.3, Math.max(vw, vh) * 0.55);
    neb.addColorStop(0, this.hexToRgba(sys.themeColor || '#38bdf8', 0.13));
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, vw, vh);

    for (const s of this.stars) {
      s.x -= s.speed * dt * (this.zoomLevel < 0.5 ? 1 : 0.25) * (1 + this.jumpFlash * 18);
      if (s.x < 0) s.x += 1;
      const sx = s.x * vw;
      const sy = s.y * vh;
      const tw = 0.65 + 0.35 * Math.sin(this.time * 2.4 + s.phase);
      ctx.globalAlpha = s.alpha * tw;
      ctx.fillStyle = '#e2e8f0';
      if (this.jumpFlash > 0.1) {
        ctx.strokeStyle = '#bae6fd';
        ctx.lineWidth = s.r;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + this.jumpFlash * 95, sy); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // 2. СЛОЙ 2 (Галактика 55° в стиле Spore) — виден при zoomLevel > 1.05
    if (this.zoomLevel > 1.02) {
      const t = Math.min(1, (this.zoomLevel - 1.0) / 1.0); // 0..1
      const scale = 2.15 - t * 1.15; // приближается/отдаляется в 1.0
      ctx.save();
      ctx.globalAlpha = Math.pow(t, 0.75);
      ctx.translate(vw / 2, vh / 2);
      ctx.scale(scale, scale);
      ctx.translate(-vw / 2, -vh / 2);
      this.renderGalaxySpore3D(ctx, engine, selection.galaxyId, vw, vh);
      ctx.restore();
    }

    // 3. СЛОЙ 1 (Система 55° с орбитами и ножками высоты Z) — виден при 0.02 < zoomLevel < 1.98
    if (this.zoomLevel > 0.02 && this.zoomLevel < 1.98) {
      let alpha = 1;
      let scale = 1;
      if (this.zoomLevel < 1) {
        const t = this.zoomLevel; // 0..1 (приходит с zoom out от корабля)
        alpha = Math.pow(t, 0.75);
        scale = 2.25 - t * 1.25;
      } else {
        const t = this.zoomLevel - 1; // 0..1 (уходит вглубь к галактике)
        alpha = Math.pow(1 - t, 0.8);
        scale = 1 - t * 0.72;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(vw / 2, vh / 2);
      ctx.scale(scale, scale);
      ctx.translate(-vw / 2, -vh / 2);
      this.renderSystem3D(ctx, engine, selection.nodeId, vw, vh);
      ctx.restore();
    }

    // 4. СЛОЙ 0 (2D поперечный разрез Ковчега с интерьерами и человечками) — виден при zoomLevel < 0.98
    if (this.zoomLevel < 0.98) {
      const t = this.zoomLevel; // 0..1
      const alpha = Math.pow(1 - t, 0.85);
      const scale = 1 - t * 0.75; // при отдалении корабль сжимается прямо в центр системы!
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(vw / 2, vh / 2);
      ctx.scale(scale, scale);
      ctx.translate(-vw / 2, -vh / 2);
      renderShipCutawayScene(
        ctx, engine, this.assets, selection.compId, this.hoveredId,
        vw, vh, this.time,
        { shield: this.shieldFlash, hull: this.hullFlash },
        (def, w, h) => this.getCompRect(def, w, h),
        (c, w, h, d) => this.updateAndDrawComets(c, w, h, d),
        dt
      );
      ctx.restore();
    }

    if (this.jumpFlash > 0.01) {
      ctx.fillStyle = `rgba(186, 230, 253, ${this.jumpFlash * 0.52})`;
      ctx.fillRect(0, 0, vw, vh);
    }

    ctx.restore();
  }

  // ===== СЛОЙ 1: ПСЕВДО-3D СИСТЕМА ПОД УГЛОМ 55° =====

  renderSystem3D(ctx, engine, selectedNodeId, vw, vh) {
    const sys = engine.getSystem();
    const cx = vw * 0.5;
    const cy = vh * 0.54;
    const maxRx = Math.min(vw * 0.41, 340);

    ctx.save();

    // 3D-диск плоскости эклиптики (наклон 55°)
    const diskGrad = ctx.createRadialGradient(cx, cy, 12, cx, cy, maxRx * 1.12);
    diskGrad.addColorStop(0, this.hexToRgba(sys.themeColor || '#38bdf8', 0.16));
    diskGrad.addColorStop(0.7, 'rgba(15, 23, 42, 0.25)');
    diskGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, TILT_55);
    ctx.fillStyle = diskGrad;
    ctx.beginPath(); ctx.arc(0, 0, maxRx * 1.12, 0, Math.PI * 2); ctx.fill();

    // Эллиптические орбиты и радиальная 3D-сетка радара
    for (const f of [0.35, 0.65, 0.96]) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(0, 0, maxRx * f, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 8; k++) {
      const a = (Math.PI * 2 * k) / 8;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * maxRx, Math.sin(a) * maxRx); ctx.stroke();
    }
    // Вращающийся луч 3D-радара
    const sweep = this.time * 0.65;
    ctx.fillStyle = this.hexToRgba(sys.themeColor || '#38bdf8', 0.12);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, maxRx, sweep, sweep + 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Звезда для захвата (парит над дальним правым краем 3D-плоскости)
    if (engine.state.starCapture && !engine.state.starCapture.completed) {
      const sc = engine.state.starCapture;
      const sx = vw * 0.85;
      const sy = vh * 0.24;
      const starImg = this.assets?.get('star_core');
      if (starImg) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.time * 0.35);
        ctx.drawImage(starImg, -38, -38, 76, 76);
        ctx.restore();
      }
      ctx.font = '800 10.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#fde68a';
      ctx.textAlign = 'center';
      ctx.fillText(`⭐ ${sc.starName}`, sx, sy + 42);
    }

    // Сортируем объекты по глубине Z (дальние рисуются первыми, ближние — поверх!)
    const drawList = [];
    for (const node of engine.state.nodes) {
      if (node.gone) continue;
      drawList.push({ kind: 'node', node, pos: this.getSystem3DPos(node, vw, vh) });
    }
    drawList.push({ kind: 'ark', pos: { baseX: cx, baseY: cy, x: cx, y: cy - 18, depth: 0.5, perspScale: 1 } });
    drawList.sort((a, b) => a.pos.depth - b.pos.depth);

    // 3D-дуги маршрутов активных шаттлов
    for (const sh of engine.state.shuttles) {
      const node = engine.state.nodes.find(n => n.id === sh.nodeId);
      if (!node) continue;
      const np = this.getSystem3DPos(node, vw, vh);
      const arkX = cx;
      const arkY = cy - 18;
      const ctrlX = (arkX + np.x) / 2;
      const ctrlY = Math.min(arkY, np.y) - 48;

      ctx.strokeStyle = 'rgba(167, 139, 250, 0.65)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(arkX, arkY);
      ctx.quadraticCurveTo(ctrlX, ctrlY, np.x, np.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Шаттл на 3D-дуге
      const frac = Math.min(1, (sh.turnsDone + 0.5) / sh.turnsTotal);
      const t = frac < 0.8 ? Math.min(1, frac * 1.35) : Math.max(0.15, 1 - (frac - 0.8) * 2.2);
      const mt = 1 - t;
      const sx = mt * mt * arkX + 2 * mt * t * ctrlX + t * t * np.x;
      const sy = mt * mt * arkY + 2 * mt * t * ctrlY + t * t * np.y;
      const ang = Math.atan2(np.y - arkY, np.x - arkX);
      const shImg = this.assets?.get('ship_shuttle');
      if (shImg) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(ang);
        ctx.drawImage(shImg, -15, -15, 30, 30);
        ctx.restore();
      }
    }

    // Отрисовка всех объектов и Ковчега с учётом 3D-глубины и вертикальных ножек!
    for (const item of drawList) {
      if (item.kind === 'ark') {
        const p = item.pos;
        // Проекционное кольцо Ковчега на диске
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(p.baseX, p.baseY, 20, 20 * TILT_55, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.baseX, p.baseY); ctx.lineTo(p.x, p.y); ctx.stroke();

        const arkTop = this.assets?.get('ship_ark_top');
        if (arkTop) ctx.drawImage(arkTop, p.x - 34, p.y - 24, 68, 48);
        ctx.font = '800 10.5px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#bae6fd';
        ctx.textAlign = 'center';
        ctx.fillText('EXODUS-0', p.x, p.baseY + 18);
      } else {
        const node = item.node;
        const p = item.pos;
        const isSel = selectedNodeId === node.id;
        const isHov = this.hoveredId === node.id;
        const sh = engine.state.shuttles.find(x => x.nodeId === node.id);

        ctx.save();
        if (node.depleted) ctx.globalAlpha = 0.35;

        // Голографическое кольцо на 3D-плоскости + вертикальная ножка Z (как в Spore / Homeworld!)
        const ringCol = node.type === 'capsule' ? '#4ade80' : (isSel ? '#ffffff' : 'rgba(148,163,184,0.45)');
        ctx.strokeStyle = ringCol;
        ctx.lineWidth = isSel ? 1.8 : 1.1;
        ctx.beginPath();
        ctx.ellipse(p.baseX, p.baseY, 13 * p.perspScale, 13 * p.perspScale * TILT_55, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = isSel ? 'rgba(255,255,255,0.65)' : 'rgba(148,163,184,0.32)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(p.baseX, p.baseY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Сам объект на высоте Z
        ctx.translate(p.x, p.y);
        const sc = p.perspScale;

        if (isSel || isHov) {
          ctx.strokeStyle = isSel ? '#ffffff' : 'rgba(255,255,255,0.45)';
          ctx.lineWidth = isSel ? 2.2 : 1.4;
          ctx.beginPath(); ctx.arc(0, 0, 31 * sc, 0, Math.PI * 2); ctx.stroke();
        }

        const nodeImg = this.assets?.get(`node_${node.type}`);
        if (nodeImg) {
          ctx.save();
          if (node.type === 'asteroid') ctx.rotate(this.time * 0.18);
          else if (node.type === 'nebula') ctx.rotate(Math.sin(this.time * 0.4) * 0.12);
          const sz = (node.type === 'comet' ? 64 : 58) * sc;
          ctx.drawImage(nodeImg, -sz / 2, -sz / 2, sz, sz);
          ctx.restore();
        }

        if (sh) {
          ctx.strokeStyle = '#4ade80';
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.arc(0, 0, 27 * sc, -Math.PI / 2, -Math.PI / 2 + (sh.turnsDone / sh.turnsTotal) * Math.PI * 2);
          ctx.stroke();
        }

        if (node.type === 'capsule' && !node.depleted) {
          ctx.font = '800 10px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#4ade80';
          ctx.textAlign = 'center';
          ctx.fillText(`+${node.crew || 2} чел.`, 0, -34 * sc);
        }

        // Подпись под проекцией
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = node.depleted ? 0.45 : 1;
        ctx.font = '700 10.5px Inter, system-ui, sans-serif';
        ctx.fillStyle = isSel ? '#ffffff' : '#f1f5f9';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, p.baseX, p.baseY + 18);

        const sub = sh
          ? `Экспедиция: ход ${sh.turnsDone}/${sh.turnsTotal}`
          : (node.depleted ? 'ИСТОЩЕНО' : `${node.turns} ход. · риск ${Math.round(node.risk * 100)}%`);
        ctx.font = '600 9.5px Inter, system-ui, sans-serif';
        ctx.fillStyle = sh ? '#4ade80' : '#94a3b8';
        ctx.fillText(sub, p.baseX, p.baseY + 30);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  // ===== СЛОЙ 2: 3D СПИРАЛЬНАЯ ГАЛАКТИКА ПОД УГЛОМ 55° В СТИЛЕ SPORE =====

  renderGalaxySpore3D(ctx, engine, selectedGalaxyId, vw, vh) {
    const curSys = engine.getSystem();
    const visited = engine.state.visitedSystems;
    const cx = vw * 0.5;
    const cy = vh * 0.55;
    const diskR = Math.min(vw * 0.48, vh * 0.72);

    ctx.save();

    // 1. Вращающийся 3D спиральный галактический диск под углом 55° (эффект Spore!)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, TILT_55);

    // Яркое свечение ядра галактики
    const coreG = ctx.createRadialGradient(0, 0, 8, 0, 0, diskR);
    coreG.addColorStop(0, 'rgba(254, 240, 138, 0.28)');
    coreG.addColorStop(0.25, 'rgba(168, 85, 247, 0.16)');
    coreG.addColorStop(0.65, 'rgba(56, 189, 248, 0.08)');
    coreG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = coreG;
    ctx.beginPath(); ctx.arc(0, 0, diskR, 0, Math.PI * 2); ctx.fill();

    // Концентрическая 3D-сетка галактики
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.11)';
    ctx.lineWidth = 1;
    for (const f of [0.33, 0.66, 0.98]) {
      ctx.beginPath(); ctx.arc(0, 0, diskR * f, 0, Math.PI * 2); ctx.stroke();
    }

    // 360 вращающихся звёзд в 4 спиральных рукавах!
    const spin = this.time * 0.045;
    for (const d of this.galaxyDust) {
      const a = d.angle + spin;
      const gx = Math.cos(a) * d.dist * diskR;
      const gy = Math.sin(a) * d.dist * diskR;
      ctx.globalAlpha = d.alpha;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(gx, gy, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 2. Объёмные 3D-дуги гиперпереходов между звёздными системами
    for (const sys of engine.balance.galaxyMap) {
      const p1 = this.getGalaxy3DPos(sys, vw, vh);
      for (const nxtId of (sys.next || [])) {
        const nxt = engine.getSystem(nxtId);
        if (!nxt) continue;
        const p2 = this.getGalaxy3DPos(nxt, vw, vh);
        const isAvail = sys.id === curSys.id;
        const bothVis = visited.includes(sys.id) && visited.includes(nxtId);

        const ctrlX = (p1.x + p2.x) / 2;
        const ctrlY = Math.min(p1.y, p2.y) - 22;

        ctx.strokeStyle = isAvail
          ? '#fbbf24'
          : (bothVis ? '#38bdf8' : 'rgba(148, 163, 184, 0.22)');
        ctx.lineWidth = isAvail ? 2.6 : (bothVis ? 2.1 : 1.2);
        ctx.setLineDash(isAvail ? [7, 5] : []);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(ctrlX, ctrlY, p2.x, p2.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // 3. Звёздные системы (отсортированы по глубине Z — дальние сзади, ближние спереди!)
    const sortedSys = engine.balance.galaxyMap
      .map(sys => ({ sys, p: this.getGalaxy3DPos(sys, vw, vh) }))
      .sort((a, b) => a.p.depth - b.p.depth);

    for (const { sys, p } of sortedSys) {
      const isCur = sys.id === curSys.id;
      const isReach = (curSys.next || []).includes(sys.id);
      const isVis = visited.includes(sys.id);
      const isSel = selectedGalaxyId === sys.id;
      const isHov = this.hoveredId === sys.id;
      const hasStar = !!sys.starCapture;

      // Точка проекции на 3D-диске галактики + вертикальная ножка высоты Z (как в Spore!)
      ctx.strokeStyle = isCur ? '#38bdf8' : (isReach ? 'rgba(251,191,36,0.65)' : 'rgba(148,163,184,0.28)');
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(p.baseX, p.baseY, 9 * p.persp, 9 * p.persp * TILT_55, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p.baseX, p.baseY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      ctx.save();
      ctx.translate(p.x, p.y);
      const r = (sys.isFinale ? 16 : (hasStar ? 14 : 11)) * p.persp;

      // Ореол звезды
      const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.4);
      glow.addColorStop(0, this.hexToRgba(sys.themeColor || '#38bdf8', isReach || isCur || hasStar ? 0.65 : 0.25));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2); ctx.fill();

      if (isCur) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(0, 0, r + 7 + Math.sin(this.time * 5) * 2, 0, Math.PI * 2); ctx.stroke();
      } else if (isReach) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, Math.PI * 2); ctx.stroke();
      }

      if (isSel || isHov) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r + 10, 0, Math.PI * 2); ctx.stroke();
      }

      // Сфера звёздной системы с 3D-бликом
      const sph = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      sph.addColorStop(0, '#ffffff');
      sph.addColorStop(0.5, isCur ? '#38bdf8' : (isVis ? '#1e40af' : (isReach || hasStar ? sys.themeColor : '#475569')));
      sph.addColorStop(1, '#0b1224');
      ctx.fillStyle = sph;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

      if (hasStar) {
        ctx.font = '800 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#fef08a';
        ctx.textAlign = 'center';
        ctx.fillText('★', 0, 3.5);
      }

      // Парящий значок EXODUS-0 над текущей системой
      if (isCur) {
        const arkTop = this.assets?.get('ship_ark_top');
        if (arkTop) {
          ctx.drawImage(arkTop, -18, -r - 26 + Math.sin(this.time * 4) * 2, 36, 26);
        }
      }

      // Подписи систем (чистые, без наезда)
      const narrow = vw < 860;
      const showDetail = !narrow || isCur || isReach || isSel || isHov || sys.isFinale;
      const label = showDetail ? sys.name : sys.name.split(' ')[0];
      ctx.font = `700 ${narrow ? 9.5 : 10.5}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = isReach || isCur || isSel ? '#f8fafc' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(label, 0, r + 15);

      if (showDetail && (isReach || isSel || isHov || hasStar)) {
        ctx.font = '600 9px Inter, system-ui, sans-serif';
        ctx.fillStyle = hasStar ? '#fde68a' : '#7dd3fc';
        ctx.fillText(sys.scanTag, 0, r + 26);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  updateAndDrawComets(ctx, vw, vh, dt) {
    for (let i = this.incomingComets.length - 1; i >= 0; i--) {
      const c = this.incomingComets[i];
      c.progress += c.speed * dt;
      const x = (c.x + (c.tx - c.x) * c.progress) * vw;
      const y = (c.y + (c.ty - c.y) * c.progress) * vh;

      ctx.save();
      const col = c.isComet ? '#67e8f9' : '#fb923c';
      ctx.strokeStyle = col;
      ctx.lineWidth = c.isComet ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 32, y + (c.y - c.ty) * 30);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, c.isComet ? 5 : 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      if (c.progress >= 1) {
        for (let k = 0; k < 8; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 50 + Math.random() * 140;
          this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, col, life: 0.45 });
        }
        this.incomingComets.splice(i, 1);
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.life -= dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      ctx.globalAlpha = Math.max(0, sp.life / 0.45);
      ctx.fillStyle = sp.col;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2); ctx.fill();
      if (sp.life <= 0) this.sparks.splice(i, 1);
    }
    ctx.globalAlpha = 1;
  }

  hexToRgba(hex, a) {
    const clean = hex.replace('#', '');
    const n = parseInt(clean, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
}
