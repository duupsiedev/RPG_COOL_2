// ============================================================
// gameData.js — All game constants and data lookup helpers
// Add new classes, enemies, bosses, items here. No logic.
// ============================================================

export const CLASSES = [
  {
    key: "knight", name: "Knight", icon: "⚔️", color: "#c0392b", baseScaling: 3, hpScaling: 1.6,
    stats: { atk: 14, def: 16, spr: 5, mnd: 5, agi: 10 },
    moves: [
      { id: "slash",        name: "Slash",        type: "atk", dmgType: "physical", power: 1.0, manaCost: 0,  desc: "A basic sword strike." },
      { id: "shield_bash",  name: "Shield Bash",  type: "atk", dmgType: "physical", power: 1.2, manaCost: 15, effect: "stun", desc: "Bashes with shield. May stun." },
      { id: "fortify",      name: "Fortify",      type: "def", dmgType: "physical", power: 1.0, manaCost: 10, desc: "Defensive stance, scales with DEF+MND." },
      { id: "flame_strike", name: "Flame Strike", type: "atk", dmgType: "magical",  power: 1.4, manaCost: 15, effect: "burn", desc: "Burning blade. Applies burn (SPR)." },
    ],
    passive: { name: "Grit", desc: "Heal at turn start: 10 + 10% MND" },
  },
  {
    key: "ranger", name: "Ranger", icon: "🏹", color: "#27ae60", baseScaling: 3, hpScaling: 1.3,
    stats: { atk: 14, def: 8, spr: 8, mnd: 8, agi: 12 },
    moves: [
      { id: "quick_shot",  name: "Quick Shot",  type: "atk", dmgType: "physical", power: 1.0, manaCost: 0,  desc: "A fast arrow shot." },
      { id: "bleed_arrow", name: "Bleed Arrow", type: "atk", dmgType: "physical", power: 1.3, manaCost: 15, effect: "bleed", desc: "Arrow causing bleeding. Scales with ATK." },
      { id: "dodge_roll",  name: "Dodge Roll",  type: "def", dmgType: "physical", power: 1.0, manaCost: 10, desc: "Evasive roll, scales with DEF+MND." },
      { id: "double_shot", name: "Double Shot", type: "atk", dmgType: "physical", power: 1.1, manaCost: 15, hits: 2, desc: "Two rapid arrow shots." },
    ],
    passive: { name: "Predator", desc: "Heals for bleed damage dealt each turn" },
  },
  {
    key: "mage", name: "Mage", icon: "🔮", color: "#8e44ad", baseScaling: 2, hpScaling: 1.1,
    stats: { atk: 6, def: 6, spr: 14, mnd: 18, agi: 6 },
    moves: [
      { id: "magic_bolt",  name: "Magic Bolt",  type: "atk", dmgType: "magical", power: 1.0, manaCost: 0,  desc: "A bolt of raw arcane energy." },
      { id: "inferno",     name: "Inferno",     type: "atk", dmgType: "magical", power: 1.2, manaCost: 15, effect: "burn", desc: "Scorching blast. Applies burn (SPR)." },
      { id: "mana_shield", name: "Mana Shield", type: "def", dmgType: "magical", power: 1.0, manaCost: 10, desc: "Arcane barrier, scales with DEF+MND." },
      { id: "drain",       name: "Drain",       type: "atk", dmgType: "magical", power: 0.95, manaCost: 15, effect: "drain", desc: "Drains life. Heals for damage done (SPR)." },
    ],
    passive: { name: "Knowledge", desc: "+1 SPR every 5 wins" },
  },
  {
    key: "thief", name: "Thief", icon: "🗡️", color: "#f39c12", baseScaling: 3, hpScaling: 1.2,
    stats: { atk: 16, def: 6, spr: 8, mnd: 6, agi: 14 },
    moves: [
      { id: "stab",         name: "Stab",         type: "atk", dmgType: "physical", power: 1.0, manaCost: 0,  desc: "A quick dagger thrust." },
      { id: "shadowstrike", name: "Shadow Strike", type: "atk", dmgType: "physical", power: 1.2, manaCost: 15, effect: "stun", desc: "Emerges from shadows. May stun." },
      { id: "smoke_bomb",   name: "Smoke Bomb",   type: "def", dmgType: "physical", power: 1.0, manaCost: 10, desc: "Vanish in smoke, scales with DEF+MND." },
      { id: "execute",      name: "Execute",      type: "atk", dmgType: "physical", power: 1.4, manaCost: 15, effect: "burn", desc: "Lethal strike. Applies burn." },
    ],
    passive: { name: "Swift", desc: "Heal 5 + 5% AGI at turn start" },
  },
  {
    key: "druid", name: "Druid", icon: "🌿", color: "#16a085", baseScaling: 2, hpScaling: 1.4,
    stats: { atk: 6, def: 10, spr: 18, mnd: 10, agi: 6 },
    moves: [
      { id: "thorn_whip", name: "Thorn Whip", type: "atk", dmgType: "magical",  power: 1.0, manaCost: 0,  desc: "Lashing vines strike." },
      { id: "lacerate",   name: "Lacerate",   type: "atk", dmgType: "magical",  power: 1.2, manaCost: 15, effect: "bleed", desc: "Razor thorns cause bleeding." },
      { id: "bark_skin",  name: "Bark Skin",  type: "def", dmgType: "physical", power: 1.0, manaCost: 10, desc: "Hardened bark armor, scales with DEF+MND." },
      { id: "regrowth",   name: "Regrowth",   type: "heal", dmgType: "heal",    power: 0,   manaCost: 15, desc: "Powerful nature heal. Scales with MND." },
    ],
    passive: { name: "Nature", desc: "+1 to a random stat every win" },
  },
  {
    key: "monk", name: "Monk", icon: "🥋", color: "#e67e22", baseScaling: 2, hpScaling: 1.5,
    stats: { atk: 6, def: 8, spr: 8, mnd: 16, agi: 12 },
    moves: [
      { id: "palm_strike",  name: "Palm Strike",  type: "atk", dmgType: "chi",     power: 1.0, manaCost: 0,  desc: "Focused chi strike. Scales MND, hits physical DEF." },
      { id: "inner_focus",  name: "Inner Focus",  type: "regen", dmgType: "heal",  power: 0,   manaCost: 15, desc: "Apply Regen: heal MND×0.3 per turn for 3 turns. Max 6 turns." },
      { id: "iron_body",    name: "Iron Body",    type: "def", dmgType: "physical", power: 1.0, manaCost: 10, desc: "Shield scales DEF+MND. Higher MND = stronger barrier." },
      { id: "void_strike",  name: "Void Strike",  type: "atk", dmgType: "void",    power: 1.4, manaCost: 15, desc: "Chi blast. Scales MND, bypasses 80% of magic resistance." },
    ],
    passive: { name: "Serenity", desc: "Deal 50% of each Regen tick as damage to the enemy" },
  },
];

