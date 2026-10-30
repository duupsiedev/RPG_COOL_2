import { finishVictory } from "./progression.js";
import { eff, getManaRegen, pathSkillVal, serenityProc, calcPhysDmg, calcMagDmg, agiCheck, tickStatus } from "./rules.js";

// Resolves the delayed enemy turn through injected state/presentation ports.
export function resolveEnemyTurn(p, e, ports) {
  const { setEnemy, setPhase, setPlayerTurn, setBusy, setPlayer, addLog, setRunSummary, spawnFloat, triggerShake, deleteSave, random } = ports;
  let p2 = { ...p, statusEffects: [...(p.statusEffects || [])], stats: { ...p.stats }, runStats: { ...(p.runStats || {})} };
  let e2 = { ...e, statusEffects: [...(e.statusEffects || [])] };
  const eLogs = [];

  // Full win sequence — passives, journey EXP, level-up, then victory transition.
  // Used by all enemy-turn death checks so none of them skip rewards.
  function awardKill(note = "") {
    finishVictory(p2, e2, eLogs, ports, note);
  }

  // Tick enemy status
  const eTick = tickStatus(e2);
  e2 = eTick.target; eLogs.push(...eTick.logs);

  // Ranger Predator / Bloodhound bleed heal (fires even if enemy dies from status)
  const isBaseRanger = p2.classKey === "ranger";
  const hasRanger = isBaseRanger || p2.multiclassKey === "ranger";
  if (hasRanger && eTick.bleedHeal > 0) {
    let healAmt = eTick.bleedHeal;
    const predAmp = pathSkillVal(p2, "predator_amp");
    if (isBaseRanger && p2.pathKey === "deadeye") {
      const enemyWasBleeding = (e.statusEffects || []).some(s => s.type === "bleed");
      if (enemyWasBleeding) { healAmt *= 2; eLogs.push(`🏹 Bloodhound: +${healAmt} HP (×2)`); }
      else { healAmt = Math.floor(healAmt * (1 + predAmp * 0.02)); eLogs.push(`🏹 Predator: +${healAmt} HP`); }
    } else {
      healAmt = Math.floor(healAmt * (1 + predAmp * 0.02));
      eLogs.push(`🏹 Predator: +${healAmt} HP`);
    }
    p2.hp = Math.min(p2.maxHp, p2.hp + healAmt);
    p2.combatHealTotal = (p2.combatHealTotal || 0) + healAmt;
    p2.runStats = { ...p2.runStats, dmgHealed: (p2.runStats?.dmgHealed||0) + healAmt };
    const sd = serenityProc(p2, healAmt);
    if (sd > 0) { e2.hp = Math.max(0, e2.hp - sd); p2.runStats = { ...p2.runStats, dmgDealt: (p2.runStats?.dmgDealt||0) + sd }; eLogs.push(`☯️ Serenity: ${sd} dmg`); }
  }

  // Enemy died from status ticks or Predator serenity
  if (e2.hp <= 0) { awardKill(" by status"); return; }

  if (e2.hp > 0) {
    // Decrement move cooldowns
    const newCDs = { ...(p2.moveCooldowns || {}) };
    for (const k in newCDs) { if (newCDs[k] > 0) newCDs[k]--; }
    p2 = { ...p2, moveCooldowns: newCDs };

    // Plaguekeeper Rot: apply 1 Wither Stack per turn
    if (p2.pathKey === "plaguekeeper" && p2.classKey === "druid") {
      const maxW = 10; const curW = e2.witherStacks || 0;
      if (curW < maxW) {
        e2 = { ...e2, witherStacks: curW + 1 };
        eLogs.push(`☣️ Rot: Wither ${e2.witherStacks}/${maxW}`);
      }
    }

    // Radiant Knight Sun Child: apply 1 burn_stack + deal burn dmg to enemy
    if (p2.pathKey === "radiant_knight" && p2.classKey === "knight") {
      if ((p2.burnStacks || 0) < 6) p2 = { ...p2, burnStacks: (p2.burnStacks || 0) + 1 };
      if ((p2.burnStacks || 0) > 0) {
        const stacks = p2.burnStacks;
        const burnAmp = 1 + pathSkillVal(p2, "more_burn_dmg") * 0.02;
        const burnDmg = Math.max(1, Math.round(eff(p2, "spr") * (0.35 + (stacks - 1) * 0.17) * burnAmp));
        e2.hp = Math.max(0, e2.hp - burnDmg);
        p2.runStats = { ...p2.runStats, dmgDealt: (p2.runStats?.dmgDealt||0) + burnDmg };
        eLogs.push(`🔥 Burn Stacks (${stacks}): ${burnDmg} dmg`);
        spawnFloat(`${burnDmg}`, "#e67e22", "enemy");
        const burnHeal = Math.max(1, Math.floor(burnDmg * (0.05 + pathSkillVal(p2, "burn_heal_amp") * 0.01)));
        p2.hp = Math.min(p2.maxHp, p2.hp + burnHeal);
        p2.combatHealTotal = (p2.combatHealTotal || 0) + burnHeal;
        p2.runStats = { ...p2.runStats, dmgHealed: (p2.runStats?.dmgHealed||0) + burnHeal };
        eLogs.push(`☀️ Sun Child: +${burnHeal} HP`);
        spawnFloat(`+${burnHeal}`, "#f39c12", "player");
      }
    }

    // Knight passive: Leader (Commander) / Grit (base or multi)
    const knightPassiveCount = [p2.classKey, p2.multiclassKey].filter(k => k === "knight").length;
    if (knightPassiveCount > 0) {
      let h = 0;
      const isPathKnight = p2.classKey === "knight" && p2.pathKey;
      if (p2.pathKey === "commander" && p2.classKey === "knight") {
        const mult = p2.isSpecialized ? 2 : 1;
        h = Math.floor((20 + eff(p2, "def") * 0.05) * mult);
        eLogs.push(`⚔️ Leader: +${h} HP`);
      } else if (!isPathKnight) {
        const mult = p2.isSpecialized ? 2 : knightPassiveCount;
        h = Math.floor((10 + eff(p2, "mnd") * 0.1) * mult);
        eLogs.push(`⚔️ Grit: +${h} HP`);
      }
      if (h > 0) {
        p2.hp = Math.min(p2.maxHp, p2.hp + h);
        p2.combatHealTotal = (p2.combatHealTotal || 0) + h;
        p2.runStats = { ...p2.runStats, dmgHealed: (p2.runStats?.dmgHealed||0) + h };
        spawnFloat(`+${h}`, "#2ecc71", "player");
        const sd = serenityProc(p2, h);
        if (sd > 0) { e2.hp = Math.max(0, e2.hp - sd); p2.runStats = { ...p2.runStats, dmgDealt: (p2.runStats?.dmgDealt||0) + sd }; eLogs.push(`☯️ Serenity: ${sd} dmg`); }
      }
    }

    // Archmage: Ultimate Knowledge — MND-based heal per turn
    if (p2.pathKey === "archmage" && p2.classKey === "mage") {
      const h = Math.max(1, Math.floor(eff(p2, "mnd") * 0.15));
      p2.hp = Math.min(p2.maxHp, p2.hp + h);
      p2.combatHealTotal = (p2.combatHealTotal || 0) + h;
      p2.runStats = { ...p2.runStats, dmgHealed: (p2.runStats?.dmgHealed||0) + h };
      eLogs.push(`📚 Ultimate Knowledge: +${h} HP`);
      spawnFloat(`+${h}`, "#8e44ad", "player");
    }

    // Ranger spec second Predator proc (no path)
    if (p2.isSpecialized && isBaseRanger && !p2.pathKey && eTick.bleedHeal > 0) {
      p2.hp = Math.min(p2.maxHp, p2.hp + eTick.bleedHeal);
      p2.combatHealTotal = (p2.combatHealTotal || 0) + eTick.bleedHeal;
      eLogs.push(`🏹 Predator (×2): +${eTick.bleedHeal} HP`);
      const sd = serenityProc(p2, eTick.bleedHeal);
      if (sd > 0) { e2.hp = Math.max(0, e2.hp - sd); p2.runStats = { ...p2.runStats, dmgDealt: (p2.runStats?.dmgDealt||0) + sd }; eLogs.push(`☯️ Serenity: ${sd} dmg`); }
    }

    // Thief Swift — skipped if base thief has a path
    const hasThief = p2.classKey === "thief" || p2.multiclassKey === "thief";
    const isPathThief = p2.classKey === "thief" && p2.pathKey;
    if (hasThief && !isPathThief) {
      const mult = p2.isSpecialized ? 2 : 1;
      const h = Math.floor((5 + eff(p2, "agi") * 0.05) * mult);
      p2.hp = Math.min(p2.maxHp, p2.hp + h);
      p2.combatHealTotal = (p2.combatHealTotal || 0) + h;
      p2.runStats = { ...p2.runStats, dmgHealed: (p2.runStats?.dmgHealed||0) + h };
      eLogs.push(`🗡️ Swift: +${h} HP`);
      spawnFloat(`+${h}`, "#2ecc71", "player");
      const sd = serenityProc(p2, h);
      if (sd > 0) { e2.hp = Math.max(0, e2.hp - sd); p2.runStats = { ...p2.runStats, dmgDealt: (p2.runStats?.dmgDealt||0) + sd }; eLogs.push(`☯️ Serenity: ${sd} dmg`); }
    }

    // Tick player status
    const wasTranscendence = p2.transcendenceThisTurn || false;
    p2 = { ...p2, transcendenceThisTurn: false };
    const pTick = tickStatus(p2);
    p2 = pTick.target; eLogs.push(...pTick.logs);

    if (pTick.regenHeal > 0) {
      p2.hp = Math.min(p2.maxHp, p2.hp + pTick.regenHeal);
      p2.combatHealTotal = (p2.combatHealTotal || 0) + pTick.regenHeal;
      p2.runStats = { ...p2.runStats, dmgHealed: (p2.runStats?.dmgHealed||0) + pTick.regenHeal };
      spawnFloat(`+${pTick.regenHeal}`, "#2ecc71", "player");
      const sd = wasTranscendence
        ? Math.floor(pTick.regenHeal * (1 + pathSkillVal(p2, "eternal_flow_amp") * 0.03))
        : serenityProc(p2, pTick.regenHeal, true);
      if (sd > 0) { e2.hp = Math.max(0, e2.hp - sd); p2.runStats = { ...p2.runStats, dmgDealt: (p2.runStats?.dmgDealt||0) + sd }; eLogs.push(`☯️ Serenity: ${sd} dmg`); spawnFloat(`${sd}`, "#e67e22", "enemy"); }
    }

    // Death check: passive effects or regen serenity killed enemy before it attacks
    if (e2.hp <= 0) { awardKill(); return; }

    if (p2.hp > 0) {
      const stunned = e2.statusEffects.some(s => s.type === "stun");
      if (stunned) {
        e2.statusEffects = e2.statusEffects.filter(s => s.type !== "stun");
        eLogs.push(`💫 ${e2.name} is stunned and loses their turn!`);
      } else {
        const hasUlt = e2.ult && p2.level >= 10;

        function dealDmgToPlayer(mv, power, dmgType) {
          const ac = agiCheck(e2.agi, eff(p2, "agi"));
          if (random() < ac.evade * (mv.isUlt ? 0.4 : 1)) {
            eLogs.push(`💨 You ${mv.isUlt ? "barely dodge" : "evaded"} ${e2.name}'s ${mv.name}!`);
            // Ghost: Phantom Step
            if (p2.pathKey === "ghost" && p2.classKey === "ranger") {
              p2.stats = { ...p2.stats, agi: p2.stats.agi + 1 };
              const evadeHeal = Math.floor(p2.maxHp * 0.10);
              p2.hp = Math.min(p2.maxHp, p2.hp + evadeHeal);
              p2.combatHealTotal = (p2.combatHealTotal || 0) + evadeHeal;
              p2.runStats = { ...p2.runStats, dmgHealed: (p2.runStats?.dmgHealed||0) + evadeHeal };
              eLogs.push(`👻 Phantom Step: +1 AGI, +${evadeHeal} HP`);
              spawnFloat(`+${evadeHeal}`, "#27ae60", "player");
              const counterAmp = pathSkillVal(p2, "evade_counter");
              if (counterAmp > 0) {
                const cDmg = Math.floor(eff(p2, "atk") * (0.40 + counterAmp * 0.04));
                e2.hp = Math.max(0, e2.hp - cDmg);
                p2.runStats = { ...p2.runStats, dmgDealt: (p2.runStats?.dmgDealt||0) + cDmg };
                eLogs.push(`👻 Phantom Counter: ${cDmg} dmg`);
                spawnFloat(`${cDmg}`, "#27ae60", "enemy");
              }
            }
            return;
          }
          const crit = random() < ac.crit;
          let d = dmgType === "magical"
            ? calcMagDmg(e2.spr, eff(p2, "mnd"), power)
            : calcPhysDmg(e2.atk, eff(p2, "def"), power);
          if (crit) d = Math.floor(d * 1.5);
          if (p2.shield > 0) {
            const blocked = Math.min(p2.shield, d);
            d = Math.max(1, d - blocked); p2.shield = 0;
            eLogs.push(`🛡️ Shield absorbed ${blocked}!`);
            spawnFloat(`-${blocked}`, "#3498db", "player");
          }
          p2.hp = Math.max(0, p2.hp - d);
          p2.runStats = { ...p2.runStats, dmgReceived: (p2.runStats?.dmgReceived||0) + d, killedBy: p2.hp <= 0 ? `${e2.icon} ${mv.name}` : p2.runStats?.killedBy };
          eLogs.push(`${mv.isUlt ? "💥 " : ""}${crit ? "⚡ CRIT! " : ""}${e2.icon} ${mv.name}: ${d} dmg`);
          const isMag = dmgType === "magical";
          spawnFloat(crit ? `⚡${d}` : `${d}`, crit ? (isMag ? "#f97316" : "#e74c3c") : (isMag ? "#e8c070" : "#ffffff"), "player");
          triggerShake("player");
          // Curse: enemy loses HP after attacking
          const curseEff = e2.statusEffects.find(s => s.type === "curse");
          if (curseEff && p2.hp > 0) {
            e2.hp = Math.max(0, e2.hp - curseEff.dmg);
            p2.runStats = { ...p2.runStats, dmgDealt: (p2.runStats?.dmgDealt||0) + curseEff.dmg };
            eLogs.push(`💀 Curse: ${curseEff.dmg} dmg to ${e2.name}`);
            spawnFloat(`${curseEff.dmg}`, "#9b59b6", "enemy");
          }
          // Blood Pact: gain soul_stack on taking damage
          if (p2.pathKey === "soulbinder" && p2.classKey === "mage" && d > 0) {
            const maxSS = 10 + pathSkillVal(p2, "soul_cap");
            if ((p2.soulStacks || 0) < maxSS) {
              p2 = { ...p2, soulStacks: (p2.soulStacks || 0) + 1 };
              eLogs.push(`💜 Blood Pact: Soul ${p2.soulStacks}/${maxSS}`);
            }
          }
          // heal_on_hit (Commander)
          const hon = pathSkillVal(p2, "heal_on_hit");
          if (hon > 0 && d > 0) {
            const h = Math.floor(d * hon * 0.03);
            if (h > 0) { p2.hp = Math.min(p2.maxHp, p2.hp + h); p2.combatHealTotal = (p2.combatHealTotal||0)+h; eLogs.push(`🛡️ Endurance: +${h} HP`); }
          }
        }

        if (e2.charging) {
          e2 = { ...e2, charging: false };
          dealDmgToPlayer({ name: e2.ult.name, isUlt: true }, e2.ult.power, e2.ult.dmgType);
        } else if (hasUlt && random() < 0.25) {
          e2 = { ...e2, charging: true };
          eLogs.push(`⚠️ ${e2.name} is charging ${e2.ult.name}!`);
        } else {
          const mv = e2.moves[Math.floor(random() * e2.moves.length)];
          dealDmgToPlayer(mv, mv.power, mv.dmgType);
        }

        // Death check: curse or phantom counter killed enemy after their attack
        if (e2.hp <= 0) { awardKill(); return; }
      }
    }
  }

  addLog(...eLogs);
  p2.mana = Math.min(p2.maxMana, p2.mana + getManaRegen(p2));
  p2.shield = 0;

  if (p2.hp <= 0) {
    addLog(`💀 Defeated after ${p2.wins} wins at level ${p2.level}.`);
    deleteSave();
    setRunSummary({ player: p2, enemy: e2 });
    setPlayer(p2); setEnemy(e2); setPhase("defeat"); setBusy(false);
    return;
  }
  setPlayer(p2); setEnemy(e2); setPlayerTurn(true); setBusy(false);
}
