/**
 * Obtiene la instancia real de Sequelize aunque config/database.js exporte:
 * - module.exports = sequelize
 * - module.exports = { sequelize }
 * - module.exports = { db: sequelize }
 * - module.exports = { connection: sequelize }
 * - module.exports = { default: sequelize }
 */
const databaseModule = require('../config/database');

const candidates = [
  databaseModule,
  databaseModule?.sequelize,
  databaseModule?.db,
  databaseModule?.connection,
  databaseModule?.default,
  databaseModule?.default?.sequelize,
  databaseModule?.default?.db,
  databaseModule?.default?.connection,
];

const sequelize = candidates.find(
  candidate => candidate && typeof candidate.define === 'function'
);

if (!sequelize) {
  const exportedKeys = databaseModule && typeof databaseModule === 'object'
    ? Object.keys(databaseModule).join(', ') || '(sin propiedades enumerables)'
    : typeof databaseModule;

  throw new TypeError(
    `No se encontró una instancia válida de Sequelize en src/config/database.js. ` +
    `Exportación detectada: ${exportedKeys}. ` +
    `Debe exportarse la instancia directamente o dentro de una propiedad sequelize.`
  );
}

module.exports = sequelize;
