import { getClass, PATHS_DATA } from "../gameData.js";

export function initPlayer(classKey) {
  const cls = getClass(classKey);
  return {
    classKey, level: 1, exp: 0, expToNext: 100, gold: 50, wins: 0,
    maxHp: 100, hp: 100, maxMana: 50, mana: 50,
    stats: { ...cls.stats },
    bonusFlat: { atk: 0, def: 0, spr: 0, mnd: 0, agi: 0 },
    bonusPct:  { atk: 0, def: 0, spr: 0, mnd: 0, agi: 0 },
    shopLevels:{ atk: 0, def: 0, spr: 0, mnd: 0, agi: 0 },
    shopLevelsT2:{ atk: 0, def: 0, spr: 0, mnd: 0, agi: 0 },
    shopLevelsT3:{ atk: 0, def: 0, spr: 0, mnd: 0, agi: 0 },
    shopTier:  { atk: 1, def: 1, spr: 1, mnd: 1, agi: 1 },
    statusEffects: [], passiveWins: 0, shield: 0,
    skillPoints: 0, skills: { xpBonus: 0, goldBonus: 0, statBonus: 0 },
    runStats: { dmgDealt: 0, dmgReceived: 0, dmgHealed: 0, killedBy: null },
    // Path & Journey
    pathKey: null, pathSkills: {},
    journeyExp: 0, journeyLevel: 0, journeyPoints: 0,
    harmonyBoosts: 0,
    // Per-combat (reset each fight)
    burnStacks: 0, soulStacks: 0, critStacks: 0,
    yinStacks: 0, yangStacks: 0,
    catalystConsumed: 0,
    moveCooldowns: {}, combatHealTotal: 0,
  };
}

export function eff(player, stat) {
  const base = player.stats[stat];
  const flat = player.bonusFlat[stat];
  const pct  = player.bonusPct[stat] + (player.skills?.statBonus || 0) * 5;
  // Yin/Yang temp bonuses (Duality path — reset each combat)
  const stackAmp = pathSkillVal(player, "stack_amp");
  let tempPct = 0;
  if (stat === "atk") tempPct += (player.yinStacks  || 0) * (2 + stackAmp);
  if (stat === "spr") tempPct += (player.yangStacks || 0) * (2 + stackAmp);
  return base + flat + Math.floor((base + flat) * (pct + tempPct) / 100);
}

export function skillXpMult(p)   { return 1 + (p.skills?.xpBonus   || 0) * 0.10; }

export function skillGoldMult(p) { return 1 + (p.skills?.goldBonus  || 0) * 0.10; }

export function getManaRegen(p)  { return Math.floor(10 + p.maxMana * 0.05); }

export function pathSkillVal(player, key) { return (player.pathSkills || {})[key] || 0; }

export function getPathDef(player) {
  if (!player.pathKey) return null;
  return (PATHS_DATA[player.classKey] || []).find(p => p.key === player.pathKey) || null;
}

export function getPlayerMoves(player) {
  const cls = getClass(player.classKey);
  const pathDef = getPathDef(player);
  if (!pathDef) return cls.moves;
  const moves = [...cls.moves];
  moves[0] = pathDef.newMoves[0];
  moves[1] = pathDef.newMoves[1];
  if (pathDef.grandDetonation) moves[3] = pathDef.grandDetonation;
  if (pathDef.healMove && pathDef.key !== "catalyst") moves[3] = pathDef.healMove;
  if (pathDef.key === "catalyst" && pathDef.healMove) {
    const bIdx = moves.findIndex(m => m.id === "bunker");
    if (bIdx >= 0) moves[bIdx] = pathDef.healMove;
  }
  const defIdx = moves.findIndex(m => m.id === pathDef.defMoveRename.renamedFrom);
  if (defIdx >= 0) moves[defIdx] = { ...moves[defIdx], id: pathDef.defMoveRename.id, name: pathDef.defMoveRename.name };
  return moves;
}

export function applyPath(player, pathKey) {
  const cls = getClass(player.classKey);
  return {
    ...player,
    pathKey,
    pathSkills: {},
    journeyExp: player.journeyExp || 0,
    journeyLevel: player.journeyLevel || 0,
    journeyPoints: player.journeyPoints || 0,
    combinedScaling: Math.ceil((player.combinedScaling || cls.baseScaling) * 1.5),
    pathHpScaling: (cls.hpScaling || 1) * 1.5,
    burnStacks: 0, soulStacks: 0, critStacks: 0,
    yinStacks: 0, yangStacks: 0,
    catalystConsumed: 0,
    harmonyBoosts: player.harmonyBoosts || 0,
    moveCooldowns: {}, combatHealTotal: 0,
    maxHp: player.maxHp + 100,
    hp: Math.min(player.hp + 100, player.maxHp + 100),
  };
}

export function serenityProc(player, healAmt, isRegen = false) {
  const hasMonk = player.classKey === "monk" || player.multiclassKey === "monk";
  if (!hasMonk || healAmt <= 0) return 0;
  const isGrandmaster = player.pathKey === "grandmaster" && player.classKey === "monk";
  const regenPct = isGrandmaster ? 0.75 + pathSkillVal(player, "eternal_flow_amp") * 0.03 : 0.50;
  const pct = isRegen ? regenPct : 0.20;
  return Math.floor(healAmt * pct);
}
