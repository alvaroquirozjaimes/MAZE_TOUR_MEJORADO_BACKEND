'use strict';

module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Destination',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      regionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'region_id',
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notEmpty: true },
      },
      slug: {
        type: DataTypes.STRING(180),
        allowNull: false,
      },
      // La base de datos ya tiene estas columnas en snake_case.
      // Sequelize expone los valores al frontend en camelCase.
      imageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'image_url',
      },
      shortDescription: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'short_description',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'tour_destinations',
      indexes: [
        {
          unique: true,
          fields: ['region_id', 'slug'],
          name: 'uq_tour_destinations_region_slug',
        },
        {
          fields: ['region_id'],
          name: 'idx_tour_destinations_region',
        },
        {
          fields: ['isActive'],
          name: 'idx_tour_destinations_active',
        },
        {
          fields: ['region_id', 'sortOrder', 'name'],
          name: 'idx_tour_destinations_order',
        },
      ],
    }
  );
