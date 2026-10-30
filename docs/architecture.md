# Phase 2: extracted combat engine

Phase 2 separates rules and encounter execution from React. It deliberately
preserves the existing mechanics and seven known TODO failures. No new packages,
external APIs, hosted services, or paid tools were added.

## Modules

| Module | Responsibility |
| --- | --- |
| `engine/character.js` | Initial player state, effective stats, move selection, path application, healing passives and resource multipliers |
| `engine/damage.js` | Physical/magic/chi/void calculations, move scaling and penetration, poison damage, crit/evasion probabilities |
| `engine/status.js` | Status application, stacking, ticking and expiration |
| `engine/enemies.js` | Win/level scaling, enemy unlocks, boss rotation, injectable spawn randomness |
| `engine/rules.js` | Convenience exports for those four helper modules |
| `engine/abilities.js` | Player move guards, resource/cooldown costs, ability and passive resolution, delayed enemy-turn scheduling |
| `engine/enemyTurn.js` | Enemy-turn status/passive processing, action selection, boss charging/ultimates, shielding, victory/defeat checks |
| `engine/progression.js` | One shared victory calculation for rewards, passives, leveling and journey progress; victory publication and transitions |
| `engine/encounter.js` | Encounter initialization, milestone routing, resource/counter resets, controller wiring |
| `rpg-game.jsx` | React state, screen rendering, shop interactions, navigation handlers, animation/log callbacks, legacy saving |

Helper functions have no React dependencies. `resolveVictory` returns
`{ player, gold, exp, logs }` without mutating inputs. Supply its optional `random`
function to make passive stat rolls deterministic. `spawnEnemy` similarly accepts
an optional third argument for randomness.

## Controller boundary

`createCombatController(state, effects)` accepts the current snapshot
`{ player, enemy, playerTurn, busy, phase }` and returns `beginCombat(player)` and
`handleMove(move)`. React creates this controller on each render, preserving the
original captured-state behavior.

The `effects` object supplies state setters (`setPlayer`, `setEnemy`, `setScreen`,
`setLog`, `setPhase`, `setPlayerTurn`, `setBusy`, `setLastReward`, `setRunSummary`),
presentation callbacks (`addLog`, `spawnFloat`, `triggerShake`), and `deleteSave`.
It can override `random` and `schedule`; defaults are local `Math.random` and
`setTimeout`. The controller supplies `beginCombat` to the turn modules internally.

The turn functions are imperative orchestration functions, not pure reducers.
They do not import React, access localStorage, or manipulate the DOM. Their ports
let a test or future simulator replace state publication and timers. The pure
calculations and progression can also be called independently.

Timing remains 900ms for enemy turns, 1200ms for next encounters, and 1800ms for
reward notices. Animation timing and random draws remain in React. A future
simulator must account for presentation RNG consumption if it needs exact
browser-seed parity, rather than merely statistically equivalent battles.

## Preservation checks

Before extraction, 252 deterministic baseline scenarios were captured in
`tests/fixtures/phase-1-parity.json`. They cover every base/path move slot across
normal, direct-kill and status-kill setups, with a Monk multiclass, active effects,
stacks, and maximum path skills. Each hash covers full state (including logs and
animation state) at six time checkpoints plus the number of random draws.

All 252 match after extraction and consolidation of the two victory branches.
Do not regenerate the baseline to hide a refactor regression. An intentional
gameplay fix may require a separately reviewed baseline update.

`tests/engine.test.js` directly imports the engine, checks pure progression with
deep-frozen inputs, and completes an encounter without React/browser globals.
The older test adapter now imports all combat rules and the controller directly;
source slicing remains only for the legacy save helpers and React navigation/
presentation wrapper. That adapter still does not emulate real React batching or
effects. Replace this remaining UI adapter with lifecycle/browser tests during
the timing phase, rather than treating it as a simulator.

Validation after extraction:

- 31 passing tests, including the 252-scenario parity test; seven expected TODO
  failures remain visible and excluded from the failing exit status.
- Production Vite build passes.
- Actual React server rendering of the main menu through Vite succeeds.
- AST inspection found no unused imports in the extracted modules or component.
- `git diff --check` passes.
- Interactive browser testing was unavailable: the browser tool reported no
  connected browser. Server rendering does not verify clicks, autosave effects,
  StrictMode lifecycle, or visual layout.

## Deferred behavior changes

Poison refresh duplication, first-application regen duration, curse expiry,
missing save defaults/validation, stale timers, and same-render duplicate actions
are intentionally unchanged. So are one-hit shields with minimum one damage,
the `+120` resistance denominator, boss/multiclass/path timing, and the existing
save key/payload. No bug fixes or balance adjustments are bundled with extraction.

Next work should make each approved fix independently, promote its TODO to a
required regression test, and review any resulting parity differences. Save
migration/protection and timer invalidation remain Phases 3 and 4. The development
simulator and final browser validation remain later phases.
