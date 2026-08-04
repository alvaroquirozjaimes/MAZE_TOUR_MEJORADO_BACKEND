module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'AdminActivityLog',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      userId: { type: DataTypes.STRING(128), allowNull: true },
      action: { type: DataTypes.STRING(80), allowNull: false },
      entityType: { type: DataTypes.STRING(50), allowNull: false },
      entityId: { type: DataTypes.STRING(128), allowNull: true },
      details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      ipAddress: { type: DataTypes.STRING(64), allowNull: true },
      userAgent: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'AdminActivityLogs' }
  );