export function getClass(key) { return CLASSES.find(c => c.key === key); }

export const ENEMY_POOL = [
  { name: "Goblin",      icon: "👺", baseHp: 40,  baseAtk: 6,  baseDef: 3,  baseSpr: 2,  baseMnd: 2,  baseAgi: 5,  reward: { gold: 15,  exp: 20  }, moves: [{ name: "Shiv",        type: "atk", dmgType: "physical", power: 1.0 }, { name: "Cheap Shot",  type: "atk", dmgType: "physical", power: 1.5 }], ult: { name: "Frenzied Stab",  dmgType: "physical", power: 2.2 } },
  { name: "Skeleton",    icon: "💀", baseHp: 50,  baseAtk: 8,  baseDef: 5,  baseSpr: 2,  baseMnd: 1,  baseAgi: 4,  reward: { gold: 20,  exp: 25  }, moves: [{ name: "Bone Strike",  type: "atk", dmgType: "physical", power: 1.0 }, { name: "Rattle Slam", type: "atk", dmgType: "physical", power: 1.6 }], ult: { name: "Bone Shatter",   dmgType: "physical", power: 2.4 } },
  { name: "Wolf",        icon: "🐺", baseHp: 45,  baseAtk: 9,  baseDef: 3,  baseSpr: 1,  baseMnd: 1,  baseAgi: 8,  reward: { gold: 18,  exp: 22  }, moves: [{ name: "Bite",         type: "atk", dmgType: "physical", power: 1.0 }, { name: "Pounce",      type: "atk", dmgType: "physical", power: 1.6 }], ult: { name: "Pack Frenzy",    dmgType: "physical", power: 2.5 } },
  { name: "Orc",         icon: "👹", baseHp: 80,  baseAtk: 12, baseDef: 8,  baseSpr: 3,  baseMnd: 2,  baseAgi: 4,  reward: { gold: 35,  exp: 45  }, unlockWin: 5,  moves: [{ name: "Axe Swing",   type: "atk", dmgType: "physical", power: 1.0 }, { name: "Skull Crush", type: "atk", dmgType: "physical", power: 1.7 }], ult: { name: "Berserker Rage", dmgType: "physical", power: 2.6 } },
  { name: "Dark Mage",   icon: "🧙", baseHp: 65,  baseAtk: 7,  baseDef: 4,  baseSpr: 14, baseMnd: 8,  baseAgi: 5,  reward: { gold: 40,  exp: 50  }, unlockWin: 8,  moves: [{ name: "Shadow Bolt", type: "atk", dmgType: "magical",  power: 1.0 }, { name: "Void Blast",  type: "atk", dmgType: "magical",  power: 1.7 }], ult: { name: "Doom Surge",     dmgType: "magical",  power: 2.6 } },
  { name: "Vampire",     icon: "🧛", baseHp: 100, baseAtk: 14, baseDef: 8,  baseSpr: 10, baseMnd: 6,  baseAgi: 9,  reward: { gold: 60,  exp: 75  }, unlockWin: 15, moves: [{ name: "Claw Rake",   type: "atk", dmgType: "physical", power: 1.0 }, { name: "Blood Drain", type: "atk", dmgType: "magical",  power: 1.7 }], ult: { name: "Crimson Nova",   dmgType: "magical",  power: 2.7 } },
  { name: "Stone Golem", icon: "🪨", baseHp: 150, baseAtk: 10, baseDef: 18, baseSpr: 2,  baseMnd: 2,  baseAgi: 2,  reward: { gold: 65,  exp: 80  }, unlockWin: 20, moves: [{ name: "Rock Fist",   type: "atk", dmgType: "physical", power: 1.0 }, { name: "Earthquake",  type: "atk", dmgType: "physical", power: 1.8 }], ult: { name: "Avalanche",      dmgType: "physical", power: 2.8 } },
  { name: "Dragon Whelp",icon: "🐉", baseHp: 130, baseAtk: 16, baseDef: 12, baseSpr: 14, baseMnd: 6,  baseAgi: 10, reward: { gold: 100, exp: 130 }, unlockWin: 30, moves: [{ name: "Claw Swipe",  type: "atk", dmgType: "physical", power: 1.0 }, { name: "Flame Breath",type: "atk", dmgType: "magical",  power: 1.7 }], ult: { name: "Inferno",        dmgType: "magical",  power: 2.8 } },
];

