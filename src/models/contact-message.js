module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'ContactMessage',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      /* El formulario público ya no pide correo. La columna se queda
         por los mensajes antiguos, pero admite NULL. Sequelize salta
         el validador isEmail cuando el valor es null y allowNull. */
      email: { type: DataTypes.STRING(254), allowNull: true, validate: { isEmail: true } },
      phone: { type: DataTypes.STRING(40), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'new', validate: { isIn: [['new', 'read', 'archived']] } },
      readAt: { type: DataTypes.DATE, allowNull: true },
      ipAddress: { type: DataTypes.STRING(64), allowNull: true },
    },
    { tableName: 'ContactMessages', indexes: [{ fields: ['status', 'createdAt'], name: 'idx_contact_status_created' }] }
  );
