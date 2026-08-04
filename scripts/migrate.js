const fs = require('fs');
const path = require('path');
const { sequelize } = require('../src/config/database');

const migrationsDir = path.resolve(__dirname, '../src/database/migrations');

const ensureTable = async () => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "MazeMigrations" (
      "name" VARCHAR(255) PRIMARY KEY,
      "executedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const files = () =>
  fs
    .readdirSync(migrationsDir)
    .filter((name) => /^\d+.*\.js$/.test(name))
    .sort();

const executedNames = async () => {
  const [rows] = await sequelize.query('SELECT "name" FROM "MazeMigrations" ORDER BY "name" ASC;');
  return new Set(rows.map((row) => row.name));
};

const status = async () => {
  await ensureTable();
  const executed = await executedNames();
  for (const name of files()) {
    console.log(`${executed.has(name) ? 'aplicada  ' : 'pendiente '} ${name}`);
  }
};

const up = async () => {
  await ensureTable();
  const executed = await executedNames();

  for (const name of files()) {
    if (executed.has(name)) continue;
    const migration = require(path.join(migrationsDir, name));
    if (typeof migration.up !== 'function') {
      throw new Error(`La migración ${name} no exporta up().`);
    }

    const transaction = await sequelize.transaction();
    try {
      console.log(`Aplicando ${name}...`);
      await migration.up({ sequelize, transaction });
      await sequelize.query(
        'INSERT INTO "MazeMigrations" ("name", "executedAt") VALUES (:name, NOW());',
        { replacements: { name }, transaction }
      );
      await transaction.commit();
      console.log(`OK ${name}`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};

const main = async () => {
  const command = process.argv[2] || 'up';
  await sequelize.authenticate();
  if (command === 'status') await status();
  else if (command === 'up') await up();
  else throw new Error(`Comando no reconocido: ${command}`);
};

main()
  .catch((error) => {
    console.error('Error de migración:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