export const BOSS_POOL = [
  { name: "Bandit King",   icon: "👑", isBoss: true, baseHp: 150, baseAtk: 14, baseDef: 9,  baseSpr: 8,  baseMnd: 6,  baseAgi: 10, reward: { gold: 150, exp: 200 }, moves: [{ name: "Reign Slash", type: "atk", dmgType: "physical", power: 1.0 }, { name: "Execution",    type: "atk", dmgType: "physical", power: 1.8 }], ult: { name: "Kingslayer",    dmgType: "physical", power: 3.0 } },
  { name: "Lich",          icon: "☠️", isBoss: true, baseHp: 180, baseAtk: 12, baseDef: 8,  baseSpr: 20, baseMnd: 14, baseAgi: 8,  reward: { gold: 200, exp: 250 }, moves: [{ name: "Soul Leech",  type: "atk", dmgType: "magical",  power: 1.0 }, { name: "Death Coil",   type: "atk", dmgType: "magical",  power: 1.8 }], ult: { name: "Undying Curse", dmgType: "magical",  power: 3.0 } },
  { name: "Ancient Dragon",icon: "🐲", isBoss: true, baseHp: 300, baseAtk: 22, baseDef: 18, baseSpr: 16, baseMnd: 10, baseAgi: 12, reward: { gold: 300, exp: 400 }, moves: [{ name: "Talon Strike",type: "atk", dmgType: "physical", power: 1.0 }, { name: "Inferno Roar", type: "atk", dmgType: "magical",  power: 1.8 }], ult: { name: "Dragon's Wrath",dmgType: "magical",  power: 3.2 } },
];

export const SHOP_ITEMS = [
  { id: "weapon",      name: "Weapon",      stat: "atk", icon: "⚔️", t1: { price: 100, flat: 1, pct: 5 }, t2: { price: 400, flat: 5, pct: 10 }, t3: { price: 1200, flat: 15, pct: 20 } },
  { id: "armor",       name: "Armor",       stat: "def", icon: "🛡️", t1: { price: 100, flat: 1, pct: 5 }, t2: { price: 400, flat: 5, pct: 10 }, t3: { price: 1200, flat: 15, pct: 20 } },
  { id: "spirit_orb",  name: "Spirit Orb",  stat: "spr", icon: "🔮", t1: { price: 100, flat: 1, pct: 5 }, t2: { price: 400, flat: 5, pct: 10 }, t3: { price: 1200, flat: 15, pct: 20 } },
  { id: "mind_tome",   name: "Mind Tome",   stat: "mnd", icon: "📖", t1: { price: 100, flat: 1, pct: 5 }, t2: { price: 400, flat: 5, pct: 10 }, t3: { price: 1200, flat: 15, pct: 20 } },
  { id: "swift_boots", name: "Swift Boots", stat: "agi", icon: "👟", t1: { price: 100, flat: 1, pct: 5 }, t2: { price: 400, flat: 5, pct: 10 }, t3: { price: 1200, flat: 15, pct: 20 } },
];

