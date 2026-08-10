module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    'Complaint',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },

      /* Correlativo visible para el consumidor. Lo genera una
         secuencia de Postgres en el servicio, no Sequelize. */
      code: { type: DataTypes.STRING(24), allowNull: false, unique: true },

      /* La norma distingue reclamo (disconformidad con el servicio)
         de queja (malestar por la atención). No es un matiz: solo
         el reclamo puede terminar en denuncia ante INDECOPI. */
      kind: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [['reclamo', 'queja']] },
      },

      /* ---------- Consumidor ---------- */
      fullName: { type: DataTypes.STRING(180), allowNull: false },
      documentType: { type: DataTypes.STRING(20), allowNull: false },
      documentNumber: { type: DataTypes.STRING(20), allowNull: false },
      /* Aquí el correo SÍ es obligatorio, al revés que en el
         formulario de contacto: el proveedor debe remitir copia de
         la hoja al consumidor, y sin correo no hay a dónde. */
      email: { type: DataTypes.STRING(254), allowNull: false, validate: { isEmail: true } },
      phone: { type: DataTypes.STRING(40), allowNull: true },
      address: { type: DataTypes.STRING(255), allowNull: false },
      isMinor: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      guardianName: { type: DataTypes.STRING(180), allowNull: true },

      /* ---------- Bien contratado ---------- */
      itemType: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [['producto', 'servicio']] },
      },
      itemDescription: { type: DataTypes.TEXT, allowNull: false },
      amountClaimed: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'PEN' },

      /* ---------- Detalle ---------- */
      detail: { type: DataTypes.TEXT, allowNull: false },
      request: { type: DataTypes.TEXT, allowNull: false },

      /* ---------- Respuesta ---------- */
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'answered', 'closed']] },
      },
      response: { type: DataTypes.TEXT, allowNull: true },
      respondedAt: { type: DataTypes.DATE, allowNull: true },
      respondedBy: { type: DataTypes.STRING(128), allowNull: true },

      dueAt: { type: DataTypes.DATE, allowNull: false },
      extendedUntil: { type: DataTypes.DATE, allowNull: true },

      ipAddress: { type: DataTypes.STRING(64), allowNull: true },
    },
    {
      tableName: 'Complaints',
      indexes: [
        { fields: ['status', 'dueAt'], name: 'idx_complaints_status_due' },
        { fields: ['createdAt'], name: 'idx_complaints_created' },
      ],
    }
  );
