import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, encounter, plain, data } from './harness.js';

test('physical and magical damage retain current resistance and rounding', () => {
  const g = createGame();
  for (const calculate of [g.calcPhysDmg, g.calcMagDmg]) {
    assert.equal(calculate(100, 0, 1), 100);
    assert.equal(calculate(100, 120, 1), 60);
    assert.equal(calculate(100, 120, 1.5), 90);
    assert.equal(calculate(100, 120, 0), 5);
  }
  assert.equal(g.calcChiDmg(100, 120, 1), 60);
  assert.equal(g.calcVoidDmg(100, 250, 1), 60);
});

test('agility probabilities have current floors and caps', () => {
  const g = createGame();
  assert.deepEqual(plain(g.agiCheck(10, 10)), { crit: 0.15, evade: 0.05 });
  assert.deepEqual(plain(g.agiCheck(1000, 1)), { crit: 0.5, evade: 0 });
  assert.deepEqual(plain(g.agiCheck(1, 1000)), { crit: 0.05, evade: 0.35 });
});

test('stats combine flat, percent, skill and temporary bonuses', () => {
  const g = createGame(), p = g.initPlayer('knight');
  p.bonusFlat.atk = 6; p.bonusPct.atk = 10; p.skills.statBonus = 1;
  p.yinStacks = 2; p.pathSkills.stack_amp = 1;
  assert.equal(g.eff(p, 'atk'), 24);
});

test('move damage respects penetration, alternate scaling and mixed damage', () => {
  const g = createGame(), p = g.initPlayer('knight');
  p.stats.atk = 100; p.stats.def = 80; p.stats.spr = 60;
  const e = { def: 240, mnd: 120 };
  assert.equal(g.calcMoveDmg({ dmgType: 'physical', power: 1, defPen: 0.5 }, p, e), 60);
  assert.equal(g.calcMoveDmg({ dmgType: 'physical', power: 1, scalesStat: 'def', defPen: 0.5 }, p, e), 48);
  assert.equal(g.calcMoveDmg({ dmgType: 'mixed', power: 1.5 }, p, e), 240);
  assert.equal(g.effEnemyDef({ def: 100, witherStacks: 50 }, p), 0);
});

test('healing, mana regeneration and Monk multiclass Serenity', () => {
  const g = createGame(), p = g.initPlayer('mage');
  assert.equal(g.calcHeal(10), 28);
  assert.equal(g.getManaRegen(p), 12);
  assert.equal(g.serenityProc(p, 100, true), 0);
  const multi = data.applyMulticlass(p, 'monk');
  assert.equal(g.serenityProc(multi, 100, true), 50);
  assert.equal(g.serenityProc(multi, 100), 20);
  const grand = g.applyPath(g.initPlayer('monk'), 'grandmaster');
  assert.equal(g.serenityProc(grand, 100, true), 75);
});

for (const type of ['burn', 'bleed', 'poison']) {
  test(`${type} ticks, expires, clamps HP and does not mutate input`, () => {
    const g = createGame(), initial = { hp: 15, statusEffects: [] };
    let target = g.applyEffect(initial, type, 10);
    const duration = type === 'poison' ? 4 : 3;
    assert.equal(target.statusEffects[0].turns, duration);
    assert.equal(initial.statusEffects.length, 0);
    const snapshot = plain(target);
    const first = g.tickStatus(target);
    assert.equal(first.target.hp, 5);
    assert.equal(first.bleedHeal, type === 'bleed' ? 10 : 0);
    assert.deepEqual(plain(target), snapshot);
    for (let i = 0; i < duration; i++) target = g.tickStatus(target).target;
    assert.equal(target.hp, 0);
    assert.equal(target.statusEffects.length, 0);
  });
}

test('effect reapplication refreshes damage; regen stacks duration to six', () => {
  const g = createGame();
  let p = g.applyEffect({ hp: 100 }, 'burn', 4);
  p = g.applyEffect(p, 'burn', 9);
  assert.deepEqual(plain(p.statusEffects), [{ type: 'burn', turns: 3, dmg: 9 }]);
  p = g.applyEffect({ hp: 50 }, 'regen', 4);
  p = g.applyEffect(p, 'regen', 8);
  p = g.applyEffect(p, 'regen', 8);
  const tick = g.tickStatus(p);
  assert.equal(p.statusEffects[0].turns, 6);
  assert.equal(tick.regenHeal, 8);
  assert.equal(tick.target.hp, 50); // Caller, not tickStatus, applies regen healing.
});

