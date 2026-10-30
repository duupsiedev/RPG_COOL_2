import { getClass, JOURNEY_MAX_LEVEL, JOURNEY_EXP_TABLE } from "../gameData.js";
import { skillGoldMult, skillXpMult, getManaRegen } from "./character.js";

// Pure with a supplied RNG: does not mutate the player, enemy, or their nested data.
export function resolveVictory(player, e, { random = Math.random, note = "" } = {}) {
  const p = { ...player };
  const logs = [];
  const gold = Math.floor(e.reward.gold * skillGoldMult(p));
  const exp  = Math.floor(e.reward.exp  * skillXpMult(p));
  p.gold += gold; p.exp += exp; p.wins += 1;
  p.maxHp += 10;
  if (p.wins % 25 === 0) p.maxHp += 100;
  logs.push(`💀 ${e.name} defeated${note}! +${exp} EXP +${gold} Gold`);

  // Passives on kill — runs for classKey AND multiclassKey if present
  const passiveKeys = p.isSpecialized
    ? [p.classKey]  // spec: only run once, doubled internally
    : [p.classKey, p.multiclassKey].filter(Boolean);
  const isSpec = p.isSpecialized;

  for (const pk of passiveKeys) {
    // Druid: Nature (base) or Harmony (path)
    if (pk === "druid") {
      const isDruidBase = pk === p.classKey;
      const hasHarmony  = isDruidBase && p.pathKey === "archdruid";
      const rolls = isSpec && isDruidBase ? 2 : 1;
      const numRolls = hasHarmony ? rolls * 2 : rolls; // Harmony: +2 stats per win
      const stats = ["atk","def","spr","mnd","agi"];
      for (let i = 0; i < numRolls; i++) {
        const s = stats[Math.floor(random() * stats.length)];
        p.bonusFlat = { ...p.bonusFlat, [s]: (p.bonusFlat[s] || 0) + 1 };
        if (hasHarmony) {
          p.harmonyBoosts = (p.harmonyBoosts || 0) + 1;
          logs.push(`🌙 Harmony: +1 ${s.toUpperCase()}! (${p.harmonyBoosts} total)`);
        } else {
          logs.push(`🌿 Nature: +1 ${s.toUpperCase()}!`);
        }
      }
    }
    // Mage: Knowledge (base) or Ultimate Knowledge (path)
    if (pk === "mage") {
      const isMageBase = pk === p.classKey;
      const hasUltKnowledge = isMageBase && p.pathKey === "archmage";
      if (hasUltKnowledge) {
        // Ultimate Knowledge: +1 MND every win
        const gains = isSpec ? 2 : 1;
        p.bonusFlat = { ...p.bonusFlat, mnd: (p.bonusFlat.mnd || 0) + gains };
        logs.push(`📚 Ultimate Knowledge: +${gains} MND!`);
      } else {
        const isSecond = !isSpec && pk === p.multiclassKey;
        const tracker = isSecond ? "passiveWins2" : "passiveWins";
        p[tracker] = (p[tracker] || 0) + 1;
        const threshold = isSpec ? 3 : 5;
        if (p[tracker] % threshold === 0) {
          p.bonusFlat = { ...p.bonusFlat, spr: (p.bonusFlat.spr || 0) + 1 };
          logs.push(`🔮 Knowledge: +1 SPR!`);
        }
      }
    }
  }

  // Journey EXP — only earnable after choosing a path
  if (p.pathKey) {
    const jExp = Math.floor(e.reward.exp * skillXpMult(p));
    p.journeyExp = (p.journeyExp || 0) + jExp;
    while ((p.journeyLevel || 0) < JOURNEY_MAX_LEVEL && p.journeyExp >= JOURNEY_EXP_TABLE[(p.journeyLevel || 0) + 1]) {
      p.journeyLevel = (p.journeyLevel || 0) + 1;
      p.journeyPoints = (p.journeyPoints || 0) + 1;
      logs.push(`🌟 Journey Level ${p.journeyLevel}! +1 Path Skill Point`);
    }
  }

  // Level up
  while (p.exp >= p.expToNext) {
    p.exp -= p.expToNext; p.level += 1;
    p.expToNext = Math.floor(p.expToNext * 1.30);
    const baseStats = getClass(p.classKey).stats;
    const secondStats = p.multiclassKey ? getClass(p.multiclassKey).stats : null;
    const scalingMult = p.combinedScaling
      ? p.combinedScaling / getClass(p.classKey).baseScaling
      : 1;
    const ns = { ...p.stats };
    const desc = [];
    Object.keys(ns).forEach(s => {
      const blendedBase = secondStats
        ? (baseStats[s] + secondStats[s]) / 2
        : baseStats[s];
      const g = Math.ceil(blendedBase * Math.pow(1.08, p.level - 1) * scalingMult);
      ns[s] += g; desc.push(`${s.toUpperCase()}+${g}`);
    });
    p.stats = ns;
    // Use pathHpScaling if path chosen, else base hpScaling
    const hpScaling = p.pathHpScaling || getClass(p.classKey).hpScaling || 1;
    const hpGain = Math.floor(20 * hpScaling);
    p.maxHp += hpGain; p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
    p.skillPoints = (p.skillPoints || 0) + 2;
    logs.push(`🎉 LEVEL UP → ${p.level}! ${desc.join(" ")} +2 SP`);
  }

  p.mana = Math.min(p.maxMana, p.mana + getManaRegen(p));

  return { player: p, gold, exp, logs };
}

// Preserve publication order and pacing for both direct and delayed kills.
export function finishVictory(player, enemy, precedingLogs, ports, note = "") {
  const result = resolveVictory(player, enemy, { random: ports.random, note });
  ports.addLog(...precedingLogs, ...result.logs);
  ports.setLastReward({ gold: result.gold, exp: result.exp });
  ports.schedule(() => ports.setLastReward(null), 1800);
  ports.setPlayer(result.player);
  ports.setEnemy(enemy);
  ports.setPhase("victory");
  ports.setBusy(false);
  ports.schedule(() => ports.beginCombat(result.player), 1200);
}
