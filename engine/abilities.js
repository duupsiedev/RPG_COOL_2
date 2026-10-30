import { finishVictory } from "./progression.js";
import { eff, pathSkillVal, getPlayerMoves, serenityProc, calcPhysDmg, calcMagDmg, calcChiDmg, calcHeal, effEnemyDef, calcPoisonDmg, calcMoveDmg, agiCheck, applyEffect } from "./rules.js";
import { resolveEnemyTurn } from "./enemyTurn.js";

// State is a render-time snapshot, preserving the original action guard semantics.
export function resolvePlayerMove(move, state, ports) {
  const { player, enemy, playerTurn, busy, phase } = state;
  const { setEnemy, setPlayerTurn, setBusy, setPlayer, addLog, spawnFloat, triggerShake, random, schedule } = ports;
  if (!playerTurn || busy || phase !== "active") return;
  const isFirstMove = getPlayerMoves(player)[0]?.id === move.id;
  if (!isFirstMove && player.mana < move.manaCost) return;
  // Cooldown check
  if ((player.moveCooldowns || {})[move.id] > 0) return;
  setBusy(true);

  let p = { ...player, statusEffects: [...(player.statusEffects || [])], stats: { ...player.stats }, moveCooldowns: { ...(player.moveCooldowns || {}) } };
  let e = { ...enemy,  statusEffects: [...(enemy.statusEffects  || [])] };
  const logs = [];

  if (!isFirstMove) p.mana -= move.manaCost;

  // Set cooldown if this move has one (unless remove_cooldown path skill purchased)
  if (move.cooldown && !(move.id === "meteor" && pathSkillVal(p, "remove_cooldown") >= 1)) {
    p.moveCooldowns[move.id] = move.cooldown;
  }

  if (move.type === "heal") {
    if (move.id === "phantom_mend") {
      const h = Math.floor(eff(p, "agi") * 1.2 + 10);
      p.hp = Math.min(p.maxHp, p.hp + h);
      p.combatHealTotal = (p.combatHealTotal || 0) + h;
      p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + h };
      logs.push(`💨 ${move.name}: Healed ${h} HP`);
      spawnFloat(`+${h}`, "#2ecc71", "player");
      const regenVal = Math.max(1, Math.floor(eff(p, "agi") * 0.3));
      p = applyEffect(p, "regen", regenVal, { addTurns: 2 });
      logs.push(`💨 Swiftness Regen: ${regenVal}/turn (2 turns)`);
      const sd = serenityProc(p, h);
      if (sd > 0) { e.hp = Math.max(0, e.hp - sd); p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + sd }; logs.push(`☯️ Serenity: ${sd} dmg`); }
    } else {
    const h = calcHeal(eff(p, "mnd"));
    p.hp = Math.min(p.maxHp, p.hp + h);
    p.combatHealTotal = (p.combatHealTotal || 0) + h;
    logs.push(`💚 ${move.name}: Healed ${h} HP`);
    spawnFloat(`+${h}`, "#2ecc71", "player");
    p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + h };
    const sd = serenityProc(p, h);
    if (sd > 0) { e.hp = Math.max(0, e.hp - sd); p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + sd }; logs.push(`☯️ Serenity: ${sd} dmg`); }
    }

  } else if (move.type === "regen") {
    // Inner Focus / Transcendence
    const mndMult = move.mndMult || 0.5;
    const regenVal = Math.max(1, Math.floor(eff(p, "mnd") * mndMult * (1 + pathSkillVal(p, "regen_amp") * 0.02)));
    const isGrandmaster = p.pathKey === "grandmaster" && p.classKey === "monk";
    const baseTurns = isGrandmaster ? 4 : 3;
    const extraTurns = pathSkillVal(p, "focus_duration");
    const addTurns = baseTurns + extraTurns;
    p = applyEffect(p, "regen", regenVal, { addTurns });
    // Transcendence: flag this tick for 100% serenity
    if (move.effect === "serenity_100") p = { ...p, transcendenceThisTurn: true };
    const currentTurns = p.statusEffects.find(s => s.type === "regen")?.turns || addTurns;
    logs.push(`☯️ ${move.name}: Regen ${regenVal}/turn (${currentTurns} turns)`);
    spawnFloat(`☯️`, "#e67e22", "player");

  } else if (move.type === "def+atk") {
    // spike_armor (Catalyst): shield + low phys dmg + bleed + consume poison for bonus shield
    const saShield = Math.floor(eff(p, "def") * 0.6 + eff(p, "mnd") * 0.4);
    p.shield = (p.shield || 0) + saShield;
    logs.push(`🛡️ ${move.name}: Shielded ${saShield}`);
    spawnFloat(`🛡${saShield}`, "#3498db", "player");
    const saDmg = Math.max(1, calcPhysDmg(eff(p, "atk"), effEnemyDef(e, p), move.power));
    e.hp = Math.max(0, e.hp - saDmg);
    p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + saDmg };
    logs.push(`⚔️ ${move.name}: ${saDmg} dmg`);
    spawnFloat(`${saDmg}`, "#ffffff", "enemy");
    triggerShake("enemy");
    e = applyEffect(e, "bleed", Math.max(1, Math.floor(eff(p, "atk") * 0.35)));
    logs.push("🩸 Bleed applied!");
    // Consume poison for bonus shield + Ignition proc (Catalyst)
    const saPoisonIdx = (e.statusEffects || []).findIndex(s => s.type === "poison");
    if (saPoisonIdx >= 0) {
      const saExtraShield = Math.floor(eff(p, "def") * 0.3);
      p.shield = (p.shield || 0) + saExtraShield;
      e = { ...e, statusEffects: e.statusEffects.filter((_, i) => i !== saPoisonIdx) };
      logs.push(`🧪 Spike Armor: Consumed poison for +${saExtraShield} shield!`);
      if (p.pathKey === "catalyst" && p.classKey === "artificier") {
        const saConsumeAmp = pathSkillVal(p, "consume_amp");
        const saIgniteDmg  = Math.floor(eff(p, "spr") * 0.15 * (1 + saConsumeAmp * 0.10));
        const saIgniteHeal = Math.floor(eff(p, "spr") * (0.10 + pathSkillVal(p, "ignition_amp") * 0.02));
        if (saIgniteDmg > 0) { e.hp = Math.max(0, e.hp - saIgniteDmg); p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + saIgniteDmg }; logs.push(`⚗️ Ignition: ${saIgniteDmg} dmg`); spawnFloat(`${saIgniteDmg}`, "#e8c070", "enemy"); }
        if (saIgniteHeal > 0) { p.hp = Math.min(p.maxHp, p.hp + saIgniteHeal); p.combatHealTotal = (p.combatHealTotal || 0) + saIgniteHeal; p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + saIgniteHeal }; logs.push(`⚗️ Ignition: +${saIgniteHeal} HP`); spawnFloat(`+${saIgniteHeal}`, "#2ecc71", "player"); }
        p.catalystConsumed = (p.catalystConsumed || 0) + 1;
      }
    }

  } else if (move.type === "def") {
    let shield;
    if (move.scalesStat === "agi") {
      shield = Math.floor(eff(p, "agi") * 1.0);
    } else {
      shield = Math.floor(eff(p, "def") * 0.6 + eff(p, "mnd") * 0.4);
    }
    p.shield = (p.shield || 0) + shield;
    logs.push(`🛡️ ${move.name}: Shielded ${shield}`);
    spawnFloat(`🛡${shield}`, "#3498db", "player");
    // Commander path: stronghold_ironclad — auto-activate ironclad after stronghold
    if (move.id === "stronghold" && pathSkillVal(p, "stronghold_ironclad") >= 1) {
      const extraShield = Math.floor(eff(p, "def") * 0.6 + eff(p, "mnd") * 0.4);
      p.shield += extraShield;
      logs.push(`🛡️ Ironclad (auto): +${extraShield} shield`);
    }

  } else if (move.type === "heal+atk") {
    if (move.id === "equilibrium") {
      // Chi strike using avg of ATK+SPR, then heal 30% of damage
      const avgStat = Math.floor((eff(p, "atk") + eff(p, "spr")) / 2);
      const dmg = Math.max(1, calcChiDmg(avgStat, effEnemyDef(e, p), move.power));
      e.hp = Math.max(0, e.hp - dmg);
      p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + dmg };
      logs.push(`☯️ ${move.name}: ${dmg} dmg`);
      spawnFloat(`${dmg}`, "#e67e22", "enemy");
      triggerShake("enemy");
      const healAmt = Math.floor(dmg * 0.30);
      p.hp = Math.min(p.maxHp, p.hp + healAmt);
      p.combatHealTotal = (p.combatHealTotal || 0) + healAmt;
      p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + healAmt };
      logs.push(`💚 Equilibrium: Healed ${healAmt} HP`);
      spawnFloat(`+${healAmt}`, "#2ecc71", "player");
      const sd = serenityProc(p, healAmt);
      if (sd > 0) { e.hp = Math.max(0, e.hp - sd); p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + sd }; logs.push(`☯️ Serenity: ${sd} dmg`); }
    } else if (move.id === "solar_flare") {
      // Magical damage scales SPR, heal based on burn stacks
      const dmg = Math.max(1, calcMagDmg(eff(p, "spr"), e.mnd, move.power));
      e.hp = Math.max(0, e.hp - dmg);
      p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + dmg };
      logs.push(`☀️ ${move.name}: ${dmg} dmg`);
      spawnFloat(`${dmg}`, "#f97316", "enemy");
      triggerShake("enemy");
      const healAmt = Math.floor((p.burnStacks || 0) * eff(p, "spr") * 0.20 + 10);
      p.hp = Math.min(p.maxHp, p.hp + healAmt);
      p.combatHealTotal = (p.combatHealTotal || 0) + healAmt;
      p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + healAmt };
      logs.push(`☀️ Solar Heal: +${healAmt} HP (${p.burnStacks || 0} burn stacks)`);
      spawnFloat(`+${healAmt}`, "#2ecc71", "player");
      const sd = serenityProc(p, healAmt);
      if (sd > 0) { e.hp = Math.max(0, e.hp - sd); p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + sd }; logs.push(`☯️ Serenity: ${sd} dmg`); }
    } else if (move.id === "toxic_smoke") {
      // Mixed dmg: avg of phys(ATK) + mag(SPR). Heals 50% of dmg. Applies poison.
      const dmg = Math.max(1, calcMoveDmg(move, p, e));
      e.hp = Math.max(0, e.hp - dmg);
      p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + dmg };
      logs.push(`🧪 ${move.name}: ${dmg} dmg`);
      spawnFloat(`${dmg}`, "#7f8c8d", "enemy");
      triggerShake("enemy");
      const tsPoison = calcPoisonDmg(p);
      const tsPoisonDur = 4 + pathSkillVal(p, "dot_duration");
      e = applyEffect(e, "poison", tsPoison, { duration: tsPoisonDur });
      logs.push(`🧪 Poison applied! (${tsPoison}/turn)`);
      if (p.pathKey === "maniac" && p.classKey === "artificier") {
        const ovDmg = Math.floor(eff(p, "spr") * (0.15 + pathSkillVal(p, "overload_amp") * 0.01));
        if (ovDmg > 0) { e.hp = Math.max(0, e.hp - ovDmg); p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + ovDmg }; logs.push(`💥 Overload: ${ovDmg} dmg`); spawnFloat(`${ovDmg}`, "#e74c3c", "enemy"); }
      }
      const tsHeal = Math.floor(dmg * 0.50);
      if (tsHeal > 0) {
        p.hp = Math.min(p.maxHp, p.hp + tsHeal);
        p.combatHealTotal = (p.combatHealTotal || 0) + tsHeal;
        p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + tsHeal };
        logs.push(`💚 Toxic Smoke: +${tsHeal} HP`);
        spawnFloat(`+${tsHeal}`, "#2ecc71", "player");
        const sd = serenityProc(p, tsHeal);
        if (sd > 0) { e.hp = Math.max(0, e.hp - sd); p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + sd }; logs.push(`☯️ Serenity: ${sd} dmg`); }
      }
    } else if (move.id === "acid_smoke") {
      // Maniac healMove: mixed dmg (avg ATK+SPR), applies poison + 1 wither, heals 50% dmg
      const asDmg = Math.max(1, calcMoveDmg(move, p, e));
      e.hp = Math.max(0, e.hp - asDmg);
      p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + asDmg };
      logs.push(`🧪 ${move.name}: ${asDmg} dmg`);
      spawnFloat(`${asDmg}`, "#7f8c8d", "enemy");
      triggerShake("enemy");
      // Apply poison
      const asPoison = calcPoisonDmg(p);
      const asPoisonDur = 4 + pathSkillVal(p, "dot_duration");
      e = applyEffect(e, "poison", asPoison, { duration: asPoisonDur });
      logs.push(`🧪 Poison applied! (${asPoison}/turn)`);
      if (p.pathKey === "maniac" && p.classKey === "artificier") { const ovDmg = Math.floor(eff(p,"spr")*(0.15+pathSkillVal(p,"overload_amp")*0.01)); if(ovDmg>0){e.hp=Math.max(0,e.hp-ovDmg);p.runStats={...p.runStats,dmgDealt:(p.runStats?.dmgDealt||0)+ovDmg};logs.push(`💥 Overload: ${ovDmg} dmg`);spawnFloat(`${ovDmg}`,"#e74c3c","enemy");} }
      // Apply 1 wither stack
      const asMaxWither = 10;
      e.witherStacks = Math.min(asMaxWither, (e.witherStacks || 0) + 1);
      logs.push(`🌿 Wither: ${e.witherStacks} stack(s) (-${e.witherStacks * 3}% DEF)`);
      if (p.pathKey === "maniac" && p.classKey === "artificier") { const ovDmg = Math.floor(eff(p,"spr")*(0.15+pathSkillVal(p,"overload_amp")*0.01)); if(ovDmg>0){e.hp=Math.max(0,e.hp-ovDmg);p.runStats={...p.runStats,dmgDealt:(p.runStats?.dmgDealt||0)+ovDmg};logs.push(`💥 Overload: ${ovDmg} dmg`);spawnFloat(`${ovDmg}`,"#e74c3c","enemy");} }
      // Heal 50% of damage dealt
      const asHeal = Math.floor(asDmg * 0.50);
      if (asHeal > 0) {
        p.hp = Math.min(p.maxHp, p.hp + asHeal);
        p.combatHealTotal = (p.combatHealTotal || 0) + asHeal;
        p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + asHeal };
        logs.push(`💚 Acid Smoke: +${asHeal} HP`);
        spawnFloat(`+${asHeal}`, "#2ecc71", "player");
        const sd = serenityProc(p, asHeal);
        if (sd > 0) { e.hp = Math.max(0, e.hp - sd); p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + sd }; logs.push(`☯️ Serenity: ${sd} dmg`); }
      }
    } else {
    // Verdant Bloom (Archdruid): heal + regen + small dmg to enemy
    const healAmt = Math.max(1, Math.floor(eff(p, "mnd") * (0.4 + pathSkillVal(p, "bloom_amp") * 0.03)));
    p.hp = Math.min(p.maxHp, p.hp + healAmt);
    p.combatHealTotal = (p.combatHealTotal || 0) + healAmt;
    p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + healAmt };
    logs.push(`🌿 ${move.name}: Healed ${healAmt} HP`);
    spawnFloat(`+${healAmt}`, "#2ecc71", "player");
    // Apply regen
    const regenVal = Math.max(1, Math.floor(eff(p, "mnd") * 0.3));
    p = applyEffect(p, "regen", regenVal, { addTurns: 3 });
    logs.push(`💚 Verdant Regen: ${regenVal}/turn`);
    // Small damage to enemy
    const smDmg = Math.max(1, Math.floor(calcMagDmg(eff(p, "spr"), e.mnd, move.power)));
    e.hp = Math.max(0, e.hp - smDmg);
    p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + smDmg };
    logs.push(`🌿 Nature strike: ${smDmg} dmg`);
    spawnFloat(`${smDmg}`, "#16a085", "enemy");
    const sd = serenityProc(p, healAmt);
    if (sd > 0) { e.hp = Math.max(0, e.hp - sd); p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + sd }; logs.push(`☯️ Serenity: ${sd} dmg`); }
    }

  } else if (move.id === "grand_detonation") {
    // Grand Detonation (Catalyst): consume all statuses, massive SPR dmg scaled by catalystConsumed
    const gdCount = Math.min(p.catalystConsumed || 0, 10);
    const gdAmp   = pathSkillVal(p, "grand_amp");
    const gdDmg   = Math.floor(gdCount * eff(p, "spr") * (0.25 + gdAmp * 0.15));
    e = { ...e, statusEffects: [], witherStacks: 0 };
    if (gdDmg > 0) {
      e.hp = Math.max(0, e.hp - gdDmg);
      p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + gdDmg };
      logs.push(`💣 Grand Detonation: ${gdDmg} dmg (${gdCount} charges)`);
      spawnFloat(`${gdDmg}`, "#e74c3c", "enemy");
      triggerShake("enemy");
      const gdHeal = Math.floor(gdDmg * 0.20);
      if (gdHeal > 0) { p.hp = Math.min(p.maxHp, p.hp + gdHeal); p.combatHealTotal = (p.combatHealTotal || 0) + gdHeal; p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + gdHeal }; logs.push(`💣 Grand Detonation: +${gdHeal} HP`); spawnFloat(`+${gdHeal}`, "#2ecc71", "player"); }
    } else {
      logs.push(`💣 Grand Detonation: No charges! Use Caustic Injection or Incendiary Round first.`);
    }
    p.catalystConsumed = 0;

  } else {
    // All attack moves
    const ac = agiCheck(eff(p, "agi"), e.agi);
    if (random() < ac.evade) {
      logs.push(`💨 ${e.name} evaded!`);
    } else {
      // Determine crit
      const critChanceBonus = pathSkillVal(p, "crit_chance_amp") * 0.02;
      const critMultBonus   = pathSkillVal(p, "crit_mult_amp") * 0.05;
      const critStackBonus  = (p.critStacks || 0) * 0.20;
      const forceCrit = move.effect === "consume_crit_stack" && (p.critStacks || 0) > 0;
      const crit = forceCrit || random() < (ac.crit + critChanceBonus);
      const critMult = 1.5 + critMultBonus + critStackBonus;

      if (forceCrit && move.effect === "consume_crit_stack") {
        p.critStacks = Math.max(0, (p.critStacks || 0) - 1);
        logs.push(`🎯 Deathmark: guaranteed crit (${p.critStacks + 1} stacks → ${p.critStacks})`);
      }

      let hits = move.hits || 1;
      // Extra hit path skills
      if (move.id === "flurry")           hits += pathSkillVal(p, "flurry_extra");
      if (move.id === "rain_of_arrows")   hits += pathSkillVal(p, "extra_arrow");
      if (move.id === "phantom_arrow")    hits += pathSkillVal(p, "phantom_extra");
      if (move.id === "inversion_strike") hits += pathSkillVal(p, "dual_extra");
      if (move.id === "soul_cannon")      hits += pathSkillVal(p, "dual_extra");

      // Consume Yin/Yang stacks for bonus
      let stackBonusPct = 1.0;
      if (move.effect === "consume_yin") {
        const stacks = p.yinStacks || 0;
        stackBonusPct = 1 + stacks * 0.20;
        p.yinStacks = 0;
        if (stacks > 0) logs.push(`☯️ Consumed ${stacks} Yin stacks (+${Math.round((stackBonusPct-1)*100)}% dmg)`);
      }
      if (move.effect === "consume_yang") {
        const stacks = p.yangStacks || 0;
        stackBonusPct = 1 + stacks * 0.20;
        p.yangStacks = 0;
        if (stacks > 0) logs.push(`☯️ Consumed ${stacks} Yang stacks (+${Math.round((stackBonusPct-1)*100)}% dmg)`);
      }

      // Immolate: consume burn stacks
      let immolateBonus = 1.0;
      if (move.effect === "consume_burn") {
        const stacks = p.burnStacks || 0;
        immolateBonus = Math.min(3.0 / 1.2, 1 + stacks * 0.5); // effective multiplier on top of power
        logs.push(`🔥 Immolate: ${stacks} stacks consumed!`);
        p.burnStacks = 0;
      }

      // Wrath of Nature: power scales with harmonyBoosts count
      let wrathBonus = 1.0;
      if (move.effect === "harmony_scale") {
        const boosts = p.harmonyBoosts || 0;
        wrathBonus = 1 + boosts * 0.05 * (1 + pathSkillVal(p, "wrath_amp") * 0.15);
      }

      // Chaos Engineer (Artificier base passive): +10% dmg per active status on enemy
      const isArtificierClass = p.classKey === "artificier" || p.multiclassKey === "artificier";
      const chaosCount = isArtificierClass
        ? (e.statusEffects || []).filter(s => ["burn","bleed","poison","stun","curse"].includes(s.type)).length
          + ((e.witherStacks || 0) > 0 ? 1 : 0)
        : 0;

      let totalDmg = 0;
      for (let h = 0; h < hits; h++) {
        const isLastHit = h === hits - 1;
        let d = calcMoveDmg(move, p, e);
        d = Math.floor(d * stackBonusPct * immolateBonus * wrathBonus);
        // Flurry: each hit crits independently
        const hitCrit = move.id === "flurry" ? random() < (ac.crit + critChanceBonus) : crit;
        if (hitCrit) d = Math.floor(d * critMult);
        totalDmg += d;

        // Decompose: bonus per active DoT
        if (move.effect === "dot_bonus" && isLastHit) {
          const dotCount = (e.statusEffects || []).filter(s => ["burn","bleed","poison"].includes(s.type)).length
                         + (e.witherStacks > 0 ? 1 : 0);
          const dotAmp   = pathSkillVal(p, "decompose_amp");
          const dotBonus = Math.floor(d * dotCount * (0.10 + dotAmp * 0.10));
          totalDmg += dotBonus;
          if (dotBonus > 0) logs.push(`☣️ Decompose DoT bonus: +${dotBonus}`);
        }

        // Chi burst: bonus from total healed this combat
        if (move.effect === "heal_scale" && isLastHit) {
          const healBonus = Math.floor((p.combatHealTotal || 0) * 0.05);
          totalDmg += healBonus;
          if (healBonus > 0) logs.push(`☯️ Chi Burst heal bonus: +${healBonus}`);
        }

        // Bleed on last hit only (rain_of_arrows)
        if (move.effect === "bleed_last" && isLastHit) {
          const bleedAmp = pathSkillVal(p, "bleed_amp");
          e = applyEffect(e, "bleed", Math.max(1, Math.floor(eff(p,"atk") * 0.35 * (1 + bleedAmp * 0.03))));
          logs.push("🩸 Bleed applied!");
        }
      }

      // Apply Chaos Engineer multiplier after totalDmg is finalized
      if (chaosCount > 0) {
        totalDmg = Math.floor(totalDmg * (1 + chaosCount * 0.10));
        logs.push(`🧪 Chaos Engineer: +${chaosCount * 10}% dmg (${chaosCount} statuses)`);
      }
      e.hp = Math.max(0, e.hp - totalDmg);
      p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + totalDmg };
      logs.push(`${crit ? "⚡ CRIT! " : ""}${move.name}: ${totalDmg} dmg${hits > 1 ? ` (${hits}×)` : ""}`);
      const isMag  = move.dmgType === "magical" || move.dmgType === "chi" || move.dmgType === "void";
      const fcol   = crit ? (isMag ? "#f97316" : "#e74c3c") : (isMag ? "#e8c070" : "#ffffff");
      spawnFloat(crit ? `⚡${totalDmg}` : `${totalDmg}`, fcol, "enemy");
      triggerShake("enemy");

      // crit_heal: predatory_strike — heal 40% of damage on crit, consume 1 crit stack
      if (move.effect === "crit_heal" && crit) {
        const healAmt = Math.floor(totalDmg * 0.40);
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        p.combatHealTotal = (p.combatHealTotal || 0) + healAmt;
        p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + healAmt };
        if ((p.critStacks || 0) > 0) p.critStacks = Math.max(0, (p.critStacks || 0) - 1);
        logs.push(`🗡️ Predatory Strike: crit heal +${healAmt} HP`);
        spawnFloat(`+${healAmt}`, "#2ecc71", "player");
        const sd = serenityProc(p, healAmt);
        if (sd > 0) { e.hp = Math.max(0, e.hp - sd); p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + sd }; logs.push(`☯️ Serenity: ${sd} dmg`); }
      }

      // Gain crit stack on crit (Assassin)
      if (crit && p.pathKey === "assassin") {
        const maxStacks = 5;
        if ((p.critStacks || 0) < maxStacks) {
          p.critStacks = (p.critStacks || 0) + 1;
          logs.push(`🎯 Killing Edge: crit stack ${p.critStacks}/${maxStacks}`);
        }
      }

      // Yin/Yang stacks (Duality)
      if (p.pathKey === "duality") {
        const stackCap = 5 + pathSkillVal(p, "stack_cap");
        if (move.dmgType === "physical" && move.effect !== "consume_yang") {
          if ((p.yangStacks || 0) < stackCap) {
            p.yangStacks = (p.yangStacks || 0) + 1;
            logs.push(`☯️ Yang Stack: ${p.yangStacks}/${stackCap} (+${(2 + pathSkillVal(p,"stack_amp"))}% SPR temp)`);
          }
        }
        if (move.dmgType === "magical" && move.effect !== "consume_yin") {
          if ((p.yinStacks || 0) < stackCap) {
            p.yinStacks = (p.yinStacks || 0) + 1;
            logs.push(`☯️ Yin Stack: ${p.yinStacks}/${stackCap} (+${(2 + pathSkillVal(p,"stack_amp"))}% ATK temp)`);
          }
        }
      }

      // ---- Effect resolution ----
      if (move.effect === "burn" || (move.id === "spore_cloud" && pathSkillVal(p, "spore_burn") >= 1)) {
        e = applyEffect(e, "burn", Math.max(1, Math.floor(eff(p,"spr") * 0.25)));
        logs.push("🔥 Burn applied!");
      }
      if (move.effect === "bleed" && move.effect !== "bleed_last") {
        const bleedAmp = pathSkillVal(p, "bleed_amp");
        e = applyEffect(e, "bleed", Math.max(1, Math.floor(eff(p,"atk") * 0.35 * (1 + bleedAmp * 0.03))));
        logs.push("🩸 Bleed applied!");
      }
      if (move.effect === "stun" && random() < 0.4) {
        e = applyEffect(e, "stun", 0);
        logs.push("💫 Enemy stunned!");
      }
      if (move.effect === "drain" || move.id === "soul_leech") {
        const soulStacks = p.soulStacks || 0;
        const drainAmp   = pathSkillVal(p, "drain_amp") * 0.02;
        const healPct    = 0.60 + soulStacks * 0.05 + drainAmp;
        const h = Math.floor(totalDmg * healPct);
        p.hp = Math.min(p.maxHp, p.hp + h);
        p.combatHealTotal = (p.combatHealTotal || 0) + h;
        logs.push(`💜 Drain: Healed ${h} HP`);
        spawnFloat(`+${h}`, "#2ecc71", "player");
        p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + h };
        const sd = serenityProc(p, h);
        if (sd > 0) { e.hp = Math.max(0, e.hp - sd); p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + sd }; logs.push(`☯️ Serenity: ${sd} dmg`); }
      }
      if (move.effect === "burn_stack") {
        const maxBurnStacks = 6;
        if ((p.burnStacks || 0) < maxBurnStacks) {
          p.burnStacks = (p.burnStacks || 0) + 1;
          logs.push(`🔥 Burn Stack: ${p.burnStacks}/${maxBurnStacks}`);
        }
      }
      if (move.effect === "poison") {
        const poisonDmg = calcPoisonDmg(p);
        const dur = 4 + pathSkillVal(p, "poison_duration");
        e = applyEffect(e, "poison", poisonDmg, { duration: dur });
        logs.push(`🧪 Poison applied! (${poisonDmg}/turn)`);
        // venom_bleed path skill
        if (move.id === "venom_strike" && pathSkillVal(p, "venom_bleed") >= 1) {
          e = applyEffect(e, "bleed", Math.max(1, Math.floor(eff(p,"atk") * 0.35)));
          logs.push("🩸 Bleed applied (Venom)!");
        }
      }
      if (move.effect === "refresh_poison") {
        const poisonDmg = calcPoisonDmg(p);
        const dur = 4 + pathSkillVal(p, "poison_duration");
        e = applyEffect(e, "refresh_poison", poisonDmg, { duration: dur });
        logs.push("🧪 Poison refreshed!");
      }
      if (move.effect === "poison+bleed") {
        const poisonDmg = calcPoisonDmg(p);
        const dur = 4 + pathSkillVal(p, "poison_duration");
        e = applyEffect(e, "poison", poisonDmg, { duration: dur });
        logs.push(`🧪 Poison applied! (${poisonDmg}/turn)`);
        e = applyEffect(e, "bleed", Math.max(1, Math.floor(eff(p,"atk") * 0.35)));
        logs.push("🩸 Bleed applied!");
        if (pathSkillVal(p, "spore_burn") >= 1) {
          e = applyEffect(e, "burn", Math.max(1, Math.floor(eff(p,"spr") * 0.25)));
          logs.push("🔥 Burn applied (Spore)!");
        }
      }
      if (move.effect === "curse") {
        e = applyEffect(e, "curse", Math.max(1, Math.floor(eff(p,"spr") * 0.25)));
        logs.push("💀 Cursed!");
        // coil_bleed path skill
        if (move.id === "death_coil" && pathSkillVal(p, "coil_bleed") >= 1) {
          e = applyEffect(e, "bleed", Math.max(1, Math.floor(eff(p,"atk") * 0.35)));
          logs.push("🩸 Bleed applied (Coil)!");
        }
      }
      // burn+bleed (thermite — Maniac path)
      if (move.effect === "burn+bleed") {
        e = applyEffect(e, "burn", Math.max(1, Math.floor(eff(p,"spr") * 0.25)));
        logs.push("🔥 Burn applied!");
        const bbDotDur = pathSkillVal(p, "dot_duration");
        if (bbDotDur > 0) e = { ...e, statusEffects: e.statusEffects.map(s => s.type === "burn"  ? { ...s, turns: s.turns + bbDotDur } : s) };
        if (p.pathKey === "maniac" && p.classKey === "artificier") { const ovDmg = Math.floor(eff(p,"spr")*(0.15+pathSkillVal(p,"overload_amp")*0.01)); if(ovDmg>0){e.hp=Math.max(0,e.hp-ovDmg);p.runStats={...p.runStats,dmgDealt:(p.runStats?.dmgDealt||0)+ovDmg};logs.push(`💥 Overload: ${ovDmg} dmg`);spawnFloat(`${ovDmg}`,"#e74c3c","enemy");} }
        const bbBleedAmp = pathSkillVal(p, "bleed_amp");
        e = applyEffect(e, "bleed", Math.max(1, Math.floor(eff(p,"atk") * 0.35 * (1 + bbBleedAmp * 0.03))));
        logs.push("🩸 Bleed applied!");
        if (bbDotDur > 0) e = { ...e, statusEffects: e.statusEffects.map(s => s.type === "bleed" ? { ...s, turns: s.turns + bbDotDur } : s) };
        if (p.pathKey === "maniac" && p.classKey === "artificier") { const ovDmg = Math.floor(eff(p,"spr")*(0.15+pathSkillVal(p,"overload_amp")*0.01)); if(ovDmg>0){e.hp=Math.max(0,e.hp-ovDmg);p.runStats={...p.runStats,dmgDealt:(p.runStats?.dmgDealt||0)+ovDmg};logs.push(`💥 Overload: ${ovDmg} dmg`);spawnFloat(`${ovDmg}`,"#e74c3c","enemy");} }
        if (pathSkillVal(p, "triple_threat") >= 1) {
          const ttPDmg = calcPoisonDmg(p);
          const ttPDur = 4 + pathSkillVal(p, "dot_duration");
          e = applyEffect(e, "poison", ttPDmg, { duration: ttPDur });
          logs.push(`🧪 Triple Threat: Poison! (${ttPDmg}/turn)`);
          if (p.pathKey === "maniac" && p.classKey === "artificier") { const ovDmg = Math.floor(eff(p,"spr")*(0.15+pathSkillVal(p,"overload_amp")*0.01)); if(ovDmg>0){e.hp=Math.max(0,e.hp-ovDmg);p.runStats={...p.runStats,dmgDealt:(p.runStats?.dmgDealt||0)+ovDmg};logs.push(`💥 Overload: ${ovDmg} dmg`);spawnFloat(`${ovDmg}`,"#e74c3c","enemy");} }
        }
      }
      // bleed+poison (fragmentation — Maniac path)
      if (move.effect === "bleed+poison") {
        const bpBleedAmp = pathSkillVal(p, "bleed_amp");
        e = applyEffect(e, "bleed", Math.max(1, Math.floor(eff(p,"atk") * 0.35 * (1 + bpBleedAmp * 0.03))));
        logs.push("🩸 Bleed applied!");
        const bpDotDur = pathSkillVal(p, "dot_duration");
        if (bpDotDur > 0) e = { ...e, statusEffects: e.statusEffects.map(s => s.type === "bleed" ? { ...s, turns: s.turns + bpDotDur } : s) };
        if (p.pathKey === "maniac" && p.classKey === "artificier") { const ovDmg = Math.floor(eff(p,"spr")*(0.15+pathSkillVal(p,"overload_amp")*0.01)); if(ovDmg>0){e.hp=Math.max(0,e.hp-ovDmg);p.runStats={...p.runStats,dmgDealt:(p.runStats?.dmgDealt||0)+ovDmg};logs.push(`💥 Overload: ${ovDmg} dmg`);spawnFloat(`${ovDmg}`,"#e74c3c","enemy");} }
        const bpPoisonDmg = calcPoisonDmg(p);
        const bpPoisonDur = 4 + pathSkillVal(p, "dot_duration");
        e = applyEffect(e, "poison", bpPoisonDmg, { duration: bpPoisonDur });
        logs.push(`🧪 Poison applied! (${bpPoisonDmg}/turn)`);
        if (p.pathKey === "maniac" && p.classKey === "artificier") { const ovDmg = Math.floor(eff(p,"spr")*(0.15+pathSkillVal(p,"overload_amp")*0.01)); if(ovDmg>0){e.hp=Math.max(0,e.hp-ovDmg);p.runStats={...p.runStats,dmgDealt:(p.runStats?.dmgDealt||0)+ovDmg};logs.push(`💥 Overload: ${ovDmg} dmg`);spawnFloat(`${ovDmg}`,"#e74c3c","enemy");} }
      }
      // apply_poison+consume_burn (caustic_injection — Catalyst path)
      if (move.effect === "apply_poison+consume_burn") {
        const ciPDmg = calcPoisonDmg(p);
        const ciPDur = 4 + pathSkillVal(p, "dot_duration");
        e = applyEffect(e, "poison", ciPDmg, { duration: ciPDur });
        logs.push(`🧪 Poison applied! (${ciPDmg}/turn)`);
        const ciBurnIdx = (e.statusEffects || []).findIndex(s => s.type === "burn");
        if (ciBurnIdx >= 0) {
          e = { ...e, statusEffects: e.statusEffects.filter((_, i) => i !== ciBurnIdx) };
          logs.push("🔥 Burn consumed!");
          if (p.pathKey === "catalyst" && p.classKey === "artificier") {
            const ciConsumeAmp = pathSkillVal(p, "consume_amp");
            const ciIgniteDmg  = Math.floor(eff(p,"spr") * 0.15 * (1 + ciConsumeAmp * 0.10));
            const ciIgniteHeal = Math.floor(eff(p,"spr") * (0.10 + pathSkillVal(p,"ignition_amp") * 0.02));
            if (ciIgniteDmg > 0) { e.hp=Math.max(0,e.hp-ciIgniteDmg); p.runStats={...p.runStats,dmgDealt:(p.runStats?.dmgDealt||0)+ciIgniteDmg}; logs.push(`⚗️ Ignition: ${ciIgniteDmg} dmg`); spawnFloat(`${ciIgniteDmg}`,"#e8c070","enemy"); }
            if (ciIgniteHeal > 0) { p.hp=Math.min(p.maxHp,p.hp+ciIgniteHeal); p.combatHealTotal=(p.combatHealTotal||0)+ciIgniteHeal; p.runStats={...p.runStats,dmgHealed:(p.runStats?.dmgHealed||0)+ciIgniteHeal}; logs.push(`⚗️ Ignition: +${ciIgniteHeal} HP`); spawnFloat(`+${ciIgniteHeal}`,"#2ecc71","player"); }
            p.catalystConsumed = (p.catalystConsumed || 0) + 1;
          }
        }
      }
      // apply_burn+consume_bleed (incendiary_round — Catalyst path)
      if (move.effect === "apply_burn+consume_bleed") {
        const ibDotDur = pathSkillVal(p, "dot_duration");
        e = applyEffect(e, "burn", Math.max(1, Math.floor(eff(p,"spr") * 0.25)));
        logs.push("🔥 Burn applied!");
        if (ibDotDur > 0) e = { ...e, statusEffects: e.statusEffects.map(s => s.type === "burn" ? { ...s, turns: s.turns + ibDotDur } : s) };
        const ibBleedIdx = (e.statusEffects || []).findIndex(s => s.type === "bleed");
        if (ibBleedIdx >= 0) {
          e = { ...e, statusEffects: e.statusEffects.filter((_, i) => i !== ibBleedIdx) };
          logs.push("🩸 Bleed consumed!");
          if (p.pathKey === "catalyst" && p.classKey === "artificier") {
            const ibConsumeAmp = pathSkillVal(p, "consume_amp");
            const ibIgniteDmg  = Math.floor(eff(p,"spr") * 0.15 * (1 + ibConsumeAmp * 0.10));
            const ibIgniteHeal = Math.floor(eff(p,"spr") * (0.10 + pathSkillVal(p,"ignition_amp") * 0.02));
            if (ibIgniteDmg > 0) { e.hp=Math.max(0,e.hp-ibIgniteDmg); p.runStats={...p.runStats,dmgDealt:(p.runStats?.dmgDealt||0)+ibIgniteDmg}; logs.push(`⚗️ Ignition: ${ibIgniteDmg} dmg`); spawnFloat(`${ibIgniteDmg}`,"#e8c070","enemy"); }
            if (ibIgniteHeal > 0) { p.hp=Math.min(p.maxHp,p.hp+ibIgniteHeal); p.combatHealTotal=(p.combatHealTotal||0)+ibIgniteHeal; p.runStats={...p.runStats,dmgHealed:(p.runStats?.dmgHealed||0)+ibIgniteHeal}; logs.push(`⚗️ Ignition: +${ibIgniteHeal} HP`); spawnFloat(`+${ibIgniteHeal}`,"#2ecc71","player"); }
            p.catalystConsumed = (p.catalystConsumed || 0) + 1;
          }
        }
      }
      // multicast (Lightning): chance to cast again
      if (move.effect === "multicast") {
        const multicastChance = 0.25 + pathSkillVal(p, "multicast_amp") * 0.08;
        if (random() < multicastChance) {
          const d2 = calcMoveDmg(move, p, e);
          e.hp = Math.max(0, e.hp - d2);
          p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + d2 };
          logs.push(`⚡ Multicast! ${move.name}: ${d2} dmg`);
          spawnFloat(`⚡${d2}`, "#f97316", "enemy");
        }
      }
    }
  }

  // Enemy dead?
  if (e.hp <= 0) {
    finishVictory(p, e, logs, ports);
    return;
  }

  addLog(...logs);
  setPlayer(p); setEnemy(e);
  setPlayerTurn(false);

  schedule(() => resolveEnemyTurn(p, e, ports), 900);
}
