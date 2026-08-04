module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Restaurant',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      placeId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(180), allowNull: false, validate: { notEmpty: true } },
      description: { type: DataTypes.TEXT, allowNull: true },
      images: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true, defaultValue: [] },
      category: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'restaurante' },
      menuPdf: { type: DataTypes.TEXT, allowNull: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'Restaurants', version: true, indexes: [{ fields: ['placeId', 'sortOrder'], name: 'idx_restaurants_place_sort' }] }
  );
