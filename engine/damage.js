import { eff, pathSkillVal } from "./character.js";

export function calcPhysDmg(atk, def, power) {
  const reduction = def / (def + 120);        // 0→0%, 50→50%, 150→75%, never 100%
  const raw = atk * power * (1 - reduction * 0.8);
  return Math.max(Math.floor(atk * 0.05), Math.floor(raw)); // floor = 5% atk so always tickles
}

export function calcMagDmg(spr, mnd, power) {
  const reduction = mnd / (mnd + 120);
  const raw = spr * power * (1 - reduction * 0.8);
  return Math.max(Math.floor(spr * 0.05), Math.floor(raw));
}

export function calcChiDmg(mnd, def, power) {
  return calcPhysDmg(mnd, def, power);
}

export function calcVoidDmg(mnd, enemyMnd, power) {
  const reduction = (enemyMnd * 0.2) / (enemyMnd * 0.2 + 50);
  const raw = mnd * power * (1 - reduction * 0.8);
  return Math.max(Math.floor(mnd * 0.05), Math.floor(raw));
}

export function calcHeal(mnd) { return Math.floor(mnd * 1.6 + 12); }

export function effEnemyDef(enemy, player) {
  const stacks = enemy.witherStacks || 0;
  const amp = pathSkillVal(player, "wither_amp");
  return Math.max(0, Math.floor(enemy.def * (1 - stacks * (0.03 + amp * 0.01))));
}

export function calcPoisonDmg(player) {
  return Math.max(1, Math.round(eff(player, "spr") * 0.15 + eff(player, "atk") * 0.15 + player.maxHp * 0.01));
}

export function calcMoveDmg(move, player, enemy) {
  const wDef = effEnemyDef(enemy, player);
  const penDef = Math.floor(wDef * (1 - (move.defPen || 0)));
  const ss = move.scalesStat;
  let atkStat;
  if      (ss === "def")     atkStat = eff(player, "def");
  else if (ss === "agi")     atkStat = eff(player, "agi");
  else if (ss === "spr")     atkStat = eff(player, "spr");
  else if (ss === "atk")     atkStat = eff(player, "atk");
  else if (ss === "spr+mnd")     atkStat = Math.floor((eff(player, "spr") + eff(player, "mnd")) / 2);
  else if (ss === "atk+spr_avg") atkStat = Math.floor((eff(player, "atk") + eff(player, "spr")) / 2);
  else if (move.dmgType === "physical") atkStat = eff(player, "atk");
  else if (move.dmgType === "magical")  atkStat = eff(player, "spr");
  else                                   atkStat = eff(player, "mnd");
  if (move.dmgType === "mixed") {
    return Math.floor((eff(player, "atk") + eff(player, "spr")) * move.power);
  }
  if (move.dmgType === "chi")  return calcChiDmg(ss ? atkStat : eff(player, "mnd"), penDef, move.power);
  if (move.dmgType === "void") return calcVoidDmg(eff(player, "mnd"), enemy.mnd, move.power);
  if (move.dmgType === "physical") return calcPhysDmg(atkStat, penDef, move.power);
  return calcMagDmg(atkStat, enemy.mnd, move.power);
}

export function agiCheck(atkAgi, defAgi) {
  const crit  = Math.max(0.05, Math.min(0.50, (atkAgi - defAgi) * 0.008 + 0.15));
  const evade = Math.max(0.00, Math.min(0.35, (defAgi - atkAgi) * 0.008 + 0.05));
  return { crit, evade };
}
