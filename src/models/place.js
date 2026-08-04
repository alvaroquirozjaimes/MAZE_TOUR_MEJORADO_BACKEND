module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Place',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(180), allowNull: false, validate: { notEmpty: true } },
      city: { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'Ciudad Desconocida', validate: { notEmpty: true } },
      category: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'lugar' },
      shortDescription: { type: DataTypes.STRING(500), allowNull: true },
      longDescription: { type: DataTypes.TEXT, allowNull: true },
      price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
      imageUrl: { type: DataTypes.TEXT, allowNull: true },
      gallery: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true, defaultValue: [] },
      isHidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      billingDate: { type: DataTypes.DATEONLY, allowNull: false },
      createdBy: { type: DataTypes.STRING(128), allowNull: true },
      updatedBy: { type: DataTypes.STRING(128), allowNull: true },
      deletedBy: { type: DataTypes.STRING(128), allowNull: true },
    },
    {
      tableName: 'Places',
      paranoid: true,
      version: true,
      indexes: [
        { fields: ['deletedAt', 'isHidden', 'createdAt'], name: 'idx_places_admin_state' },
        { fields: ['city'], name: 'idx_places_city' },
        { fields: ['category'], name: 'idx_places_category' },
        { fields: ['billingDate'], name: 'idx_places_billing_date' },
      ],
    }
  );
