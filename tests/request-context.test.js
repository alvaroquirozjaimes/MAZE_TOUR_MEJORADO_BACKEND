const test = require('node:test');
const assert = require('node:assert/strict');
const { validRequestId } = require('../src/middleware/request-context');

test('solo acepta identificadores de solicitud seguros', () => {
  assert.equal(validRequestId('web-123:abc'), true);
  assert.equal(validRequestId(''), false);
  assert.equal(validRequestId('a'.repeat(101)), false);
  assert.equal(validRequestId('cabecera\ninyectada'), false);
});
