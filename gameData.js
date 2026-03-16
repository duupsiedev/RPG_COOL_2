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
      { id: "drain",       name: "Drain",       type: "atk", dmgType: "magical", power: 0.85, manaCost: 15, effect: "drain", desc: "Drains life. Heals for damage done (SPR)." },
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
  { name: "Bandit King",   icon: "👑", isBoss: true, baseHp: 200, baseAtk: 18, baseDef: 12, baseSpr: 8,  baseMnd: 6,  baseAgi: 10, reward: { gold: 150, exp: 200 }, moves: [{ name: "Reign Slash", type: "atk", dmgType: "physical", power: 1.0 }, { name: "Execution",    type: "atk", dmgType: "physical", power: 1.8 }], ult: { name: "Kingslayer",    dmgType: "physical", power: 3.0 } },
  { name: "Lich",          icon: "☠️", isBoss: true, baseHp: 180, baseAtk: 12, baseDef: 8,  baseSpr: 20, baseMnd: 14, baseAgi: 8,  reward: { gold: 200, exp: 250 }, moves: [{ name: "Soul Leech",  type: "atk", dmgType: "magical",  power: 1.0 }, { name: "Death Coil",   type: "atk", dmgType: "magical",  power: 1.8 }], ult: { name: "Undying Curse", dmgType: "magical",  power: 3.0 } },
  { name: "Ancient Dragon",icon: "🐲", isBoss: true, baseHp: 300, baseAtk: 22, baseDef: 18, baseSpr: 16, baseMnd: 10, baseAgi: 12, reward: { gold: 300, exp: 400 }, moves: [{ name: "Talon Strike",type: "atk", dmgType: "physical", power: 1.0 }, { name: "Inferno Roar", type: "atk", dmgType: "magical",  power: 1.8 }], ult: { name: "Dragon's Wrath",dmgType: "magical",  power: 3.2 } },
];

export const SHOP_ITEMS = [
  { id: "weapon",      name: "Weapon",      stat: "atk", icon: "⚔️", t1: { price: 100, flat: 1, pct: 5 }, t2: { price: 400, flat: 5, pct: 10 } },
  { id: "armor",       name: "Armor",       stat: "def", icon: "🛡️", t1: { price: 100, flat: 1, pct: 5 }, t2: { price: 400, flat: 5, pct: 10 } },
  { id: "spirit_orb",  name: "Spirit Orb",  stat: "spr", icon: "🔮", t1: { price: 100, flat: 1, pct: 5 }, t2: { price: 400, flat: 5, pct: 10 } },
  { id: "mind_tome",   name: "Mind Tome",   stat: "mnd", icon: "📖", t1: { price: 100, flat: 1, pct: 5 }, t2: { price: 400, flat: 5, pct: 10 } },
  { id: "swift_boots", name: "Swift Boots", stat: "agi", icon: "👟", t1: { price: 100, flat: 1, pct: 5 }, t2: { price: 400, flat: 5, pct: 10 } },
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