test('poison ages by ten percent each tick', () => {
  const g = createGame();
  const p = g.applyEffect({ hp: 100 }, 'poison', 10);
  const a = g.tickStatus(p).target, b = g.tickStatus(a).target;
  assert.equal(a.hp, 90); assert.equal(b.hp, 79);
});

test('every class creates independent player state and four moves', () => {
  const g = createGame();
  for (const cls of data.CLASSES) {
    const a = g.initPlayer(cls.key), b = g.initPlayer(cls.key);
    assert.equal(g.getPlayerMoves(a).length, 4);
    assert.equal(a.hp, 100); assert.equal(a.gold, 50);
    a.stats.atk = -1;
    assert.equal(b.stats.atk, cls.stats.atk);
  }
});

test('all multiclass pairs preserve base stats and add HP/scaling', () => {
  const g = createGame();
  for (const a of data.CLASSES) for (const b of data.CLASSES) {
    const p = g.initPlayer(a.key), m = data.applyMulticlass(p, b.key);
    assert.equal(m.maxHp, 200); assert.equal(p.maxHp, 100);
    assert.equal(m.isSpecialized, a.key === b.key);
    assert.equal(m.combinedScaling, a.baseScaling + b.baseScaling);
    assert.deepEqual(m.stats, p.stats);
  }
});

test('every path installs its moves without modifying class definitions', () => {
  const g = createGame(), before = plain(data.CLASSES);
  for (const [key, paths] of Object.entries(data.PATHS_DATA)) for (const path of paths) {
    const p = g.applyPath(g.initPlayer(key), path.key), moves = g.getPlayerMoves(p);
    assert.equal(moves[0].id, path.newMoves[0].id);
    assert.equal(moves[1].id, path.newMoves[1].id);
    assert.equal(p.maxHp, 200);
    assert.equal(p.combinedScaling, Math.ceil(data.getClass(key).baseScaling * 1.5));
  }
  assert.deepEqual(plain(data.CLASSES), before);
});

test('enemy unlocks, scaling and repeating boss rotation', () => {
  const g = createGame();
  assert.equal(g.spawnEnemy(0).name, 'Wolf');
  assert.equal(g.spawnEnemy(5).name, 'Orc');
  for (const [wins, name] of [[25, 'Bandit King'], [50, 'Lich'], [75, 'Ancient Dragon'], [100, 'Bandit King']]) {
    assert.equal(g.spawnEnemy(wins).name, name);
    assert.equal(g.spawnEnemy(wins).isBoss, true);
  }
  const e = g.scaleEnemy(data.ENEMY_POOL[0], 0, 1);
  assert.equal(e.hp, 28); assert.equal(e.reward.exp, 20);
  assert.ok(g.scaleEnemy(data.ENEMY_POOL[0], 25, 2).hp > e.hp);
});

test('character creation and milestone screens use existing win counts', () => {
  const g = createGame(); g.call('handleClassSelect', 'knight');
  assert.equal(g.state().screen, 'combat');
  const p = g.state().player;
  g.call('beginCombat', { ...p, wins: 25 }); assert.equal(g.state().screen, 'multiclass');
  g.setState({ player: { ...p, wins: 25 } }); g.call('handleMulticlass', 'mage');
  assert.equal(g.state().enemy.name, 'Bandit King');
  g.call('beginCombat', { ...g.state().player, wins: 50 });
  assert.equal(g.state().screen, 'path_select');
});

test('normal hit, forced critical roll, and evasion execute actual handler', () => {
  for (const [rolls, expected] of [[[0.99, 0.99], 14], [[0.99, 0], 21], [[0], 0]]) {
    const queue = [...rolls], g = encounter('mage', { random: () => queue.shift() ?? 0.99 });
    g.call('handleMove', data.getClass('mage').moves[0]);
    assert.equal(g.state().enemy.hp, 1000 - expected);
  }
});

test('paid moves consume mana; insufficient mana and active cooldown block actions', () => {
  const g = encounter(), move = data.getClass('mage').moves[1];
  g.call('handleMove', move); assert.equal(g.state().player.mana, 35);
  for (const patch of [{ mana: 0 }, { moveCooldowns: { [move.id]: 2 } }]) {
    const h = encounter(); h.setState({ player: { ...h.state().player, ...patch } });
    h.call('handleMove', move);
    assert.equal(h.state().enemy.hp, 1000); assert.equal(h.state().busy, false);
  }
});

test('enemy action waits 900ms; shield blocks but retains minimum one damage', () => {
  const g = encounter();
  g.setState({ player: { ...g.state().player, shield: 100 } });
  g.call('handleMove', data.getClass('mage').moves[0]);
  g.advance(899); assert.equal(g.state().player.hp, 100);
  g.advance(1); assert.equal(g.state().player.hp, 99);
  assert.equal(g.state().player.shield, 0);
  assert.equal(g.state().playerTurn, true);
  assert.equal(g.state().busy, false);
});

