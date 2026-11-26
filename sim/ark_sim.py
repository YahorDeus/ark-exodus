#!/usr/bin/env python3
"""
sim/ark_sim.py — симулятор кампании ARK EXODUS v4 (экономика дефицита):
- старт с 8 людьми -> рост экипажа через спасение капсул в системах;
- Оружие и Щит реально тратятся каждый ход при Захвате Звезды и в боях с Десантом/Перехватчиком;
- Сплавы тратятся на гиперпрыжки, ремонт и апгрейды.
"""

import json
import random
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BALANCE_PATH = ROOT / "data" / "ark_balance.json"


def load_balance():
    return json.loads(BALANCE_PATH.read_text(encoding="utf-8"))


def simulate_campaign(bal, rng):
    init = bal["initial"]
    sys_map = {s["id"]: s for s in bal["galaxyMap"]}
    comp_map = {c["id"]: c for c in bal["compartments"]}
    tiers = bal["reactorTiers"]
    rules = bal["turnRules"]

    cur_id = "sys_0"
    reactor_tier = 1
    levels = {c["id"]: 1 for c in bal["compartments"]}

    hull = float(init["hull"])
    max_hull = float(init["maxHull"])
    o2 = float(init["oxygen"])
    fuel = float(init["fuel"])
    alloys = float(init["alloys"])
    food = float(init["food"])
    comp = float(init["components"])
    shield_stock = float(init.get("shieldStock", 4))
    weapon_stock = float(init.get("weaponStock", 4))
    crew = int(init["crewHealthy"])
    morale = float(init["morale"])

    turn = 1
    sys_turn = 1
    stars_captured = 0
    expeditions = 0
    crew_rescued = 0
    upgrades_bought = 0
    threats_won = 0
    threats_rerouted = 0
    total_weapon_spent = 0
    total_shield_spent = 0

    active_threat = None
    resolved_threats = set()

    def get_sys():
        return sys_map[cur_id]

    def max_w(cid):
        return comp_map[cid]["levels"][levels[cid] - 1]["maxWorkers"]

    def reset_nodes():
        return [dict(n, done=False) for n in get_sys()["nodes"]]

    nodes = reset_nodes()
    shuttles = []
    sc = dict(get_sys()["starCapture"], active=False, turnsDone=0, done=False) if get_sys().get("starCapture") else None

    for _ in range(145):
        sys = get_sys()
        r_tier = tiers[reactor_tier - 1]
        o2_lvl = comp_map["life_support"]["levels"][levels["life_support"] - 1]
        fd_lvl = comp_map["hydroponics"]["levels"][levels["hydroponics"] - 1]
        sy_lvl = comp_map["synthesizer"]["levels"][levels["synthesizer"] - 1]
        df_lvl = comp_map["defense_bay"]["levels"][levels["defense_bay"] - 1]
        md_lvl = comp_map["medbay"]["levels"][levels["medbay"] - 1]
        sh_lvl = comp_map["shuttle_bay"]["levels"][levels["shuttle_bay"] - 1]

        # 1. Апгрейды отсеков (учитываем запас сплавов на прыжок!)
        alloy_reserve = sys.get("jumpAlloyCost", 0) + 12
        for cid in ["reactor", "defense_bay", "life_support", "hydroponics", "shuttle_bay", "synthesizer", "medbay"]:
            if levels[cid] < 3:
                nxt = comp_map[cid]["levels"][levels[cid]]
                if alloys >= nxt["alloyCost"] + alloy_reserve and comp >= nxt["compCost"]:
                    alloys -= nxt["alloyCost"]
                    comp -= nxt["compCost"]
                    levels[cid] += 1
                    upgrades_bought += 1
                    if cid == "defense_bay" and levels[cid] == 3:
                        max_hull += 25
                        hull += 25

        # 2. Смена маршрута при угрозе, если не успеваем докопить Щит/Оружие
        if active_threat and active_threat["turnsLeft"] <= 2:
            if shield_stock < active_threat["reqShield"] or weapon_stock < active_threat["reqWeapon"]:
                if active_threat["reroutesUsed"] < active_threat["maxReroutes"] and fuel >= active_threat["rerouteFuelCost"] + 6:
                    fuel -= active_threat["rerouteFuelCost"]
                    active_threat["turnsLeft"] += active_threat["rerouteDelayTurns"]
                    active_threat["reroutesUsed"] += 1
                    threats_rerouted += 1

        # 3. Запуск Захвата Звезды (нужен запас O2, Еды, Оружия и Щита!)
        if sc and not sc["done"] and not sc["active"]:
            need_w = sc.get("weaponUsePerTurn", 4) * 2
            if o2 >= 36 and food >= 32 and hull >= 62 and weapon_stock >= need_w and len(shuttles) == 0:
                sc["active"] = True

        # 4. Запуск экспедиций (капсулы с потерянным экипажем — высокий приоритет, пока экипаж < 18!)
        if (not sc or not sc["active"]) and len(shuttles) < sh_lvl["maxShuttles"]:
            avail = [n for n in nodes if not n["done"] and (not n.get("expiresTurn") or sys_turn <= n["expiresTurn"])]
            avail.sort(key=lambda n: -(
                (n.get("crew", 0) * (42 if crew < 16 else 10))
                + n.get("fuel", 0) * (2.8 if fuel < sys["jumpFuelCost"] + 16 else 1.0)
                + n.get("alloys", 0) * (1.5 if alloys < sys.get("jumpAlloyCost", 0) + 25 else 0.8)
                + n.get("comp", 0) * 20
                + n.get("oxygen", 0) * 0.4
            ))
            if avail and crew >= 6:
                pick = avail[0]
                pick["done"] = True
                shuttles.append({"node": pick, "crew": 2, "done": 0, "total": pick["turns"]})

        # 5. Распределение экипажа и МВт
        busy_sh = sum(sh["crew"] for sh in shuttles)
        free = crew - busy_sh
        w = {cid: 0 for cid in comp_map}

        w["reactor"] = min(max_w("reactor"), free)
        free -= w["reactor"]

        power_gen = r_tier["basePower"] + w["reactor"] * r_tier["powerPerWorker"] - sys.get("powerPenalty", 0)
        star_drain = sc["powerDrain"] if (sc and sc["active"]) else 0
        base_use = rules["cryoPowerCostBase"] + 1 + star_drain
        overcharge = False
        if power_gen - base_use < (6 if (sc and sc["active"]) else 5):
            overcharge = True
            power_gen += 5
        avail_mw = power_gen - base_use

        need_defense = (
            (sc and sc["active"])
            or (active_threat and (shield_stock < active_threat["reqShield"] or weapon_stock < active_threat["reqWeapon"]))
            or (sc and not sc["done"] and weapon_stock < sc.get("weaponUsePerTurn", 4) * 3)
        )
        if need_defense:
            while w["defense_bay"] < max_w("defense_bay") and free > 0 and avail_mw >= 2:
                w["defense_bay"] += 1
                free -= 1
                avail_mw -= 2

        need_o2_workers = min(max_w("life_support"), max(1, int((crew * rules["o2PerCrew"]) / o2_lvl["o2PerWorker"]) + (1 if o2 < 55 else 0)))
        while w["life_support"] < need_o2_workers and free > 0 and avail_mw >= 1:
            w["life_support"] += 1
            free -= 1
            avail_mw -= 1

        need_fd_workers = min(max_w("hydroponics"), max(1, int((crew * rules["foodPerCrew"]) / fd_lvl["foodPerWorker"]) + (1 if food < 52 else 0)))
        while w["hydroponics"] < need_fd_workers and free > 0 and avail_mw >= 1:
            w["hydroponics"] += 1
            free -= 1
            avail_mw -= 1

        if hull < 85 or weapon_stock < 14 or shield_stock < 16:
            while w["defense_bay"] < max_w("defense_bay") and free > 0 and avail_mw >= 2:
                w["defense_bay"] += 1
                free -= 1
                avail_mw -= 2

        if morale < 65 and w["medbay"] < max_w("medbay") and free > 0 and avail_mw >= 1:
            w["medbay"] += 1
            free -= 1
            avail_mw -= 1

        while w["synthesizer"] < max_w("synthesizer") and free > 0 and avail_mw >= 2:
            w["synthesizer"] += 1
            free -= 1
            avail_mw -= 2

        # 6. Обработка хода (с реальным расходом Оружия и Щита на Захвате Звезды!)
        blackout = avail_mw < 0
        mult = rules["blackoutPenalty"] if blackout else 1.0

        fuel = max(0.0, fuel - (r_tier["fuelPerTurn"] + (2 if overcharge else 0)))
        o2 = min(130.0, max(0.0, o2 + round(w["life_support"] * o2_lvl["o2PerWorker"] * mult) - round(crew * rules["o2PerCrew"])))
        food = min(130.0, max(0.0, food + round(w["hydroponics"] * fd_lvl["foodPerWorker"] * mult) - round(crew * rules["foodPerCrew"])))
        alloys_gen = round(w["synthesizer"] * sy_lvl["alloysPerWorker"] * mult)

        sh_gen = round(w["defense_bay"] * df_lvl["shieldGenPerWorker"] * mult)
        wp_gen = round(w["defense_bay"] * df_lvl["weaponGenPerWorker"] * mult)
        shift_block = round(w["defense_bay"] * df_lvl["shieldBlockPerWorker"] * (0.5 if blackout else 1.0))

        wp_spent = 0
        sh_spent = 0
        comet_after = 0
        if sc and sc["active"]:
            wp_spent = min(weapon_stock + wp_gen, sc.get("weaponUsePerTurn", 4))
            shot_down = wp_spent * 2
            rem1 = max(0, sc["cometDamagePerTurn"] - shot_down - shift_block)
            sh_spent = min(shield_stock + sh_gen, sc.get("shieldUsePerTurn", 6), rem1)
            comet_after = max(0, rem1 - sh_spent)
            total_weapon_spent += wp_spent
            total_shield_spent += sh_spent

        shield_stock = min(60.0, max(0.0, shield_stock + sh_gen - sh_spent))
        weapon_stock = min(55.0, max(0.0, weapon_stock + wp_gen - wp_spent))

        storm_dmg = 10 if sys_turn >= sys["stormTurn"] else 0
        env_after = max(0, sys.get("ambientHullDmg", 0) + storm_dmg + (3 if overcharge else 0) - int(shift_block * 0.4))
        raw_dmg = comet_after + env_after

        rep = 0
        rep_cost = 0
        if w["defense_bay"] > 0 and hull - raw_dmg < max_hull and alloys + alloys_gen >= w["defense_bay"] * df_lvl["alloyPerRepair"]:
            rep = round(w["defense_bay"] * df_lvl["repairPerWorker"] * mult)
            rep_cost = w["defense_bay"] * df_lvl["alloyPerRepair"]
        hull = min(max_hull, hull - raw_dmg + rep)
        alloys = max(0.0, alloys + alloys_gen - rep_cost)
        if w["synthesizer"] >= 2 and not blackout and rng.random() < sy_lvl["compChance"] * (w["synthesizer"] / 3.0):
            comp += 1
        morale = min(100.0, max(0.0, morale + w["medbay"] * md_lvl["moralePerWorker"] - (7 if blackout else 0) - sys.get("ambientMoraleDmg", 0)))

        # Захват Звезды
        if sc and sc["active"] and not blackout:
            sc["turnsDone"] += 1
            if sc["turnsDone"] >= sc["turnsRequired"]:
                sc["done"] = True
                sc["active"] = False
                stars_captured += 1
                reactor_tier = max(reactor_tier, sc["targetTier"])
                morale = min(100.0, morale + 14)
                if sc.get("isVictoryCapture"):
                    return {
                        "won": True,
                        "turns": turn,
                        "minutes": turn * rng.uniform(0.55, 0.70),
                        "crew_end": crew,
                        "crew_rescued": crew_rescued,
                        "upgrades": upgrades_bought,
                        "threats_won": threats_won,
                        "threats_rerouted": threats_rerouted,
                        "wp_spent": total_weapon_spent,
                        "sh_spent": total_shield_spent,
                    }

        # Шаттлы
        for sh in list(shuttles):
            sh["done"] += 1
            if sh["done"] >= sh["total"]:
                n = sh["node"]
                m = sh_lvl["yieldMult"]
                fuel = min(160.0, fuel + round(n.get("fuel", 0) * m))
                o2 = min(130.0, o2 + round(n.get("oxygen", 0) * m))
                alloys += round(n.get("alloys", 0) * m)
                comp += round(n.get("comp", 0) * m)
                if n.get("crew", 0) > 0:
                    crew += n["crew"]
                    crew_rescued += n["crew"]
                    morale = min(100.0, morale + 4)
                expeditions += 1
                shuttles.remove(sh)

        # Запланированные угрозы
        if not active_threat:
            for tpl in bal.get("scheduledThreats", []):
                if turn >= tpl["triggerTurn"] and tpl["id"] not in resolved_threats:
                    active_threat = dict(tpl, turnsLeft=tpl["warningTurns"], reroutesUsed=0)
                    break
        else:
            active_threat["turnsLeft"] -= 1
            if active_threat["turnsLeft"] <= 0:
                th = active_threat
                if shield_stock >= th["reqShield"] and weapon_stock >= th["reqWeapon"]:
                    shield_stock -= th["fightCostShield"]
                    weapon_stock -= th["fightCostWeapon"]
                    total_shield_spent += th["fightCostShield"]
                    total_weapon_spent += th["fightCostWeapon"]
                    rew = th["fightRewards"]
                    alloys += rew.get("alloys", 0)
                    fuel = min(160.0, fuel + rew.get("fuel", 0))
                    comp += rew.get("comp", 0)
                    morale = min(100.0, morale + rew.get("morale", 0))
                    threats_won += 1
                else:
                    br = th["breachPenalty"]
                    hull += br.get("hull", -34)
                    morale += br.get("morale", -10)
                resolved_threats.add(th["id"])
                active_threat = None

        if hull <= 0 or morale <= 0 or o2 <= 0:
            return {"won": False, "reason": "hull" if hull <= 0 else ("o2" if o2 <= 0 else "morale"), "layer": sys["layer"], "turns": turn}

        turn += 1
        sys_turn += 1

        # Прыжок (требует He-3 И Сплавы!)
        need_a = sys.get("jumpAlloyCost", 0)
        if sys.get("next") and len(shuttles) == 0 and (not sc or sc["done"]) and fuel >= sys["jumpFuelCost"] + 6 and alloys >= need_a + 4 and sys_turn >= 5:
            nexts = [sys_map[nid] for nid in sys["next"]]
            star_nexts = [ns for ns in nexts if ns.get("starCapture")]
            target = rng.choice(star_nexts) if star_nexts else rng.choice(nexts)
            fuel -= sys["jumpFuelCost"]
            alloys -= need_a
            cur_id = target["id"]
            sys_turn = 1
            nodes = reset_nodes()
            sc = dict(target["starCapture"], active=False, turnsDone=0, done=False) if target.get("starCapture") else None

    return {"won": False, "reason": "timeout", "layer": get_sys()["layer"], "turns": turn}


