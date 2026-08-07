const fs = require('fs');
const path = require('path');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const migrationsDir = path.resolve(__dirname, 'migrations');
const MIGRATION_LOCK = 'maze-tour-schema-migrations-v1';

const expectedMigrations = () =>
  fs.readdirSync(migrationsDir).filter((name) => /^\d+.*\.js$/.test(name)).sort();

const ensureMigrationTable = async (transaction) => {
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS "MazeMigrations" (
       "name" VARCHAR(255) PRIMARY KEY,
       "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );
     ALTER TABLE "MazeMigrations"
       ADD COLUMN IF NOT EXISTS "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();`,
    { transaction }
  );
};

const getAppliedMigrations = async (transaction) => {
  const rows = await sequelize.query('SELECT "name" FROM "MazeMigrations" ORDER BY "name" ASC;', {
    type: QueryTypes.SELECT,
    transaction,
  });
  return new Set(rows.map((row) => row.name));
};

/**
 * Aplica automáticamente solo las migraciones pendientes.
 *
 * - Una BD nueva queda preparada al primer arranque.
 * - Una BD existente conserva sus datos y solo recibe cambios nuevos.
 * - El advisory lock evita que dos procesos PM2 intenten migrar al mismo tiempo.
 */
const runPendingMigrations = async () => {
  const expected = expectedMigrations();
  if (!expected.length) return [];

  const transaction = await sequelize.transaction();
  try {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:lockName));', {
      replacements: { lockName: MIGRATION_LOCK },
      transaction,
    });

    await ensureMigrationTable(transaction);
    const applied = await getAppliedMigrations(transaction);
    const pending = expected.filter((name) => !applied.has(name));

    for (const name of pending) {
      const migrationPath = path.join(migrationsDir, name);
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const migration = require(migrationPath);
      if (!migration || typeof migration.up !== 'function') {
        throw new Error(`La migración ${name} no exporta una función up().`);
      }

      console.log(`[DB] Aplicando migración ${name}...`);
      await migration.up({ sequelize, transaction });
      await sequelize.query(
        'INSERT INTO "MazeMigrations" ("name", "executedAt") VALUES (:name, NOW()) ON CONFLICT ("name") DO NOTHING;',
        { replacements: { name }, transaction }
      );
    }

    await transaction.commit();
    if (pending.length) console.log(`[DB] ${pending.length} migración(es) aplicada(s) correctamente.`);
    else console.log('[DB] Esquema actualizado. No hay migraciones pendientes.');
    return pending;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

const assertMigrationsApplied = async () => {
  const expected = expectedMigrations();
  if (!expected.length) return;
  let rows;
  try {
    rows = await sequelize.query('SELECT "name" FROM "MazeMigrations";', { type: QueryTypes.SELECT });
  } catch {
    throw new Error('La base de datos todavía no tiene el esquema de Maze Tour preparado.');
  }
  const applied = new Set(rows.map((row) => row.name));
  const pending = expected.filter((name) => !applied.has(name));
  if (pending.length) {
    throw new Error(`Hay migraciones pendientes: ${pending.join(', ')}.`);
  }
};

module.exports = { assertMigrationsApplied, expectedMigrations, runPendingMigrations };
