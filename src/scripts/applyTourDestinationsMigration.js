'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

function isSequelizeInstance(value) {
  return Boolean(value && typeof value.authenticate === 'function' && typeof value.query === 'function');
}

function resolveExistingSequelize() {
  try {
    // Se intenta reutilizar la conexión del proyecto sin cargar models/index.js.
    // Así la migración también funciona aunque todavía falte alguna tabla.
    const database = require('../config/database');
    const candidates = [
      database,
      database && database.sequelize,
      database && database.db,
      database && database.connection,
      database && database.default,
    ];

    return candidates.find(isSequelizeInstance) || null;
  } catch (error) {
    console.warn('No se pudo reutilizar config/database.js:', error.message);
    return null;
  }
}

function createSequelizeFromEnv() {
  const database = process.env.DB_NAME || process.env.POSTGRES_DB;
  const username = process.env.DB_USER || process.env.POSTGRES_USER;
  const password = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || '';
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || 5432);

  if (!database || !username) {
    throw new Error('Faltan DB_NAME o DB_USER en backend/.env.');
  }

  const useSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';

  return new Sequelize(database, username, password, {
    host,
    port,
    dialect: 'postgres',
    logging: false,
    dialectOptions: useSsl
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : undefined,
  });
}

async function main() {
  const reusedConnection = resolveExistingSequelize();
  const sequelize = reusedConnection || createSequelizeFromEnv();
  const ownsConnection = !reusedConnection;

  const sqlPath = path.resolve(
    __dirname,
    '../sql/002_create_tour_destinations_compatible.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await sequelize.authenticate();
    console.log('Conexión PostgreSQL correcta.');

    await sequelize.query(sql);

    const [tables] = await sequelize.query(`
      SELECT to_regclass('public.tour_destinations') AS destinations,
             to_regclass('public.tour_map_points') AS map_points;
    `);

    console.log('Migración aplicada correctamente.');
    console.log('Tablas verificadas:', tables[0]);
  } catch (error) {
    console.error('No se pudo aplicar la migración.');
    console.error(error.original || error);
    process.exitCode = 1;
  } finally {
    if (ownsConnection) {
      await sequelize.close().catch(() => undefined);
    }
  }
}

main();
