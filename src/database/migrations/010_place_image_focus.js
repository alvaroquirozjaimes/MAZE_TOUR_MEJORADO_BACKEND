/*
 * Encuadre de la portada.
 *
 * Las tarjetas del catálogo recortan la foto con `object-fit: cover`, que
 * siempre conserva el centro. En una foto vertical o con el motivo arriba
 * (una torre, un campanario) el centro es justo lo que no interesa.
 *
 * Se guardan tres valores por lugar:
 *   imageFocusX / imageFocusY  punto de la foto que debe quedar visible,
 *                              en porcentaje sobre la imagen original.
 *   imageZoom                  acercamiento sobre ese punto (1 = sin zoom).
 *
 * Los valores por defecto (50, 50, 1) reproducen exactamente el
 * comportamiento actual, así que ningún lugar ya publicado cambia de
 * aspecto al aplicar esta migración.
 */
const sql = `
ALTER TABLE "Places"
  ADD COLUMN IF NOT EXISTS "imageFocusX" SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "imageFocusY" SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "imageZoom" NUMERIC(4,2) NOT NULL DEFAULT 1.00;

-- La validación de Sequelize solo protege lo que pasa por la aplicación.
-- El CHECK protege la tabla de un script o de una consulta manual.
ALTER TABLE "Places" DROP CONSTRAINT IF EXISTS chk_places_image_focus;
ALTER TABLE "Places" ADD CONSTRAINT chk_places_image_focus
  CHECK (
    "imageFocusX" BETWEEN 0 AND 100
    AND "imageFocusY" BETWEEN 0 AND 100
    AND "imageZoom" BETWEEN 1.00 AND 3.00
  );
`;

module.exports = {
  up: async ({ sequelize, transaction }) => {
    await sequelize.query(sql, { transaction });
  },
};
