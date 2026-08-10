/*
 * "Me gusta" para los Full Days.
 *
 * La tabla "Likes" solo tiene "placeId" y su índice único es
 * ("userId", "placeId"), así que no puede guardar el like de un Full
 * Day: son dos tablas distintas y los ids se pisarían entre sí.
 *
 * Se crea una tabla propia con la misma forma. Todo va con IF NOT
 * EXISTS para que sea seguro sobre una base ya instalada.
 */
const sql = `
CREATE TABLE IF NOT EXISTS "FullDayLikes" (
  "id" SERIAL PRIMARY KEY,
  "userId" VARCHAR(128) NOT NULL,
  "fullDayId" INTEGER NOT NULL
    REFERENCES "FullDays" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un usuario, un like por Full Day. Sin esto, pulsar dos veces seguidas
-- deja dos filas y el contador se dispara.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_full_day_likes_user_full_day
  ON "FullDayLikes" ("userId", "fullDayId");

CREATE INDEX IF NOT EXISTS idx_full_day_likes_full_day_id
  ON "FullDayLikes" ("fullDayId");
CREATE INDEX IF NOT EXISTS idx_full_day_likes_user_id
  ON "FullDayLikes" ("userId");
`;

module.exports = {
  up: async ({ sequelize, transaction }) => {
    await sequelize.query(sql, { transaction });
  },
};
