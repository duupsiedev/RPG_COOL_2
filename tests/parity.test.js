import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureParity } from './parity-cases.js';

test('all class/path moves preserve pre-extraction state, logs, timing and random draws', () => {
  const expected = JSON.parse(readFileSync(new URL('./fixtures/phase-1-parity.json', import.meta.url), 'utf8'));
  const actual = captureParity();
  assert.deepEqual(Object.keys(actual), Object.keys(expected));
  for (const key of Object.keys(expected)) assert.equal(actual[key], expected[key], key);
});