test('healing caps at max HP and regen applies on enemy turn', () => {
  const g = encounter('druid');
  g.setState({ player: { ...g.state().player, hp: 90 } });
  g.call('handleMove', data.getClass('druid').moves[3]);
  assert.equal(g.state().player.hp, 100);
  const m = encounter('monk');
  m.setState({ player: { ...m.state().player, hp: 40 }, enemy: { ...m.state().enemy, statusEffects: [{ type: 'stun', turns: 1, dmg: 0 }] } });
  m.call('handleMove', data.getClass('monk').moves[1]); m.advance(900);
  assert.equal(m.state().player.hp, 48);
  assert.equal(m.state().enemy.hp, 996);
  assert.equal(m.state().player.statusEffects[0].turns, 2);
});

test('cooldowns are set on use and decrement on the following enemy turn', () => {
  const g = encounter();
  const move = { ...data.getClass('mage').moves[1], cooldown: 3 };
  g.call('handleMove', move); assert.equal(g.state().player.moveCooldowns[move.id], 3);
  g.advance(900); assert.equal(g.state().player.moveCooldowns[move.id], 2);
});

for (const dot of [false, true]) {
  test(`${dot ? 'status' : 'direct'} victory awards currency, XP, levels and one transition`, () => {
    const g = encounter();
    g.setState({ player: { ...g.state().player, exp: 90, skills: { xpBonus: 1, goldBonus: 1 } },
      enemy: { ...g.state().enemy, hp: dot ? 20 : 1, statusEffects: dot ? [{ type: 'burn', turns: 3, dmg: 100 }] : [] } });
    g.call('handleMove', data.getClass('mage').moves[0]);
    if (dot) g.advance(900);
    const p = g.state().player;
    assert.equal(g.state().phase, 'victory'); assert.equal(p.wins, 1);
    assert.equal(p.gold, 66); assert.equal(p.exp, 12); assert.equal(p.level, 2);
    assert.equal(p.expToNext, 130); assert.equal(p.skillPoints, 2); assert.equal(p.maxHp, 132);
    assert.equal(p.stats.spr, 30);
    g.advance(1199); assert.equal(g.state().phase, 'victory');
    g.advance(1); assert.equal(g.state().phase, 'active'); assert.equal(g.state().player.wins, 1);
  });
}

test('defeat records summary and clears save', () => {
  const g = encounter(); g.saveGame(g.state().player);
  g.setState({ player: { ...g.state().player, hp: 1 } });
  g.call('handleMove', data.getClass('mage').moves[0]); g.advance(900);
  assert.equal(g.state().phase, 'defeat'); assert.equal(g.state().player.hp, 0);
  assert.equal(g.state().runSummary.player.hp, 0); assert.equal(g.hasSave(), false);
});

test('boss ultimate charges, then executes on next enemy turn', () => {
  const g = encounter('mage', { random: () => 0.2 });
  g.setState({ player: { ...g.state().player, level: 10 },
    enemy: { ...g.state().enemy, ult: { name: 'Blast', power: 2, dmgType: 'magical' } } });
  g.call('handleMove', data.getClass('mage').moves[0]); g.advance(900);
  assert.equal(g.state().enemy.charging, true); assert.equal(g.state().player.hp, 100);
  g.call('handleMove', data.getClass('mage').moves[0]); g.advance(900);
  assert.equal(g.state().enemy.charging, false); assert.ok(g.state().player.hp < 100);
});

test('legacy save round-trip, continue, missing save and malformed JSON', () => {
  const g = createGame(); assert.equal(g.loadGame(), null);
  const p = g.initPlayer('ranger'); g.saveGame(p);
  assert.equal(g.hasSave(), true); assert.deepEqual(plain(g.loadGame()), plain(p));
  g.call('handleContinue'); assert.equal(g.state().screen, 'combat');
  assert.equal(g.state().player.classKey, 'ranger');
  g.storage.set('realm_of_echoes_save_v1', '{broken');
  assert.equal(g.loadGame(), null);
  assert.equal(g.storage.get('realm_of_echoes_save_v1'), '{broken');
  g.deleteSave(); assert.equal(g.hasSave(), false);
});

