module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'FullDay',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(180), allowNull: false, validate: { notEmpty: true } },
      city: { type: DataTypes.STRING(120), allowNull: false, validate: { notEmpty: true } },
      description: { type: DataTypes.TEXT, allowNull: true },
      price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
      billingDate: { type: DataTypes.DATEONLY, allowNull: false },
      imageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
          const value = this.getDataValue('imageUrl');
          return value ? value.replace(/\\/g, '/') : null;
        },
      },
      isHidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdBy: { type: DataTypes.STRING(128), allowNull: true },
      updatedBy: { type: DataTypes.STRING(128), allowNull: true },
      deletedBy: { type: DataTypes.STRING(128), allowNull: true },
    },
    {
      tableName: 'FullDays',
      paranoid: true,
      version: true,
      indexes: [
        { fields: ['deletedAt', 'isHidden', 'createdAt'], name: 'idx_full_days_admin_state' },
        { fields: ['city'], name: 'idx_full_days_city' },
        { fields: ['billingDate'], name: 'idx_full_days_billing_date' },
      ],
    }
  );
