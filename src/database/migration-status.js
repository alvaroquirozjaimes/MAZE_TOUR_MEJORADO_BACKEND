const fs = require('fs');
const path = require('path');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const migrationsDir = path.resolve(__dirname, 'migrations');

const expectedMigrations = () =>
  fs.readdirSync(migrationsDir).filter((name) => /^\d+.*\.js$/.test(name)).sort();

const assertMigrationsApplied = async () => {
  const expected = expectedMigrations();
  if (!expected.length) return;
  let rows;
  try {
    rows = await sequelize.query('SELECT "name" FROM "MazeMigrations";', { type: QueryTypes.SELECT });
  } catch {
    throw new Error('La base de datos no tiene migraciones aplicadas. Ejecuta: npm run db:migrate');
  }
  const applied = new Set(rows.map((row) => row.name));
  const pending = expected.filter((name) => !applied.has(name));
  if (pending.length) {
    throw new Error(`Hay migraciones pendientes (${pending.join(', ')}). Ejecuta: npm run db:migrate`);
  }
};

module.exports = { assertMigrationsApplied, expectedMigrations };
