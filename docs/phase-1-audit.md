# Phase 1: baseline and regression foundation

Historical baseline: Phase 2 has since extracted the engine. See
[the current architecture and verification report](architecture.md).

Scope: establish tests before substantive restructuring, per the implementation
brief's recommendation to deliver Phase 1 first. No production gameplay, visuals,
save format, or balance were changed. Phases 2–6 remain future work.

## Current architecture

| Source | Responsibility |
| --- | --- |
| `main.jsx` | React root and StrictMode |
| `index.html`, `vite.config.js` | Browser entry and bundling |
| `gameData.js` | Seven classes, eight enemies, three bosses, shop/skill definitions, multiclass names and application, path definitions and journey thresholds |
| `rpg-game.jsx`, helpers | Enemy scaling/spawning, player initialization, damage/stat formulas, status effects, path application, localStorage helpers |
| `rpg-game.jsx`, screen components | Menu, class/multiclass/path choices, shop/skills/journey purchases, run summary, visual helpers |
| `RPGGame` / `handleMove` | Navigation, combat state, ability execution, passive resolution, enemy actions, duplicate reward/level-up sequences, timers and autosave |
| `path 2.0.txt` | Existing untracked design notes; left untouched, not treated as authority to change balance |

The central component owns the complete encounter lifecycle. A player action
resolves immediately; a surviving enemy acts after 900ms. Victory starts the next
encounter after 1200ms, and its reward notice clears after 1800ms. Animation timers
also live in the component. Only the player is saved, so Continue starts a fresh
encounter rather than restoring the enemy and pending turn.

## Testing decision

Use `node:test` and `node:assert/strict` rather than introducing a dependency.
`tests/harness.js` reads the actual source and evaluates the helper and component
logic in an isolated Node VM, replacing hooks, randomness, timers, and storage.
It omits JSX and React effects. The adapter has explicit source boundaries and
fails if they disappear; it derives state slot names from the hook declarations.
No combat algorithms are copied into the tests.

This is a temporary bridge for testing the existing monolith before extraction.
It is intentionally coupled to source layout. During Phase 2, migrate these tests
to direct imports of pure engine functions and retire the adapter. It is not a
simulation engine or a replacement React renderer.

Random rolls are controlled per isolated VM, with ordered rolls for crit/evasion.
Timers advance deterministically without real waiting. Storage is an in-memory
map: tests never touch the user's browser saves.

## Verified results

- 28 passing regression tests; zero unexpected failures.
- Seven executable TODO cases reproduce existing defects or missing protections.
  TODO failures are visible in output but intentionally do not fail `npm test`.
- Production build passes (Vite 5.4.21 installed from the existing lockfile).
  The initial sandbox build could not read a parent directory; the approved
  build outside the sandbox succeeded.
- No production source edits or added dependencies.

Coverage includes physical/magical/chi/void damage, penetration and mixed damage,
stat bonuses, crit/evasion rolls, healing/regen, shield absorption, status refresh
and expiration, poison aging, cooldown/resource gating, all class initialization
and multiclass pairs, all path move installation, two victory routes, rewards,
leveling, journey caps, Druid/Mage passives, defeat, boss selection and ultimates,
encounter resets, save round-trips, malformed JSON and Continue.

These are representative behavioral tests, not exhaustive validation of every
path skill combination. Browser rendering, actual React batching/StrictMode,
autosave effect scheduling, unmount cleanup, shop clicks, and a full long-run
playthrough have not been verified. No visual/runtime-browser verification is
claimed from the successful build or headless handler tests.

## Findings requiring follow-up

Executable TODO reproductions:

1. `applyEffect(..., 'refresh_poison', ...)` looks up `refresh_poison` instead of
   the existing `poison` type, appending a duplicate rather than preserving its age
   and refreshing its duration.
2. First regen application always lasts three turns; `addTurns` is honored only
   on reapplication. This conflicts with duration-aware callers.
3. Curse is defined as three turns, but its duration never decrements, including
   across actual enemy turns.
4. Old saves missing fields receive no defaults.
5. Syntactically valid but invalid save schemas (e.g. `42`) are accepted by load.
6. A delayed enemy turn can overwrite a newly initialized character in the
   handler harness. No encounter invalidation or timer cancellation exists.
7. Two invocations of the same rendered action handler both execute because
   `busy` is a captured value. This demonstrates missing synchronous protection;
   whether ordinary UI clicks can reach it depends on React event scheduling.

Additional source observations, not silently corrected:

- Multiclass/path screens occur at 25/50 wins **before** spawning the bosses for
  those counts. Comments/design notes describe unlocks after those bosses.
  Resolve intended milestone semantics before changing this.
- Physical/magical resistance uses denominator `+120`, despite comments claiming
  `+50`. Tests preserve the implementation. Void still uses `+50` after its
  resistance penetration.
- Druid/Harmony gains go to `bonusFlat`, contrary to the note in `gameData.js`.
- Inner Focus description says MND × 0.3; execution defaults to × 0.5.
- Some conversion-skill comments claim `eff()` handles them, but that helper only
  handles ordinary bonuses and Yin/Yang. Review skill-by-skill before extraction.
- Shield consumption resets the entire shield and leaves at least one damage.
  This is characterized, not rebalanced.
- Saving catches storage errors silently; malformed JSON returns null while
  `hasSave()` still reports true. There is no explicit payload schema version.
- Victory processing and Artificier effects are duplicated. Refactor with tests
  checking both direct-kill and delayed-status-kill routes.
- HTML declares French although the visible game text is English.

## Recommended next stages

First extract helpers with no behavioral edits, switching their tests to direct
imports. Then consolidate victory/progression and isolate turn resolution from
React. Preserve event ordering, rounding, random roll order, and all timing values.
Keep bug fixes separate from mechanical extraction so behavioral changes are
reviewable. Promote each relevant TODO to a required passing test with its fix.

Implement versioned save parsing/migration with preservation of incompatible raw
data before changing the stored format. Add encounter generation IDs/cancellable
timers and an immediate action lock, with real React/browser tests for lifecycle
behavior. Build the balance simulator only after it can reuse the extracted rules.
Do not use this source-slicing test adapter as the long-term simulator.
