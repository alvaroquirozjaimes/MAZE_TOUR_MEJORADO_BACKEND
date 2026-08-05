'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../config/database');

async function main() {
  const sqlPath = path.resolve(__dirname, '../sql/003_integrate_catalog_map.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await sequelize.authenticate();
    console.log('Conexión PostgreSQL correcta.');
    await sequelize.query(sql);
    const [rows] = await sequelize.query(`
      SELECT
        to_regclass('public.tour_destinations') AS destinations,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'Places' AND column_name = 'showOnMap'
        ) AS places_map_ready,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'FullDays' AND column_name = 'showOnMap'
        ) AS full_days_map_ready;
    `);
    console.log('Migración del mapa aplicada correctamente:', rows[0]);
  } catch (error) {
    console.error('No se pudo aplicar la migración del mapa.');
    console.error(error.original || error);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => undefined);
  }
}

main();
