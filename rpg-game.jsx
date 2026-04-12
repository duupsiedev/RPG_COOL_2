import { useState, useEffect, useRef } from "react";
import {
  CLASSES, ENEMY_POOL, BOSS_POOL, SHOP_ITEMS, SKILLS_DEF,
  PATHS_DATA, JOURNEY_MAX_LEVEL, JOURNEY_EXP_TABLE,
  getClass, getMulticlassInfo, applyMulticlass,
} from "./gameData.js";

const SAVE_KEY = "realm_of_echoes_save_v1";

// ============================================================
// HELPERS
// ============================================================

function winMultiplier(wins) {
  let mult = 1, remaining = wins, segment = 0;
  while (remaining > 0) {
    const rate = 1.015 + 0.01 * segment;
    mult *= Math.pow(rate, Math.min(remaining, 25));
    remaining -= 25; segment++;
  }
  return mult;
}

function scaleEnemy(template, wins, playerLevel = 1) {
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

function spawnEnemy(wins, playerLevel = 1) {
  if (wins > 0 && wins % 25 === 0) {
    const boss = BOSS_POOL[Math.floor(wins / 25 - 1) % BOSS_POOL.length];
    return scaleEnemy(boss, wins, playerLevel);
  }
  const pool = ENEMY_POOL.filter(e => !e.unlockWin || e.unlockWin <= wins);
  return scaleEnemy(pool[Math.floor(Math.random() * pool.length)], wins, playerLevel);
}

function initPlayer(classKey) {
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

function eff(player, stat) {
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

function skillXpMult(p)   { return 1 + (p.skills?.xpBonus   || 0) * 0.10; }
function skillGoldMult(p) { return 1 + (p.skills?.goldBonus  || 0) * 0.10; }
function getManaRegen(p)  { return Math.floor(10 + p.maxMana * 0.05); }

// Defense uses soft diminishing returns: effective reduction = def / (def + 50) * atk
// This means high DEF still matters but never walls completely, and damage scales smoothly
function calcPhysDmg(atk, def, power) {
  const reduction = def / (def + 120);        // 0→0%, 50→50%, 150→75%, never 100%
  const raw = atk * power * (1 - reduction * 0.8);
  return Math.max(Math.floor(atk * 0.05), Math.floor(raw)); // floor = 5% atk so always tickles
}

function calcMagDmg(spr, mnd, power) {
  const reduction = mnd / (mnd + 120);
  const raw = spr * power * (1 - reduction * 0.8);
  return Math.max(Math.floor(spr * 0.05), Math.floor(raw));
}
// Chi: scales MND but hits physical DEF (Palm Strike)
function calcChiDmg(mnd, def, power) {
  return calcPhysDmg(mnd, def, power);
}
// Void: scales MND, bypasses 80% of magic resistance (Void Strike)
function calcVoidDmg(mnd, enemyMnd, power) {
  const reduction = (enemyMnd * 0.2) / (enemyMnd * 0.2 + 50);
  const raw = mnd * power * (1 - reduction * 0.8);
  return Math.max(Math.floor(mnd * 0.05), Math.floor(raw));
}
function calcHeal(mnd) { return Math.floor(mnd * 1.6 + 12); }

// ---- Path / Journey helpers ----
function pathSkillVal(player, key) { return (player.pathSkills || {})[key] || 0; }

function getPathDef(player) {
  if (!player.pathKey) return null;
  return (PATHS_DATA[player.classKey] || []).find(p => p.key === player.pathKey) || null;
}

function getPlayerMoves(player) {
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

// Effective enemy DEF reduced by Wither stacks
function effEnemyDef(enemy, player) {
  const stacks = enemy.witherStacks || 0;
  const amp = pathSkillVal(player, "wither_amp");
  return Math.max(0, Math.floor(enemy.def * (1 - stacks * (0.03 + amp * 0.01))));
}

// Poison tick damage formula
function calcPoisonDmg(player) {
  return Math.max(1, Math.round(eff(player, "spr") * 0.15 + eff(player, "atk") * 0.15 + player.maxHp * 0.01));
}

// Apply path to player (called when player picks a path)
function applyPath(player, pathKey) {
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

// Unified move damage calculator respecting scalesStat and defPen
function calcMoveDmg(move, player, enemy) {
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

// Serenity proc — updated for Grandmaster (75% regen instead of 50%)
function serenityProc(player, healAmt, isRegen = false) {
  const hasMonk = player.classKey === "monk" || player.multiclassKey === "monk";
  if (!hasMonk || healAmt <= 0) return 0;
  const isGrandmaster = player.pathKey === "grandmaster" && player.classKey === "monk";
  const regenPct = isGrandmaster ? 0.75 + pathSkillVal(player, "eternal_flow_amp") * 0.03 : 0.50;
  const pct = isRegen ? regenPct : 0.20;
  return Math.floor(healAmt * pct);
}

function agiCheck(atkAgi, defAgi) {
  const crit  = Math.max(0.05, Math.min(0.50, (atkAgi - defAgi) * 0.008 + 0.15));
  const evade = Math.max(0.00, Math.min(0.35, (defAgi - atkAgi) * 0.008 + 0.05));
  return { crit, evade };
}

function tickStatus(target) {
  const logs = []; let bleedHeal = 0; let regenHeal = 0; let totalDotDmg = 0;
  const effects = (target.statusEffects || []).map(e => {
    if (e.type === "burn") {
      totalDotDmg += e.dmg;
      logs.push(`🔥 Burn: ${e.dmg} dmg`);
      return { ...e, turns: e.turns - 1 };
    }
    if (e.type === "bleed") {
      totalDotDmg += e.dmg; bleedHeal += e.dmg;
      logs.push(`🩸 Bleed: ${e.dmg} dmg`);
      return { ...e, turns: e.turns - 1 };
    }
    if (e.type === "regen") {
      regenHeal += e.dmg;
      logs.push(`💚 Regen: +${e.dmg} HP`);
      return { ...e, turns: e.turns - 1 };
    }
    if (e.type === "poison") {
      // Toxicology: poison grows 10% per active turn (ageBonus accumulates)
      const aged = Math.max(1, Math.floor(e.dmg * (1 + (e.ageBonus || 0))));
      totalDotDmg += aged;
      logs.push(`🧪 Poison: ${aged} dmg`);
      return { ...e, turns: e.turns - 1, ageBonus: (e.ageBonus || 0) + 0.10 };
    }
    return e;
  }).filter(e => e.turns > 0);
  return { target: { ...target, hp: Math.max(0, target.hp - totalDotDmg), statusEffects: effects }, logs, bleedHeal, regenHeal };
}

function applyEffect(target, effect, dmg, opts = {}) {
  const effects = [...(target.statusEffects || [])];
  const turns = effect === "stun" ? 1 : effect === "curse" ? 3 : effect === "poison" ? (opts.duration || 4) : 3;
  const idx = effects.findIndex(e => e.type === effect);
  if (effect === "regen" && idx >= 0) {
    // Regen stacks turns, capped at 6
    const addTurns = opts.addTurns || 3;
    effects[idx] = { ...effects[idx], turns: Math.min(6, effects[idx].turns + addTurns), dmg };
  } else if (effect === "refresh_poison" && idx >= 0) {
    // Refresh poison duration but keep ageBonus (Toxicology)
    effects[idx] = { ...effects[idx], turns: opts.duration || 4 };
  } else if (idx >= 0) {
    effects[idx] = { ...effects[idx], turns, dmg };
  } else {
    const type = effect === "refresh_poison" ? "poison" : effect;
    effects.push({ type, turns, dmg });
  }
  return { ...target, statusEffects: effects };
}

// Save / Load
function saveGame(player) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(player)); } catch {}
}
function loadGame() {
  try { const d = localStorage.getItem(SAVE_KEY); return d ? JSON.parse(d) : null; } catch { return null; }
}
function deleteSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}
function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

// ============================================================
// UI COMPONENTS
// ============================================================

function Bar({ val, max, color, label }) {
  const pct = Math.max(0, Math.min(100, (val / max) * 100));
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888", marginBottom: 2 }}>
        <span>{label}</span><span style={{ color: "#bbb" }}>{val}/{max}</span>
      </div>
      <div style={{ height: 8, background: "#111", borderRadius: 4, overflow: "hidden", border: "1px solid #2a2a3a" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.35s ease", boxShadow: `0 0 5px ${color}88` }} />
      </div>
    </div>
  );
}

function Badge({ e }) {
  const c  = e.type === "burn" ? "#e74c3c" : e.type === "bleed" ? "#c0392b" : e.type === "regen" ? "#2ecc71" : "#f39c12";
  const ic = e.type === "burn" ? "🔥" : e.type === "bleed" ? "🩸" : e.type === "regen" ? "💚" : "💫";
  return (
    <span style={{ fontSize: 10, background: "#1a0a0a", border: `1px solid ${c}66`, borderRadius: 4, padding: "1px 5px", color: c, marginRight: 3 }}>
      {ic} {e.turns}t
    </span>
  );
}

function Log({ lines }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [lines]);
  return (
    <div ref={ref} style={{ height: 120, overflowY: "auto", background: "#080810", border: "1px solid #1e1e2e", borderRadius: 8, padding: "8px 10px", fontSize: 11.5, lineHeight: 1.75, color: "#bbb" }}>
      {lines.map((l, i) => (
        <div key={i} style={{ color:
          l.startsWith("💀") || l.startsWith("❌") ? "#e74c3c" :
          l.startsWith("✨") || l.startsWith("🎉") || l.startsWith("💚") ? "#2ecc71" :
          l.startsWith("🛡️") ? "#3498db" :
          l.startsWith("⚠️") || l.startsWith("💥") ? "#f97316" :
          "#bbb"
        }}>{l}</div>
      ))}
    </div>
  );
}

function MoveBtn({ move, player, onUse, disabled, isFree }) {
  const cd  = (player.moveCooldowns || {})[move.id] || 0;
  const ok  = (isFree || player.mana >= move.manaCost) && cd === 0;
  const col = { atk: "#c0392b", def: "#2980b9", heal: "#16a085", regen: "#e67e22", "heal+atk": "#16a085" }[move.type] || "#666";
  const [hover, setHover] = useState(false);
  const effectIcons = { burn:"🔥", bleed:"🩸", drain:"💜", stun:"💫", poison:"🧪", curse:"💀", burn_stack:"🔥", consume_burn:"💥", "poison+bleed":"🧪🩸" };
  return (
    <button onClick={() => onUse(move)} disabled={disabled || !ok}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: hover && ok && !disabled ? `${col}33` : ok ? `${col}15` : "#0d0d0d",
        border: `1px solid ${ok && !disabled ? col : "#222"}`,
        borderRadius: 8, padding: "8px 10px", cursor: ok && !disabled ? "pointer" : "not-allowed",
        color: ok ? "#ddd" : "#444", textAlign: "left", width: "100%", transition: "all 0.15s",
      }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 1, display: "flex", justifyContent: "space-between" }}>
        <span>{move.name}{move.hits ? ` ×${move.hits}` : ""}</span>
        {cd > 0 && <span style={{ color: "#f97316", fontSize: 11 }}>{cd}⏳</span>}
      </div>
      <div style={{ fontSize: 10, color: "#777" }}>{move.desc}</div>
      <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
        {(isFree || move.manaCost === 0) ? "Free" : `💧${move.manaCost}`} ·{move.dmgType === "physical" ? "⚔️" : move.dmgType === "magical" ? "✨" : move.dmgType === "chi" ? "☯️" : move.dmgType === "void" ? "🌀" : "💚"}
        {move.effect ? ` · ${effectIcons[move.effect] || ""}` : ""}
        {move.cooldown ? ` · CD:${move.cooldown}` : ""}
      </div>
    </button>
  );
}