// Desired behavior not established/implemented yet. Do not lock bugs in as game rules.
test('poison refresh updates existing poison instead of adding a duplicate', { todo: 'Verified defect; Phase 2' }, () => {
  const g = createGame();
  const p = g.tickStatus(g.applyEffect({ hp: 100 }, 'poison', 10)).target;
  const refreshed = g.applyEffect(p, 'refresh_poison', 10, { duration: 6 });
  assert.equal(refreshed.statusEffects.length, 1);
  assert.equal(refreshed.statusEffects[0].turns, 6);
  assert.equal(refreshed.statusEffects[0].ageBonus, 0.1);
});
test('first regen application honors requested duration', { todo: 'Verified defect; Phase 2' }, () => {
  const g = createGame();
  assert.equal(g.applyEffect({ hp: 100 }, 'regen', 10, { addTurns: 4 }).statusEffects[0].turns, 4);
});
test('curse expires after its documented duration', { todo: 'Verified defect; Phase 2' }, () => {
  const g = encounter();
  g.setState({ enemy: g.applyEffect(g.state().enemy, 'curse', 1) });
  for (let i = 0; i < 3; i++) { g.call('handleMove', data.getClass('mage').moves[0]); g.advance(900); }
  assert.equal(g.state().enemy.statusEffects.length, 0);
});
test('missing save attributes receive defaults', { todo: 'Missing migration; Phase 3' }, () => {
  const g = createGame(), p = plain(g.initPlayer('mage'));
  delete p.skills; delete p.bonusFlat;
  g.storage.set('realm_of_echoes_save_v1', JSON.stringify(p));
  assert.deepEqual(plain(g.loadGame()).skills, { xpBonus: 0, goldBonus: 0, statBonus: 0 });
});
test('invalid save schemas are rejected without deleting original data', { todo: 'Missing validation; Phase 3' }, () => {
  const g = createGame(); g.storage.set('realm_of_echoes_save_v1', '42');
  assert.equal(g.loadGame(), null);
  assert.equal(g.storage.get('realm_of_echoes_save_v1'), '42');
});
test('stale enemy turns cannot overwrite a new character', { todo: 'Missing cancellation; Phase 4' }, () => {
  const g = encounter(); g.call('handleMove', data.getClass('mage').moves[0]);
  g.call('handleClassSelect', 'ranger'); g.advance(900);
  assert.equal(g.state().player.classKey, 'ranger');
});
test('same-render rapid input only schedules one enemy turn', { todo: 'Missing synchronous lock; Phase 4' }, () => {
  let rolls = 0;
  const g = encounter('mage', { random: () => { rolls++; return 0.99; } });
  const handler = g.render().handleMove;
  handler(data.getClass('mage').moves[0]); const afterOne = rolls;
  handler(data.getClass('mage').moves[0]); assert.equal(rolls, afterOne);
});

test('journey awards points for crossed thresholds and caps at level 30', () => {
  for (const [exp, level, points] of [[300, 2, 2], [100000, 30, 30]]) {
    const g = encounter();
    g.setState({ player: g.applyPath(g.state().player, 'archmage'),
      enemy: { ...g.state().enemy, hp: 1, reward: { gold: 0, exp } } });
    g.call('handleMove', g.getPlayerMoves(g.state().player)[0]);
    assert.equal(g.state().player.journeyLevel, level);
    assert.equal(g.state().player.journeyPoints, points);
  }
});

test('victory applies Druid and secondary Mage passives on both kill routes', () => {
  for (const dot of [false, true]) {
    const g = encounter('druid');
    const p = data.applyMulticlass(g.state().player, 'mage'); p.passiveWins2 = 4;
    g.setState({ player: p, enemy: { ...g.state().enemy, hp: dot ? 100 : 1,
      statusEffects: dot ? [{ type: 'burn', turns: 3, dmg: 1000 }] : [] } });
    g.call('handleMove', data.getClass('druid').moves[0]); if (dot) g.advance(900);
    assert.equal(g.state().player.bonusFlat.agi, 1);
    assert.equal(g.state().player.bonusFlat.spr, 1);
    assert.equal(g.state().player.passiveWins2, 5);
  }
});

test('boss encounters restore resources and clear per-encounter counters', () => {
  const g = createGame(), p = data.applyMulticlass(g.initPlayer('mage'), 'monk');
  Object.assign(p, { wins: 25, hp: 1, mana: 0, soulStacks: 9, combatHealTotal: 50, moveCooldowns: { meteor: 3 } });
  g.call('beginCombat', p);
  assert.equal(g.state().player.hp, 200); assert.equal(g.state().player.mana, 50);
  assert.equal(g.state().player.soulStacks, 0); assert.equal(g.state().player.combatHealTotal, 0);
  assert.deepEqual(plain(g.state().player.moveCooldowns), {});
});
