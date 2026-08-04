module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'MenuItem',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      restaurantId: { type: DataTypes.INTEGER, allowNull: false },
      dishName: { type: DataTypes.STRING(180), allowNull: false, validate: { notEmpty: true } },
      dishDescription: { type: DataTypes.TEXT, allowNull: true },
      dishPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
      dishImage: { type: DataTypes.TEXT, allowNull: true },
      category: { type: DataTypes.ENUM('dishes', 'drinks', 'cocktails', 'specials'), allowNull: false },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'MenuItems',
      version: true,
      indexes: [
        { fields: ['restaurantId', 'category', 'sortOrder'], name: 'idx_menu_restaurant_sort' },
        { fields: ['restaurantId', 'dishPrice'], name: 'idx_menu_items_restaurant_price' },
      ],
    }
  );
