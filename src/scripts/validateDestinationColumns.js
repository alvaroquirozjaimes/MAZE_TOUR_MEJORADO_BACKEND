'use strict';

require('dotenv').config();
const { sequelize } = require('../config/database');

async function main() {
  try {
    await sequelize.authenticate();
    console.log('✓ Conexión PostgreSQL correcta.');

    const [rows] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tour_destinations'
        AND column_name IN ('image_url', 'short_description')
      ORDER BY column_name;
    `);

    const columns = new Set(rows.map((row) => row.column_name));
    const missing = ['image_url', 'short_description'].filter(
      (column) => !columns.has(column)
    );

    if (missing.length) {
      throw new Error(
        `Faltan columnas en tour_destinations: ${missing.join(', ')}`
      );
    }

    const [testRows] = await sequelize.query(`
      SELECT id, image_url, short_description
      FROM tour_destinations
      ORDER BY id ASC
      LIMIT 1;
    `);

    console.log('✓ Columnas de destinos verificadas.');
    console.log(`✓ Consulta de prueba correcta (${testRows.length} fila(s)).`);
  } catch (error) {
    console.error('✗ No se pudo validar el catálogo de destinos.');
    console.error(error.original || error);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => undefined);
  }
}

main();