function ClassCard({ cls, onSelect }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={() => onSelect(cls.key)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? `${cls.color}18` : "#0e0e18",
        border: `2px solid ${hover ? cls.color : cls.color + "44"}`,
        borderRadius: 12, padding: "16px 12px", cursor: "pointer", color: "#eee", textAlign: "center",
        transition: "all 0.2s", transform: hover ? "translateY(-3px)" : "",
        boxShadow: hover ? `0 6px 24px ${cls.color}33` : "none",
      }}>
      <div style={{ fontSize: 30, marginBottom: 6 }}>{cls.icon}</div>
      <div style={{ fontWeight: 800, fontSize: 14, color: cls.color, marginBottom: 8, letterSpacing: 1 }}>{cls.name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, fontSize: 10, marginBottom: 8 }}>
        {Object.entries(cls.stats).map(([s, v]) => (
          <div key={s} style={{ background: "#0a0a14", borderRadius: 3, padding: "2px 4px", color: "#888" }}>
            {s.toUpperCase()} <span style={{ color: "#ccc" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "#666", fontStyle: "italic" }}>{cls.passive.name}: {cls.passive.desc}</div>
    </button>
  );
}

// ============================================================
// SHOP SCREEN
// ============================================================

function ShopScreen({ player, setPlayer, setScreen }) {
  const [tab, setTab] = useState("shop");
  const sk = player.skills;
  const sp = player.skillPoints;
  const jp = player.journeyPoints || 0;
  const pathDef = getPathDef(player);

  function buyItem(item, tier) {
    const td  = tier === 3 ? item.t3 : tier === 2 ? item.t2 : item.t1;
    const lvlKey = tier === 3 ? "shopLevelsT3" : tier === 2 ? "shopLevelsT2" : "shopLevels";
    const lvl = (player[lvlKey] || {})[item.stat] || 0;
    const price = Math.floor(td.price * Math.pow(1.2, lvl));
    if (player.gold < price) return;
    const p = {
      ...player,
      bonusFlat: { ...player.bonusFlat },
      bonusPct:  { ...player.bonusPct },
      shopLevels:   { ...player.shopLevels },
      shopLevelsT2: { ...(player.shopLevelsT2 || { atk:0,def:0,spr:0,mnd:0,agi:0 }) },
      shopLevelsT3: { ...(player.shopLevelsT3 || { atk:0,def:0,spr:0,mnd:0,agi:0 }) },
      shopTier: { ...player.shopTier },
    };
    p.gold -= price;
    p.bonusFlat[item.stat] += td.flat;
    p.bonusPct[item.stat]  += td.pct;
    p[lvlKey][item.stat] += 1;
    p.shopTier[item.stat] = tier;
    setPlayer(p);
  }

  function investSkill(key, max) {
    if (sp <= 0 || (max !== null && sk[key] >= max)) return;
    setPlayer(p => ({ ...p, skillPoints: p.skillPoints - 1, skills: { ...p.skills, [key]: p.skills[key] + 1 } }));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#07070f", fontFamily: "Georgia, serif", color: "#eee", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#e8c070" }}>🏪 Hub</div>
            <div style={{ fontSize: 11, color: "#555" }}>Buy anytime · battle waits</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#e8c070", fontWeight: 700 }}>💰 {player.gold}g</div>
            {sp > 0 && <div style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700 }}>✨ {sp} skill point{sp > 1 ? "s" : ""}</div>}
            {jp > 0 && <div style={{ color: "#16a085", fontSize: 11, fontWeight: 700 }}>🌟 {jp} path point{jp > 1 ? "s" : ""}</div>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {["shop", "skills", ...(pathDef ? ["journey"] : [])].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 0", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer",
              background: tab === t ? "#1a1a2e" : "transparent",
              border: `1px solid ${tab === t ? "#e8c07066" : "#222"}`,
              color: tab === t ? "#e8c070" : "#555",
            }}>
              {t === "shop" ? "🏪 Shop" : t === "skills" ? `🌟 Skills${sp > 0 ? ` (${sp})` : ""}` : `🌿 Journey${jp > 0 ? ` (${jp})` : ""}`}
            </button>
          ))}
        </div>

        {tab === "shop" && (
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {SHOP_ITEMS.map(item => {
              const lvl1 = player.shopLevels[item.stat] || 0;
              const lvl2 = (player.shopLevelsT2 || {})[item.stat] || 0;
              const lvl3 = (player.shopLevelsT3 || {})[item.stat] || 0;
              const t1p = Math.floor(item.t1.price * Math.pow(1.2, lvl1));
              const t2p = Math.floor(item.t2.price * Math.pow(1.2, lvl2));
              const t3p = Math.floor(item.t3.price * Math.pow(1.2, lvl3));
              return (
                <div key={item.id} style={{ background: "#0e0e18", border: "1px solid #1e1e2e", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div style={{ fontSize: 20 }}>{item.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{item.name} <span style={{ color: "#555", fontSize: 10 }}>T1 Lv.{lvl1} · T2 Lv.{lvl2} · T3 Lv.{lvl3}</span></div>
                      <div style={{ fontSize: 10, color: "#666" }}>{item.stat.toUpperCase()} {eff(player, item.stat)} (+{player.bonusFlat[item.stat]} flat, +{player.bonusPct[item.stat]}%)</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[{ tier: 1, price: t1p, label: "T1 +1/+5%" }, { tier: 2, price: t2p, label: "T2 +5/+10%", gold: true }, { tier: 3, price: t3p, label: "T3 +15/+20%", gem: true }].map(({ tier, price, label, gold, gem }) => {
                      const can = player.gold >= price;
                      return (
                        <button key={tier} onClick={() => buyItem(item, tier)} disabled={!can} style={{
                          flex: 1, background: can ? (gem ? "#a78bfa11" : gold ? "#e8c07011" : "#ffffff11") : "#111",
                          border: `1px solid ${can ? (gem ? "#a78bfa" : gold ? "#e8c070" : "#aaa") : "#222"}`,
                          color: can ? (gem ? "#a78bfa" : gold ? "#e8c070" : "#ddd") : "#444",
                          borderRadius: 6, padding: "5px 0", cursor: can ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 700,
                        }}>{label} · {price}g</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "skills" && (
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>2 points per level up. Prodigy has no cap.</div>
            {SKILLS_DEF.map(skill => {
              const lvl = sk[skill.key];
              const atMax = skill.max !== null && lvl >= skill.max;
              const canBuy = sp > 0 && !atMax;
              return (
                <div key={skill.key} style={{ background: "#0e0e18", border: `1px solid ${skill.color}33`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 22 }}>{skill.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: skill.color }}>{skill.label} <span style={{ color: "#555", fontSize: 10 }}>Lv.{lvl}{skill.max ? `/${skill.max}` : ""}</span></div>
                      <div style={{ fontSize: 10, color: "#666" }}>{skill.desc}</div>
                      <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                        {skill.key === "statBonus" ? `+${lvl * 5}% all stats` : `+${lvl * 10}% ${skill.key === "xpBonus" ? "EXP" : "Gold"}`}
                      </div>
                    </div>
                    <button onClick={() => investSkill(skill.key, skill.max)} disabled={!canBuy} style={{
                      background: canBuy ? `${skill.color}22` : "#111", border: `1px solid ${canBuy ? skill.color : "#222"}`,
                      color: canBuy ? skill.color : "#444", borderRadius: 7, padding: "6px 12px",
                      cursor: canBuy ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                    }}>{atMax ? "MAX" : "Invest (1pt)"}</button>
                  </div>
                  {skill.max && (
                    <div style={{ marginTop: 8, height: 4, background: "#111", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(lvl / skill.max) * 100}%`, background: skill.color, borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ fontSize: 10, color: "#444", textAlign: "center", marginTop: 4 }}>
              Available: <span style={{ color: "#a78bfa", fontWeight: 700 }}>{sp} point{sp !== 1 ? "s" : ""}</span>
            </div>
          </div>
        )}

        {tab === "journey" && pathDef && (
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {/* Journey EXP bar */}
            <div style={{ background: "#0e0e18", border: "1px solid #16a08544", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", marginBottom: 6 }}>
                <span style={{ color: "#16a085", fontWeight: 700 }}>🌿 {pathDef.name} — Journey Lv.{player.journeyLevel || 0}/{JOURNEY_MAX_LEVEL}</span>
                <span style={{ color: "#555" }}>{jp} point{jp !== 1 ? "s" : ""} available</span>
              </div>
              {(player.journeyLevel || 0) < JOURNEY_MAX_LEVEL && (
                <div style={{ height: 6, background: "#111", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3, background: "#16a085", transition: "width 0.3s",
                    width: `${Math.max(0, Math.min(100, ((player.journeyExp||0) - JOURNEY_EXP_TABLE[player.journeyLevel||0]) / (JOURNEY_EXP_TABLE[(player.journeyLevel||0)+1] - JOURNEY_EXP_TABLE[player.journeyLevel||0]) * 100))}%`
                  }} />
                </div>
              )}
              <div style={{ fontSize: 10, color: "#444", marginTop: 4 }}>
                {(player.journeyLevel || 0) < JOURNEY_MAX_LEVEL
                  ? `${player.journeyExp || 0} / ${JOURNEY_EXP_TABLE[(player.journeyLevel||0)+1]} EXP`
                  : "MAX LEVEL"}
              </div>
            </div>

            {/* Path skills */}
            <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>Path Skills · 1 point per rank (or listed cost for special skills)</div>
            {pathDef.pathSkills.map(skill => {
              const invested = pathSkillVal(player, skill.key);
              const atMax    = invested >= skill.max;
              const canBuy   = jp >= skill.cost && !atMax;
              return (
                <div key={skill.key} style={{ background: "#0e0e18", border: "1px solid #16a08533", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#16a085" }}>
                        {skill.label} <span style={{ color: "#555", fontSize: 10 }}>Lv.{invested}/{skill.max}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#666" }}>{skill.desc}</div>
                    </div>
                    <button
                      onClick={() => {
                        if (!canBuy) return;
                        setPlayer(prev => ({
                          ...prev,
                          journeyPoints: (prev.journeyPoints || 0) - skill.cost,
                          pathSkills: { ...(prev.pathSkills || {}), [skill.key]: invested + 1 },
                        }));
                      }}
                      disabled={!canBuy}
                      style={{
                        background: canBuy ? "#16a08522" : "#111", border: `1px solid ${canBuy ? "#16a085" : "#222"}`,
                        color: canBuy ? "#16a085" : "#444", borderRadius: 7, padding: "6px 10px",
                        cursor: canBuy ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                      }}>
                      {atMax ? "MAX" : `Invest (${skill.cost}pt)`}
                    </button>
                  </div>
                  {skill.max > 1 && (
                    <div style={{ marginTop: 8, height: 4, background: "#111", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(invested / skill.max) * 100}%`, background: "#16a085", borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button onClick={() => setScreen("combat")} style={{ width: "100%", padding: 12, background: "#27ae6022", border: "2px solid #27ae60", borderRadius: 10, color: "#27ae60", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          ← Back to Battle
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MAIN MENU
// ============================================================

function MainMenu({ onNewGame, onContinue, onDeleteSave, saveExists, saveInfo }) {
  return (
    <div style={{
      minHeight: "100vh", background: "#07070f", fontFamily: "Georgia, serif", color: "#eee",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "30px 16px",
    }}>
      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>⚔️</div>
        <h1 style={{ margin: 0, fontSize: 32, color: "#e8c070", letterSpacing: 5, textTransform: "uppercase", fontWeight: 900 }}>
          Realm of Echoes
        </h1>
        <p style={{ color: "#444", fontSize: 12, marginTop: 10, letterSpacing: 2 }}>
          face the endless dungeon
        </p>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 300 }}>
        {saveExists && (
          <button onClick={onContinue} style={{
            padding: "14px 0", background: "#e8c07022", border: "2px solid #e8c070",
            borderRadius: 12, color: "#e8c070", fontSize: 16, fontWeight: 800, cursor: "pointer",
            letterSpacing: 1,
          }}>
            ▶ Continue
            {saveInfo && <div style={{ fontSize: 10, fontWeight: 400, color: "#a88", marginTop: 3 }}>
              {saveInfo.className} · Lv.{saveInfo.level} · {saveInfo.wins} wins
            </div>}
          </button>
        )}

        <button onClick={onNewGame} style={{
          padding: "14px 0", background: saveExists ? "transparent" : "#e8c07022",
          border: `2px solid ${saveExists ? "#444" : "#e8c070"}`,
          borderRadius: 12, color: saveExists ? "#666" : "#e8c070",
          fontSize: 16, fontWeight: 800, cursor: "pointer", letterSpacing: 1,
        }}>
          {saveExists ? "⚔ New Game" : "▶ New Game"}
        </button>

        {saveExists && (
          <button onClick={onDeleteSave} style={{
            padding: "8px 0", background: "transparent", border: "1px solid #2a1a1a",
            borderRadius: 8, color: "#3a2020", fontSize: 11, cursor: "pointer",
          }}>
            🗑 Delete Save
          </button>
        )}
      </div>

      <div style={{ marginTop: 48, fontSize: 10, color: "#222", letterSpacing: 2 }}>
        HOW FAR CAN YOU GO?
      </div>
    </div>
  );
}

// ============================================================
// CLASS SELECT
// ============================================================

function ClassSelect({ onSelect }) {
  return (
    <div style={{ minHeight: "100vh", background: "#07070f", fontFamily: "Georgia, serif", color: "#eee", display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 16px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 40, marginBottom: 6 }}>⚔️</div>
        <h1 style={{ margin: 0, fontSize: 24, color: "#e8c070", letterSpacing: 4, textTransform: "uppercase", fontWeight: 900 }}>Choose Your Class</h1>
        <p style={{ color: "#555", fontSize: 12, marginTop: 6, letterSpacing: 1 }}>Your path begins here.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, maxWidth: 680, width: "100%" }}>
        {CLASSES.map(cls => <ClassCard key={cls.key} cls={cls} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

// ============================================================
// MULTICLASS SCREEN
// ============================================================

function MulticlassScreen({ player, onSelect }) {
  const [hovered, setHovered] = useState(null);
  const baseCls = getClass(player.classKey);

  return (
    <div style={{ minHeight: "100vh", background: "#07070f", fontFamily: "Georgia, serif", color: "#eee", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px" }}>
      <div style={{ maxWidth: 680, width: "100%", textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: "#a78bfa", letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>First Boss Defeated</div>
        <h1 style={{ margin: 0, fontSize: 26, color: "#e8c070", letterSpacing: 3, textTransform: "uppercase", fontWeight: 900 }}>Choose Your Path</h1>
        <p style={{ color: "#555", fontSize: 12, marginTop: 8 }}>
          Multiclass with another class — or specialize by choosing <span style={{ color: baseCls.color }}>{baseCls.name}</span> again.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, maxWidth: 680, width: "100%" }}>
        {CLASSES.map(cls => {
          const isSpec = cls.key === player.classKey;
          const info = getMulticlassInfo(player.classKey, cls.key);
          const isHov = hovered === cls.key;

          return (
            <button key={cls.key}
              onClick={() => onSelect(cls.key)}
              onMouseEnter={() => setHovered(cls.key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                background: isHov ? `${cls.color}18` : "#0e0e18",
                border: `2px solid ${isHov ? cls.color : isSpec ? `${cls.color}88` : `${cls.color}33`}`,
                borderRadius: 12, padding: "16px 12px", cursor: "pointer", color: "#eee", textAlign: "center",
                transition: "all 0.2s", transform: isHov ? "translateY(-3px)" : "",
                boxShadow: isHov ? `0 6px 24px ${cls.color}33` : "none",
              }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>{info.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: cls.color, marginBottom: 2 }}>{info.name}</div>
              <div style={{ fontSize: 10, color: "#555", marginBottom: 8 }}>
                {isSpec ? `${baseCls.icon} ${baseCls.name} ×2` : `${baseCls.icon} + ${cls.icon}`}
              </div>
              <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>
                {isSpec
                  ? <span style={{ color: "#a78bfa" }}>Scaling ×2 · Passive ×2</span>
                  : <span style={{ color: "#a78bfa" }}>+{cls.baseScaling} scaling · +passive</span>
                }
              </div>
              <div style={{ fontSize: 10, color: "#666", fontStyle: "italic", borderTop: "1px solid #1a1a2e", paddingTop: 6, marginTop: 4 }}>
                {isSpec
                  ? <><div>{baseCls.passive.name} (doubled)</div><div style={{ color: "#444", marginTop: 3 }}>{baseCls.passive.desc}</div></>
                  : <><div>+ {cls.passive.name}</div><div style={{ color: "#444", marginTop: 3 }}>{cls.passive.desc}</div></>
                }
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: "#333", textAlign: "center" }}>
        Your base class moves are kept · Stats and scaling improve immediately
      </div>
    </div>
  );
}

// ============================================================
// PATH SELECT SCREEN
// ============================================================

function PathSelect({ player, onSelect }) {
  const [hovered, setHovered] = useState(null);
  const paths = PATHS_DATA[player.classKey] || [];

  return (
    <div style={{ minHeight: "100vh", background: "#07070f", fontFamily: "Georgia, serif", color: "#eee", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px" }}>
      <div style={{ maxWidth: 700, width: "100%", textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: "#e8c070", letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>2nd Boss Defeated · Win 50</div>
        <h1 style={{ margin: 0, fontSize: 26, color: "#a78bfa", letterSpacing: 3, textTransform: "uppercase", fontWeight: 900 }}>Choose Your Path</h1>
        <p style={{ color: "#555", fontSize: 12, marginTop: 8 }}>
          Your path replaces your first two moves and passive. Scaling and HP scaling increase by 50%. Unlocks the Journey tab.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, maxWidth: 700, width: "100%" }}>
        {paths.map(path => {
          const isHov = hovered === path.key;
          return (
            <button key={path.key}
              onClick={() => onSelect(path.key)}
              onMouseEnter={() => setHovered(path.key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                background: isHov ? "#1a1a2e" : "#0e0e18",
                border: `2px solid ${isHov ? "#a78bfa" : "#a78bfa44"}`,
                borderRadius: 14, padding: "18px 16px", cursor: "pointer", color: "#eee", textAlign: "left",
                transition: "all 0.2s", transform: isHov ? "translateY(-3px)" : "",
                boxShadow: isHov ? "0 6px 24px #a78bfa33" : "none",
              }}>
              <div style={{ fontWeight: 900, fontSize: 16, color: "#a78bfa", marginBottom: 4 }}>{path.name}</div>
              <div style={{ fontSize: 11, color: "#e8c070", marginBottom: 10, fontStyle: "italic" }}>
                ✨ {path.passive.name} — {path.passive.desc}
              </div>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>New Moves</div>
              {path.newMoves.map(m => (
                <div key={m.id} style={{ background: "#080810", border: "1px solid #1e1e2e", borderRadius: 6, padding: "5px 8px", marginBottom: 5, fontSize: 10 }}>
                  <span style={{ color: "#ddd", fontWeight: 700 }}>{m.name}</span>
                  <span style={{ color: "#555", marginLeft: 6 }}>{m.desc}</span>
                </div>
              ))}
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1, margin: "10px 0 6px" }}>Path Skills</div>
              {path.pathSkills.map(sk => (
                <div key={sk.key} style={{ fontSize: 10, color: "#777", marginBottom: 3 }}>
                  <span style={{ color: "#a78bfa" }}>{sk.label}</span>
                  <span style={{ color: "#444", marginLeft: 4 }}>· {sk.desc}</span>
                </div>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// RUN SUMMARY
// ============================================================

function RunSummary({ player, enemy, onMenu }) {
  const cls = getClass(player.classKey);
  const rs = player.runStats || {};
  const className = player.multiclassName || cls.name;
  const classIcon = player.multiclassIcon || cls.icon;

  return (
    <div style={{ minHeight: "100vh", background: "#07070f", fontFamily: "Georgia, serif", color: "#eee", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💀</div>
          <h1 style={{ margin: 0, fontSize: 22, color: "#e74c3c", letterSpacing: 3, textTransform: "uppercase", fontWeight: 900 }}>Defeated</h1>
          <div style={{ color: "#555", fontSize: 12, marginTop: 6 }}>
            {classIcon} {className} · Level {player.level} · {player.wins} wins
          </div>
        </div>

        {/* Killed by */}
        {rs.killedBy && (
          <div style={{ background: "#1a0808", border: "1px solid #c0392b44", borderRadius: 10, padding: "10px 14px", marginBottom: 12, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>Killed by</div>
            <div style={{ fontWeight: 800, color: "#e74c3c", fontSize: 15 }}>{rs.killedBy}</div>
            <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>on win {player.wins}</div>
          </div>
        )}

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Damage Dealt",    value: (rs.dmgDealt    || 0).toLocaleString(), color: "#e74c3c", icon: "⚔️" },
            { label: "Damage Received", value: (rs.dmgReceived || 0).toLocaleString(), color: "#f97316", icon: "🛡️" },
            { label: "Healing Done",    value: (rs.dmgHealed   || 0).toLocaleString(), color: "#2ecc71", icon: "💚" },
          ].map(s => (
            <div key={s.label} style={{ background: "#0e0e18", border: `1px solid ${s.color}33`, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: "#555", marginTop: 3, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Final stats */}
        <div style={{ background: "#0e0e18", border: "1px solid #1e1e2e", borderRadius: 10, padding: "10px 14px", marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Final Stats</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11 }}>
            {["atk","def","spr","mnd","agi"].map(s => (
              <span key={s} style={{ color: "#777" }}>{s.toUpperCase()} <span style={{ color: "#aaa", fontWeight: 700 }}>{eff(player, s)}</span></span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11, color: "#555" }}>
            <span>💰 {player.gold}g earned</span>
          </div>
        </div>

        <button onClick={onMenu} style={{ width: "100%", padding: 14, background: "#c0392b22", border: "2px solid #c0392b", borderRadius: 10, color: "#c0392b", fontSize: 15, fontWeight: 800, cursor: "pointer", letterSpacing: 1 }}>
          ↩ Main Menu
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MAIN GAME COMPONENT
// ============================================================

export default function RPGGame() {
  const [screen, setScreen]         = useState("menu");
  const [player, setPlayer]         = useState(null);
  const [enemy, setEnemy]           = useState(null);
  const [log, setLog]               = useState([]);
  const [playerTurn, setPlayerTurn] = useState(true);
  const [phase, setPhase]           = useState("active");
  const [busy, setBusy]             = useState(false);
  const [lastReward, setLastReward] = useState(null);
  const [runSummary, setRunSummary] = useState(null);
  const [floatingNums, setFloatingNums] = useState([]);
  const [shakePlayer, setShakePlayer]   = useState(false);
  const [shakeEnemy, setShakeEnemy]     = useState(false);
  const floatIdRef = useRef(0);

  // Auto-save whenever player state changes — never save a dead player
  useEffect(() => { if (player && player.hp > 0) saveGame(player); }, [player]);

  const saveExists = hasSave();
  const rawSave    = loadGame();
  const saveInfo = rawSave ? {
    className: rawSave.multiclassName || getClass(rawSave.classKey)?.name,
    level: rawSave.level, wins: rawSave.wins
  } : null;

  function spawnFloat(value, color, target) {
    const id   = floatIdRef.current++;
    const left = 20 + Math.floor(Math.random() * 60);
    setFloatingNums(prev => [...prev, { id, value, color, target, left }]);
    setTimeout(() => setFloatingNums(prev => prev.filter(n => n.id !== id)), 1000);
  }

  function triggerShake(target) {
    if (target === "player") { setShakePlayer(true); setTimeout(() => setShakePlayer(false), 400); }
    else                     { setShakeEnemy(true);  setTimeout(() => setShakeEnemy(false),  400); }
  }

  function addLog(...msgs) { setLog(prev => [...prev.slice(-80), ...msgs]); }

  function beginCombat(p) {
    // Show multiclass screen after first boss (win 25) if not yet multiclassed
    if (p.wins === 25 && !p.multiclassKey) {
      setScreen("multiclass");
      return;
    }
    // Show path select after 2nd boss (win 50) if not yet chosen
    if (p.wins === 50 && !p.pathKey) {
      setScreen("path_select");
      return;
    }
    // Reset per-combat state
    p = {
      ...p,
      burnStacks: 0, soulStacks: 0, critStacks: 0,
      yinStacks: 0, yangStacks: 0,
      catalystConsumed: 0,
      moveCooldowns: {}, combatHealTotal: 0,
      transcendenceThisTurn: false,
    };
    const isBoss = p.wins > 0 && p.wins % 25 === 0;
    if (isBoss) {
      p = { ...p, hp: p.maxHp, mana: p.maxMana };
    }
    const e = spawnEnemy(p.wins, p.level);
    setEnemy(e); setLog([]); setPhase("active");
    setPlayerTurn(true); setScreen("combat"); setBusy(false);
    setPlayer(p);
    if (isBoss) {
      addLog(`✨ You feel your strength return. HP and MP fully restored!`);
      addLog(`⚠️ BOSS — ${e.icon} ${e.name} approaches!`);
    } else {
      addLog(`${e.icon} ${e.name} appears!`);
    }
  }

  function handleNewGame() { setScreen("class_select"); }

  function handleContinue() {
    const saved = loadGame();
    if (!saved) return;
    setPlayer(saved);
    beginCombat(saved);
  }

  function handleDeleteSave() {
    if (window.confirm("Delete your save? This cannot be undone.")) {
      deleteSave();
      setScreen("menu");
    }
  }

  function handleClassSelect(classKey) {
    const p = initPlayer(classKey);
    setPlayer(p);
    beginCombat(p);
  }

  function handleMulticlass(secondClassKey) {
    const p = applyMulticlass(player, secondClassKey);
    setPlayer(p);
    beginCombat(p);
  }

  function handlePath(pathKey) {
    const p = applyPath(player, pathKey);
    setPlayer(p);
    beginCombat(p);
  }

  function handleMove(move) {
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
      if (Math.random() < ac.evade) {
        logs.push(`💨 ${e.name} evaded!`);
      } else {
        // Determine crit
        const critChanceBonus = pathSkillVal(p, "crit_chance_amp") * 0.02;
        const critMultBonus   = pathSkillVal(p, "crit_mult_amp") * 0.05;
        const critStackBonus  = (p.critStacks || 0) * 0.20;
        const forceCrit = move.effect === "consume_crit_stack" && (p.critStacks || 0) > 0;
        const crit = forceCrit || Math.random() < (ac.crit + critChanceBonus);
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
          const hitCrit = move.id === "flurry" ? Math.random() < (ac.crit + critChanceBonus) : crit;
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
        if (move.effect === "stun" && Math.random() < 0.4) {
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
          if (Math.random() < multicastChance) {
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
      const gold = Math.floor(e.reward.gold * skillGoldMult(p));
      const exp  = Math.floor(e.reward.exp  * skillXpMult(p));
      p.gold += gold; p.exp += exp; p.wins += 1;
      p.maxHp += 10;
      if (p.wins % 25 === 0) p.maxHp += 100;
      logs.push(`💀 ${e.name} defeated! +${exp} EXP +${gold} Gold`);

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
            const s = stats[Math.floor(Math.random() * stats.length)];
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

      // atk_to_def / atk_to_spr conversion (Commander / Radiant Knight path skills)
      // These are permanent ratios — applied via effective stat, no base mutation needed.
      // (Handled in eff() would require a different approach; instead, we can treat them
      //  as bonus conversions applied once and stored in bonusFlat.)
      // The simplest approach: each point converts 5% of base ATK to DEF/SPR at win time.
      // (Once-time application is wrong; instead handle in eff() as a pct override.)
      // → Handled in eff() as a computed bonus already via pathSkillVal.

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
      addLog(...logs);
      setLastReward({ gold, exp });
      setTimeout(() => setLastReward(null), 1800);
      setPlayer(p); setEnemy(e); setPhase("victory"); setBusy(false);
      setTimeout(() => beginCombat(p), 1200);
      return;
    }

    addLog(...logs);
    setPlayer(p); setEnemy(e);
    setPlayerTurn(false);

    // Enemy turn
    setTimeout(() => {
      let p2 = { ...p, statusEffects: [...(p.statusEffects || [])], stats: { ...p.stats }, runStats: { ...(p.runStats || {})} };
      let e2 = { ...e, statusEffects: [...(e.statusEffects || [])] };
      const eLogs = [];

      // Full win sequence — passives, journey EXP, level-up, then victory transition.
      // Used by all enemy-turn death checks so none of them skip rewards.
      function awardKill(note = "") {
        const gold = Math.floor(e2.reward.gold * skillGoldMult(p2));
        const exp  = Math.floor(e2.reward.exp  * skillXpMult(p2));
        p2.gold += gold; p2.exp += exp; p2.wins += 1;
        p2.maxHp += 10;
        if (p2.wins % 25 === 0) p2.maxHp += 100;
        eLogs.push(`💀 ${e2.name} defeated${note}! +${exp} EXP +${gold} Gold`);
        // Passives on kill
        const passiveKeys = p2.isSpecialized ? [p2.classKey] : [p2.classKey, p2.multiclassKey].filter(Boolean);
        const isSpec = p2.isSpecialized;
        for (const pk of passiveKeys) {
          if (pk === "druid") {
            const isDruidBase = pk === p2.classKey;
            const hasHarmony = isDruidBase && p2.pathKey === "archdruid";
            const rolls = isSpec && isDruidBase ? 2 : 1;
            const numRolls = hasHarmony ? rolls * 2 : rolls;
            const stats = ["atk","def","spr","mnd","agi"];
            for (let i = 0; i < numRolls; i++) {
              const s = stats[Math.floor(Math.random() * stats.length)];
              p2.bonusFlat = { ...p2.bonusFlat, [s]: (p2.bonusFlat[s] || 0) + 1 };
              if (hasHarmony) { p2.harmonyBoosts = (p2.harmonyBoosts || 0) + 1; eLogs.push(`🌙 Harmony: +1 ${s.toUpperCase()}! (${p2.harmonyBoosts} total)`); }
              else { eLogs.push(`🌿 Nature: +1 ${s.toUpperCase()}!`); }
            }
          }
          if (pk === "mage") {
            const isMageBase = pk === p2.classKey;
            const hasUltKnowledge = isMageBase && p2.pathKey === "archmage";
            if (hasUltKnowledge) {
              const gains = isSpec ? 2 : 1;
              p2.bonusFlat = { ...p2.bonusFlat, mnd: (p2.bonusFlat.mnd || 0) + gains };
              eLogs.push(`📚 Ultimate Knowledge: +${gains} MND!`);
            } else {
              const isSecond = !isSpec && pk === p2.multiclassKey;
              const tracker = isSecond ? "passiveWins2" : "passiveWins";
              p2[tracker] = (p2[tracker] || 0) + 1;
              const threshold = isSpec ? 3 : 5;
              if (p2[tracker] % threshold === 0) { p2.bonusFlat = { ...p2.bonusFlat, spr: (p2.bonusFlat.spr || 0) + 1 }; eLogs.push(`🔮 Knowledge: +1 SPR!`); }
            }
          }
        }
        // Journey EXP
        if (p2.pathKey) {
          const jExp = Math.floor(e2.reward.exp * skillXpMult(p2));
          p2.journeyExp = (p2.journeyExp || 0) + jExp;
          while ((p2.journeyLevel || 0) < JOURNEY_MAX_LEVEL && p2.journeyExp >= JOURNEY_EXP_TABLE[(p2.journeyLevel || 0) + 1]) {
            p2.journeyLevel = (p2.journeyLevel || 0) + 1;
            p2.journeyPoints = (p2.journeyPoints || 0) + 1;
            eLogs.push(`🌟 Journey Level ${p2.journeyLevel}! +1 Path Skill Point`);
          }
        }
        // Level up
        while (p2.exp >= p2.expToNext) {
          p2.exp -= p2.expToNext; p2.level += 1;
          p2.expToNext = Math.floor(p2.expToNext * 1.30);
          const baseStats = getClass(p2.classKey).stats;
          const secondStats = p2.multiclassKey ? getClass(p2.multiclassKey).stats : null;
          const scalingMult = p2.combinedScaling ? p2.combinedScaling / getClass(p2.classKey).baseScaling : 1;
          const ns = { ...p2.stats };
          const desc = [];
          Object.keys(ns).forEach(s => {
            const blendedBase = secondStats ? (baseStats[s] + secondStats[s]) / 2 : baseStats[s];
            const g = Math.ceil(blendedBase * Math.pow(1.08, p2.level - 1) * scalingMult);
            ns[s] += g; desc.push(`${s.toUpperCase()}+${g}`);
          });
          p2.stats = ns;
          const hpScaling = p2.pathHpScaling || getClass(p2.classKey).hpScaling || 1;
          const hpGain = Math.floor(20 * hpScaling);
          p2.maxHp += hpGain; p2.hp = Math.min(p2.maxHp, p2.hp + Math.floor(p2.maxHp * 0.5));
          p2.skillPoints = (p2.skillPoints || 0) + 2;
          eLogs.push(`🎉 LEVEL UP → ${p2.level}! ${desc.join(" ")} +2 SP`);
        }
        p2.mana = Math.min(p2.maxMana, p2.mana + getManaRegen(p2));
        addLog(...eLogs);
        setLastReward({ gold, exp });
        setTimeout(() => setLastReward(null), 1800);
        setPlayer(p2); setEnemy(e2); setPhase("victory"); setBusy(false);
        setTimeout(() => beginCombat(p2), 1200);
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
              if (Math.random() < ac.evade * (mv.isUlt ? 0.4 : 1)) {
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
              const crit = Math.random() < ac.crit;
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
            } else if (hasUlt && Math.random() < 0.25) {
              e2 = { ...e2, charging: true };
              eLogs.push(`⚠️ ${e2.name} is charging ${e2.ult.name}!`);
            } else {
              const mv = e2.moves[Math.floor(Math.random() * e2.moves.length)];
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
    }, 900);
  }

  // ---- SCREENS ----

  if (screen === "menu") {
    return <MainMenu onNewGame={handleNewGame} onContinue={handleContinue} onDeleteSave={handleDeleteSave} saveExists={saveExists} saveInfo={saveInfo} />;
  }

  if (screen === "class_select") {
    return <ClassSelect onSelect={handleClassSelect} />;
  }

  if (screen === "multiclass") {
    return <MulticlassScreen player={player} onSelect={handleMulticlass} />;
  }

  if (screen === "path_select") {
    return <PathSelect player={player} onSelect={handlePath} />;
  }

  if (runSummary) {
    return <RunSummary player={runSummary.player} enemy={runSummary.enemy} onMenu={() => { setRunSummary(null); setScreen("menu"); }} />;
  }

  if (screen === "shop") {
    return <ShopScreen player={player} setPlayer={setPlayer} setScreen={setScreen} />;
  }

  if (screen === "combat" && player && enemy) {
    const cls = getClass(player.classKey);
    return (
      <div style={{ minHeight: "100vh", background: "#07070f", fontFamily: "Georgia, serif", color: "#eee", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px" }}>
        <style>{`
          @keyframes rewardPop {
            0%   { opacity:0; transform:translate(-50%,-30%); }
            15%  { opacity:1; transform:translate(-50%,-50%); }
            70%  { opacity:1; transform:translate(-50%,-50%); }
            100% { opacity:0; transform:translate(-50%,-70%); }
          }
          @keyframes floatUp {
            0%   { opacity:0; transform:translateY(0) scale(0.8); }
            15%  { opacity:1; transform:translateY(-6px) scale(1.15); }
            80%  { opacity:1; transform:translateY(-22px) scale(1); }
            100% { opacity:0; transform:translateY(-32px) scale(0.9); }
          }
          @keyframes shakeX {
            0%,100% { transform:translateX(0); }
            20%     { transform:translateX(-6px); }
            40%     { transform:translateX(6px); }
            60%     { transform:translateX(-4px); }
            80%     { transform:translateX(4px); }
          }
          @keyframes pulse {
            from { opacity:0.7; }
            to   { opacity:1; box-shadow:0 0 8px #f97316; }
          }
        `}</style>

        <div style={{ maxWidth: 520, width: "100%" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, fontSize: 11, color: "#555" }}>
            <span>
              {player.multiclassName
                ? <span style={{ color: "#a78bfa" }}>{player.multiclassIcon} {player.multiclassName}</span>
                : `${cls.icon} ${cls.name}`
              } · Lv.{player.level} · 🏆 {player.wins} wins
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#e8c070" }}>💰 {player.gold}g</span>
              <button onClick={() => setScreen("shop")} style={{ background: "#e8c07018", border: "1px solid #e8c07066", borderRadius: 6, color: "#e8c070", padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                🏪{player.skillPoints > 0 ? ` ✨${player.skillPoints}` : ""}
              </button>
            </div>
          </div>

          {/* Player card */}
          <div style={{ position: "relative", marginBottom: 8 }}>
            <div style={{ background: "#0e0e18", border: `1px solid ${cls.color}44`, borderRadius: 12, padding: "12px 14px", animation: shakePlayer ? "shakeX 0.4s ease" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 800, color: player.multiclassName ? "#a78bfa" : cls.color, fontSize: 14 }}>
                    {player.multiclassIcon || cls.icon} {player.multiclassName || cls.name}
                  </span>
                  <div style={{ fontSize: 9, color: "#555", marginTop: 2 }}>
                    {(() => {
                      const pathDef2 = getPathDef(player);
                      const basePassiveName = pathDef2 ? pathDef2.passive.name : cls.passive.name;
                      if (player.multiclassKey) {
                        const multiPassive = getClass(player.multiclassKey).passive.name;
                        return player.isSpecialized
                          ? `${basePassiveName} ×2`
                          : `${basePassiveName} · ${multiPassive}`;
                      }
                      return basePassiveName;
                    })()}
                    {player.pathKey && <span style={{ color: "#a78bfa", marginLeft: 4 }}>· {getPathDef(player)?.name}</span>}
                  </div>
                </div>
                <div>{(player.statusEffects||[]).map((e,i) => <Badge key={i} e={e} />)}</div>
              </div>
              <Bar val={player.hp}   max={player.maxHp}   color="#e74c3c" label="HP" />
              <Bar val={player.mana} max={player.maxMana} color="#3498db" label="MP" />
              <Bar val={player.exp}  max={player.expToNext} color="#e8c070" label="EXP" />
              {player.pathKey && (player.journeyLevel||0) < JOURNEY_MAX_LEVEL && (
                <Bar
                  val={(player.journeyExp||0) - JOURNEY_EXP_TABLE[player.journeyLevel||0]}
                  max={JOURNEY_EXP_TABLE[(player.journeyLevel||0)+1] - JOURNEY_EXP_TABLE[player.journeyLevel||0]}
                  color="#16a085"
                  label={`Journey Lv.${player.journeyLevel||0}`}
                />
              )}
              <div style={{ display: "flex", gap: 10, fontSize: 10, color: "#555", marginTop: 5, flexWrap: "wrap" }}>
                {["atk","def","spr","mnd","agi"].map(s => (
                  <span key={s} style={{ color: "#777" }}>{s.toUpperCase()} <span style={{ color: "#aaa" }}>{eff(player,s)}</span></span>
                ))}
                {(player.shield||0)      > 0 && <span style={{ color: "#3498db" }}>🛡️{player.shield}</span>}
                {(player.burnStacks||0)  > 0 && <span style={{ color: "#e67e22" }}>🔥×{player.burnStacks}</span>}
                {(player.soulStacks||0)  > 0 && <span style={{ color: "#9b59b6" }}>💜×{player.soulStacks}</span>}
                {(player.critStacks||0)  > 0 && <span style={{ color: "#e74c3c" }}>🎯×{player.critStacks}</span>}
                {(player.yinStacks||0)   > 0 && <span style={{ color: "#3498db" }}>☯️Y×{player.yinStacks}</span>}
                {(player.yangStacks||0)  > 0 && <span style={{ color: "#f39c12" }}>☯️G×{player.yangStacks}</span>}
                {(enemy?.witherStacks||0)> 0 && <span style={{ color: "#27ae60" }}>🌿W×{enemy.witherStacks}</span>}
              </div>
            </div>
            {floatingNums.filter(n => n.target === "player").map(n => (
              <div key={n.id} style={{ position: "absolute", top: "30%", left: `${n.left}%`, color: n.color, fontWeight: 900, fontSize: n.value.startsWith("+") ? 16 : 18, textShadow: `0 0 8px ${n.color}`, pointerEvents: "none", animation: "floatUp 1s ease forwards", zIndex: 20 }}>{n.value}</div>
            ))}
          </div>

          {/* Enemy card */}
          <div style={{ position: "relative", marginBottom: 8 }}>
            <div style={{ background: "#110a0a", border: `1px solid ${enemy.isBoss ? "#e8c070" : "#c0392b"}44`, borderRadius: 12, padding: "12px 14px", animation: shakeEnemy ? "shakeX 0.4s ease" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 800, color: enemy.isBoss ? "#e8c070" : "#e74c3c", fontSize: 14 }}>
                  {enemy.isBoss ? "⚠️ " : ""}{enemy.icon} {enemy.name}
                </span>
                <div>{(enemy.statusEffects||[]).map((e,i) => <Badge key={i} e={e} />)}</div>
              </div>
              <Bar val={enemy.hp} max={enemy.maxHp} color={enemy.isBoss ? "#e8c070" : "#e74c3c"} label="HP" />
              {enemy.charging && (
                <div style={{ marginTop: 6, padding: "4px 8px", background: "#2a0a0a", border: "1px solid #f97316", borderRadius: 6, color: "#f97316", fontWeight: 800, fontSize: 11, animation: "pulse 0.6s ease infinite alternate" }}>
                  ⚡ CHARGING {enemy.ult?.name?.toUpperCase()}! Use your defensive move!
                </div>
              )}
              <div style={{ fontSize: 10, color: "#555", marginTop: 5 }}>
                ATK {enemy.atk} · DEF {enemy.def} · SPR {enemy.spr} · MND {enemy.mnd} · AGI {enemy.agi}
              </div>
            </div>
            {lastReward && (
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", display: "flex", gap: 10, alignItems: "center", background: "#07070fee", border: "1px solid #333", borderRadius: 10, padding: "8px 18px", animation: "rewardPop 1.8s ease forwards", pointerEvents: "none", zIndex: 10, whiteSpace: "nowrap" }}>
                <span style={{ color: "#e8c070", fontWeight: 800, fontSize: 16 }}>+{lastReward.gold}g</span>
                <span style={{ color: "#555" }}>·</span>
                <span style={{ color: "#a78bfa", fontWeight: 800, fontSize: 16 }}>+{lastReward.exp} EXP</span>
              </div>
            )}
            {floatingNums.filter(n => n.target === "enemy").map(n => (
              <div key={n.id} style={{ position: "absolute", top: "20%", left: `${n.left}%`, color: n.color, fontWeight: 900, fontSize: 20, textShadow: `0 0 10px ${n.color}`, pointerEvents: "none", animation: "floatUp 1s ease forwards", zIndex: 20 }}>{n.value}</div>
            ))}
          </div>

          {/* Log */}
          <div style={{ marginBottom: 8 }}><Log lines={log} /></div>

          {/* Moves */}
          {phase === "active" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              {getPlayerMoves(player).map((m, idx) => <MoveBtn key={m.id} move={m} player={player} onUse={handleMove} disabled={!playerTurn || busy} isFree={idx === 0} />)}
            </div>
          )}

          {phase === "victory" && (
            <div style={{ textAlign: "center", padding: "10px 0", color: "#27ae60", fontWeight: 800, fontSize: 15 }}>
              ✨ Victory! Next battle incoming...
            </div>
          )}

          {phase === "active" && (
            <div style={{ textAlign: "center", marginTop: 8, fontSize: 10, color: playerTurn && !busy ? "#27ae60" : "#e74c3c" }}>
              {busy ? "⏳ Processing..." : playerTurn ? "● Your turn" : "⏳ Enemy turn..."}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
