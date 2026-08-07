/* ============================================================
   005 · Contacto sin correo

   El formulario público pasa a pedir nombre, celular y mensaje.
   "email" era NOT NULL, así que sin esta migración cualquier
   envío nuevo revienta con un error de la base de datos.

   No se borra la columna: los mensajes ya recibidos conservan su
   correo y siguen siendo consultables. Solo deja de exigirse.
   ============================================================ */

const sql = `
ALTER TABLE "ContactMessages" ALTER COLUMN "email" DROP NOT NULL;

-- El celular pasa a ser el dato de contacto obligatorio.
UPDATE "ContactMessages" SET "phone" = NULL WHERE btrim("phone") = '';

-- El índice viejo indexaba el correo, que ahora casi siempre será
-- NULL. Se reemplaza por uno útil para la bandeja del panel.
DROP INDEX IF EXISTS idx_contact_email_created;
CREATE INDEX IF NOT EXISTS idx_contact_created ON "ContactMessages" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_contact_phone ON "ContactMessages" ("phone");
`;

module.exports = {
  up: async ({ sequelize, transaction }) => {
    await sequelize.query(sql, { transaction });
  },
};
