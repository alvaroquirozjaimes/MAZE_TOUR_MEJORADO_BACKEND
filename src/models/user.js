module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'User',
    {
      googleId: {
        type: DataTypes.STRING(128),
        allowNull: false,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(254),
        allowNull: true,
        unique: true,
        validate: { isEmail: true },
      },
      avatar: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'user',
        validate: { isIn: [['admin', 'user']] },
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      loginCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
    },
    {
      tableName: 'Users',
      indexes: [
        { fields: ['email'], unique: true },
        { fields: ['role'], name: 'idx_users_role' },
        { fields: ['createdAt'], name: 'idx_users_created_at' },
        { fields: ['lastLoginAt'], name: 'idx_users_last_login_at' },
      ],
    }
  );
