import { spawnEnemy } from "./rules.js";
import { resolvePlayerMove } from "./abilities.js";

// Explicit ports keep React, storage and real timers outside the game rules.
// Timing/cancellation semantics intentionally remain unchanged in Phase 2.
export function createCombatController(state, effects) {
  // Native browser timers must not receive the ports object as their `this`.
  // A wrapper is safe both as ports.schedule(...) and as a detached callback.
  const ports = {
    random: Math.random,
    schedule: (callback, delay) => globalThis.setTimeout(callback, delay),
    ...effects,
  };
  const { setScreen, setEnemy, setLog, setPhase, setPlayerTurn, setBusy, setPlayer, addLog } = ports;
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
    const e = spawnEnemy(p.wins, p.level, ports.random);
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

  ports.beginCombat = beginCombat;
  return { beginCombat, handleMove: move => resolvePlayerMove(move, state, ports) };
}
