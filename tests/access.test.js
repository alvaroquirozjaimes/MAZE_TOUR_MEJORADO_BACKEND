const test = require('node:test');
const assert = require('node:assert/strict');
const { isAdminUser, normalizeEmail } = require('../src/config/access');

test('solo el rol admin concede acceso', () => {
  assert.equal(isAdminUser({ role: 'admin', email: 'x@example.com' }), true);
  assert.equal(isAdminUser({ role: 'user', email: 'alvaroquiroz159357@gmail.com' }), false);
  assert.equal(isAdminUser(null), false);
});

test('normaliza correos', () => {
  assert.equal(normalizeEmail('  USER@EXAMPLE.COM '), 'user@example.com');
});
