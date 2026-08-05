'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../config/database');

const REQUIRED_COLUMNS = ['destinationId', 'mapAddress', 'latitude', 'longitude', 'showOnMap'];

async function getColumns(tableName) {
  const [rows] = await sequelize.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = :tableName
      ORDER BY ordinal_position`,
    { replacements: { tableName } }
  );

  return new Set(rows.map((row) => row.column_name));
}

async function assertTableReady(tableName) {
  const columns = await getColumns(tableName);
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(column));

  if (missing.length > 0) {
    throw new Error(`La tabla ${tableName} todavía no contiene: ${missing.join(', ')}`);
  }

  console.log(`✓ ${tableName}: columnas del mapa verificadas.`);
}

async function main() {
  const sqlPath = path.resolve(__dirname, '../sql/004_fix_missing_map_columns.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await sequelize.authenticate();
    console.log('✓ Conexión PostgreSQL correcta.');

    await sequelize.query(sql);

    await assertTableReady('Places');
    await assertTableReady('FullDays');

    console.log('✓ Corrección del mapa aplicada correctamente.');
    console.log('Ya puedes iniciar el backend con: npm run dev');
  } catch (error) {
    console.error('✗ No se pudo aplicar la corrección del mapa.');
    console.error(error.original || error.message || error);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => undefined);
  }
}

main();
