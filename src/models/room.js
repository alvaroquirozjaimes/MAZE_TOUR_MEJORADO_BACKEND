module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Room',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      hotelId: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(180), allowNull: false, validate: { notEmpty: true } },
      type: { type: DataTypes.STRING(100), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
      images: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true, defaultValue: [] },
      category: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'habitacion' },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'Rooms',
      version: true,
      indexes: [
        { fields: ['hotelId', 'sortOrder'], name: 'idx_rooms_hotel_sort' },
        { fields: ['hotelId', 'price'], name: 'idx_rooms_hotel_price' },
        { fields: ['hotelId', 'type'], name: 'idx_rooms_hotel_type' },
      ],
    }
  );
