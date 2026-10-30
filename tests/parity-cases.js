import { createHash } from 'node:crypto';
import { createGame, data, plain } from './harness.js';

// Golden outcomes captured before Phase 2. Keep fixed when mechanically refactoring.
// They characterize current behavior (including bugs), not approved future balance.
export function captureParity() {
  const results = {};
  for (const cls of data.CLASSES) {
    for (const path of [null, ...(data.PATHS_DATA[cls.key] || [])]) {
      for (let slot = 0; slot < 4; slot++) {
        for (const mode of ['normal', 'direct-kill', 'status-kill']) {
          let seed = 1729, draws = 0;
          const g = createGame({ random: () => {
            draws++; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
          } });
          let p = data.applyMulticlass(g.initPlayer(cls.key), 'monk');
          if (path) p = g.applyPath(p, path.key);
          Object.assign(p, { hp: 120, mana: 100, maxMana: 100, exp: 90,
            burnStacks: 3, soulStacks: 3, critStacks: 2, yinStacks: 2, yangStacks: 2,
            catalystConsumed: 3, combatHealTotal: 50, wins: 7 });
          if (path) p.pathSkills = Object.fromEntries(path.pathSkills.map(s => [s.key, s.max]));
          const e = g.scaleEnemy(data.ENEMY_POOL[0], 0);
          Object.assign(e, { hp: mode === 'direct-kill' ? 1 : 10000, maxHp: 10000,
            witherStacks: 2, statusEffects: [
              { type: 'burn', turns: 3, dmg: mode === 'status-kill' ? 20000 : 3 },
              { type: 'bleed', turns: 3, dmg: 2 }, { type: 'poison', turns: 4, dmg: 4, ageBonus: 0.2 },
            ] });
          g.setState({ player: p, enemy: e, screen: 'combat' });
          g.call('handleMove', g.getPlayerMoves(p)[slot]);
          const snapshots = [plain(g.state())];
          for (const ms of [899, 1, 300, 900, 900]) { g.advance(ms); snapshots.push(plain(g.state())); }
          results[`${cls.key}/${path?.key || 'base'}/${slot}/${mode}`] = createHash('sha256')
            .update(JSON.stringify({ snapshots, draws })).digest('hex');
        }
      }
    }
  }
  return results;
}
