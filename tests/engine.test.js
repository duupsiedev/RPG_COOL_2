import test from 'node:test';
import assert from 'node:assert/strict';
import { initPlayer, applyPath } from '../engine/character.js';
import { resolveVictory } from '../engine/progression.js';
import { createCombatController } from '../engine/encounter.js';
import { applyMulticlass, getClass } from '../gameData.js';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

test('shared victory calculation is deterministic and does not mutate frozen inputs', () => {
  let p = applyPath(applyMulticlass(initPlayer('druid'), 'druid'), 'archdruid');
  p = freeze({ ...p, exp: 95, wins: 24 });
  const e = freeze({ name: 'Boss', reward: { gold: 150, exp: 350 } });
  const before = JSON.stringify({ p, e });
  const a = resolveVictory(p, e, { random: () => 0, note: ' by status' });
  const b = resolveVictory(p, e, { random: () => 0, note: ' by status' });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify({ p, e }), before);
  assert.equal(a.player.bonusFlat.atk, 4);
  assert.equal(a.player.harmonyBoosts, 4);
  assert.equal(a.player.wins, 25);
  assert.equal(a.player.journeyLevel, 2);
  assert.equal(a.player.level, 4);
  assert.equal(a.player.gold, 200);
  assert.equal(a.logs[0], '💀 Boss defeated by status! +350 EXP +150 Gold');
});

test('engine can resolve a complete encounter without React, browser globals or source slicing', () => {
  const state = { player: initPlayer('mage'), enemy: null, playerTurn: true, busy: false, phase: 'active' };
  const logs = [], scheduled = [], notifications = [];
  const ports = {
    random: () => 0.99,
    schedule: (fn, delay) => scheduled.push({ fn, delay }),
    addLog: (...lines) => logs.push(...lines),
    spawnFloat: (...args) => notifications.push(args), triggerShake() {}, deleteSave() {},
  };
  for (const name of ['screen', 'enemy', 'log', 'phase', 'playerTurn', 'busy', 'player', 'lastReward', 'runSummary']) {
    ports[`set${name[0].toUpperCase()}${name.slice(1)}`] = value => { state[name] = value; };
  }
  createCombatController({ ...state }, ports).beginCombat(state.player);
  assert.equal(state.screen, 'combat');
  const originalEnemy = state.enemy;
  state.enemy = { ...state.enemy, hp: 1 };
  createCombatController({ ...state }, ports).handleMove(getClass('mage').moves[0]);
  assert.equal(state.phase, 'victory');
  assert.equal(state.player.wins, 1);
  assert.equal(state.player.gold, 50 + originalEnemy.reward.gold);
  assert.deepEqual(scheduled.map(t => t.delay), [1800, 1200]);
  assert.ok(logs.some(line => line.includes('defeated!')));
  assert.ok(notifications.length > 0);
  scheduled.find(t => t.delay === 1200).fn();
  assert.equal(state.phase, 'active');
  assert.equal(state.player.wins, 1);
  assert.ok(state.enemy.hp > 0);
});
