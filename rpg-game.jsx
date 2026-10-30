import { createCombatController } from "./engine/encounter.js";
import { useState, useEffect, useRef } from "react";
import { CLASSES, SHOP_ITEMS, SKILLS_DEF, PATHS_DATA, JOURNEY_MAX_LEVEL, JOURNEY_EXP_TABLE, getClass, getMulticlassInfo, applyMulticlass } from "./gameData.js";

import { initPlayer, eff, pathSkillVal, getPathDef, getPlayerMoves, applyPath } from "./engine/rules.js";

const SAVE_KEY = "realm_of_echoes_save_v1";

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

  const { beginCombat, handleMove } = createCombatController(
    { player, enemy, playerTurn, busy, phase },
    { setScreen, setEnemy, setLog, setPhase, setPlayerTurn, setBusy, setPlayer,
      addLog, setLastReward, setRunSummary, spawnFloat, triggerShake, deleteSave }
  );

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
