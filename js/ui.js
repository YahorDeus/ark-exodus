// ui.js — пошаговый интерфейс ARK EXODUS v2 (Корабль, Система, Карта Галактики, Захват Звезды)

const NODE_TYPE_LABELS = {
  nebula: 'Газовая туманность',
  asteroid: 'Астероид (руда)',
  comet: 'Пролетающая комета',
  wreck: 'Обломки / SOS',
  capsule: 'Потерянный экипаж (SOS)'
};

const MODE_DESC = {
  safe: '+1 ход · −45% риска ЧП · 90% добычи',
  standard: 'Баланс длительности и риска ЧП',
  overdrive: '−1 ход · +25% добычи · +50% риска ЧП!'
};

function fmtDelta(v, unit = ' / ход') {
  const r = Math.round(v);
  return (r > 0 ? `+${r}` : `${r}`) + unit;
}

export class ArkUI {
  constructor(engine, renderer, sound, assets = null) {
    this.engine = engine;
    this.renderer = renderer;
    this.sound = sound;
    this.assets = assets;

    this.viewMode = 'ship'; // 'ship' | 'system' | 'galaxy'
    this.selection = { compId: 'reactor', nodeId: null, galaxyId: null };
    this.launchCrew = 2;
    this.launchMode = 'standard';
    this.renderedModalRef = null;

    this.el = {
      screenTitle: document.getElementById('screen-title'),
      btnNewGame: document.getElementById('btn-new-game'),
      btnContinue: document.getElementById('btn-continue'),
      app: document.getElementById('app'),

      pillHull: document.getElementById('pill-hull'),
      valHull: document.getElementById('val-hull'),
      rateHull: document.getElementById('rate-hull'),
      pillDefense: document.getElementById('pill-defense'),
      valShield: document.getElementById('val-shield'),
      valWeapon: document.getElementById('val-weapon'),
      rateDefense: document.getElementById('rate-defense'),
      pillPower: document.getElementById('pill-power'),
      valPower: document.getElementById('val-power'),
      ratePower: document.getElementById('rate-power'),
      pillO2: document.getElementById('pill-o2'),
      valO2: document.getElementById('val-o2'),
      rateO2: document.getElementById('rate-o2'),
      pillFuel: document.getElementById('pill-fuel'),
      valFuel: document.getElementById('val-fuel'),
      rateFuel: document.getElementById('rate-fuel'),
      valAlloys: document.getElementById('val-alloys'),
      valComp: document.getElementById('val-comp'),
      rateAlloys: document.getElementById('rate-alloys'),
      pillFood: document.getElementById('pill-food'),
      valFood: document.getElementById('val-food'),
      rateFood: document.getElementById('rate-food'),
      valCrewFree: document.getElementById('val-crew-free'),
      valCrewTotal: document.getElementById('val-crew-total'),
      valCryo: document.getElementById('val-cryo'),
      pillMorale: document.getElementById('pill-morale'),
      valMorale: document.getElementById('val-morale'),
      rateMorale: document.getElementById('rate-morale'),

      tabShip: document.getElementById('tab-ship'),
      tabSystem: document.getElementById('tab-system'),
      tabGalaxy: document.getElementById('tab-galaxy'),
      zoomBreadcrumb: document.getElementById('zoom-breadcrumb'),
      barSystemName: document.getElementById('bar-system-name'),
      barTurn: document.getElementById('bar-turn'),
      barStorm: document.getElementById('bar-storm'),
      btnMusic: document.getElementById('btn-music'),
      btnSound: document.getElementById('btn-sound'),
      btnRestart: document.getElementById('btn-restart'),
      btnEndTurn: document.getElementById('btn-end-turn'),

      stripShuttleList: document.getElementById('strip-shuttle-list'),
      logList: document.getElementById('log-list'),

      threatCard: document.getElementById('threat-card'),
      thCountdown: document.getElementById('th-countdown'),
      thArt: document.getElementById('th-art'),
      thName: document.getElementById('th-name'),
      thReqs: document.getElementById('th-reqs'),
      btnRerouteThreat: document.getElementById('btn-reroute-threat'),

      starCaptureCard: document.getElementById('star-capture-card'),
      scProgress: document.getElementById('sc-progress'),
      scName: document.getElementById('sc-name'),
      scDesc: document.getElementById('sc-desc'),
      scTactics: document.getElementById('sc-tactics'),
      btnToggleCapture: document.getElementById('btn-toggle-capture'),

      sideShipPanel: document.getElementById('side-ship-panel'),
      sideSystemPanel: document.getElementById('side-system-panel'),
      sideGalaxyPanel: document.getElementById('side-galaxy-panel'),

      ciTag: document.getElementById('ci-tag'),
      ciLevel: document.getElementById('ci-level'),
      ciIcon: document.getElementById('ci-icon'),
      ciName: document.getElementById('ci-name'),
      ciDesc: document.getElementById('ci-desc'),
      ciFormula: document.getElementById('ci-formula'),
      ciWorkersSub: document.getElementById('ci-workers-sub'),
      ciWorkersNum: document.getElementById('ci-workers-num'),
      btnWMinus: document.getElementById('btn-w-minus'),
      btnWPlus: document.getElementById('btn-w-plus'),
      ciUpgTitle: document.getElementById('ci-upg-title'),
      ciUpgNote: document.getElementById('ci-upg-note'),
      ciUpgCost: document.getElementById('ci-upg-cost'),
      btnUpgradeComp: document.getElementById('btn-upgrade-comp'),

      cryoStatusTag: document.getElementById('cryo-status-tag'),
      btnCryoPower: document.getElementById('btn-cryo-power'),
      polOvertime: document.getElementById('pol-overtime'),
      polRationing: document.getElementById('pol-rationing'),
      polOvercharge: document.getElementById('pol-overcharge'),
      btnWakeCryo: document.getElementById('btn-wake-cryo'),

      niType: document.getElementById('ni-type'),
      niRisk: document.getElementById('ni-risk'),
      niIcon: document.getElementById('ni-icon'),
      niName: document.getElementById('ni-name'),
      niDesc: document.getElementById('ni-desc'),
      niYields: document.getElementById('ni-yields'),
      niFreeCrew: document.getElementById('ni-free-crew'),
      segCrew: document.getElementById('seg-crew'),
      niModeDesc: document.getElementById('ni-mode-desc'),
      segMode: document.getElementById('seg-mode'),
      btnLaunchShuttle: document.getElementById('btn-launch-shuttle'),
      siShuttlesCap: document.getElementById('si-shuttles-cap'),
      nodeList: document.getElementById('node-list'),

      giLayer: document.getElementById('gi-layer'),
      giThreat: document.getElementById('gi-threat'),
      giName: document.getElementById('gi-name'),
      giScan: document.getElementById('gi-scan'),
      giMeta: document.getElementById('gi-meta'),
      giJumpHint: document.getElementById('gi-jump-hint'),
      btnGalaxyJump: document.getElementById('btn-galaxy-jump'),
      giFuelCost: document.getElementById('gi-fuel-cost'),
      galaxyNextList: document.getElementById('galaxy-next-list'),

      modalEvent: document.getElementById('modal-event'),
      evBadge: document.getElementById('ev-badge'),
      evArt: document.getElementById('ev-art'),
      evTitle: document.getElementById('ev-title'),
      evDesc: document.getElementById('ev-desc'),
      evStats: document.getElementById('ev-stats'),
      evChoices: document.getElementById('ev-choices')
    };

    this.bindEvents();
    this.el.btnContinue.classList.toggle('hidden', !this.engine.hasSave());
  }

