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
  "imageUrl" TEXT NULL,
  "shortDescription" VARCHAR(500) NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Esta es la única tabla de destinos utilizada por el modelo actual.
CREATE TABLE IF NOT EXISTS tour_destinations (
  id SERIAL PRIMARY KEY,
  region_id INTEGER NOT NULL,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  image_url TEXT NULL,
  short_description VARCHAR(500) NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "Places"
  ADD COLUMN IF NOT EXISTS "destinationId" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "mapAddress" VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS "latitude" NUMERIC(10,8) NULL,
  ADD COLUMN IF NOT EXISTS "longitude" NUMERIC(11,8) NULL,
  ADD COLUMN IF NOT EXISTS "showOnMap" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "FullDays"
  ADD COLUMN IF NOT EXISTS "destinationId" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "mapAddress" VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS "latitude" NUMERIC(10,8) NULL,
  ADD COLUMN IF NOT EXISTS "longitude" NUMERIC(11,8) NULL,
  ADD COLUMN IF NOT EXISTS "showOnMap" BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tour_destinations_region') THEN
    ALTER TABLE tour_destinations
      ADD CONSTRAINT fk_tour_destinations_region FOREIGN KEY (region_id) REFERENCES "Regions"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_places_destination') THEN
    ALTER TABLE "Places"
      ADD CONSTRAINT fk_places_destination FOREIGN KEY ("destinationId") REFERENCES tour_destinations(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_full_days_destination') THEN
    ALTER TABLE "FullDays"
      ADD CONSTRAINT fk_full_days_destination FOREIGN KEY ("destinationId") REFERENCES tour_destinations(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_regions_country_slug ON "Regions" ("countryCode", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS uq_tour_destinations_region_slug ON tour_destinations (region_id, slug);
CREATE INDEX IF NOT EXISTS idx_regions_catalog ON "Regions" ("isActive", "sortOrder", "name");
CREATE INDEX IF NOT EXISTS idx_tour_destinations_catalog ON tour_destinations (region_id, "isActive", "sortOrder", name);
CREATE INDEX IF NOT EXISTS idx_tour_destinations_region ON tour_destinations (region_id);
CREATE INDEX IF NOT EXISTS idx_places_destination ON "Places" ("destinationId");
CREATE INDEX IF NOT EXISTS idx_full_days_destination ON "FullDays" ("destinationId");
CREATE INDEX IF NOT EXISTS idx_places_map_visibility ON "Places" ("showOnMap", "isHidden");
CREATE INDEX IF NOT EXISTS idx_full_days_map_visibility ON "FullDays" ("showOnMap", "isHidden");
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

    // Compatibilidad con instalaciones antiguas que solo tenían el texto city.
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
          `INSERT INTO tour_destinations (region_id, name, slug, "isActive", "sortOrder", "createdAt", "updatedAt")
           VALUES (:regionId, :name, :slug, FALSE, :sortOrder, NOW(), NOW())
           ON CONFLICT (region_id, slug) DO UPDATE SET name = EXCLUDED.name
           RETURNING id;`,
          { replacements: { regionId, name: city, slug, sortOrder: index }, transaction }
        );
        const destinationId = destinationRows[0]?.id;
        await sequelize.query(
          `UPDATE "Places" SET "destinationId" = :destinationId WHERE "destinationId" IS NULL AND LOWER(TRIM("city")) = LOWER(:city);
           UPDATE "FullDays" SET "destinationId" = :destinationId WHERE "destinationId" IS NULL AND LOWER(TRIM("city")) = LOWER(:city);`,
          { replacements: { destinationId, city }, transaction }
        );
      }
    }
  },
};
