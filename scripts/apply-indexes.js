const fs = require('fs/promises');
const path = require('path');
const { sequelize } = require('../src/config/database');

const run = async () => {
  const sqlPath = path.resolve(__dirname, '../src/database/sql/20260803_performance_indexes.sql');
  const sql = await fs.readFile(sqlPath, 'utf8');
  await sequelize.authenticate();
  await sequelize.query(sql);
  console.log('Índices de rendimiento aplicados correctamente.');
  await sequelize.close();
};

run().catch(async (error) => {
  console.error('No se pudieron aplicar los índices:', error);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
