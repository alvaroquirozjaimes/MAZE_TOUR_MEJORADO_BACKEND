// Agrega estas líneas en backend/src/models/index.js.
// Tu proyecto usa modelos fábrica, por eso ambos archivos reciben
// (sequelize, DataTypes).

const Destination = require('./destination')(sequelize, DataTypes);
const MapPoint = require('./mapPoint')(sequelize, DataTypes);

Destination.hasMany(MapPoint, {
  foreignKey: 'destino_id',
  as: 'puntosMapa',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});

MapPoint.belongsTo(Destination, {
  foreignKey: 'destino_id',
  as: 'destino',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});

// Incluye ambos modelos en el module.exports existente:
// module.exports = {
//   sequelize,
//   ...tusModelosActuales,
//   Destination,
//   MapPoint,
// };
