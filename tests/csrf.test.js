const test = require('node:test');
const assert = require('node:assert/strict');
const { safeEqual } = require('../src/middleware/csrf');

test('comparación CSRF es exacta', () => {
  assert.equal(safeEqual('abc123', 'abc123'), true);
  assert.equal(safeEqual('abc123', 'abc124'), false);
  assert.equal(safeEqual('', ''), false);
});
