module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'ApiRateLimit',
    {
      key: { type: DataTypes.STRING(255), primaryKey: true },
      count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      resetAt: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: 'ApiRateLimits', indexes: [{ fields: ['resetAt'], name: 'idx_rate_limits_reset' }] }
  );
