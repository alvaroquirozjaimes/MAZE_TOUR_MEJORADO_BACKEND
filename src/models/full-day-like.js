module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'FullDayLike',
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
      fullDayId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      tableName: 'FullDayLikes',
      indexes: [
        { unique: true, fields: ['userId', 'fullDayId'], name: 'uniq_full_day_likes_user_full_day' },
        { fields: ['fullDayId'], name: 'idx_full_day_likes_full_day_id' },
        { fields: ['userId'], name: 'idx_full_day_likes_user_id' },
      ],
    }
  );
