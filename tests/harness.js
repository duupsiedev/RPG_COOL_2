// Temporary UI adapter for navigation, animation callbacks and legacy saves.
// Combat rules/controller are direct imports; no combat source is sliced or copied.
// Replace the remaining UI adapter with browser/React lifecycle tests in Phase 4.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as data from '../gameData.js';
import * as rules from '../engine/rules.js';
import { createCombatController } from '../engine/encounter.js';

const source = readFileSync(new URL('../rpg-game.jsx', import.meta.url), 'utf8');
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`Test adapter boundary missing: ${start} / ${end}`);
  return source.slice(a, b);
}
const helpers = between('const SAVE_KEY', '// UI COMPONENTS');
const component = between('export default function RPGGame()', '  // ---- SCREENS ----')
  .replace('export default ', '');
const helperNames = [...helpers.matchAll(/^function (\w+)\(/gm)].map(m => m[1]);
const handlers = ['beginCombat', 'handleNewGame', 'handleContinue', 'handleClassSelect',
  'handleMulticlass', 'handlePath', 'handleMove'];
const stateNames = [...component.matchAll(/const \[(\w+),\s*set\w+\]\s*= useState/g)].map(m => m[1]);

export function createGame({ random = () => 0.99 } = {}) {
  const values = [], refs = [], storage = new Map(), timers = [];
  let cursor = 0, refCursor = 0, now = 0, nextTimer = 0;
  const math = Object.create(Math);
  math.random = () => random();
  const importedRules = { ...rules, spawnEnemy: (wins, level) => rules.spawnEnemy(wins, level, random) };
  const context = vm.createContext({ ...data, ...importedRules, Math: math,
    createCombatController: (state, ports) => createCombatController(state, { ...ports, random,
      schedule: (fn, delay) => context.setTimeout(fn, delay) }),
    useState(initial) {
      const i = cursor++;
      if (!(i in values)) values[i] = initial;
      return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }];
    },
    useRef(initial) { const i = refCursor++; return refs[i] ||= { current: initial }; },
    // Deliberately excludes React effect scheduling; save helpers tested independently.
    useEffect() {},
    setTimeout(fn, delay) { const id = ++nextTimer; timers.push({ id, at: now + delay, fn }); return id; },
    clearTimeout(id) { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    window: { confirm: () => false },
  });
  vm.runInContext(`${helpers}\n${component}\nreturn {${handlers.join(',')}}; }\n` +
    `globalThis.api = {${helperNames.join(',')}, RPGGame};`, context);
  const api = context.api;
  function render() { cursor = 0; refCursor = 0; return api.RPGGame(); }
  render();
  return {
    ...importedRules, ...api, storage,
    state: () => Object.fromEntries(stateNames.map((name, i) => [name, values[i]])),
    setState(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const i = stateNames.indexOf(key);
        if (i < 0) throw new Error(`Unknown state: ${key}`);
        values[i] = value;
      }
    },
    call(name, ...args) { return render()[name](...args); },
    render,
    advance(ms) {
      const until = now + ms;
      let count = 0;
      while (true) {
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        if (!timers.length || timers[0].at > until) break;
        if (++count > 10000) throw new Error('Timer loop exceeded test limit');
        const t = timers.shift(); now = t.at; t.fn();
      }
      now = until;
    },
  };
}

export function encounter(classKey = 'mage', options = {}) {
  const g = createGame(options);
  const player = g.initPlayer(classKey);
  const enemy = { name: 'Training enemy', icon: '', hp: 1000, maxHp: 1000,
    atk: 20, def: 0, spr: 20, mnd: 0, agi: 10,
    reward: { gold: 15, exp: 20 }, statusEffects: [],
    moves: [{ name: 'Strike', power: 1, dmgType: 'physical' }], charging: false, ult: null };
  g.setState({ player, enemy, screen: 'combat' });
  return g;
}
export const plain = value => JSON.parse(JSON.stringify(value));
export { data };