  startApp(loadExisting = false) {
    if (loadExisting) this.engine.loadSave();
    else this.engine.initNewGame(true);
    this.resetSelections();
    this.el.screenTitle.classList.add('hidden');
    this.el.app.classList.remove('hidden');
    this.refresh();
  }

  resetSelections() {
    const firstNode = this.engine.state.nodes.find(n => !n.depleted && !n.gone) || this.engine.state.nodes[0];
    this.selection.nodeId = firstNode ? firstNode.id : null;
    const nexts = this.engine.getSystem().next || [];
    this.selection.galaxyId = nexts[0] || this.engine.state.currentSystemId;
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.renderer.setViewTarget(mode);
    this.el.tabShip.classList.toggle('active', mode === 'ship');
    this.el.tabSystem.classList.toggle('active', mode === 'system');
    this.el.tabGalaxy.classList.toggle('active', mode === 'galaxy');
    this.el.sideShipPanel.classList.toggle('hidden', mode !== 'ship');
    this.el.sideSystemPanel.classList.toggle('hidden', mode !== 'system');
    this.el.sideGalaxyPanel.classList.toggle('hidden', mode !== 'galaxy');
    if (this.el.zoomBreadcrumb) {
      const crumbs = {
        ship: 'МАСШТАБ 1/3 · ПОПЕРЕЧНЫЙ РАЗРЕЗ КОВЧЕГА · Колёсико мыши ↓ — отдалить в Систему',
        system: 'МАСШТАБ 2/3 · 3D-КАРТА СИСТЕМЫ (55°) · Колёсико ↑ Корабль / ↓ Галактика',
        galaxy: 'МАСШТАБ 3/3 · 3D-КАРТА ГАЛАКТИКИ (55°) · Выбери соседнюю систему для прыжка'
      };
      this.el.zoomBreadcrumb.textContent = crumbs[mode] || '';
    }
    if (mode === 'galaxy') {
      const nexts = this.engine.getSystem().next || [];
      if (!this.selection.galaxyId || this.selection.galaxyId === this.engine.state.currentSystemId) {
        this.selection.galaxyId = nexts[0] || this.engine.state.currentSystemId;
      }
    }
    this.refresh();
  }

  triggerEndTurn() {
    if (this.engine.activeModal || this.engine.state.ended) return;
    const outcome = this.engine.endTurn();
    if (outcome && outcome.cometAttackEvent) {
      this.renderer.triggerCometBarrage(outcome.cometAttackEvent.blocked > 0, outcome.cometAttackEvent.netDamage);
    } else {
      this.sound.playClick();
    }
    this.refresh();
  }

