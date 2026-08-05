const { env } = require('../../config/env');

const peruRegions = [
  'Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao',
  'Cusco', 'Huancavelica', 'Huánuco', 'Ica', 'Junín', 'La Libertad', 'Lambayeque',
  'Lima', 'Loreto', 'Madre de Dios', 'Moquegua', 'Pasco', 'Piura', 'Puno',
  'San Martín', 'Tacna', 'Tumbes', 'Ucayali',
];

const slugify = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const schemaSql = `
CREATE TABLE IF NOT EXISTS "Regions" (
  "id" SERIAL PRIMARY KEY,
  "countryCode" VARCHAR(2) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(140) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Destinations" (
  "id" SERIAL PRIMARY KEY,
  "regionId" INTEGER NOT NULL,
  "name" VARCHAR(140) NOT NULL,
  "slug" VARCHAR(160) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "destinationId" INTEGER NULL;
ALTER TABLE "FullDays" ADD COLUMN IF NOT EXISTS "destinationId" INTEGER NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_destinations_region') THEN
    ALTER TABLE "Destinations"
      ADD CONSTRAINT fk_destinations_region FOREIGN KEY ("regionId") REFERENCES "Regions"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_places_destination') THEN
    ALTER TABLE "Places"
      ADD CONSTRAINT fk_places_destination FOREIGN KEY ("destinationId") REFERENCES "Destinations"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_full_days_destination') THEN
    ALTER TABLE "FullDays"
      ADD CONSTRAINT fk_full_days_destination FOREIGN KEY ("destinationId") REFERENCES "Destinations"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_regions_country_slug ON "Regions" ("countryCode", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS uq_destinations_region_slug ON "Destinations" ("regionId", "slug");
CREATE INDEX IF NOT EXISTS idx_regions_catalog ON "Regions" ("isActive", "sortOrder", "name");
CREATE INDEX IF NOT EXISTS idx_destinations_catalog ON "Destinations" ("regionId", "isActive", "sortOrder", "name");
CREATE INDEX IF NOT EXISTS idx_places_destination ON "Places" ("destinationId");
CREATE INDEX IF NOT EXISTS idx_full_days_destination ON "FullDays" ("destinationId");
`;

module.exports = {
  up: async ({ sequelize, transaction }) => {
    await sequelize.query(schemaSql, { transaction });

    const countryCode = env.countryCode || 'PE';
    const seedRegions = countryCode === 'PE' ? peruRegions : [];
    for (let index = 0; index < seedRegions.length; index += 1) {
      const name = seedRegions[index];
      await sequelize.query(
        `INSERT INTO "Regions" ("countryCode", "name", "slug", "isActive", "sortOrder", "version", "createdAt", "updatedAt")
         VALUES (:countryCode, :name, :slug, TRUE, :sortOrder, 0, NOW(), NOW())
         ON CONFLICT ("countryCode", "slug") DO UPDATE SET "name" = EXCLUDED."name";`,
        { replacements: { countryCode, name, slug: slugify(name), sortOrder: index }, transaction }
      );
    }

    const [legacyCities] = await sequelize.query(
      `SELECT DISTINCT TRIM("city") AS "city"
       FROM (
         SELECT "city" FROM "Places" WHERE "destinationId" IS NULL
         UNION ALL
         SELECT "city" FROM "FullDays" WHERE "destinationId" IS NULL
       ) legacy
       WHERE TRIM(COALESCE("city", '')) <> ''
       ORDER BY 1;`,
      { transaction }
    );

    if (legacyCities.length) {
      const [regionRows] = await sequelize.query(
        `INSERT INTO "Regions" ("countryCode", "name", "slug", "isActive", "sortOrder", "version", "createdAt", "updatedAt")
         VALUES (:countryCode, 'Por clasificar', 'por-clasificar', FALSE, 9999, 0, NOW(), NOW())
         ON CONFLICT ("countryCode", "slug") DO UPDATE SET "updatedAt" = NOW()
         RETURNING "id";`,
        { replacements: { countryCode }, transaction }
      );
      let regionId = regionRows[0]?.id;
      if (!regionId) {
        const [rows] = await sequelize.query(
          `SELECT "id" FROM "Regions" WHERE "countryCode" = :countryCode AND "slug" = 'por-clasificar' LIMIT 1;`,
          { replacements: { countryCode }, transaction }
        );
        regionId = rows[0]?.id;
      }

      for (let index = 0; index < legacyCities.length; index += 1) {
        const city = legacyCities[index].city;
        const slug = slugify(city) || `destino-${index + 1}`;
        const [destinationRows] = await sequelize.query(
          `INSERT INTO "Destinations" ("regionId", "name", "slug", "isActive", "sortOrder", "version", "createdAt", "updatedAt")
           VALUES (:regionId, :name, :slug, FALSE, :sortOrder, 0, NOW(), NOW())
           ON CONFLICT ("regionId", "slug") DO UPDATE SET "name" = EXCLUDED."name"
           RETURNING "id";`,
          { replacements: { regionId, name: city, slug, sortOrder: index }, transaction }
        );
        let destinationId = destinationRows[0]?.id;
        if (!destinationId) {
          const [rows] = await sequelize.query(
            `SELECT "id" FROM "Destinations" WHERE "regionId" = :regionId AND "slug" = :slug LIMIT 1;`,
            { replacements: { regionId, slug }, transaction }
          );
          destinationId = rows[0]?.id;
        }
        await sequelize.query(
          `UPDATE "Places" SET "destinationId" = :destinationId WHERE "destinationId" IS NULL AND LOWER(TRIM("city")) = LOWER(:city);
           UPDATE "FullDays" SET "destinationId" = :destinationId WHERE "destinationId" IS NULL AND LOWER(TRIM("city")) = LOWER(:city);`,
          { replacements: { destinationId, city }, transaction }
        );
      }
    }
  },
};
