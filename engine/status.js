export function tickStatus(target) {
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

export function applyEffect(target, effect, dmg, opts = {}) {
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