export const SKILLS_DEF = [
  { key: "xpBonus",   label: "Scholar",  icon: "📚", desc: "+10% EXP per level",   max: 10,   color: "#a78bfa" },
  { key: "goldBonus", label: "Merchant", icon: "💰", desc: "+10% Gold per level",   max: 10,   color: "#e8c070" },
  { key: "statBonus", label: "Prodigy",  icon: "💪", desc: "+5% to all base stats", max: null, color: "#27ae60" },
];

export const MULTICLASS_NAMES = {
  "knight+mage":   { name: "Paladin",      icon: "✨" },
  "knight+ranger": { name: "Warden",       icon: "🏕️" },
  "knight+thief":  { name: "Shadowknight", icon: "🌑" },
  "druid+knight":  { name: "Sentinel",     icon: "🌳" },
  "mage+ranger":   { name: "Arcane Scout", icon: "🔭" },
  "mage+thief":    { name: "Spellblade",   icon: "🔪" },
  "druid+mage":    { name: "Archdruid",    icon: "🌙" },
  "ranger+thief":  { name: "Predator",     icon: "🐆" },
  "druid+ranger":  { name: "Beastmaster",  icon: "🐾" },
  "druid+thief":   { name: "Trickster",    icon: "🍃" },
  "knight+knight": { name: "Juggernaut",   icon: "🏰" },
  "mage+mage":     { name: "Archmage",     icon: "💫" },
  "ranger+ranger": { name: "Hawkeye",      icon: "🦅" },
  "thief+thief":   { name: "Assassin",     icon: "🗡️" },
  "druid+druid":   { name: "Shaman",       icon: "🌿" },
  "monk+monk":     { name: "Grandmaster",  icon: "☯️" },
  // Monk multiclass
  "knight+monk":   { name: "Paladin",      icon: "✝️" },
  "mage+monk":     { name: "Sage",         icon: "📿" },
  "monk+ranger":   { name: "Wanderer",     icon: "🍂" },
  "monk+thief":    { name: "Shadow Monk",  icon: "👁️" },
  "druid+monk":    { name: "Ascetic",      icon: "🪷" },
};

export function getMulticlassInfo(key1, key2) {
  const sorted = [key1, key2].sort().join("+");
  return MULTICLASS_NAMES[sorted] || { name: "Hero", icon: "⚔️" };
}

export function applyMulticlass(player, secondClassKey) {
  const base = getClass(player.classKey);
  const second = getClass(secondClassKey);
  const isSpec = player.classKey === secondClassKey;
  const info = getMulticlassInfo(player.classKey, secondClassKey);
  const newScaling = isSpec
    ? base.baseScaling * 2
    : Math.ceil(base.baseScaling + second.baseScaling);
  return {
    ...player,
    multiclassKey: secondClassKey,
    multiclassName: info.name,
    multiclassIcon: info.icon,
    isSpecialized: isSpec,
    combinedScaling: newScaling,
    passiveWins2: 0,
  };
}

// ============================================================
// PATHS SYSTEM — data only, no logic
// ============================================================
//
// Each path object:
//   key           — unique path identifier
//   name          — display name
//   passive       — replaces base class passive { name, desc }
//   newMoves      — 2 moves replacing moves[0] and moves[1]
//   defMoveRename — { id, name, renamedFrom } rename only, no mechanic change
//   pathSkills    — array of { key, label, desc, max, cost }
//                   cost=1: 1 point per rank
//                   cost>1: one-time purchase costing N points total
//
// NOTE: Nature (Druid) and Harmony (Archdruid) passives must modify
//       player.stats[stat] directly in rpg-game.jsx, not bonusFlat.
//
// Journey EXP: max level 30, 1 skill point per level.
//   Levels 1-15 fast (~150 EXP each), levels 16-30 slow (~350 EXP each).
// Journey EXP thresholds. Index = journey level, value = total EXP to reach it.
export const JOURNEY_MAX_LEVEL = 30;
export const JOURNEY_EXP_TABLE = (() => {
  const t = [0];
  for (let i = 1; i <= 30; i++) t.push(t[i - 1] + (i <= 15 ? 150 : 350));
  return t;
})();

