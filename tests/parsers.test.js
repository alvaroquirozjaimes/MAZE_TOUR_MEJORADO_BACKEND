const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureId, normalizeCategory, parseJson, positiveInteger, toBoolean, toNumber } = require('../src/utils/parsers');

test('parsers convierten valores válidos', () => {
  assert.equal(toNumber('12.50'), 12.5);
  assert.equal(toBoolean('true'), true);
  assert.equal(positiveInteger('500', 1, 50), 50);
  assert.equal(normalizeCategory('HOTEL'), 'hotel');
  assert.deepEqual(parseJson('[1,2]', []), [1, 2]);
  assert.equal(ensureId('4'), 4);
});

test('ensureId rechaza IDs inválidos', () => {
  assert.throws(() => ensureId('0'), /inválido/);
});
