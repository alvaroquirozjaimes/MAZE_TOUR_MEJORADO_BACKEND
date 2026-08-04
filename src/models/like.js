module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Like',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      placeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      tableName: 'Likes',
      indexes: [
        { unique: true, fields: ['userId', 'placeId'], name: 'uniq_likes_user_place' },
        { fields: ['placeId'], name: 'idx_likes_place_id' },
        { fields: ['userId'], name: 'idx_likes_user_id' },
      ],
    }
  );