export const PATHS_DATA = {
  knight: [
    {
      key: "commander",
      name: "Commander",
      passive: { name: "Leader", desc: "Restore 20 HP + 5% DEF scaling each turn" },
      newMoves: [
        { id: "stronghold",   name: "Stronghold",   type: "atk", dmgType: "physical", power: 1.2, manaCost: 15, effect: "stun",  scalesStat: "def", desc: "Shield-powered strike. Scales DEF. May stun." },
        { id: "veteran_blow", name: "Veteran Blow", type: "atk", dmgType: "physical", power: 1.2, manaCost: 15, effect: "bleed", scalesStat: "def", desc: "Heavy blow from experience. Scales DEF. Causes bleed." },
      ],
      defMoveRename: { id: "ironclad", name: "Ironclad", renamedFrom: "fortify" },
      pathSkills: [
        { key: "atk_to_def",          label: "Iron Discipline",  desc: "Convert 5% ATK to DEF per point",                    max: 10, cost: 1  },
        { key: "heal_on_hit",         label: "Endurance",         desc: "Heal 3% of damage received per point",               max: 10, cost: 1  },
        { key: "stronghold_ironclad", label: "Fortified Assault", desc: "Stronghold automatically activates Ironclad on use", max: 1,  cost: 10 },
      ],
    },
    {
      key: "radiant_knight",
      name: "Radiant Knight",
      passive: { name: "Sun Child", desc: "Apply 1 burn_stack each turn. Heal a small amount per burn tick received." },
      // burn_stack: max 6, dmg per tick = round(spr × (0.35 + stacks×0.17))
      // immolate consume: dmg = 1.2 × spr × (1 + stacks×0.5), capped at 3.0×, resets stacks
      newMoves: [
        { id: "radiance", name: "Radiance", type: "atk", dmgType: "magical", power: 1.0, manaCost: 15, effect: "burn_stack",  desc: "Blazing aura strike. Applies 1 Burn Stack." },
        { id: "immolate", name: "Immolate", type: "atk", dmgType: "magical", power: 1.2, manaCost: 20, effect: "consume_burn", desc: "Consume all Burn Stacks for massive fire dmg. Power = 1.2 × spr × (1 + stacks×0.5), cap 3.0×. Resets stacks." },
      ],
      healMove: { id: "solar_flare", name: "Solar Flare", type: "heal+atk", dmgType: "magical", power: 1.0, manaCost: 15, scalesStat: "spr", effect: "burn_stack_heal", desc: "Magical burst. Deals damage and heals based on active burn stacks." },
      defMoveRename: { id: "flame_shield", name: "Flame Shield", renamedFrom: "fortify" },
      pathSkills: [
        { key: "atk_to_spr",    label: "Solar Conversion", desc: "Convert 5% ATK to SPR per point",                    max: 10, cost: 1 },
        { key: "burn_heal_amp", label: "Pyromancy",         desc: "Burn tick heal +1% per point",                       max: 10, cost: 1 },
        { key: "more_burn_dmg", label: "Scorching Fury",    desc: "+2% burn damage per point (after stack multiplier)", max: 10, cost: 1 },
      ],
    },
  ],

  ranger: [
    {
      key: "deadeye",
      name: "Deadeye",
      passive: { name: "Bloodhound", desc: "Predator heal doubles when the enemy is bleeding" },
      newMoves: [
        { id: "piercing_shot",  name: "Piercing Shot",  type: "atk", dmgType: "physical", power: 1.4, manaCost: 15, defPen: 0.30,             desc: "Armor-piercing shot. Ignores 30% enemy DEF. Scales ATK." },
        { id: "rain_of_arrows", name: "Rain of Arrows", type: "atk", dmgType: "physical", power: 0.7, manaCost: 15, hits: 3, effect: "bleed_last", desc: "Three arrows rain down. Applies bleed on the last hit." },
      ],
      defMoveRename: { id: "deadeye_roll", name: "Deadeye Roll", renamedFrom: "dodge_roll" },
      pathSkills: [
        { key: "bleed_amp",    label: "Deep Cuts",    desc: "Bleed deals +3% more damage per point",     max: 10, cost: 1  },
        { key: "predator_amp", label: "Apex Predator", desc: "Predator heals +2% more per point",        max: 10, cost: 1  },
        { key: "extra_arrow",  label: "Extra Quiver",  desc: "Rain of Arrows fires +1 extra arrow",      max: 1,  cost: 10 },
      ],
    },
    {
      key: "ghost",
      name: "Ghost",
      // Phantom Step: +1 AGI must modify player.stats.agi directly (base stat)
      passive: { name: "Phantom Step", desc: "Every evade permanently gives +1 AGI (base stat). Heals 10% max HP on evade." },
      newMoves: [
        { id: "shadowstep",    name: "Shadowstep",    type: "def", dmgType: "physical", power: 1.0, manaCost: 10, scalesStat: "agi", desc: "Vanish and reposition. Shield scales with AGI." },
        { id: "phantom_arrow", name: "Phantom Arrow", type: "atk", dmgType: "physical", power: 1.2, manaCost: 15, scalesStat: "agi", desc: "Strike from the void. Scales AGI instead of ATK." },
      ],
      healMove: { id: "phantom_mend", name: "Phantom Mend", type: "heal", dmgType: "heal", manaCost: 15, scalesStat: "agi", effect: "regen", regenTurns: 2, desc: "Mend wounds using swiftness. Heals based on AGI, applies 2-turn regen." },
      defMoveRename: { id: "ghost_roll", name: "Ghost Roll", renamedFrom: "dodge_roll" },
      pathSkills: [
        { key: "agi_amp",       label: "Wraith Training", desc: "+2% AGI per point",                                        max: 10, cost: 1  },
        { key: "evade_counter", label: "Phantom Counter", desc: "On evade, deal 40% ATK as counter damage (+4% per point)", max: 10, cost: 1  },
        { key: "phantom_extra", label: "Twin Phantoms",   desc: "Phantom Arrow fires +1 additional shot",                   max: 1,  cost: 10 },
      ],
    },
  ],

  mage: [
    {
      key: "archmage",
      name: "Archmage",
      passive: { name: "Ultimate Knowledge", desc: "+1 MND every win. Heals a % based on MND each turn." },
      newMoves: [
        { id: "meteor",    name: "Meteor",    type: "atk", dmgType: "magical", power: 2.5, manaCost: 25, effect: "burn",     cooldown: 3, desc: "Calls down a devastating meteor. Applies burn. 3-turn cooldown." },
        { id: "lightning", name: "Lightning", type: "atk", dmgType: "magical", power: 1.2, manaCost: 15, effect: "multicast",             desc: "Rapid lightning bolt with a chance to cast twice." },
      ],
      defMoveRename: { id: "arcane_ward", name: "Arcane Ward", renamedFrom: "mana_shield" },
      pathSkills: [
        { key: "spr_amp",         label: "Spirit Mastery", desc: "+2% SPR per point",                          max: 10, cost: 1  },
        { key: "multicast_amp",   label: "Spellsurge",     desc: "Multicast trigger chance improved per point", max: 5,  cost: 1  },
        { key: "remove_cooldown", label: "Eternal Meteor", desc: "Removes Meteor's cooldown entirely",          max: 1,  cost: 15 },
      ],
    },
    {
      key: "soulbinder",
      name: "Soulbinder",
      // soul_stack: gained on taking damage, max 10 base (+1 per soul_cap point), each stack +5% Drain heal
      passive: { name: "Blood Pact", desc: "Gain 1 Soul Stack each time you take damage (max 10 base). Drain heals +5% per Soul Stack." },
      newMoves: [
        { id: "soul_leech", name: "Soul Leech", type: "atk", dmgType: "magical", power: 1.1, manaCost: 15, effect: "drain", scalesStat: "spr+mnd", desc: "Drain life force. Scales SPR+MND. Heal scales with Soul Stacks." },
        { id: "death_coil", name: "Death Coil", type: "atk", dmgType: "magical", power: 1.0, manaCost: 15, effect: "curse",                        desc: "Curse the enemy — they lose HP each time they attack (scales SPR). 3 turns." },
      ],
      defMoveRename: { id: "void_barrier", name: "Void Barrier", renamedFrom: "mana_shield" },
      pathSkills: [
        { key: "soul_cap",   label: "Bottomless Soul", desc: "Soul Stack cap +1 per point",    max: 10, cost: 1  },
        { key: "drain_amp",  label: "Vampiric",         desc: "Drain heal +2% per point",      max: 10, cost: 1  },
        { key: "coil_bleed", label: "Hemorrhage",       desc: "Death Coil also applies bleed", max: 1,  cost: 10 },
      ],
    },
  ],

  thief: [
    {
      key: "assassin",
      name: "Assassin",
      // crit_stack: max 5, each stack = +20% crit multiplier; deathmark consumes 1 stack for guaranteed crit
      passive: { name: "Killing Edge", desc: "Each crit grants 1 Crit Stack (max 5). Each stack = +20% crit multiplier." },
      newMoves: [
        { id: "deathmark", name: "Deathmark", type: "atk", dmgType: "physical", power: 1.6, manaCost: 15, effect: "consume_crit_stack", desc: "Guaranteed crit if Crit Stacks > 0, consuming 1 stack." },
        { id: "flurry",    name: "Flurry",    type: "atk", dmgType: "physical", power: 0.6, manaCost: 15, hits: 3,                       desc: "Three rapid strikes. Each hit can crit independently." },
      ],
      healMove: { id: "predatory_strike", name: "Predatory Strike", type: "atk", dmgType: "physical", power: 1.1, manaCost: 15, effect: "crit_heal", healPctOnCrit: 0.40, consumesCritStack: true, desc: "On crit: heals 40% of damage dealt and consumes 1 crit stack." },
      defMoveRename: { id: "smoke_veil", name: "Smoke Veil", renamedFrom: "smoke_bomb" },
      pathSkills: [
        { key: "crit_chance_amp", label: "Precision",  desc: "Crit chance +2% per point",       max: 10, cost: 1  },
        { key: "crit_mult_amp",   label: "Lethal Edge", desc: "Crit multiplier +5% per point",   max: 10, cost: 1  },
        { key: "flurry_extra",    label: "Blade Storm", desc: "Flurry gains +1 additional hit",  max: 1,  cost: 10 },
      ],
    },
    {
      key: "venomancer",
      name: "Venomancer",
      // poison: dmg per tick = round(spr×0.15 + atk×0.15 + maxHp×0.01), 4 turns base
      // Toxicology: +10% poison dmg per active turn (resets on reapply)
      passive: { name: "Toxicology", desc: "Poison damage increases by 10% per turn it remains active (resets on reapply)." },
      newMoves: [
        { id: "venom_strike",  name: "Venom Strike",  type: "atk", dmgType: "physical", power: 1.0, manaCost: 15, effect: "poison",          desc: "Poisoned blade. Applies poison (spr×0.15 + atk×0.15 + maxHp×0.01 per tick, 4 turns)." },
        { id: "toxic_barrage", name: "Toxic Barrage", type: "atk", dmgType: "physical", power: 0.8, manaCost: 15, hits: 2, effect: "refresh_poison", desc: "Two venom-coated strikes. Refreshes active poison duration." },
      ],
      defMoveRename: { id: "shadow_veil", name: "Shadow Veil", renamedFrom: "smoke_bomb" },
      pathSkills: [
        { key: "poison_amp",      label: "Virulence",         desc: "Poison damage +2% per point",       max: 10, cost: 1  },
        { key: "poison_duration", label: "Lingering Toxin",   desc: "Poison duration +1 turn per point", max: 5,  cost: 1  },
        { key: "venom_bleed",     label: "Hemorrhagic Venom", desc: "Venom Strike also applies bleed",   max: 1,  cost: 10 },
      ],
    },
  ],

  druid: [
    {
      key: "archdruid",
      name: "Archdruid",
      // Harmony: MUST modify player.stats[stat] directly (not bonusFlat)
      passive: { name: "Harmony", desc: "Each win, gain +1 to TWO random base stats (modifies base stats directly)." },
      // wrath_of_nature power scales with number of Harmony-boosted stats in rpg-game.jsx
      newMoves: [
        { id: "wrath_of_nature", name: "Wrath of Nature", type: "atk",      dmgType: "magical", power: 1.0, manaCost: 20, effect: "harmony_scale", desc: "Nature's fury. Power scales with total number of Harmony-boosted stats." },
        { id: "verdant_bloom",   name: "Verdant Bloom",   type: "heal+atk", dmgType: "magical", power: 0.6, manaCost: 15,                          desc: "Bloom of life. Heals player, applies regen, deals small damage to enemy." },
      ],
      defMoveRename: { id: "ancient_bark", name: "Ancient Bark", renamedFrom: "bark_skin" },
      pathSkills: [
        { key: "stat_amp",  label: "Nature's Embrace", desc: "+1% to all base stats per point",      max: 10, cost: 1 },
        { key: "bloom_amp", label: "Overgrowth",       desc: "Verdant Bloom heal +3% per point",     max: 10, cost: 1 },
        { key: "wrath_amp", label: "Ancient Wrath",    desc: "Wrath of Nature +15% power per point", max: 5,  cost: 1 },
      ],
    },
    {
      key: "plaguekeeper",
      name: "Plaguekeeper",
      // wither: -3% enemy DEF per stack, max 10 stacks
      passive: { name: "Rot", desc: "Each turn, automatically apply 1 Wither Stack on the enemy (-3% DEF per stack, max 10)." },
      // decompose: bonus dmg per active DoT (burn/bleed/poison/wither each count)
      newMoves: [
        { id: "spore_cloud", name: "Spore Cloud", type: "atk", dmgType: "magical", power: 0.7, manaCost: 15, effect: "poison+bleed", desc: "Toxic spores. Applies poison and bleed simultaneously." },
        { id: "decompose",   name: "Decompose",   type: "atk", dmgType: "magical", power: 1.0, manaCost: 20, effect: "dot_bonus",   desc: "Accelerate decay. Bonus damage per active DoT on enemy (burn/bleed/poison/wither each count)." },
      ],
      defMoveRename: { id: "living_bark", name: "Living Bark", renamedFrom: "bark_skin" },
      pathSkills: [
        { key: "wither_amp",    label: "Deep Corrosion",  desc: "Wither DEF reduction +1% per stack per point",    max: 10, cost: 1  },
        { key: "decompose_amp", label: "Accelerated Rot", desc: "Decompose +10% power per active DoT per point",   max: 5,  cost: 1  },
        { key: "spore_burn",    label: "Burning Spores",  desc: "Spore Cloud also applies burn",                   max: 1,  cost: 10 },
      ],
    },
  ],

  monk: [
    {
      key: "grandmaster",
      name: "Grandmaster",
      // Eternal Flow: Serenity dmg 75% (from 50%), Inner Focus 4 turns (from 3)
      // transcendence: Serenity proc = 100% this turn only; chi_burst: bonus dmg from total heal this combat
      passive: { name: "Eternal Flow", desc: "Serenity damage = 75% of regen tick (up from 50%). Inner Focus grants 4 turns regen instead of 3." },
      newMoves: [
        { id: "transcendence", name: "Transcendence", type: "regen", dmgType: "heal", power: 0,   manaCost: 20, mndMult: 2.5, effect: "serenity_100", desc: "Massive regen (scales MND×2.5). Serenity proc = 100% of heal this turn only." },
        { id: "chi_burst",     name: "Chi Burst",     type: "atk",   dmgType: "chi",  power: 1.3, manaCost: 15, effect: "heal_scale",                 desc: "Chi explosion. Bonus damage scales with total HP healed this combat." },
      ],
      defMoveRename: { id: "iron_veil", name: "Iron Veil", renamedFrom: "iron_body" },
      pathSkills: [
        { key: "eternal_flow_amp", label: "Endless Serenity", desc: "Serenity damage +3% per point",       max: 10, cost: 1 },
        { key: "regen_amp",        label: "Vital Current",    desc: "Regen tick value +2% per point",      max: 10, cost: 1 },
        { key: "focus_duration",   label: "Deep Meditation",  desc: "Inner Focus +1 turn regen per point", max: 5,  cost: 1 },
      ],
    },
    {
      key: "duality",
      name: "Duality",
      // yin_stack: max 5 base (+1 per stack_cap), gained on magical dmg, +2% ATK temp per stack
      // yang_stack: max 5 base (+1 per stack_cap), gained on physical dmg, +2% SPR temp per stack
      // stacks reset each combat
      passive: { name: "Yin Yang", desc: "Physical dmg → gain 1 Yang Stack (+2% SPR temp, max 5). Magical dmg → gain 1 Yin Stack (+2% ATK temp, max 5). Stacks reset each combat." },
      newMoves: [
        { id: "inversion_strike", name: "Inversion Strike", type: "atk", dmgType: "physical", power: 1.2, manaCost: 15, scalesStat: "spr", effect: "consume_yin",  desc: "Physical strike that scales SPR. Consumes Yin Stacks for bonus damage." },
        { id: "soul_cannon",      name: "Soul Cannon",      type: "atk", dmgType: "magical",  power: 1.2, manaCost: 15, scalesStat: "atk", effect: "consume_yang", desc: "Magical blast that scales ATK. Consumes Yang Stacks for bonus damage." },
      ],
      healMove: { id: "equilibrium", name: "Equilibrium", type: "heal+atk", dmgType: "chi", power: 0.9, manaCost: 15, scalesStat: "atk+spr_avg", healPct: 0.30, desc: "Chi strike scaling ATK+SPR average. Heals 30% of damage dealt." },
      defMoveRename: { id: "mirror_stance", name: "Mirror Stance", renamedFrom: "iron_body" },
      pathSkills: [
        { key: "stack_cap",  label: "Deeper Balance", desc: "Yin/Yang stack cap +1 per point (max 5 pts invested)", max: 5,  cost: 1  },
        { key: "stack_amp",  label: "Resonance",      desc: "Stack ATK/SPR temp bonus +1% per point (both stacks)", max: 10, cost: 1  },
        { key: "dual_extra", label: "Twin Souls",     desc: "Inversion Strike and Soul Cannon each gain +1 hit",    max: 1,  cost: 10 },
      ],
    },
  ],
};
