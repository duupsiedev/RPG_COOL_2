# Realm of Echoes / RPG COOL 2

React 18 / Vite browser RPG. Run `npm install`, then `npm run dev`.

Development checks (Node 22 or newer recommended; verified on Node 24.14.1):

- `npm test`: deterministic regression tests, using Node's built-in test runner.
- `npm run build`: production bundle in ignored `dist/`.
- `npm run check`: tests followed by production build.

The test runner currently reports explicit TODO failures for known defects. They
are **not passing checks** and do not fail the command. Remove each TODO when its
fix is implemented. Ordinary regression failures do fail the command.

See [the current architecture](docs/architecture.md) for the extracted combat
engine and Phase 2 validation. The [Phase 1 audit](docs/phase-1-audit.md) records
the original baseline and known defects.
