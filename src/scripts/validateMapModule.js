'use strict';

require('dotenv').config();
const { Op } = require('sequelize');
const { sequelize, Place, FullDay } = require('../models');

const countPlaceCategory = (category) => Place.count({ where: { category } });

async function main() {
  try {
    await sequelize.authenticate();
    console.log('✓ Conexión PostgreSQL correcta.');

    const [columnRows] = await sequelize.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('Places', 'FullDays')
        AND column_name IN ('mapAddress', 'latitude', 'longitude', 'showOnMap')
      ORDER BY table_name, column_name;
    `);

    const required = ['mapAddress', 'latitude', 'longitude', 'showOnMap'];
    for (const table of ['Places', 'FullDays']) {
      const existing = new Set(
        columnRows.filter((row) => row.table_name === table).map((row) => row.column_name)
      );
      const missing = required.filter((column) => !existing.has(column));
      if (missing.length) {
        throw new Error(`${table}: faltan columnas ${missing.join(', ')}`);
      }
      console.log(`✓ ${table}: columnas del mapa completas.`);
    }

    const [places, hotels, restaurants, fullDays, publicPlaces, publicFullDays] = await Promise.all([
      countPlaceCategory('lugar'),
      countPlaceCategory('hotel'),
      countPlaceCategory('restaurante'),
      FullDay.count(),
      Place.count({
        where: {
          isHidden: false,
          showOnMap: true,
          latitude: { [Op.not]: null },
          longitude: { [Op.not]: null },
        },
      }),
      FullDay.count({
        where: {
          isHidden: false,
          showOnMap: true,
          latitude: { [Op.not]: null },
          longitude: { [Op.not]: null },
        },
      }),
    ]);

    console.log('\nPublicaciones registradas:');
    console.log(`  Lugares turísticos: ${places}`);
    console.log(`  Hoteles: ${hotels}`);
    console.log(`  Restaurantes: ${restaurants}`);
    console.log(`  Full days: ${fullDays}`);
    console.log(`\nVisibles actualmente en el mapa público: ${publicPlaces + publicFullDays}`);
    console.log('✓ Validación del módulo de mapa terminada.');
  } catch (error) {
    console.error('✗ La validación del módulo de mapa falló.');
    console.error(error.original || error);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => undefined);
  }
}

main();
