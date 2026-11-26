// engine.js — пошаговый движок ARK EXODUS v2 (Энергия → Ресурсы, карта Галактики, вылазки по ходам, Захват Звезды)

const SAVE_KEY = 'ark_exodus_turn_v4';

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

export class ArkEngine {
  constructor(balance, sound) {
    this.balance = balance;
    this.sound = sound;
    this.compMap = new Map(balance.compartments.map(c => [c.id, c]));
    this.sysMap = new Map(balance.galaxyMap.map(s => [s.id, s]));

    this.activeModal = null;
    this.onEvent = null; // (type, payload) => void
    this.state = null;
    this.initNewGame(false);
  }

  initNewGame(persist = true) {
    const init = this.balance.initial;
    const comps = {};
    for (const c of this.balance.compartments) {
      comps[c.id] = { level: 1, workers: 0 };
    }
    // Стартовая напряжённая расстановка (8 чел.: 2 Реактор = 16 МВт; 2 O2, 1 Огороды, 1 Оборона, 2 свободны для экспедиции!)
    comps.reactor.workers = 2;
    comps.life_support.workers = 2;
    comps.hydroponics.workers = 1;
    comps.synthesizer.workers = 0;
    comps.defense_bay.workers = 1;

    this.state = {
      turn: 1,
      systemTurn: 1,
      currentSystemId: 'sys_0',
      visitedSystems: ['sys_0'],
      reactorTier: 1, // 1..4 (Термояд -> Карлик -> Пульсар -> Квазар)

      hull: init.hull,
      maxHull: init.maxHull,
      oxygen: init.oxygen,
      maxOxygen: init.maxOxygen,
      fuel: init.fuel,
      maxFuel: init.maxFuel,
      alloys: init.alloys,
      food: init.food,
      maxFood: init.maxFood,
      components: init.components,
      shieldStock: init.shieldStock || 4,
      maxShieldStock: init.maxShieldStock || 50,
      weaponStock: init.weaponStock || 2,
      maxWeaponStock: init.maxWeaponStock || 45,
      crewHealthy: init.crewHealthy,
      crewInjured: init.crewInjured,
      cryoPop: init.cryoPop,
      cryoPowered: true,
      morale: init.morale,

      compartments: comps,
      policies: {
        overtime: false,   // +30% синтеза ресурсов, −3 Морали/ход
        rationing: false,  // −35% расхода Еды, −2 Морали/ход
        overcharge: false  // +5 МВт к генерации, +2 He-3/ход, −3 обш/ход от перегрева
      },
      cryoWakeCd: 0,
      healProgress: 0,

      // Захват Звезды внутри текущей системы
      starCapture: null,
      capturedStars: [],

      // Крупные угрозы с отсчётом 10 ходов (Десант / Перехватчик)
      activeThreat: null,
      resolvedThreats: [],

      nodes: [],
      shuttles: [],
      usedDilemmas: [],
      logs: [],
      stats: {
        expeditionsDone: 0,
        starsCaptured: 0,
        dilemmasSolved: 0,
        systemsVisited: 1,
        crewLost: 0
      },
      ended: false,
      ending: null
    };

    this.setupSystem('sys_0', true);
    this.addLog('Земля уничтожена. Вся экономика станции держится на Энергии (МВт) и экипаже. Расставь людей, отправь шаттл и нажми «Завершить ход»!', 'info');
    if (persist) this.save();
  }

  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.compartments || !parsed.currentSystemId) return false;
      this.state = parsed;
      this.activeModal = null;
      return true;
    } catch {
      return false;
    }
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch {}
  }

  clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch {}
  }

  getSystem(id = null) {
    return this.sysMap.get(id || this.state.currentSystemId) || this.balance.galaxyMap[0];
  }

  getReactorTierDef() {
    return this.balance.reactorTiers[this.state.reactorTier - 1] || this.balance.reactorTiers[0];
  }

  getCompLevelDef(compId) {
    const def = this.compMap.get(compId);
    const st = this.state.compartments[compId];
    return def.levels[st.level - 1];
  }

  getMaxWorkers(compId) {
    const def = this.compMap.get(compId);
    const lvl = this.getCompLevelDef(compId);
    return (lvl && lvl.maxWorkers !== undefined) ? lvl.maxWorkers : def.maxWorkers;
  }

  addLog(text, kind = 'info') {
    this.state.logs.unshift({ turn: this.state.turn, text, kind });
    if (this.state.logs.length > 40) this.state.logs.pop();
  }

  setupSystem(systemId, isFirst = false) {
    this.state.currentSystemId = systemId;
    this.state.systemTurn = 1;
    this.state.shuttles = [];
    const sys = this.getSystem(systemId);

    if (!this.state.visitedSystems.includes(systemId)) {
      this.state.visitedSystems.push(systemId);
      this.state.stats.systemsVisited += 1;
    }

    // Расставляем объекты по орбите
    const count = sys.nodes.length;
    this.state.nodes = sys.nodes.map((n, i) => {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2 + (i % 2 === 0 ? 0.18 : -0.14);
      const dist = n.type === 'comet' ? 0.41 : (n.type === 'wreck' ? 0.30 : 0.25 + (i % 2) * 0.04);
      return {
        id: `${systemId}_n${i}`,
        ...n,
        angle,
        dist,
        x: 0.5 + Math.cos(angle) * dist * 1.15,
        y: 0.5 + Math.sin(angle) * dist * 0.90,
        depleted: false,
        gone: false
      };
    });

    // Настраиваем карликовую звезду, если она есть в системе и ещё не захвачена
    if (sys.starCapture && !this.state.capturedStars.includes(systemId)) {
      this.state.starCapture = {
        ...sys.starCapture,
        active: false,
        turnsDone: 0,
        completed: false
      };
    } else {
      this.state.starCapture = null;
    }

    if (!isFirst) {
      this.addLog(`Гиперпрыжок в систему «${sys.name}» (${sys.scanTag}).`, 'good');
      if (this.state.starCapture) {
        this.addLog(`⭐ В системе обнаружена звезда «${this.state.starCapture.starName}»! Накопи запасы и запусти Захват Звезды для усиления Реактора.`, 'warn');
      }
    }
  }

  // ===== ЭКИПАЖ, ЭНЕРГИЯ И ТОЧНЫЙ ПРОГНОЗ ХОДА =====

  getAssignedWorkersTotal() {
    let sum = 0;
    for (const c of Object.values(this.state.compartments)) sum += c.workers;
    return sum;
  }

  getShuttleCrewTotal() {
    let sum = 0;
    for (const sh of this.state.shuttles) sum += sh.crewCount;
    return sum;
  }

  getFreeCrew() {
    return Math.max(0, this.state.crewHealthy - this.getAssignedWorkersTotal() - this.getShuttleCrewTotal());
  }

  getTurnPreview() {
    const s = this.state;
    const sys = this.getSystem();
    const rTier = this.getReactorTierDef();
    const rComp = s.compartments.reactor;
    const rLvl = this.getCompLevelDef('reactor');
    const rules = this.balance.turnRules;

    // 1. Генерация Энергии (МВт) — сам Реактор усиливается ТОЛЬКО захватом Звёзд; модернизация отсека лишь даёт слоты инженеров!
    let powerGen = rTier.basePower + rComp.workers * rTier.powerPerWorker;
    if (s.fuel <= 0) powerGen = Math.max(8, Math.floor(powerGen * 0.55)); // аварийный режим при 0 топлива
    if (s.policies.overcharge) powerGen += 5;
    powerGen = Math.max(0, powerGen - (sys.powerPenalty || 0));

    // 2. Потребление Энергии (МВт)
    let powerUse = 0;
    if (s.cryoPowered && s.cryoPop > 0) powerUse += rules.cryoPowerCostBase;
    for (const def of this.balance.compartments) {
      const cst = s.compartments[def.id];
      const lvl = def.levels[cst.level - 1];
      const ppw = lvl.powerPerWorker !== undefined ? lvl.powerPerWorker : def.powerPerWorker;
      powerUse += (def.basePowerUse || 0) + cst.workers * ppw;
    }
    // Захват Звезды забирает огромную долю энергии!
    const starDrain = (s.starCapture && s.starCapture.active) ? s.starCapture.powerDrain : 0;
    powerUse += starDrain;

    const powerNet = powerGen - powerUse;
    const blackout = powerNet < 0;
    const workMult = (blackout ? rules.blackoutPenalty : 1.0) * (s.policies.overtime ? 1.3 : 1.0) * (s.morale < 25 ? 0.8 : 1.0);

    // 3. Топливо (He-3)
    const fuelDelta = -(rTier.fuelPerTurn + (s.policies.overcharge ? 2 : 0));

    // 4. Кислород O2
    const totalCrew = s.crewHealthy + s.crewInjured;
    const o2Lvl = this.getCompLevelDef('life_support');
    const o2Gen = Math.round(s.compartments.life_support.workers * o2Lvl.o2PerWorker * workMult);
    const o2Use = Math.round(totalCrew * rules.o2PerCrew);
    const o2Delta = o2Gen - o2Use;

    // 5. Еда
    const foodLvl = this.getCompLevelDef('hydroponics');
    const foodGen = Math.round(s.compartments.hydroponics.workers * foodLvl.foodPerWorker * workMult);
    const foodUse = Math.round(totalCrew * rules.foodPerCrew * (s.policies.rationing ? 0.65 : 1.0));
    const foodDelta = foodGen - foodUse;

    // 6. Сплавы и ремонт обшивки
    const synLvl = this.getCompLevelDef('synthesizer');
    const synWorkers = s.compartments.synthesizer.workers;
    const alloysGen = Math.round(synWorkers * synLvl.alloysPerWorker * workMult);

    const defLvl = this.getCompLevelDef('defense_bay');
    const defWorkers = s.compartments.defense_bay.workers;
    const shieldGen = Math.round(defWorkers * (defLvl.shieldGenPerWorker || 3) * workMult);
    const weaponGen = Math.round(defWorkers * (defLvl.weaponGenPerWorker || 3) * workMult);
    const shiftShieldBlock = Math.round(defWorkers * defLvl.shieldBlockPerWorker * (blackout ? 0.5 : 1.0));

    // Ожидаемый урон по обшивке и расход Оружия/Щита при Захвате Звезды!
    const stormActive = s.systemTurn >= sys.stormTurn;
    const scActive = !!(s.starCapture && s.starCapture.active);
    const cometIncoming = scActive ? s.starCapture.cometDamagePerTurn : 0;

    let weaponSpent = 0;
    let cometShotDown = 0;
    let shieldSpent = 0;
    let cometAfterShield = 0;

    if (scActive) {
      const wCap = s.starCapture.weaponUsePerTurn || 4;
      const availWeapon = (s.weaponStock || 0) + weaponGen;
      weaponSpent = Math.min(availWeapon, wCap);
      cometShotDown = weaponSpent * 2; // 1 ед. Оружия сбивает 2 урона комет!

      const remAfterWeapons = Math.max(0, cometIncoming - cometShotDown);
      const remAfterShift = Math.max(0, remAfterWeapons - shiftShieldBlock);

      const shCap = s.starCapture.shieldUsePerTurn || 6;
      const availShield = (s.shieldStock || 0) + shieldGen;
      shieldSpent = Math.min(availShield, shCap, remAfterShift);
      cometAfterShield = Math.max(0, remAfterShift - shieldSpent);
    }

    const shieldBlock = shiftShieldBlock + shieldSpent;
    const shieldDelta = shieldGen - shieldSpent;
    const weaponDelta = weaponGen - weaponSpent;

    const envDmg = (sys.ambientHullDmg || 0) + (stormActive ? 10 : 0) + (s.policies.overcharge ? 3 : 0);
    const envAfterShield = Math.max(0, envDmg - Math.floor(shiftShieldBlock * 0.4));
    const rawHullDmg = cometAfterShield + envAfterShield;

    // Авторемонт обшивки
    const hullNeedRepair = (s.hull - rawHullDmg) < s.maxHull;
    let repairHull = 0;
    let repairAlloyCost = 0;
    if (defWorkers > 0 && hullNeedRepair) {
      const potential = Math.round(defWorkers * defLvl.repairPerWorker * workMult);
      const cost = defWorkers * defLvl.alloyPerRepair;
      if (s.alloys + alloysGen >= cost) {
        repairHull = potential;
        repairAlloyCost = cost;
      }
    }
    const hullDelta = repairHull - rawHullDmg;
    const alloysDelta = alloysGen - repairAlloyCost;

    // 7. Мораль
    const medLvl = this.getCompLevelDef('medbay');
    let moraleDelta = s.compartments.medbay.workers * medLvl.moralePerWorker;
    if (s.compartments.hydroponics.workers > 0) moraleDelta += (foodLvl.moraleBonus || 0);
    if (s.policies.overtime) moraleDelta -= 3;
    if (s.policies.rationing) moraleDelta -= 2;
    if (blackout) moraleDelta -= 7;
    if (!s.cryoPowered && s.cryoPop > 0) moraleDelta -= 8;
    if (sys.ambientMoraleDmg) moraleDelta -= sys.ambientMoraleDmg;
    if (stormActive) moraleDelta -= 3;
    if (s.food + foodDelta <= 0) moraleDelta -= rules.starvationMoraleLoss;

    return {
      powerGen,
      powerUse,
      powerNet,
      blackout,
      starDrain,
      fuelDelta,
      o2Gen, o2Use, o2Delta,
      foodGen, foodUse, foodDelta,
      alloysGen, repairAlloyCost, alloysDelta,
      shieldGen, weaponGen, shieldSpent, weaponSpent, shieldDelta, weaponDelta,
      cometShotDown, shiftShieldBlock,
      shieldBlock, cometIncoming, cometAfterShield, envAfterShield, repairHull, hullDelta,
      moraleDelta,
      stormActive,
      turnsToStorm: Math.max(0, sys.stormTurn - s.systemTurn)
    };
  }

  // ===== ДЕЙСТВИЯ ВНУТРИ ХОДА =====

  changeWorkers(compId, delta) {
    const def = this.compMap.get(compId);
    const st = this.state.compartments[compId];
    if (!def || !st) return false;
    const maxW = this.getMaxWorkers(compId);
    if (delta > 0) {
      if (st.workers >= maxW || this.getFreeCrew() <= 0) return false;
      st.workers += 1;
    } else if (delta < 0) {
      if (st.workers <= 0) return false;
      st.workers -= 1;
    }
    this.sound.playClick();
    return true;
  }

  rerouteFromThreat() {
    const th = this.state.activeThreat;
    if (!th) return false;
    if (th.reroutesUsed >= th.maxReroutes) return false;
    if (this.state.fuel < th.rerouteFuelCost) return false;
    this.state.fuel -= th.rerouteFuelCost;
    th.turnsLeft += th.rerouteDelayTurns;
    th.reroutesUsed += 1;
    this.sound.playJump();
    this.addLog(`Манёвр уклонения (−${th.rerouteFuelCost} He-3): встреча с «${th.name}» отсрочена на +${th.rerouteDelayTurns} ход. (осталось ${th.turnsLeft})!`, 'good');
    this.save();
    return true;
  }

  toggleCryoPower() {
    this.state.cryoPowered = !this.state.cryoPowered;
    this.sound.playClick();
    this.addLog(`Питание Криосекции: ${this.state.cryoPowered ? 'ВКЛЮЧЕНО (3 МВт)' : 'ОТКЛЮЧЕНО (капсулы теряют холод!)'}`, this.state.cryoPowered ? 'info' : 'bad');
  }

  togglePolicy(key) {
    if (!(key in this.state.policies)) return;
    this.state.policies[key] = !this.state.policies[key];
    this.sound.playClick();
  }

  wakeCryoVolunteers() {
    if (this.state.cryoWakeCd > 0 || this.state.cryoPop < 15) return false;
    this.state.cryoPop -= 15;
    this.state.crewHealthy += 2;
    this.state.morale = clamp(this.state.morale - 3, 0, 100);
    this.state.cryoWakeCd = 5;
    this.sound.playDocked();
    this.addLog('Из криокапсул пробуждены 2 добровольца (+2 экипажа, −15 крио).', 'warn');
    return true;
  }

  canUpgradeComp(compId) {
    const def = this.compMap.get(compId);
    const st = this.state.compartments[compId];
    if (!def || !st || st.level >= def.levels.length) return false;
    const next = def.levels[st.level];
    return this.state.alloys >= next.alloyCost && this.state.components >= next.compCost;
  }

  upgradeComp(compId) {
    if (!this.canUpgradeComp(compId)) return false;
    const def = this.compMap.get(compId);
    const st = this.state.compartments[compId];
    const next = def.levels[st.level];
    this.state.alloys -= next.alloyCost;
    this.state.components -= next.compCost;
    st.level += 1;
    if (compId === 'defense_bay' && st.level === 3) {
      this.state.maxHull += 25;
      this.state.hull = Math.min(this.state.maxHull, this.state.hull + 25);
    }
    this.sound.playUpgrade();
    this.addLog(`Отсек «${def.name}» улучшен до Ур.${st.level}!`, 'good');
    this.save();
    return true;
  }

  // ===== ЗАХВАТ ЗВЕЗДЫ В РЕАКТОР =====

  toggleStarCapture() {
    const sc = this.state.starCapture;
    if (!sc || sc.completed) return false;
    sc.active = !sc.active;
    if (sc.active) {
      this.sound.playAlert();
      this.addLog(`⭐ ЗАПУЩЕН ЗАХВАТ ЗВЕЗДЫ «${sc.starName}» (${sc.turnsRequired} ходов, −${sc.powerDrain} МВт/ход)! Готовь щиты к атакам комет и астероидов!`, 'warn');
    } else {
      this.sound.playClick();
      this.addLog(`Захват звезды «${sc.starName}» приостановлен (прогресс ${sc.turnsDone}/${sc.turnsRequired} сохранён).`, 'info');
    }
    return true;
  }

  // ===== ПОШАГОВЫЕ ЭКСПЕДИЦИИ ШАТТЛОВ (3–5 ходов) =====

  getMaxShuttles() {
    return this.getCompLevelDef('shuttle_bay').maxShuttles;
  }

  getExpeditionTurns(node, crewCount, mode) {
    const bayWorkers = this.state.compartments.shuttle_bay.workers;
    let t = node.turns;
    if (crewCount >= 3) t -= 1;
    if (bayWorkers >= 2) t -= 1;
    if (mode === 'overdrive') t -= 1;
    if (mode === 'safe') t += 1;
    return clamp(t, 2, 6);
  }

  canLaunchShuttle(nodeId, crewCount) {
    const node = this.state.nodes.find(n => n.id === nodeId);
    if (!node || node.depleted || node.gone) return false;
    if (this.state.shuttles.some(sh => sh.nodeId === nodeId)) return false;
    if (this.state.shuttles.length >= this.getMaxShuttles()) return false;
    if (crewCount < 1 || crewCount > 3 || this.getFreeCrew() < crewCount) return false;
    return true;
  }

  launchShuttle(nodeId, crewCount, mode = 'standard') {
    if (!this.canLaunchShuttle(nodeId, crewCount)) return false;
    const node = this.state.nodes.find(n => n.id === nodeId);
    const bayLvl = this.getCompLevelDef('shuttle_bay');
    const modeCfg = {
      safe:      { risk: 0.55, yield: 0.90, label: 'Осторожный' },
      standard:  { risk: 1.00, yield: 1.00, label: 'Стандарт' },
      overdrive: { risk: 1.50, yield: 1.25, label: 'Форсаж' }
    }[mode] || { risk: 1, yield: 1, label: 'Стандарт' };

    const totalTurns = this.getExpeditionTurns(node, crewCount, mode);
    const effRisk = clamp(node.risk * bayLvl.riskMult * modeCfg.risk, 0.08, 0.92);
    const willIncident = Math.random() < effRisk;
    const incidentTurn = willIncident ? Math.max(1, Math.floor(totalTurns / 2)) : 99;

    this.state.shuttles.push({
      id: 'sh_' + Math.random().toString(36).slice(2, 7),
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      crewCount,
      mode,
      modeLabel: modeCfg.label,
      turnsDone: 0,
      turnsTotal: totalTurns,
      yieldMult: bayLvl.yieldMult * modeCfg.yield,
      incidentTurn,
      incidentFired: false
    });

    this.sound.playLaunch();
    this.addLog(`Экспедиция (${crewCount} чел., ${modeCfg.label}) отправлена к «${node.name}» на ${totalTurns} ход(а).`, 'info');
    return true;
  }

  recallShuttle(shuttleId) {
    const idx = this.state.shuttles.findIndex(x => x.id === shuttleId);
    if (idx === -1) return false;
    const sh = this.state.shuttles[idx];
    const node = this.state.nodes.find(n => n.id === sh.nodeId);
    const ratio = clamp(sh.turnsDone / Math.max(1, sh.turnsTotal), 0, 0.85);
    this.deliverShuttleCargo(sh, node, ratio, true);
    this.state.shuttles.splice(idx, 1);
    this.sound.playReturn();
    return true;
  }

  deliverShuttleCargo(sh, node, ratio, isAborted) {
    if (!node) return;
    const s = this.state;
    const mult = sh.yieldMult * ratio;
    const f = Math.round((node.fuel || 0) * mult);
    const o = Math.round((node.oxygen || 0) * mult);
    const a = Math.round((node.alloys || 0) * mult);
    const cp = Math.round((node.comp || 0) * mult);

    s.fuel = clamp(s.fuel + f, 0, s.maxFuel);
    s.oxygen = clamp(s.oxygen + o, 0, s.maxOxygen);
    s.alloys += a;
    s.components += cp;
    let rescued = 0;
    if (!isAborted && node.crew > 0) {
      rescued = node.crew;
      s.crewHealthy += rescued;
      s.morale = clamp(s.morale + 4, 0, 100);
    }
    if (!isAborted || ratio >= 0.5) node.depleted = true;
    s.stats.expeditionsDone += 1;

    const parts = [];
    if (rescued > 0) parts.push(`+${rescued} ЭКИПАЖА (+4 Мор)`);
    if (f > 0) parts.push(`+${f} He-3`);
    if (o > 0) parts.push(`+${o} O₂`);
    if (a > 0) parts.push(`+${a} Сплавов`);
    if (cp > 0) parts.push(`+${cp} Комп`);
    const msg = parts.join(', ') || 'без груза';
    this.addLog(`${isAborted ? 'Экстренный возврат' : 'Экспедиция завершена'} с «${sh.nodeName}»: ${msg}.`, isAborted ? 'warn' : 'good');
  }

  // ===== ГИПЕРПРЫЖОК ПО ВЕТВЯЩЕЙСЯ КАРТЕ ГАЛАКТИКИ =====

  canJumpTo(targetSystemId) {
    const cur = this.getSystem();
    if (!cur.next || !cur.next.includes(targetSystemId)) return false;
    if (this.state.shuttles.length > 0) return false;
    if (this.state.starCapture && this.state.starCapture.active) return false;
    if (this.state.fuel < cur.jumpFuelCost) return false;
    if (this.state.alloys < (cur.jumpAlloyCost || 0)) return false;
    return true;
  }

  jumpToSystem(targetSystemId) {
    if (!this.canJumpTo(targetSystemId)) return false;
    const cur = this.getSystem();
    this.state.fuel -= cur.jumpFuelCost;
    this.state.alloys -= (cur.jumpAlloyCost || 0);
    this.sound.playJump();
    this.setupSystem(targetSystemId, false);
    this.save();
    if (this.onEvent) this.onEvent('jump', this.getSystem());
    return true;
  }

  // ===== ЗАВЕРШЕНИЕ ХОДА (ГЛАВНЫЙ ШАГ ИГРЫ) =====

  endTurn() {
    if (this.activeModal || this.state.ended) return null;

    const s = this.state;
    const sys = this.getSystem();
    const prev = this.getTurnPreview();

    // 1. Применяем ресурсы по прогнозу
    s.fuel = clamp(s.fuel + prev.fuelDelta, 0, s.maxFuel);
    s.oxygen = clamp(s.oxygen + prev.o2Delta, 0, s.maxOxygen);
    s.food = clamp(s.food + prev.foodDelta, 0, s.maxFood);
    s.alloys = Math.max(0, s.alloys + prev.alloysDelta);
    s.shieldStock = clamp((s.shieldStock || 0) + prev.shieldDelta, 0, s.maxShieldStock || 60);
    s.weaponStock = clamp((s.weaponStock || 0) + prev.weaponDelta, 0, s.maxWeaponStock || 55);
    s.hull = clamp(s.hull + prev.hullDelta, 0, s.maxHull);
    s.morale = clamp(s.morale + prev.moraleDelta, 0, 100);

    // Бонусный синтез Компонентов в Синтезаторе сплавов (если работают 3 чел. или Ур.2+)
    const synLvl = this.getCompLevelDef('synthesizer');
    const synWorkers = s.compartments.synthesizer.workers;
    if (synWorkers > 0 && !prev.blackout && (synWorkers >= 3 || s.compartments.synthesizer.level >= 2)) {
      if (Math.random() < synLvl.compChance * (synWorkers / 3)) {
        s.components += 1;
        this.addLog('Молекулярный синтезатор выработал +1 редкий Компонент!', 'good');
      }
    }

    // 2. Криосекция без питания
    if (!s.cryoPowered && s.cryoPop > 0) {
      const loss = this.balance.turnRules.cryoLossIfUnpowered;
      s.cryoPop = Math.max(0, s.cryoPop - loss);
      this.addLog(`⚠ Криосекция обесточена: потеряно ${loss} колонистов!`, 'bad');
    }

    // 3. Гипоксия (O2 == 0)
    if (s.oxygen <= 0) {
      this.loseCrew(1);
      this.sound.playAlert();
      this.addLog('⚠ КРИТИЧЕСКАЯ ГИПОКСИЯ! Погиб 1 член экипажа из-за нехватки O₂!', 'bad');
    }

    // 4. Лечение в Медблоке
    if (s.crewInjured > 0 && s.compartments.medbay.workers > 0 && !prev.blackout) {
      const medLvl = this.getCompLevelDef('medbay');
      s.healProgress += s.compartments.medbay.workers;
      if (s.healProgress >= medLvl.healTurns) {
        s.healProgress = 0;
        s.crewInjured -= 1;
        s.crewHealthy += 1;
        this.addLog('Медблок вернул в строй 1 раненого члена экипажа.', 'good');
      }
    }

    // 5. Атака комет и прогресс ЗАХВАТА ЗВЕЗДЫ!
    let cometAttackEvent = null;
    if (s.starCapture && s.starCapture.active) {
      const sc = s.starCapture;
      cometAttackEvent = {
        incoming: prev.cometIncoming,
        blocked: prev.shieldBlock,
        netDamage: prev.cometAfterShield
      };
      if (prev.blackout) {
        this.addLog(`⚠ Блэкаут сорвал стабильность захвата звезды — прогресс не засчитан! (урон комет: −${prev.cometAfterShield} обш.)`, 'bad');
        this.sound.playAlert();
      } else {
        sc.turnsDone += 1;
        this.addLog(`⭐ Захват «${sc.starName}»: ход ${sc.turnsDone}/${sc.turnsRequired}! Орудия сбили ${prev.cometShotDown} (−${prev.weaponSpent} Ор), Щиты −${prev.shieldSpent}Щ, по обшивке −${prev.cometAfterShield}%.`, prev.cometAfterShield > 10 ? 'bad' : 'warn');
        if (sc.turnsDone >= sc.turnsRequired) {
          sc.completed = true;
          sc.active = false;
          this.state.capturedStars.push(sys.id);
          this.state.stats.starsCaptured += 1;
          this.state.reactorTier = Math.max(this.state.reactorTier, sc.targetTier);
          this.state.morale = clamp(this.state.morale + 14, 0, 100);
          this.sound.playUpgrade();
          this.addLog(`★ ЗВЕЗДА «${sc.starName}» ЗАХВАЧЕНА В РЕАКТОР! Новый класс: ${this.getReactorTierDef().name} (+14 Морали)!`, 'good');

          if (sc.isVictoryCapture) {
            const isTriumph = s.cryoPop >= 750 && s.morale >= 45;
            this.triggerEnding(isTriumph ? 'triumph' : 'iron_ark');
            return { cometAttackEvent };
          }
        }
      }
    }

    // 6. Продвижение пошаговых экспедиций шаттлов
    for (let i = s.shuttles.length - 1; i >= 0; i--) {
      const sh = s.shuttles[i];
      const node = s.nodes.find(n => n.id === sh.nodeId);
      sh.turnsDone += 1;

      if (!sh.incidentFired && sh.turnsDone >= sh.incidentTurn && sh.turnsDone < sh.turnsTotal && !this.activeModal) {
        sh.incidentFired = true;
        this.triggerExpeditionIncident(sh);
      } else if (sh.turnsDone >= sh.turnsTotal) {
        this.deliverShuttleCargo(sh, node, 1.0, false);
        s.shuttles.splice(i, 1);
        this.sound.playReturn();
      }
    }

    // 7. Таймеры комет (уходят на определённом ходу системы)
    s.turn += 1;
    s.systemTurn += 1;
    if (s.cryoWakeCd > 0) s.cryoWakeCd -= 1;

    for (const node of s.nodes) {
      if (node.type === 'comet' && !node.depleted && !node.gone && node.expiresTurn && s.systemTurn > node.expiresTurn) {
        const busy = s.shuttles.some(sh => sh.nodeId === node.id);
        if (!busy) {
          node.gone = true;
          this.addLog(`«${node.name}» покинула систему на ${s.systemTurn}-м ходу.`, 'info');
        }
      }
    }

    // 8. Проверка поражений
    if (s.hull <= 0) {
      this.triggerEnding('defeat_hull');
      return { cometAttackEvent };
    }
    if (s.morale <= 0) {
      this.triggerEnding('defeat_mutiny');
      return { cometAttackEvent };
    }
    if (s.crewHealthy + s.crewInjured <= 0) {
      this.triggerEnding('defeat_crew');
      return { cometAttackEvent };
    }

    // 8.5. Крупные сюжетные угрозы с отсчётом 10 ходов (Космический десант / Перехватчик «Карантин»)
    if (!s.activeThreat) {
      for (const tpl of (this.balance.scheduledThreats || [])) {
        if (s.turn >= tpl.triggerTurn && !s.resolvedThreats.includes(tpl.id)) {
          s.activeThreat = { ...tpl, turnsLeft: tpl.warningTurns, reroutesUsed: 0 };
          this.sound.playAlert();
          this.addLog(tpl.detectMsg, 'bad');
          break;
        }
      }
    } else if (!this.activeModal) {
      s.activeThreat.turnsLeft -= 1;
      if (s.activeThreat.turnsLeft <= 0) {
        this.triggerThreatEncounter(s.activeThreat);
      } else if (s.activeThreat.turnsLeft <= 3) {
        this.addLog(`⚠ «${s.activeThreat.name}» на подходе — осталось ${s.activeThreat.turnsLeft} ход(а)!`, 'warn');
      }
    }

    // 9. Сюжетные кризисные дилеммы (примерно 1 раз в 6 ходов, если нет ЧП и не идёт встреча с угрозой)
    if (!this.activeModal && sys.layer >= 1 && s.turn % 6 === 0) {
      const avail = this.balance.dilemmas.filter(d => d.minLayer <= sys.layer && !s.usedDilemmas.includes(d.id));
      if (avail.length > 0) {
        const d = avail[Math.floor(Math.random() * avail.length)];
        s.usedDilemmas.push(d.id);
        this.sound.playAlert();
        this.activeModal = { kind: 'dilemma', title: d.title, desc: d.desc, choices: d.choices };
      }
    }

    this.save();
    if (this.onEvent) this.onEvent('turn', { cometAttackEvent });
    return { cometAttackEvent };
  }

  triggerThreatEncounter(th) {
    const s = this.state;
    const neg = th.negotiateCost;
    const rew = th.fightRewards;
    const br = th.breachPenalty;
    const negParts = [`−${neg.crew} экипажа`];
    if (neg.alloys) negParts.push(`−${neg.alloys} Спл`);
    if (neg.food) negParts.push(`−${neg.food} Еды`);
    if (neg.oxygen) negParts.push(`−${neg.oxygen} O₂`);
    if (neg.comp) negParts.push(`−${neg.comp} Комп`);
    const rewParts = [];
    if (rew.alloys) rewParts.push(`+${rew.alloys} Спл`);
    if (rew.fuel) rewParts.push(`+${rew.fuel} He-3`);
    if (rew.comp) rewParts.push(`+${rew.comp} Комп`);
    if (rew.morale) rewParts.push(`+${rew.morale} Мор`);

    this.sound.playAlert();
    this.activeModal = {
      kind: 'threat_encounter',
      threatId: th.id,
      title: th.encounterTitle,
      desc: `${th.encounterDesc} (Сейчас в арсенале: Щит ${s.shieldStock}/${th.reqShield}, Оружие ${s.weaponStock}/${th.reqWeapon})`,
      choices: [
        {
          label: `Дать бой! [Нужно: ${th.reqShield} Щита, ${th.reqWeapon} Оружия] → Победа и трофеи (${rewParts.join(', ')})`,
          effect: 'threat_fight',
          reqShield: th.reqShield,
          reqWeapon: th.reqWeapon
        },
        {
          label: `Договориться и откупиться (${negParts.join(', ')}, ${neg.morale} Морали) — они не тронут корабль`,
          effect: 'threat_negotiate',
          reqCrew: neg.crew
        },
        {
          label: `Прорываться с боем без перевеса (${br.hull}% обш., ${br.injure} ран.${br.cryo ? `, ${br.cryo} крио` : ''}${br.alloys ? `, ${br.alloys} Спл` : ''})`,
          effect: 'threat_breach'
        }
      ]
    };
  }

  triggerExpeditionIncident(sh) {
    const pool = this.balance.expeditionIncidents.filter(inc => inc.types.includes(sh.nodeType));
    const tpl = pool[Math.floor(Math.random() * pool.length)] || this.balance.expeditionIncidents[0];
    this.sound.playAlert();
    this.activeModal = {
      kind: 'incident',
      shuttleId: sh.id,
      nodeName: sh.nodeName,
      title: tpl.title,
      desc: `${tpl.desc} (Ход экспедиции: ${sh.turnsDone}/${sh.turnsTotal})`,
      choices: tpl.choices
    };
  }

  resolveModalChoice(idx) {
    if (!this.activeModal) return;
    const modal = this.activeModal;
    const ch = modal.choices[idx];
    if (!ch) return;

    const s = this.state;
    if (modal.kind === 'threat_encounter') {
      const th = s.activeThreat;
      if (th) {
        if (ch.effect === 'threat_fight') {
          if (s.shieldStock < th.reqShield || s.weaponStock < th.reqWeapon) return;
          s.shieldStock = Math.max(0, s.shieldStock - th.fightCostShield);
          s.weaponStock = Math.max(0, s.weaponStock - th.fightCostWeapon);
          const r = th.fightRewards;
          s.alloys += r.alloys || 0;
          s.fuel = clamp(s.fuel + (r.fuel || 0), 0, s.maxFuel);
          s.components += r.comp || 0;
          s.morale = clamp(s.morale + (r.morale || 0), 0, 100);
          this.sound.playVictory();
          this.addLog(`★ ПОБЕДА В БОЮ против «${th.name}»! Взяты трофеи (+${r.alloys} Спл, +${r.fuel} He-3, +${r.comp} Комп)!`, 'good');
        } else if (ch.effect === 'threat_negotiate') {
          const n = th.negotiateCost;
          if (s.crewHealthy + s.crewInjured <= n.crew) return;
          this.loseCrew(n.crew);
          s.alloys = Math.max(0, s.alloys - (n.alloys || 0));
          s.food = Math.max(0, s.food - (n.food || 0));
          s.oxygen = Math.max(0, s.oxygen - (n.oxygen || 0));
          s.components = Math.max(0, s.components - (n.comp || 0));
          s.morale = clamp(s.morale + (n.morale || 0), 0, 100);
          this.addLog(`Переговоры с «${th.name}»: отдали ${n.crew} чел. и часть запасов. Ковчег пропущен без боя.`, 'warn');
        } else if (ch.effect === 'threat_breach') {
          const b = th.breachPenalty;
          s.hull = clamp(s.hull + (b.hull || 0), 0, s.maxHull);
          if (b.injure) this.injureCrew(b.injure);
          if (b.alloys) s.alloys = Math.max(0, s.alloys + b.alloys);
          if (b.cryo) s.cryoPop = Math.max(0, s.cryoPop + b.cryo);
          if (b.morale) s.morale = clamp(s.morale + b.morale, 0, 100);
          this.addLog(`Тяжёлый прорыв от «${th.name}»: обшивка повреждена (${b.hull}%), есть раненые!`, 'bad');
        }
        s.resolvedThreats.push(th.id);
        s.activeThreat = null;
        if (s.hull <= 0) { this.activeModal = null; this.triggerEnding('defeat_hull'); return; }
        if (s.morale <= 0) { this.activeModal = null; this.triggerEnding('defeat_mutiny'); return; }
      }
    } else if (modal.kind === 'incident') {
      const shIdx = s.shuttles.findIndex(x => x.id === modal.shuttleId);
      const sh = shIdx >= 0 ? s.shuttles[shIdx] : null;
      const node = sh ? s.nodes.find(n => n.id === sh.nodeId) : null;

      if (ch.effect === 'abort_safe') {
        if (sh) {
          this.deliverShuttleCargo(sh, node, 0.6, true);
          s.shuttles.splice(shIdx, 1);
        }
      } else if (ch.effect === 'spend_alloys') {
        if (s.alloys < ch.costAlloys) return;
        s.alloys -= ch.costAlloys;
        if (sh) sh.yieldMult *= (1 + (ch.bonusYield || 0));
        this.addLog(`ЧП на «${modal.nodeName}»: анкеры укреплены (−${ch.costAlloys} Сплавов), добыча усилена!`, 'good');
      } else if (ch.effect === 'spend_o2') {
        if (s.oxygen < ch.costO2) return;
        s.oxygen -= ch.costO2;
        if (sh) sh.yieldMult *= (1 + (ch.bonusYield || 0));
        this.addLog(`ЧП на «${modal.nodeName}»: контур продут (−${ch.costO2} O₂).`, 'good');
      } else if (ch.effect === 'spend_fuel') {
        if (s.fuel < ch.costFuel) return;
        s.fuel -= ch.costFuel;
        if (sh) sh.yieldMult *= (1 + (ch.bonusYield || 0));
        this.addLog(`ЧП на «${modal.nodeName}»: плита подорвана (−${ch.costFuel} He-3), богатая жила открыта!`, 'good');
      } else if (ch.effect === 'push_risk') {
        if (ch.injure) this.injureCrew(ch.injure);
        if (ch.hull) s.hull = clamp(s.hull + ch.hull, 0, s.maxHull);
        if (ch.morale) s.morale = clamp(s.morale + ch.morale, 0, 100);
        if (sh) sh.yieldMult *= (1 + (ch.bonusYield || 0));
        this.addLog(`ЧП на «${modal.nodeName}»: вылазка дожата ценой риска!`, 'bad');
      } else if (ch.effect === 'rescue_crew') {
        s.crewHealthy += (ch.crew || 0);
        s.morale = clamp(s.morale + (ch.morale || 0), 0, 100);
        if (sh) sh.yieldMult *= Math.max(0.35, 1 + (ch.bonusYield || 0));
        this.addLog(`Выжившие с «${modal.nodeName}» спасены (+${ch.crew} экипажа, +${ch.morale} Морали)!`, 'good');
      } else if (ch.effect === 'loot_cold') {
        s.components += (ch.comp || 0);
        s.morale = clamp(s.morale + (ch.morale || 0), 0, 100);
        if (sh) sh.yieldMult *= (1 + (ch.bonusYield || 0));
        this.addLog(`Сняты компоненты (+${ch.comp}), но экипаж потрясён (${ch.morale} Морали).`, 'bad');
      } else if (ch.effect === 'heroic_save') {
        if (s.oxygen < ch.costO2) return;
        s.oxygen -= ch.costO2;
        s.crewHealthy += (ch.crew || 0);
        s.components += (ch.comp || 0);
        s.morale = clamp(s.morale + (ch.morale || 0), 0, 100);
        this.addLog(`Героическая эвакуация: спасены люди и склад компонентов!`, 'good');
      }
    } else if (modal.kind === 'dilemma') {
      if (ch.alloys && ch.alloys < 0 && s.alloys < -ch.alloys) return;
      if (ch.food && ch.food < 0 && s.food < -ch.food) return;
      if (ch.oxygen && ch.oxygen < 0 && s.oxygen < -ch.oxygen) return;
      if (ch.comp && ch.comp < 0 && s.components < -ch.comp) return;

      if (ch.alloys) s.alloys = Math.max(0, s.alloys + ch.alloys);
      if (ch.food) s.food = clamp(s.food + ch.food, 0, s.maxFood);
      if (ch.oxygen) s.oxygen = clamp(s.oxygen + ch.oxygen, 0, s.maxOxygen);
      if (ch.fuel) s.fuel = clamp(s.fuel + ch.fuel, 0, s.maxFuel);
      if (ch.comp) s.components = Math.max(0, s.components + ch.comp);
      if (ch.hull) s.hull = clamp(s.hull + ch.hull, 0, s.maxHull);
      if (ch.morale) s.morale = clamp(s.morale + ch.morale, 0, 100);
      if (ch.cryo) s.cryoPop = Math.max(0, s.cryoPop + ch.cryo);
      if (ch.crew && ch.crew > 0) s.crewHealthy += ch.crew;
      if (ch.crew && ch.crew < 0) this.loseCrew(-ch.crew);
      if (ch.injure) this.injureCrew(ch.injure);
      s.stats.dilemmasSolved += 1;
      this.addLog(`Принято решение: «${modal.title}».`, 'info');
    }

    this.activeModal = null;
    this.sound.playClick();
    this.save();
  }

  injureCrew(count = 1) {
    for (let i = 0; i < count; i++) {
      if (this.state.crewHealthy <= 0) break;
      this.state.crewHealthy -= 1;
      this.state.crewInjured += 1;
      this.rebalanceWorkers();
    }
  }

  loseCrew(count = 1) {
    for (let i = 0; i < count; i++) {
      if (this.state.crewInjured > 0) this.state.crewInjured -= 1;
      else if (this.state.crewHealthy > 0) {
        this.state.crewHealthy -= 1;
        this.rebalanceWorkers();
      }
      this.state.stats.crewLost += 1;
      this.state.morale = clamp(this.state.morale - 7, 0, 100);
    }
  }

  rebalanceWorkers() {
    while (this.getAssignedWorkersTotal() + this.getShuttleCrewTotal() > this.state.crewHealthy) {
      const order = ['medbay', 'synthesizer', 'hydroponics', 'shuttle_bay', 'defense_bay', 'life_support', 'reactor'];
      let ok = false;
      for (const cid of order) {
        if (this.state.compartments[cid].workers > 0) {
          this.state.compartments[cid].workers -= 1;
          ok = true;
          break;
        }
      }
      if (!ok) break;
    }
  }

  triggerEnding(code) {
    this.state.ended = true;
    const isWin = code === 'triumph' || code === 'iron_ark';
    if (isWin) this.sound.playVictory();
    else this.sound.playDefeat();

    const texts = {
      triumph: {
        badge: 'ПОБЕДА · НОВАЯ ЗЕМЛЯ',
        title: 'Орбита Эдема стабилизирована!',
        desc: `Ты провёл EXODUS-0 через враждебные сектора, захватил звёздные ядра в Реактор и выдержал финальную кометную бурю. Выжило ${this.state.cryoPop} колонистов при высокой морали!`
      },
      iron_ark: {
        badge: 'ПОБЕДА · ЖЕЛЕЗНЫЙ КОВЧЕГ',
        title: 'Мы долетели. Но какой ценой?',
        desc: `Орбитальный квазар захвачен, колонисты высажены на Новую Землю (${this.state.cryoPop} в крио), но тяжёлые решения оставили шрам на экипаже.`
      },
      defeat_hull: {
        badge: 'ГИБЕЛЬ КОВЧЕГА',
        title: 'Обшивка не выдержала',
        desc: `Корпус EXODUS-0 разрушен в системе «${this.getSystem().name}» на ${this.state.turn}-м ходу.`
      },
      defeat_mutiny: {
        badge: 'БУНТ НА БОРТУ',
        title: 'Экипаж захватил мостик',
        desc: `Мораль рухнула до нуля в системе «${this.getSystem().name}». Экспедиция прервана.`
      },
      defeat_crew: {
        badge: 'КОРАБЛЬ-ПРИЗРАК',
        title: 'На борту не осталось живых',
        desc: `Активный экипаж погиб на ${this.state.turn}-м ходу. Ковчег продолжает безмолвный дрейф.`
      }
    }[code];

    this.state.ending = { code, isWin, ...texts };
    this.activeModal = { kind: 'ending', ...this.state.ending };
    this.clearSave();
    if (this.onEvent) this.onEvent('ending', this.state.ending);
  }
}
