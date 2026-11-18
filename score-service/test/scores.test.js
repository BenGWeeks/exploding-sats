import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateScoreSubmission, MAX_SCORE } from '../scores.js';

const PUBKEY = 'ab'.repeat(32);
const check = (body) => validateScoreSubmission(body, { maxLevel: 10 });
const valid = { playerPubkey: PUBKEY, score: 1200, level: 3 };

test('accepts a normal submission and keeps only the signed fields', () => {
  assert.deepEqual(check({ ...valid, extra: 'ignored' }), { value: valid });
  assert.deepEqual(check({ ...valid, score: 0, level: 0 }).value, { ...valid, score: 0, level: 0 });
  assert.deepEqual(check({ ...valid, score: MAX_SCORE, level: 10 }).value, { ...valid, score: MAX_SCORE, level: 10 });
});

test('normalises the pubkey and rounds half-point scores', () => {
  const { value } = check({ ...valid, playerPubkey: PUBKEY.toUpperCase(), score: 150.5 });
  assert.equal(value.playerPubkey, PUBKEY);
  assert.equal(value.score, 151);
});

test('rejects NaN, Infinity and non-numbers for score', () => {
  // JSON cannot carry NaN, but 1e999 parses to Infinity; test the values directly too.
  for (const score of [NaN, Infinity, -Infinity, JSON.parse('1e999'), '100', null, [], {}, true]) {
    assert.equal(check({ ...valid, score }).error, 'Invalid score value', String(score));
  }
  for (const score of [-1, MAX_SCORE + 1]) {
    assert.equal(check({ ...valid, score }).error, 'Invalid score value', String(score));
  }
});

test('rejects NaN, fractions and out-of-range values for level', () => {
  for (const level of [NaN, Infinity, 1.5, -1, 11, '3', null, [], {}]) {
    assert.equal(check({ ...valid, level }).error, 'Invalid level value', String(level));
  }
});

test('rejects missing fields, bad pubkeys and non-object bodies', () => {
  for (const body of [null, undefined, 'x', 5, [], {}, { playerPubkey: PUBKEY, score: 1 }, { score: 1, level: 1 }]) {
    assert.match(check(body).error, /^Missing required fields/, JSON.stringify(body));
  }
  for (const playerPubkey of ['abc', `${PUBKEY}00`, 'zz'.repeat(32), 42, { length: 64 }]) {
    assert.match(check({ ...valid, playerPubkey }).error, /^Invalid playerPubkey/, String(playerPubkey));
  }
});

test('validates the optional difficulty and duration tags', () => {
  assert.deepEqual(check({ ...valid, difficulty: 'hard', duration: 90.4 }).value, { ...valid, difficulty: 'hard', duration: 90 });
  for (const difficulty of ['', 'x'.repeat(33), 'a\nb', 5, {}]) {
    assert.equal(check({ ...valid, difficulty }).error, 'Invalid difficulty value', String(difficulty));
  }
  for (const duration of [NaN, Infinity, -1, '90', 1e9]) {
    assert.equal(check({ ...valid, duration }).error, 'Invalid duration value', String(duration));
  }
});
