'use strict';

const MAP_POINT_TYPES = Object.freeze([
  'LUGAR_TURISTICO',
  'HOTEL',
  'RESTAURANTE',
  'FULL_DAY',
]);

/**
 * Modelo fábrica compatible con el patrón usado por MAZE_TOUR_MEJORADO:
 * const MapPoint = require('./mapPoint')(sequelize, DataTypes);
 */
module.exports = (sequelize, DataTypes) => {
  const MapPoint = sequelize.define(
    'MapPoint',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      destino_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      tipo: {
        type: DataTypes.STRING(40),
        allowNull: false,
        validate: {
          isIn: [MAP_POINT_TYPES],
        },
      },
      referencia_id: {
        type: DataTypes.STRING(80),
        allowNull: true,
      },
      nombre: {
        type: DataTypes.STRING(180),
        allowNull: false,
      },
      nombre_normalizado: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      descripcion: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      direccion: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      imagen_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      latitud: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: false,
      },
      longitud: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: false,
      },
      destacado: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      activo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      tableName: 'tour_map_points',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['destino_id'] },
        { fields: ['tipo'] },
        { fields: ['nombre_normalizado'] },
        { fields: ['activo'] },
        { fields: ['destino_id', 'tipo', 'activo'] },
        { fields: ['latitud', 'longitud'] },
      ],
    }
  );

  MapPoint.MAP_POINT_TYPES = MAP_POINT_TYPES;
  return MapPoint;
};

module.exports.MAP_POINT_TYPES = MAP_POINT_TYPES;
