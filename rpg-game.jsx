import { useState, useEffect, useRef } from "react";
import {
  CLASSES, ENEMY_POOL, BOSS_POOL, SHOP_ITEMS, SKILLS_DEF,
  getClass, getMulticlassInfo, applyMulticlass,
} from "./gameData.js";

const SAVE_KEY = "realm_of_echoes_save_v1";

// ============================================================
// HELPERS
// ============================================================

function scaleEnemy(template, wins, playerLevel = 1) {
  const winMult = Math.pow(1.015, wins);
  const lvlMult = Math.pow(1.12, playerLevel - 1);
  const s = winMult * lvlMult;
  const rewardMult = winMult * Math.pow(1.08, playerLevel - 1);
  return {
    name: template.name, icon: template.icon, isBoss: template.isBoss || false,
    maxHp: Math.floor(template.baseHp * s), hp: Math.floor(template.baseHp * s),
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
    shopTier:  { atk: 1, def: 1, spr: 1, mnd: 1, agi: 1 },
    statusEffects: [], passiveWins: 0, shield: 0,
    skillPoints: 0, skills: { xpBonus: 0, goldBonus: 0, statBonus: 0 },
    runStats: { dmgDealt: 0, dmgReceived: 0, dmgHealed: 0, killedBy: null },
  };
}

function eff(player, stat) {
  const base = player.stats[stat];
  const flat = player.bonusFlat[stat];
  const pct  = player.bonusPct[stat] + (player.skills?.statBonus || 0) * 5;
  return base + flat + Math.floor((base + flat) * pct / 100);
}

function skillXpMult(p)   { return 1 + (p.skills?.xpBonus   || 0) * 0.10; }
function skillGoldMult(p) { return 1 + (p.skills?.goldBonus  || 0) * 0.10; }
function getManaRegen(p)  { return Math.floor(10 + p.maxMana * 0.05); }

// Defense uses soft diminishing returns: effective reduction = def / (def + 50) * atk
// This means high DEF still matters but never walls completely, and damage scales smoothly
function calcPhysDmg(atk, def, power) {
  const reduction = def / (def + 50);        // 0→0%, 50→50%, 150→75%, never 100%
  const raw = atk * power * (1 - reduction * 0.8);
  return Math.max(Math.floor(atk * 0.05), Math.floor(raw)); // floor = 5% atk so always tickles
}

