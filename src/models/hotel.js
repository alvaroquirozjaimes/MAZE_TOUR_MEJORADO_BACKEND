module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Hotel',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      placeId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(180), allowNull: false, validate: { notEmpty: true } },
      description: { type: DataTypes.TEXT, allowNull: true },
      images: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true, defaultValue: [] },
      category: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'hotel' },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'Hotels', version: true, indexes: [{ fields: ['placeId', 'sortOrder'], name: 'idx_hotels_place_sort' }] }
  );
