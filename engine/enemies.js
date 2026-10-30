import { ENEMY_POOL, BOSS_POOL } from "../gameData.js";

export function winMultiplier(wins) {
  let mult = 1, remaining = wins, segment = 0;
  while (remaining > 0) {
    const rate = 1.015 + 0.01 * segment;
    mult *= Math.pow(rate, Math.min(remaining, 25));
    remaining -= 25; segment++;
  }
  return mult;
}

export function scaleEnemy(template, wins, playerLevel = 1) {
  const winMult = winMultiplier(wins);
  const lvlMult = Math.pow(1.12, playerLevel - 1);
  const s = winMult * lvlMult;
  const earlyHpFactor = wins <= 25 ? (0.70 + 0.30 * wins / 25) : 1.0;
  const rewardMult = winMult * Math.pow(1.08, playerLevel - 1);
  return {
    name: template.name, icon: template.icon, isBoss: template.isBoss || false,
    maxHp: Math.floor(template.baseHp * s * earlyHpFactor), hp: Math.floor(template.baseHp * s * earlyHpFactor),
    atk: Math.floor(template.baseAtk * s), def: Math.floor(template.baseDef * s),
    spr: Math.floor(template.baseSpr * s), mnd: Math.floor(template.baseMnd * s),
    agi: Math.floor(template.baseAgi * s),
    reward: { gold: Math.floor(template.reward.gold * rewardMult), exp: Math.floor(template.reward.exp * rewardMult) },
    statusEffects: [], moves: template.moves, ult: template.ult || null, charging: false,
  };
}

export function spawnEnemy(wins, playerLevel = 1, random = Math.random) {
  if (wins > 0 && wins % 25 === 0) {
    const boss = BOSS_POOL[Math.floor(wins / 25 - 1) % BOSS_POOL.length];
    return scaleEnemy(boss, wins, playerLevel);
  }
  const pool = ENEMY_POOL.filter(e => !e.unlockWin || e.unlockWin <= wins);
  return scaleEnemy(pool[Math.floor(random() * pool.length)], wins, playerLevel);
}
