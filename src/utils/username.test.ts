import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeUsername, validateUsername } from './username';

test('normalizes ASCII username by trimming spaces and lowercasing', () => {
  assert.equal(normalizeUsername('  Trail_Rider  '), 'trail_rider');
  assert.deepEqual(validateUsername('  Trail_Rider  '), {
    normalized: 'trail_rider', error: null, valid: true,
  });
});

test('accepts usernames at minimum and maximum allowed lengths', () => {
  assert.equal(validateUsername('abc').valid, true);
  assert.equal(validateUsername('a'.repeat(24)).valid, true);
});

test('rejects too-short, too-long, non-ASCII, whitespace, and punctuation inputs', () => {
  for (const value of ['ab', 'a'.repeat(25), 'café', 'two words', 'name.tag', 'tab\tname']) {
    assert.equal(validateUsername(value).valid, false, `expected ${JSON.stringify(value)} to be invalid`);
  }
});

test('canonical casing is consistent for uniqueness checks', () => {
  assert.equal(validateUsername('SameName').normalized, validateUsername('SAMENAME').normalized);
});