  bindEvents() {
    this.el.btnNewGame.addEventListener('click', () => { this.sound.ensure(); this.sound.startMusic(); this.startApp(false); });
    this.el.btnContinue.addEventListener('click', () => { this.sound.ensure(); this.sound.startMusic(); this.startApp(true); });

    this.el.tabShip.addEventListener('click', () => { this.sound.playClick(); this.setViewMode('ship'); });
    this.el.tabSystem.addEventListener('click', () => { this.sound.playClick(); this.setViewMode('system'); });
    this.el.tabGalaxy.addEventListener('click', () => { this.sound.playClick(); this.setViewMode('galaxy'); });

    this.el.btnEndTurn.addEventListener('click', () => { this.sound.ensure(); this.triggerEndTurn(); });

    if (this.el.btnMusic) {
      this.el.btnMusic.addEventListener('click', () => {
        this.sound.ensure();
        this.sound.setMusicEnabled(!this.sound.musicEnabled);
        this.el.btnMusic.textContent = this.sound.musicEnabled ? 'Музыка: ВКЛ' : 'Музыка: ВЫКЛ';
        this.el.btnMusic.classList.toggle('active-spd', this.sound.musicEnabled);
      });
    }

    this.el.btnSound.addEventListener('click', () => {
      this.sound.setEnabled(!this.sound.enabled);
      this.el.btnSound.textContent = this.sound.enabled ? 'SFX: ВКЛ' : 'SFX: ВЫКЛ';
    });

    this.el.btnRestart.addEventListener('click', () => {
      if (confirm('Начать новую экспедицию с 1-го хода?')) {
        this.engine.initNewGame(true);
        this.resetSelections();
        this.setViewMode('ship');
      }
    });

    this.el.btnToggleCapture.addEventListener('click', () => {
      this.engine.toggleStarCapture();
      this.refresh();
    });

    this.el.btnRerouteThreat.addEventListener('click', () => {
      if (this.engine.rerouteFromThreat()) {
        this.renderer.triggerJumpFlash();
        this.refresh();
      }
    });

    this.el.btnWMinus.addEventListener('click', () => { this.engine.changeWorkers(this.selection.compId, -1); this.refresh(); });
    this.el.btnWPlus.addEventListener('click', () => { this.engine.changeWorkers(this.selection.compId, +1); this.refresh(); });
    this.el.btnUpgradeComp.addEventListener('click', () => { this.engine.upgradeComp(this.selection.compId); this.refresh(); });

    this.el.btnCryoPower.addEventListener('click', () => { this.engine.toggleCryoPower(); this.refresh(); });
    this.el.polOvertime.addEventListener('change', () => { this.engine.togglePolicy('overtime'); this.refresh(); });
    this.el.polRationing.addEventListener('change', () => { this.engine.togglePolicy('rationing'); this.refresh(); });
    this.el.polOvercharge.addEventListener('change', () => { this.engine.togglePolicy('overcharge'); this.refresh(); });
    this.el.btnWakeCryo.addEventListener('click', () => { this.engine.wakeCryoVolunteers(); this.refresh(); });

    this.el.segCrew.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.launchCrew = Number(btn.dataset.val);
        this.el.segCrew.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
        this.refresh();
      });
    });

    this.el.segMode.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.launchMode = btn.dataset.val;
        this.el.segMode.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
        this.refresh();
      });
    });

    this.el.btnLaunchShuttle.addEventListener('click', () => {
      if (this.engine.launchShuttle(this.selection.nodeId, this.launchCrew, this.launchMode)) {
        this.refresh();
      }
    });

    this.el.btnGalaxyJump.addEventListener('click', () => {
      if (this.engine.jumpToSystem(this.selection.galaxyId)) {
        this.renderer.triggerJumpFlash();
        this.resetSelections();
        this.setViewMode('ship');
      }
    });
  }

  refresh() {
    const s = this.engine.state;
    const sys = this.engine.getSystem();
    const prev = this.engine.getTurnPreview();

    // Адаптивная музыка: включаем напряжённый бас-пульс при Захвате Звезды, Блэкауте или близкой угрозе!
    const tense = prev.blackout
      || !!(s.starCapture && s.starCapture.active)
      || !!(s.activeThreat && s.activeThreat.turnsLeft <= 5);
    this.sound.setTension(tense);

    // 1. Верхние 9 приборов с точным прогнозом
    this.el.valHull.textContent = `${Math.ceil(s.hull)} / ${s.maxHull}`;
    this.setDelta(this.el.rateHull, prev.hullDelta);
    this.el.pillHull.classList.toggle('danger', s.hull < 35);

    this.el.valShield.textContent = `${Math.floor(s.shieldStock || 0)}`;
    this.el.valWeapon.textContent = `${Math.floor(s.weaponStock || 0)}`;
    const sd = prev.shieldDelta;
    const wd = prev.weaponDelta;
    const sdStr = sd > 0 ? `+${sd}` : `${sd}`;
    const wdStr = wd > 0 ? `+${wd}` : `${wd}`;
    this.el.rateDefense.textContent = `${sdStr}Щ / ${wdStr}Ор`;
    this.el.rateDefense.className = (sd < 0 || wd < 0) ? 'rate-neg' : ((sd > 0 || wd > 0) ? 'rate-pos' : '');

    this.el.valPower.textContent = `${prev.powerGen} / ${prev.powerUse} МВт`;
    this.el.ratePower.textContent = prev.blackout ? `БЛЭКАУТ (${prev.powerNet})` : `ЗАПАС +${prev.powerNet}`;
    this.el.ratePower.className = prev.blackout ? 'rate-neg' : 'rate-pos';
    this.el.pillPower.classList.toggle('danger', prev.blackout);

    this.el.valO2.textContent = `${Math.round(s.oxygen)} / ${s.maxOxygen}`;
    this.setDelta(this.el.rateO2, prev.o2Delta);
    this.el.pillO2.classList.toggle('danger', s.oxygen + prev.o2Delta <= 12);

    this.el.valFuel.textContent = `${Math.round(s.fuel)} / ${sys.jumpFuelCost || '—'}`;
    this.setDelta(this.el.rateFuel, prev.fuelDelta);
    this.el.pillFuel.classList.toggle('warn', sys.jumpFuelCost > 0 && s.fuel < sys.jumpFuelCost);

    this.el.valAlloys.textContent = `${Math.floor(s.alloys)}`;
    this.el.valComp.textContent = `${Math.floor(s.components)}`;
    this.setDelta(this.el.rateAlloys, prev.alloysDelta);

    this.el.valFood.textContent = `${Math.round(s.food)} / ${s.maxFood}`;
    this.setDelta(this.el.rateFood, prev.foodDelta);
    this.el.pillFood.classList.toggle('danger', s.food + prev.foodDelta <= 10);

    this.el.valCrewFree.textContent = `${this.engine.getFreeCrew()}`;
    this.el.valCrewTotal.textContent = `${s.crewHealthy}${s.crewInjured > 0 ? ` (+${s.crewInjured} ран.)` : ''}`;
    this.el.valCryo.textContent = `Крио: ${s.cryoPop}${s.cryoPowered ? '' : ' ⚠ВЫКЛ'}`;

    this.el.valMorale.textContent = `${Math.round(s.morale)}%`;
    this.setDelta(this.el.rateMorale, prev.moraleDelta);
    this.el.pillMorale.classList.toggle('danger', s.morale < 25);

    // 2. Полоса статуса и кнопка хода
    this.el.barSystemName.textContent = `Сектор ${sys.layer}/6 · ${sys.name}`;
    this.el.barTurn.textContent = `Ход ${s.turn}`;
    if (prev.stormActive) {
      this.el.barStorm.textContent = '⚠ ШТОРМ (−10 обш/ход)';
      this.el.barStorm.classList.add('storm-now');
    } else {
      this.el.barStorm.textContent = `Шторм через ${prev.turnsToStorm} ход.`;
      this.el.barStorm.classList.remove('storm-now');
    }

    const canJumpAny = (sys.next || []).some(id => this.engine.canJumpTo(id));
    this.el.tabGalaxy.classList.toggle('pulse-gold', canJumpAny && this.viewMode !== 'galaxy');

    this.el.btnEndTurn.disabled = !!this.engine.activeModal || s.ended;
    this.el.btnEndTurn.classList.toggle('warn-btn', prev.blackout);
    this.el.btnEndTurn.textContent = prev.blackout
      ? `ХОД ${s.turn} → ${s.turn + 1} (⚡БЛЭКАУТ!)`
      : `ЗАВЕРШИТЬ ХОД (${s.turn} → ${s.turn + 1}) →`;

    // 2.5. Карточка приближающейся угрозы (Космический десант / Перехватчик)
    const th = s.activeThreat;
    if (th) {
      this.el.threatCard.classList.remove('hidden');
      this.el.thCountdown.textContent = `Встреча через ${th.turnsLeft} ход.`;
      if (this.el.thArt) {
        this.el.thArt.src = th.id === 'quarantine_dreadnought'
          ? 'assets/svg/threat_dreadnought.svg'
          : 'assets/svg/threat_marines.svg';
      }
      this.el.thName.textContent = th.name;
      const shOk = (s.shieldStock || 0) >= th.reqShield;
      const wpOk = (s.weaponStock || 0) >= th.reqWeapon;
      this.el.thReqs.innerHTML = `
        <div>Для победы в бою нужно:</div>
        <div>🛡 Щит: <strong style="color:${shOk ? 'var(--green)' : 'var(--red)'}">${Math.floor(s.shieldStock)} / ${th.reqShield}</strong> · ⚔ Оружие: <strong style="color:${wpOk ? 'var(--green)' : 'var(--red)'}">${Math.floor(s.weaponStock)} / ${th.reqWeapon}</strong></div>
        <div class="muted" style="margin-top:3px;">Иначе: откуп (${th.negotiateCost.crew} чел. + ресурсы) или тяжёлый прорыв.</div>
      `;
      const canReroute = th.reroutesUsed < th.maxReroutes && s.fuel >= th.rerouteFuelCost;
      this.el.btnRerouteThreat.disabled = !canReroute;
      this.el.btnRerouteThreat.textContent = th.reroutesUsed >= th.maxReroutes
        ? 'МАНЁВРЫ УКЛОНЕНИЯ ИСЧЕРПАНЫ'
        : `СМЕНИТЬ МАРШРУТ (−${th.rerouteFuelCost} He-3 → +${th.rerouteDelayTurns} ход.)`;
    } else {
      this.el.threatCard.classList.add('hidden');
    }

    // 3. Карточка Захвата Звезды
    const sc = s.starCapture;
    if (sc && !sc.completed) {
      this.el.starCaptureCard.classList.remove('hidden');
      this.el.starCaptureCard.classList.toggle('capturing', sc.active);
      this.el.scProgress.textContent = `${sc.turnsDone} / ${sc.turnsRequired} ходов`;
      this.el.scName.textContent = sc.starName;
      this.el.scDesc.textContent = sc.desc;
      const wCap = sc.weaponUsePerTurn || 4;
      const shCap = sc.shieldUsePerTurn || 6;
      const estW = Math.min((s.weaponStock || 0) + prev.weaponGen, wCap);
      const estShot = estW * 2;
      const rem1 = Math.max(0, sc.cometDamagePerTurn - estShot - prev.shiftShieldBlock);
      const estSh = Math.min((s.shieldStock || 0) + prev.shieldGen, shCap, rem1);
      const netComet = Math.max(0, rem1 - estSh);
      this.el.scTactics.innerHTML = `
        <div>Нагрузка захвата: <strong style="color:var(--gold)">−${sc.powerDrain} МВт / ход</strong></div>
        <div>Кометы (${sc.cometDamagePerTurn}): Орудия сбивают <strong style="color:#fb923c">${estShot}</strong> (−${estW}Ор), Щит <strong style="color:var(--cyan)">${prev.shiftShieldBlock + estSh}</strong> (−${estSh}Щ) → обш. <strong style="color:${netComet > 10 ? 'var(--red)' : 'var(--green)'}">−${netComet}%/ход</strong></div>
      `;
      this.el.btnToggleCapture.textContent = sc.active ? 'ПРИОСТАНОВИТЬ ЗАХВАТ' : 'НАЧАТЬ ЗАХВАТ ЗВЕЗДЫ';
      this.el.btnToggleCapture.className = sc.active ? 'btn btn-danger-ghost btn-full' : 'btn btn-turn btn-full';
    } else {
      this.el.starCaptureCard.classList.add('hidden');
    }

    // 4. Контекстные панели
    if (this.viewMode === 'ship') this.renderShipSidebar();
    else if (this.viewMode === 'system') this.renderSystemSidebar();
    else this.renderGalaxySidebar();

    // 5. Нижняя полоса и модалки
    this.renderShuttlesStrip();
    this.renderLogs();
    this.renderModal();
  }

  setDelta(el, val) {
    el.textContent = fmtDelta(val);
    el.className = val > 0 ? 'rate-pos' : (val < 0 ? 'rate-neg' : '');
  }

  renderShipSidebar() {
    const def = this.engine.compMap.get(this.selection.compId);
    if (!def) return;
    const cst = this.engine.state.compartments[def.id];
    const lvl = def.levels[cst.level - 1];
    const next = def.levels[cst.level] || null;
    const rTier = this.engine.getReactorTierDef();
    const free = this.engine.getFreeCrew();

    this.el.ciTag.textContent = `ОТСЕК · ${def.short}`;
    this.el.ciLevel.textContent = `Ур. ${cst.level} / ${def.levels.length}`;
    if (this.el.ciIcon) this.el.ciIcon.src = `assets/svg/comp_${def.id}.svg`;
    this.el.ciName.textContent = def.name;
    this.el.ciDesc.textContent = def.desc;

    const maxW = this.engine.getMaxWorkers(def.id);
    if (def.id === 'reactor') {
      this.el.ciFormula.textContent = `Ядро «${rTier.name}»: база ${rTier.basePower} МВт + ${rTier.powerPerWorker} МВт/инженер (слотов: ${maxW}). Само ядро усиливается только захватом Звёзд!`;
    } else {
      this.el.ciFormula.textContent = lvl.note;
    }

    this.el.ciWorkersSub.textContent = `${cst.workers} / ${maxW} (свободно: ${free})`;
    this.el.ciWorkersNum.textContent = `${cst.workers}`;
    this.el.btnWMinus.disabled = cst.workers <= 0;
    this.el.btnWPlus.disabled = cst.workers >= maxW || free <= 0;

    if (!next) {
      this.el.ciUpgTitle.textContent = 'Максимальный уровень';
      this.el.ciUpgNote.textContent = 'Отсек полностью модернизирован.';
      this.el.ciUpgCost.innerHTML = '';
      this.el.btnUpgradeComp.classList.add('hidden');
    } else {
      this.el.btnUpgradeComp.classList.remove('hidden');
      this.el.ciUpgTitle.textContent = `Модернизация → Ур. ${next.level}`;
      this.el.ciUpgNote.textContent = next.note;
      const aOk = this.engine.state.alloys >= next.alloyCost;
      const cOk = this.engine.state.components >= next.compCost;
      this.el.ciUpgCost.innerHTML = `
        <span style="color:${aOk ? 'var(--gold)' : 'var(--red)'}">Сплавы: ${next.alloyCost}</span>
        <span style="color:${cOk ? 'var(--purple)' : 'var(--red)'}">Компоненты: ${next.compCost}</span>
      `;
      this.el.btnUpgradeComp.disabled = !(aOk && cOk);
    }

    // Крио и Указы
    const s = this.engine.state;
    this.el.cryoStatusTag.textContent = `${s.cryoPop} капсул`;
    this.el.btnCryoPower.textContent = s.cryoPowered ? 'ВКЛ (3 МВт)' : 'ВЫКЛ (⚠)';
    this.el.btnCryoPower.className = s.cryoPowered ? 'btn btn-sm btn-ghost active-spd' : 'btn btn-sm btn-danger-ghost';

    this.el.polOvertime.checked = s.policies.overtime;
    this.el.polRationing.checked = s.policies.rationing;
    this.el.polOvercharge.checked = s.policies.overcharge;

    this.el.btnWakeCryo.disabled = s.cryoWakeCd > 0 || s.cryoPop < 15;
    this.el.btnWakeCryo.textContent = s.cryoWakeCd > 0
      ? `Пробуждение из Крио (через ${s.cryoWakeCd} ход.)`
      : 'Пробудить +2 чел. из Крио (−15 крио, −3 Морали)';
  }

  renderSystemSidebar() {
    const nodes = this.engine.state.nodes;
    const maxSh = this.engine.getMaxShuttles();
    const curSh = this.engine.state.shuttles.length;
    this.el.siShuttlesCap.textContent = `Шаттлы: ${curSh}/${maxSh}`;

    const node = nodes.find(n => n.id === this.selection.nodeId && !n.gone) || nodes.find(n => !n.gone) || nodes[0];
    if (node) {
      this.selection.nodeId = node.id;
      const bayLvl = this.engine.getCompLevelDef('shuttle_bay');
      const modeRisk = this.launchMode === 'safe' ? 0.55 : (this.launchMode === 'overdrive' ? 1.50 : 1.0);
      const effRisk = Math.min(92, Math.round(node.risk * bayLvl.riskMult * modeRisk * 100));
      const turns = this.engine.getExpeditionTurns(node, this.launchCrew, this.launchMode);

      this.el.niType.textContent = NODE_TYPE_LABELS[node.type] || node.type;
      this.el.niRisk.textContent = `Риск ЧП: ${effRisk}%`;
      this.el.niRisk.style.color = effRisk >= 55 ? 'var(--red)' : (effRisk >= 35 ? 'var(--gold)' : 'var(--green)');
      if (this.el.niIcon) this.el.niIcon.src = `assets/svg/node_${node.type}.svg`;
      this.el.niName.textContent = node.name;
      this.el.niDesc.textContent = node.depleted
        ? 'Объект полностью выработан.'
        : `Длительность экспедиции: ${turns} ход(а). Пока люди на вылазке, они не работают в отсеках.`;

      const chips = [];
      if (node.crew) chips.push(`<span class="y-chip" style="color:var(--green);border-color:rgba(74,222,128,0.45)">👤 +${node.crew} Экипажа</span>`);
      if (node.fuel) chips.push(`<span class="y-chip" style="color:var(--gold)">He-3: ~${node.fuel}</span>`);
      if (node.oxygen) chips.push(`<span class="y-chip" style="color:var(--cyan)">O₂: ~${node.oxygen}</span>`);
      if (node.alloys) chips.push(`<span class="y-chip">Сплавы: ~${node.alloys}</span>`);
      if (node.comp) chips.push(`<span class="y-chip" style="color:var(--purple)">Комп.: ~${node.comp}</span>`);
      this.el.niYields.innerHTML = chips.join('');

      this.el.niFreeCrew.textContent = `Свободно: ${this.engine.getFreeCrew()} чел.`;
      this.el.niModeDesc.textContent = MODE_DESC[this.launchMode];

      const canGo = this.engine.canLaunchShuttle(node.id, this.launchCrew);
      this.el.btnLaunchShuttle.disabled = !canGo;
      if (node.depleted) this.el.btnLaunchShuttle.textContent = 'ИСТОЩЕНО';
      else if (this.engine.state.shuttles.some(sh => sh.nodeId === node.id)) this.el.btnLaunchShuttle.textContent = 'ЭКСПЕДИЦИЯ В ПУТИ';
      else if (curSh >= maxSh) this.el.btnLaunchShuttle.textContent = 'ВСЕ ШАТТЛЫ ЗАНЯТЫ';
      else if (this.engine.getFreeCrew() < this.launchCrew) this.el.btnLaunchShuttle.textContent = 'НЕТ СВОБОДНОГО ЭКИПАЖА';
      else this.el.btnLaunchShuttle.textContent = `ОТПРАВИТЬ (${this.launchCrew} чел. · ${turns} ход.)`;
    }

    const frag = document.createDocumentFragment();
    for (const n of nodes) {
      if (n.gone) continue;
      const row = document.createElement('div');
      row.className = 'node-row';
      if (n.id === this.selection.nodeId) row.classList.add('active');
      if (n.depleted) row.classList.add('depleted');
      const res = [];
      if (n.crew) res.push(`+${n.crew} экипажа`);
      if (n.fuel) res.push(`He-3:${n.fuel}`);
      if (n.oxygen) res.push(`O₂:${n.oxygen}`);
      if (n.alloys) res.push(`Спл:${n.alloys}`);
      if (n.comp) res.push(`Комп:${n.comp}`);
      row.innerHTML = `
        <div class="node-row-top">
          <span>${n.name}</span>
          <span class="muted">${n.depleted ? 'Пусто' : `${n.turns} ход.`}</span>
        </div>
        <small>${res.join(' · ')}</small>
      `;
      row.addEventListener('click', () => {
        this.selection.nodeId = n.id;
        this.sound.playClick();
        this.refresh();
      });
      frag.appendChild(row);
    }
    this.el.nodeList.innerHTML = '';
    this.el.nodeList.appendChild(frag);
  }

  renderGalaxySidebar() {
    const curSys = this.engine.getSystem();
    const selSys = this.engine.getSystem(this.selection.galaxyId) || curSys;
    const isNext = (curSys.next || []).includes(selSys.id);

    this.el.giLayer.textContent = `СЕКТОР ${selSys.layer}/6 · РАЗВЕДКА`;
    this.el.giThreat.textContent = `Угроза: ${selSys.threatLevel}/5`;
    this.el.giName.textContent = selSys.name;
    this.el.giScan.textContent = selSys.scanSummary;

    const chips = [`<span class="y-chip" style="color:var(--gold)">${selSys.scanTag}</span>`];
    if (selSys.powerPenalty) chips.push(`<span class="y-chip" style="color:var(--cyan)">Штраф сети: −${selSys.powerPenalty} МВт</span>`);
    if (selSys.ambientHullDmg) chips.push(`<span class="y-chip" style="color:var(--red)">Фон: −${selSys.ambientHullDmg} обш/ход</span>`);
    if (selSys.starCapture) chips.push(`<span class="y-chip" style="color:var(--gold)">⭐ Звезда для Реактора</span>`);
    this.el.giMeta.innerHTML = chips.join('');

    const alloyJump = curSys.jumpAlloyCost || 0;
    this.el.giFuelCost.textContent = curSys.jumpFuelCost > 0
      ? `Прыжок: ${curSys.jumpFuelCost} He-3 · ${alloyJump} Спл`
      : 'Финальный сектор';

    const canJump = this.engine.canJumpTo(selSys.id);
    this.el.btnGalaxyJump.disabled = !canJump;

    if (selSys.id === curSys.id) {
      this.el.giJumpHint.textContent = 'Ты сейчас находишься в этой системе. Выбери одну из подсвеченных золотым соседних систем.';
      this.el.btnGalaxyJump.textContent = 'ТЕКУЩАЯ СИСТЕМА';
    } else if (!isNext) {
      this.el.giJumpHint.textContent = 'Слишком далеко: можно прыгать только в соседние соединённые системы.';
      this.el.btnGalaxyJump.textContent = 'НЕТ ПРЯМОГО МАРШРУТА';
    } else if (this.engine.state.shuttles.length > 0) {
      this.el.giJumpHint.textContent = 'Дождись возвращения всех шаттлов перед прыжком!';
      this.el.btnGalaxyJump.textContent = 'ЖДЁМ ШАТТЛЫ';
    } else if (this.engine.state.starCapture && this.engine.state.starCapture.active) {
      this.el.giJumpHint.textContent = 'Приостанови или заверши Захват Звезды перед прыжком.';
      this.el.btnGalaxyJump.textContent = 'ИДЁТ ЗАХВАТ ЗВЕЗДЫ';
    } else if (this.engine.state.fuel < curSys.jumpFuelCost) {
      this.el.giJumpHint.textContent = `Не хватает Гелия-3: нужно ${curSys.jumpFuelCost}, сейчас ${Math.round(this.engine.state.fuel)}.`;
      this.el.btnGalaxyJump.textContent = `НУЖНО ${curSys.jumpFuelCost} He-3`;
    } else if (this.engine.state.alloys < alloyJump) {
      this.el.giJumpHint.textContent = `Не хватает Сплавов на термозащиту прыжка: нужно ${alloyJump}, сейчас ${Math.floor(this.engine.state.alloys)}.`;
      this.el.btnGalaxyJump.textContent = `НУЖНО ${alloyJump} СПЛАВОВ`;
    } else {
      this.el.giJumpHint.textContent = `Гипердвигатель готов. Расход прыжка: ${curSys.jumpFuelCost} He-3 и ${alloyJump} Сплавов.`;
      this.el.btnGalaxyJump.textContent = `ГИПЕРПРЫЖОК → ${selSys.name} (−${curSys.jumpFuelCost} He-3, −${alloyJump} Спл)`;
    }

    // Список доступных соседних систем
    const frag = document.createDocumentFragment();
    for (const nid of (curSys.next || [])) {
      const ns = this.engine.getSystem(nid);
      if (!ns) continue;
      const row = document.createElement('div');
      row.className = 'node-row';
      if (ns.id === selSys.id) row.classList.add('active');
      row.innerHTML = `
        <div class="node-row-top">
          <span>${ns.starCapture ? '⭐ ' : ''}${ns.name}</span>
          <span style="color:var(--gold)">Угроза ${ns.threatLevel}/5</span>
        </div>
        <small>${ns.scanTag}</small>
      `;
      row.addEventListener('click', () => {
        this.selection.galaxyId = ns.id;
        this.sound.playClick();
        this.refresh();
      });
      frag.appendChild(row);
    }
    this.el.galaxyNextList.innerHTML = '';
    if ((curSys.next || []).length === 0) {
      this.el.galaxyNextList.innerHTML = `<span class="muted">Финальный сектор достигнут! Захвати Орбитальный Квазар Эдема для победы.</span>`;
    } else {
      this.el.galaxyNextList.appendChild(frag);
    }
  }

  renderShuttlesStrip() {
    const shs = this.engine.state.shuttles;
    if (shs.length === 0) {
      this.el.stripShuttleList.innerHTML = `<span class="muted">Нет активных экспедиций. Перейди на вкладку «2. Система (Вылазки)», чтобы отправить шаттл.</span>`;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const sh of shs) {
      const chip = document.createElement('div');
      chip.className = 'shuttle-chip';
      chip.innerHTML = `
        <div>
          <strong>${sh.nodeName} (${sh.crewCount} чел. · ${sh.modeLabel})</strong>
          <small>Прогресс: ход ${sh.turnsDone} из ${sh.turnsTotal}</small>
        </div>
      `;
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-danger-ghost';
      btn.textContent = 'Отозвать';
      btn.addEventListener('click', () => {
        this.engine.recallShuttle(sh.id);
        this.refresh();
      });
      chip.appendChild(btn);
      frag.appendChild(chip);
    }
    this.el.stripShuttleList.innerHTML = '';
    this.el.stripShuttleList.appendChild(frag);
  }

  renderLogs() {
    this.el.logList.innerHTML = this.engine.state.logs.slice(0, 12).map(l =>
      `<div class="log-row ${l.kind}"><b>[Ход ${l.turn}]</b>${l.text}</div>`
    ).join('');
  }

  renderModal() {
    const m = this.engine.activeModal;
    if (!m) {
      this.el.modalEvent.classList.add('hidden');
      this.renderedModalRef = null;
      return;
    }
    if (this.renderedModalRef === m) return;
    this.renderedModalRef = m;

    this.el.modalEvent.classList.remove('hidden');
    this.el.evBadge.className = 'ev-badge';
    if (m.kind === 'threat_encounter') {
      this.el.evBadge.textContent = 'БОЕВОЕ СТОЛКНОВЕНИЕ';
    } else if (m.kind === 'incident') {
      this.el.evBadge.classList.add('warn');
      this.el.evBadge.textContent = `ЧП НА ВЫЛАЗКЕ · ${m.nodeName.toUpperCase()}`;
    } else if (m.kind === 'dilemma') {
      this.el.evBadge.textContent = 'КРИЗИС НА БОРТУ';
    } else if (m.kind === 'ending') {
      this.el.evBadge.textContent = m.badge;
      if (m.isWin) this.el.evBadge.classList.add('good');
    }

    if (this.el.evArt) {
      if (m.kind === 'threat_encounter') {
        this.el.evArt.src = m.threatId === 'quarantine_dreadnought'
          ? 'assets/svg/threat_dreadnought.svg'
          : 'assets/svg/threat_marines.svg';
        this.el.evArt.classList.remove('hidden');
      } else {
        this.el.evArt.classList.add('hidden');
      }
    }

    this.el.evTitle.textContent = m.title;
    this.el.evDesc.textContent = m.desc;

    if (m.kind === 'ending') {
      const s = this.engine.state;
      this.el.evStats.classList.remove('hidden');
      this.el.evStats.innerHTML = `
        <div class="ev-stat-box"><span>Всего ходов</span><strong>${s.turn}</strong></div>
        <div class="ev-stat-box"><span>Захвачено Звёзд</span><strong>${s.stats.starsCaptured}</strong></div>
        <div class="ev-stat-box"><span>Выжившие в крио</span><strong>${s.cryoPop} / 1000</strong></div>
        <div class="ev-stat-box"><span>Вылазок / Систем</span><strong>${s.stats.expeditionsDone} / ${s.stats.systemsVisited}</strong></div>
      `;
      this.el.evChoices.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-lg';
      btn.textContent = 'НАЧАТЬ НОВУЮ ЭКСПЕДИЦИЮ';
      btn.addEventListener('click', () => {
        this.engine.activeModal = null;
        this.renderedModalRef = null;
        this.engine.initNewGame(true);
        this.resetSelections();
        this.setViewMode('ship');
      });
      this.el.evChoices.appendChild(btn);
      return;
    }

    this.el.evStats.classList.add('hidden');
    const s = this.engine.state;
    const frag = document.createDocumentFragment();
    m.choices.forEach((ch, idx) => {
      const btn = document.createElement('button');
      btn.className = 'ev-choice-btn';
      let disabled = false;
      if (ch.costAlloys && s.alloys < ch.costAlloys) disabled = true;
      if (ch.costO2 && s.oxygen < ch.costO2) disabled = true;
      if (ch.costFuel && s.fuel < ch.costFuel) disabled = true;
      if (ch.alloys && ch.alloys < 0 && s.alloys < -ch.alloys) disabled = true;
      if (ch.food && ch.food < 0 && s.food < -ch.food) disabled = true;
      if (ch.oxygen && ch.oxygen < 0 && s.oxygen < -ch.oxygen) disabled = true;
      if (ch.comp && ch.comp < 0 && s.components < -ch.comp) disabled = true;
      if (ch.reqShield && (s.shieldStock || 0) < ch.reqShield) disabled = true;
      if (ch.reqWeapon && (s.weaponStock || 0) < ch.reqWeapon) disabled = true;
      if (ch.reqCrew && (s.crewHealthy + s.crewInjured) <= ch.reqCrew) disabled = true;

      btn.disabled = disabled;
      btn.textContent = ch.label + (disabled ? ' [не выполнены условия]' : '');
      btn.addEventListener('click', () => {
        this.engine.resolveModalChoice(idx);
        this.refresh();
      });
      frag.appendChild(btn);
    });
    this.el.evChoices.innerHTML = '';
    this.el.evChoices.appendChild(frag);
  }
}
