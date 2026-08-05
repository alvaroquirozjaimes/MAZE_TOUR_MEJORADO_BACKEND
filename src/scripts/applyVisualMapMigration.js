'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../config/database');

async function main() {
  const sqlPath = path.resolve(__dirname, '../sql/005_visual_location_images.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await sequelize.authenticate();
    console.log('Conexión PostgreSQL correcta.');
    await sequelize.query(sql);

    const [rows] = await sequelize.query(`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'Regions' AND column_name = 'imageUrl'
        ) AS region_image_ready,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tour_destinations' AND column_name = 'image_url'
        ) AS destination_image_ready;
    `);

    console.log('Mejora visual del mapa aplicada correctamente:', rows[0]);
  } catch (error) {
    console.error('No se pudo aplicar la mejora visual del mapa.');
    console.error(error.original || error);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => undefined);
  }
}

main();
