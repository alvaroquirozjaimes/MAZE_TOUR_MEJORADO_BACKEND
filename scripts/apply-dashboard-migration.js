const fs = require('fs/promises');
const path = require('path');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/config/database');
const { env } = require('../src/config/env');

const run = async () => {
  const sqlPath = path.resolve(
    __dirname,
    '../src/database/sql/20260804_dashboard_improvements.sql'
  );
  const sql = await fs.readFile(sqlPath, 'utf8');

  await sequelize.authenticate();

  if (env.dbSync && !env.isProduction) {
    require('../src/models');
    await sequelize.sync();
  }

  await sequelize.transaction(async (transaction) => {
    await sequelize.query(sql, { transaction });

    if (env.adminEmails.length) {
      await sequelize.query(
        `UPDATE "Users"
         SET "role" = 'admin', "updatedAt" = NOW()
         WHERE LOWER("email") IN (:adminEmails)`,
        {
          replacements: { adminEmails: env.adminEmails },
          type: QueryTypes.UPDATE,
          transaction,
        }
      );
    }
  });

  console.log('Migración de dashboard y roles aplicada correctamente.');
  await sequelize.close();
};

run().catch(async (error) => {
  console.error('No se pudo aplicar la migración del dashboard:', error);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