def main():
    bal = load_balance()
    rng = random.Random(2026)
    N = 200
    res = [simulate_campaign(bal, rng) for _ in range(N)]
    wins = [r for r in res if r["won"]]
    fails = [r for r in res if not r["won"]]
    print(f"=== ARK EXODUS v4 Scarcity Simulation ({N} campaigns) ===")
    print(f"Victory rate: {len(wins)}/{N} ({len(wins)*100/N:.1f}%)")
    if fails:
        bd = {}
        for f in fails:
            k = f"{f['reason']}@layer{f['layer']}"
            bd[k] = bd.get(k, 0) + 1
        print("Failures:", bd)
    if wins:
        print(f"Turns: median={statistics.median([w['turns'] for w in wins]):.0f}")
        print(f"Est. playtime: median={statistics.median([w['minutes'] for w in wins]):.1f} min")
        print(f"Crew growth: 8 -> median {statistics.median([w['crew_end'] for w in wins]):.0f} (+{statistics.median([w['crew_rescued'] for w in wins]):.0f} rescued)")
        print(f"Total Weapon spent: {statistics.median([w['wp_spent'] for w in wins]):.0f} · Shield spent: {statistics.median([w['sh_spent'] for w in wins]):.0f}")
        print(f"Threats won: {statistics.median([w['threats_won'] for w in wins]):.1f}/2 · Reroutes: {statistics.mean([w['threats_rerouted'] for w in wins]):.2f} · Upgrades: {statistics.median([w['upgrades'] for w in wins]):.1f}/14")


if __name__ == "__main__":
    main()
