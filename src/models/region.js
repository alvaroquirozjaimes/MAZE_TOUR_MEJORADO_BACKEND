module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Region',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      countryCode: { type: DataTypes.STRING(2), allowNull: false, defaultValue: 'PE' },
      name: { type: DataTypes.STRING(120), allowNull: false, validate: { notEmpty: true } },
      slug: { type: DataTypes.STRING(140), allowNull: false, validate: { notEmpty: true } },
      imageUrl: { type: DataTypes.TEXT, allowNull: true },
      shortDescription: { type: DataTypes.STRING(500), allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'Regions',
      version: true,
      indexes: [
        { unique: true, fields: ['countryCode', 'slug'], name: 'uq_regions_country_slug' },
        { fields: ['isActive', 'sortOrder', 'name'], name: 'idx_regions_catalog' },
      ],
    }
  );