function calcMagDmg(spr, mnd, power) {
  const reduction = mnd / (mnd + 50);
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
function calcHeal(mnd)                { return Math.floor(mnd * 1.6 + 12); }

function agiCheck(atkAgi, defAgi) {
  const crit  = Math.max(0.05, Math.min(0.50, (atkAgi - defAgi) * 0.008 + 0.15));
  const evade = Math.max(0.00, Math.min(0.35, (defAgi - atkAgi) * 0.008 + 0.05));
  return { crit, evade };
}

function tickStatus(target) {
  const logs = []; let bleedHeal = 0; let regenHeal = 0;
  const totalDmg = (target.statusEffects || []).reduce((s, e) =>
    (e.type === "burn" || e.type === "bleed") ? s + e.dmg : s, 0);
  const effects = (target.statusEffects || []).map(e => {
    if (e.type === "burn")  { logs.push(`🔥 Burn: ${e.dmg} dmg`);  return { ...e, turns: e.turns - 1 }; }
    if (e.type === "bleed") { bleedHeal += e.dmg; logs.push(`🩸 Bleed: ${e.dmg} dmg`); return { ...e, turns: e.turns - 1 }; }
    if (e.type === "regen") { regenHeal += e.dmg; logs.push(`💚 Regen: +${e.dmg} HP`); return { ...e, turns: e.turns - 1 }; }
    return e;
  }).filter(e => e.turns > 0);
  return { target: { ...target, hp: Math.max(0, target.hp - totalDmg), statusEffects: effects }, logs, bleedHeal, regenHeal };
}

function applyEffect(target, effect, dmg) {
  const effects = [...(target.statusEffects || [])];
  const turns = effect === "stun" ? 1 : effect === "regen" ? 3 : 3;
  const idx = effects.findIndex(e => e.type === effect);
  if (effect === "regen" && idx >= 0) {
    // Regen stacks turns, capped at 6
    effects[idx] = { ...effects[idx], turns: Math.min(6, effects[idx].turns + 3), dmg };
  } else if (idx >= 0) {
    effects[idx] = { ...effects[idx], turns, dmg };
  } else {
    effects.push({ type: effect, turns, dmg });
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

function MoveBtn({ move, player, onUse, disabled }) {
  const ok  = player.mana >= move.manaCost;
  const col = { atk: "#c0392b", def: "#2980b9", heal: "#16a085" }[move.type] || "#666";
  const [hover, setHover] = useState(false);
  return (
    <button onClick={() => onUse(move)} disabled={disabled || !ok}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: hover && ok && !disabled ? `${col}33` : ok ? `${col}15` : "#0d0d0d",
        border: `1px solid ${ok && !disabled ? col : "#222"}`,
        borderRadius: 8, padding: "8px 10px", cursor: ok && !disabled ? "pointer" : "not-allowed",
        color: ok ? "#ddd" : "#444", textAlign: "left", width: "100%", transition: "all 0.15s",
      }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 1 }}>{move.name}{move.hits ? ` ×${move.hits}` : ""}</div>
      <div style={{ fontSize: 10, color: "#777" }}>{move.desc}</div>
      <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
        {move.manaCost > 0 ? `💧${move.manaCost}` : "Free"} · {move.dmgType === "physical" ? "⚔️" : move.dmgType === "magical" ? "✨" : "💚"}
        {move.effect ? ` · ${{ burn:"🔥", bleed:"🩸", drain:"💜", stun:"💫" }[move.effect] || ""}` : ""}
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

  function buyItem(item, tier) {
    const td  = tier === 2 ? item.t2 : item.t1;
    const lvlKey = tier === 2 ? "shopLevelsT2" : "shopLevels";
    const lvl = (player[lvlKey] || {})[item.stat] || 0;
    const price = Math.floor(td.price * Math.pow(1.2, lvl));
    if (player.gold < price) return;
    const p = {
      ...player,
      bonusFlat: { ...player.bonusFlat },
      bonusPct:  { ...player.bonusPct },
      shopLevels:   { ...player.shopLevels },
      shopLevelsT2: { ...(player.shopLevelsT2 || { atk:0,def:0,spr:0,mnd:0,agi:0 }) },
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
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {["shop", "skills"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 0", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer",
              background: tab === t ? "#1a1a2e" : "transparent",
              border: `1px solid ${tab === t ? "#e8c07066" : "#222"}`,
              color: tab === t ? "#e8c070" : "#555",
            }}>{t === "shop" ? "🏪 Shop" : `🌟 Skills${sp > 0 ? ` (${sp})` : ""}`}</button>
          ))}
        </div>

        {tab === "shop" && (
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {SHOP_ITEMS.map(item => {
              const lvl1 = player.shopLevels[item.stat] || 0;
              const lvl2 = (player.shopLevelsT2 || {})[item.stat] || 0;
              const t1p = Math.floor(item.t1.price * Math.pow(1.2, lvl1));
              const t2p = Math.floor(item.t2.price * Math.pow(1.2, lvl2));
              return (
                <div key={item.id} style={{ background: "#0e0e18", border: "1px solid #1e1e2e", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div style={{ fontSize: 20 }}>{item.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{item.name} <span style={{ color: "#555", fontSize: 10 }}>T1 Lv.{lvl1} · T2 Lv.{lvl2}</span></div>
                      <div style={{ fontSize: 10, color: "#666" }}>{item.stat.toUpperCase()} {eff(player, item.stat)} (+{player.bonusFlat[item.stat]} flat, +{player.bonusPct[item.stat]}%)</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[{ tier: 1, price: t1p, label: "T1 +1/+5%" }, { tier: 2, price: t2p, label: "T2 +5/+10%", gold: true }].map(({ tier, price, label, gold }) => {
                      const can = player.gold >= price;
                      return (
                        <button key={tier} onClick={() => buyItem(item, tier)} disabled={!can} style={{
                          flex: 1, background: can ? (gold ? "#e8c07011" : "#ffffff11") : "#111",
                          border: `1px solid ${can ? (gold ? "#e8c070" : "#aaa") : "#222"}`,
                          color: can ? (gold ? "#e8c070" : "#ddd") : "#444",
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
                  ? `${baseCls.passive.name} (doubled)`
                  : `+ ${cls.passive.name}`
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
              <span key={s} style={{ color: "#777" }}>{s.toUpperCase()} <span style={{ color: "#aaa", fontWeight: 700 }}>{player.stats[s]}</span></span>
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
    const e = spawnEnemy(p.wins, p.level);
    setEnemy(e); setLog([]); setPhase("active");
    setPlayerTurn(true); setScreen("combat"); setBusy(false);
    const isBoss = p.wins > 0 && p.wins % 25 === 0;
    addLog(isBoss ? `⚠️ BOSS — ${e.icon} ${e.name} approaches!` : `${e.icon} ${e.name} appears!`);
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

  function handleMove(move) {
    if (!playerTurn || busy || phase !== "active") return;
    if (player.mana < move.manaCost) return;
    setBusy(true);

    let p = { ...player, statusEffects: [...(player.statusEffects || [])], stats: { ...player.stats } };
    let e = { ...enemy,  statusEffects: [...(enemy.statusEffects  || [])] };
    const logs = [];

    p.mana -= move.manaCost;

    if (move.type === "heal") {
      const h = calcHeal(eff(p, "mnd"));
      p.hp = Math.min(p.maxHp, p.hp + h);
      logs.push(`💚 ${move.name}: Healed ${h} HP`);
      spawnFloat(`+${h}`, "#2ecc71", "player");
      p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + h };

    } else if (move.type === "regen") {
      // Inner Focus — apply/extend Regen status
      const regenVal = Math.floor(eff(p, "mnd") * 0.5);
      p = applyEffect(p, "regen", regenVal);
      const currentTurns = p.statusEffects.find(s => s.type === "regen")?.turns || 3;
      logs.push(`☯️ ${move.name}: Regen ${regenVal}/turn (${currentTurns} turns)`);
      spawnFloat(`☯️`, "#e67e22", "player");

    } else if (move.type === "def") {
      const shield = Math.floor(eff(p, "def") * 0.6 + eff(p, "mnd") * 0.4);
      p.shield = (p.shield || 0) + shield;
      logs.push(`🛡️ ${move.name}: Shielded ${shield}`);
      spawnFloat(`🛡${shield}`, "#3498db", "player");

    } else {
      const ac  = agiCheck(eff(p, "agi"), e.agi);
      if (Math.random() < ac.evade) {
        logs.push(`💨 ${e.name} evaded!`);
      } else {
        const crit = Math.random() < ac.crit;
        const hits = move.hits || 1;
        let totalDmg = 0;
        for (let h = 0; h < hits; h++) {
          let d;
          if (move.dmgType === "chi")       d = calcChiDmg(eff(p, "mnd"), e.def, move.power);
          else if (move.dmgType === "void")  d = calcVoidDmg(eff(p, "mnd"), e.mnd, move.power);
          else if (move.dmgType === "physical") d = calcPhysDmg(eff(p, "atk"), e.def, move.power);
          else                               d = calcMagDmg(eff(p, "spr"), e.mnd, move.power);
          if (crit) d = Math.floor(d * 1.5);
          totalDmg += d;
        }
        e.hp = Math.max(0, e.hp - totalDmg);
        p.runStats = { ...p.runStats, dmgDealt: (p.runStats?.dmgDealt||0) + totalDmg };
        logs.push(`${crit ? "⚡ CRIT! " : ""}${move.name}: ${totalDmg} dmg${hits > 1 ? ` (${hits}×)` : ""}`);
        const isMag  = move.dmgType === "magical" || move.dmgType === "chi" || move.dmgType === "void";
        const fcol   = crit ? (isMag ? "#f97316" : "#e74c3c") : (isMag ? "#e8c070" : "#ffffff");
        spawnFloat(crit ? `⚡${totalDmg}` : `${totalDmg}`, fcol, "enemy");
        triggerShake("enemy");

        if (move.effect === "burn")  { e = applyEffect(e, "burn",  Math.max(1, Math.floor(eff(p,"spr")*0.25))); logs.push("🔥 Burn applied!"); }
        if (move.effect === "bleed") { e = applyEffect(e, "bleed", Math.max(1, Math.floor(eff(p,"atk")*0.35))); logs.push("🩸 Bleed applied!"); }
        if (move.effect === "stun" && Math.random() < 0.4) { e = applyEffect(e, "stun", 0); logs.push("💫 Enemy stunned!"); }
        if (move.effect === "drain") {
          const h = Math.floor(totalDmg * 0.6);
          p.hp = Math.min(p.maxHp, p.hp + h);
          logs.push(`💜 Drain: Healed ${h} HP`);
          spawnFloat(`+${h}`, "#2ecc71", "player");
          p.runStats = { ...p.runStats, dmgHealed: (p.runStats?.dmgHealed||0) + h };
        }
      }
    }

    // Enemy dead?
    if (e.hp <= 0) {
      const gold = Math.floor(e.reward.gold * skillGoldMult(p));
      const exp  = Math.floor(e.reward.exp  * skillXpMult(p));
      p.gold += gold; p.exp += exp; p.wins += 1;
      logs.push(`💀 ${e.name} defeated! +${exp} EXP +${gold} Gold`);

      // Passives on kill — runs for classKey AND multiclassKey if present
      const passiveKeys = p.isSpecialized
        ? [p.classKey]  // spec: only run once, doubled internally
        : [p.classKey, p.multiclassKey].filter(Boolean);
      const isSpec = p.isSpecialized;

      for (const pk of passiveKeys) {
        if (pk === "thief") {
          const mult = isSpec && pk === p.classKey ? 2 : 1;
          const h = Math.floor(e.maxHp * 0.05 * mult);
          p.hp = Math.min(p.maxHp, p.hp + h);
          logs.push(`🗡️ Pickpocket: +${h} HP`);
        }
        if (pk === "druid") {
          const rolls = isSpec && pk === p.classKey ? 2 : 1;
          const stats = ["atk","def","spr","mnd","agi"];
          for (let i = 0; i < rolls; i++) {
            const s = stats[Math.floor(Math.random() * stats.length)];
            p.stats = { ...p.stats, [s]: p.stats[s] + 1 };
            logs.push(`🌿 Nature: +1 ${s.toUpperCase()}!`);
          }
        }
        if (pk === "mage") {
          // For spec, only track once (using passiveWins) but fire every 3 wins
          // For multiclass second mage, track separately with passiveWins2
          const isSecond = !isSpec && pk === p.multiclassKey;
          const tracker = isSecond ? "passiveWins2" : "passiveWins";
          p[tracker] = (p[tracker] || 0) + 1;
          const threshold = isSpec ? 3 : 5;
          if (p[tracker] % threshold === 0) {
            p.stats = { ...p.stats, spr: p.stats.spr + 1 };
            logs.push(`🔮 Knowledge: +1 SPR!`);
          }
        }
      }

      // Level up
      while (p.exp >= p.expToNext) {
        p.exp -= p.expToNext; p.level += 1;
        p.expToNext = Math.floor(p.expToNext * 1.4);
        const base = getClass(p.classKey).stats;
        const pctBonus = 0.02 * (p.level - 1);
        const scalingMult = p.combinedScaling
          ? p.combinedScaling / getClass(p.classKey).baseScaling
          : 1;
        const ns = { ...p.stats };
        const desc = [];
        Object.keys(ns).forEach(s => {
          const g = Math.ceil(base[s] * (0.25 + pctBonus) * scalingMult);
          ns[s] += g; desc.push(`${s.toUpperCase()}+${g}`);
        });
        p.stats = ns;
        const hpGain = Math.floor(15 * (getClass(p.classKey).hpScaling || 1));
        p.maxHp += hpGain; p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
        p.skillPoints = (p.skillPoints || 0) + 2;
        logs.push(`🎉 LEVEL UP → ${p.level}! ${desc.join(" ")} +2 SP`);
      }

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
      let p2 = { ...p, statusEffects: [...(p.statusEffects || [])], stats: { ...p.stats }, runStats: { ...(p.runStats || {}) } };
      let e2 = { ...e, statusEffects: [...(e.statusEffects || [])] };
      const eLogs = [];

      // Tick enemy status
      const eTick = tickStatus(e2);
      e2 = eTick.target; eLogs.push(...eTick.logs);
      const hasRanger = p2.classKey === "ranger" || p2.multiclassKey === "ranger";
      if (hasRanger && eTick.bleedHeal > 0) {
        p2.hp = Math.min(p2.maxHp, p2.hp + eTick.bleedHeal);
        eLogs.push(`🏹 Predator: +${eTick.bleedHeal} HP`);
      }

      // Enemy died from status
      if (e2.hp <= 0) {
        const gold = Math.floor(e2.reward.gold * skillGoldMult(p2));
        const exp  = Math.floor(e2.reward.exp  * skillXpMult(p2));
        p2.gold += gold; p2.exp += exp; p2.wins += 1;
        eLogs.push(`💀 ${e2.name} defeated by status! +${exp} EXP +${gold} Gold`);
        if (p2.classKey === "thief" || p2.multiclassKey === "thief") {
          const mult = p2.isSpecialized ? 2 : 1;
          const h = Math.floor(e2.maxHp * 0.05 * mult);
          p2.hp = Math.min(p2.maxHp, p2.hp + h);
        }
        addLog(...eLogs);
        setLastReward({ gold, exp });
        setTimeout(() => setLastReward(null), 1800);
        setPlayer(p2); setEnemy(e2); setPhase("victory"); setBusy(false);
        setTimeout(() => beginCombat(p2), 1200);
        return;
      }

      if (e2.hp > 0) {
        // Knight passive (Grit) — runs for base or second class
        const knightPassiveCount = [p2.classKey, p2.multiclassKey].filter(k => k === "knight").length;
        if (knightPassiveCount > 0) {
          const mult = p2.isSpecialized ? 2 : knightPassiveCount;
          const h = Math.floor((10 + eff(p2,"mnd") * 0.1) * mult);
          p2.hp = Math.min(p2.maxHp, p2.hp + h);
          p2.runStats = { ...p2.runStats, dmgHealed: (p2.runStats?.dmgHealed||0) + h };
          eLogs.push(`⚔️ Grit: +${h} HP`);
          spawnFloat(`+${h}`, "#2ecc71", "player");
        }

        // Ranger Predator passive (bleed heal already handled above in eTick)
        // but we need to double it for spec/multi
        if (p2.isSpecialized && p2.classKey === "ranger" && eTick.bleedHeal > 0) {
          p2.hp = Math.min(p2.maxHp, p2.hp + eTick.bleedHeal); // second proc
          eLogs.push(`🏹 Predator (×2): +${eTick.bleedHeal} HP`);
        }

        // Tick player status
        const pTick = tickStatus(p2);
        p2 = pTick.target; eLogs.push(...pTick.logs);

        // Apply Regen healing to player
        if (pTick.regenHeal > 0) {
          p2.hp = Math.min(p2.maxHp, p2.hp + pTick.regenHeal);
          p2.runStats = { ...p2.runStats, dmgHealed: (p2.runStats?.dmgHealed||0) + pTick.regenHeal };
          spawnFloat(`+${pTick.regenHeal}`, "#2ecc71", "player");
          // Serenity passive — Monk deals 50% of regen as damage
          const hasMonk = p2.classKey === "monk" || p2.multiclassKey === "monk";
          if (hasMonk) {
            const serenityDmg = Math.floor(pTick.regenHeal * 0.5);
            e2.hp = Math.max(0, e2.hp - serenityDmg);
            p2.runStats = { ...p2.runStats, dmgDealt: (p2.runStats?.dmgDealt||0) + serenityDmg };
            eLogs.push(`☯️ Serenity: ${serenityDmg} dmg`);
            spawnFloat(`${serenityDmg}`, "#e67e22", "enemy");
          }
        }

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
                    {player.multiclassKey
                      ? player.isSpecialized
                        ? `${cls.passive.name} ×2`
                        : `${cls.passive.name} · ${getClass(player.multiclassKey).passive.name}`
                      : cls.passive.name
                    }
                  </div>
                </div>
                <div>{(player.statusEffects||[]).map((e,i) => <Badge key={i} e={e} />)}</div>
              </div>
              <Bar val={player.hp}   max={player.maxHp}   color="#e74c3c" label="HP" />
              <Bar val={player.mana} max={player.maxMana} color="#3498db" label="MP" />
              <Bar val={player.exp}  max={player.expToNext} color="#e8c070" label="EXP" />
              <div style={{ display: "flex", gap: 10, fontSize: 10, color: "#555", marginTop: 5, flexWrap: "wrap" }}>
                {["atk","def","spr","mnd","agi"].map(s => (
                  <span key={s} style={{ color: "#777" }}>{s.toUpperCase()} <span style={{ color: "#aaa" }}>{eff(player,s)}</span></span>
                ))}
                {(player.shield||0) > 0 && <span style={{ color: "#3498db" }}>🛡️{player.shield}</span>}
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
              {cls.moves.map(m => <MoveBtn key={m.id} move={m} player={player} onUse={handleMove} disabled={!playerTurn || busy} />)}
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
