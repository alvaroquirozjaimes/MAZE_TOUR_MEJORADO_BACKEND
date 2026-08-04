module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'ContactMessage',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      email: { type: DataTypes.STRING(254), allowNull: false, validate: { isEmail: true } },
      phone: { type: DataTypes.STRING(40), allowNull: true },
      message: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'new', validate: { isIn: [['new', 'read', 'archived']] } },
      readAt: { type: DataTypes.DATE, allowNull: true },
      ipAddress: { type: DataTypes.STRING(64), allowNull: true },
    },
    { tableName: 'ContactMessages', indexes: [{ fields: ['status', 'createdAt'], name: 'idx_contact_status_created' }] }
  );
