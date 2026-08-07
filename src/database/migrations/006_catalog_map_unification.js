/*
 * Unifica instalaciones existentes que pudieron haber usado dos estructuras
 * distintas de destinos/mapa.
 *
 * IMPORTANTE:
 * - Es aditiva e idempotente.
 * - No elimina publicaciones.
 * - Si Places/FullDays aún apuntan a "Destinations", primero retira esas FK,
 *   luego remapea los IDs y finalmente crea las FK hacia tour_destinations.
 *   Ese orden evita violaciones de FK durante el remapeo.
 */

const run = (sequelize, transaction, sql, replacements) =>
  sequelize.query(sql, { transaction, ...(replacements ? { replacements } : {}) });

const tableHasColumn = async (sequelize, transaction, tableName, columnName) => {
  const [rows] = await run(
    sequelize,
    transaction,
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = :tableName
         AND column_name = :columnName
     ) AS "exists";`,
    { tableName, columnName }
  );
  return Boolean(rows[0]?.exists);
};

const tableExists = async (sequelize, transaction, qualifiedName) => {
  const [rows] = await run(
    sequelize,
    transaction,
    `SELECT to_regclass(:qualifiedName) IS NOT NULL AS "exists";`,
    { qualifiedName }
  );
  return Boolean(rows[0]?.exists);
};

const getDestinationFkTarget = async (sequelize, transaction, tableName, constraintName) => {
  const [rows] = await run(
    sequelize,
    transaction,
    `SELECT c.confrelid::regclass::text AS "target"
     FROM pg_constraint c
     WHERE c.conname = :constraintName
       AND c.conrelid = to_regclass(:tableRegclass)
     LIMIT 1;`,
    {
      constraintName,
      tableRegclass: `public."${tableName}"`,
    }
  );
  return rows[0]?.target || null;
};

const renameLegacyTourDestinationsIfNeeded = async (sequelize, transaction) => {
  const exists = await tableExists(sequelize, transaction, 'public.tour_destinations');
  if (!exists) return;

  const hasLegacyColumn = await tableHasColumn(
    sequelize,
    transaction,
    'tour_destinations',
    'departamento_codigo'
  );
  const hasCanonicalColumn = await tableHasColumn(
    sequelize,
    transaction,
    'tour_destinations',
    'region_id'
  );

  if (!hasLegacyColumn || hasCanonicalColumn) return;

  const candidates = [
    'tour_destinations_legacy_map',
    'tour_destinations_legacy_map_2',
    'tour_destinations_legacy_map_3',
  ];

  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const candidateExists = await tableExists(sequelize, transaction, `public.${candidate}`);
    if (!candidateExists) {
      // Los nombres son constantes internos, no vienen del usuario.
      // eslint-disable-next-line no-await-in-loop
      await run(
        sequelize,
        transaction,
        `ALTER TABLE public.tour_destinations RENAME TO ${candidate};`
      );
      return;
    }
  }

  throw new Error(
    'No se pudo reservar un nombre de respaldo para la tabla antigua tour_destinations.'
  );
};

module.exports = {
  up: async ({ sequelize, transaction }) => {
    // 1) Campos visuales de regiones.
    await run(
      sequelize,
      transaction,
      `ALTER TABLE "Regions"
         ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
         ADD COLUMN IF NOT EXISTS "shortDescription" VARCHAR(500);`
    );

    // 2) Si existe el prototipo viejo del mapa, se conserva con otro nombre.
    await renameLegacyTourDestinationsIfNeeded(sequelize, transaction);

    // 3) Tabla canónica usada por el modelo Destination.
    await run(
      sequelize,
      transaction,
      `CREATE TABLE IF NOT EXISTS tour_destinations (
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
       );`
    );

    await run(
      sequelize,
      transaction,
      `ALTER TABLE tour_destinations
         ADD COLUMN IF NOT EXISTS region_id INTEGER,
         ADD COLUMN IF NOT EXISTS name VARCHAR(150),
         ADD COLUMN IF NOT EXISTS slug VARCHAR(180),
         ADD COLUMN IF NOT EXISTS image_url TEXT,
         ADD COLUMN IF NOT EXISTS short_description VARCHAR(500),
         ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
         ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0,
         ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();`
    );

    await run(
      sequelize,
      transaction,
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_tour_destinations_region_slug
         ON tour_destinations (region_id, slug);
       CREATE INDEX IF NOT EXISTS idx_tour_destinations_region
         ON tour_destinations (region_id);
       CREATE INDEX IF NOT EXISTS idx_tour_destinations_order
         ON tour_destinations (region_id, "sortOrder", name);
       CREATE INDEX IF NOT EXISTS idx_tour_destinations_current_active
         ON tour_destinations ("isActive");`
    );

    await run(
      sequelize,
      transaction,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'fk_tour_destinations_region'
             AND conrelid = 'public.tour_destinations'::regclass
         ) THEN
           ALTER TABLE tour_destinations
             ADD CONSTRAINT fk_tour_destinations_region
             FOREIGN KEY (region_id) REFERENCES "Regions"(id)
             ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
         END IF;
       END $$;`
    );

    // 4) Copia los destinos de la estructura oficial anterior, si existe.
    //    Todavía no tocamos las FK de Places/FullDays.
    const legacyDestinationsExists = await tableExists(
      sequelize,
      transaction,
      'public."Destinations"'
    );

    if (legacyDestinationsExists) {
      await run(
        sequelize,
        transaction,
        `INSERT INTO tour_destinations
           (region_id, name, slug, "isActive", "sortOrder", "createdAt", "updatedAt")
         SELECT
           d."regionId", d."name", d."slug", d."isActive", d."sortOrder", d."createdAt", d."updatedAt"
         FROM "Destinations" d
         WHERE d."regionId" IS NOT NULL AND d."slug" IS NOT NULL
         ON CONFLICT (region_id, slug) DO UPDATE SET
           name = EXCLUDED.name,
           "isActive" = EXCLUDED."isActive",
           "sortOrder" = EXCLUDED."sortOrder",
           "updatedAt" = GREATEST(tour_destinations."updatedAt", EXCLUDED."updatedAt");`
      );
    }

    // 5) Columnas de mapa/catalogación.
    await run(
      sequelize,
      transaction,
      `ALTER TABLE "Places"
         ADD COLUMN IF NOT EXISTS "destinationId" INTEGER,
         ADD COLUMN IF NOT EXISTS "mapAddress" VARCHAR(255),
         ADD COLUMN IF NOT EXISTS "latitude" NUMERIC(10,8),
         ADD COLUMN IF NOT EXISTS "longitude" NUMERIC(11,8),
         ADD COLUMN IF NOT EXISTS "showOnMap" BOOLEAN NOT NULL DEFAULT FALSE;

       ALTER TABLE "FullDays"
         ADD COLUMN IF NOT EXISTS "destinationId" INTEGER,
         ADD COLUMN IF NOT EXISTS "mapAddress" VARCHAR(255),
         ADD COLUMN IF NOT EXISTS "latitude" NUMERIC(10,8),
         ADD COLUMN IF NOT EXISTS "longitude" NUMERIC(11,8),
         ADD COLUMN IF NOT EXISTS "showOnMap" BOOLEAN NOT NULL DEFAULT FALSE;`
    );

    // 6) Detecta a qué tabla apuntan actualmente las FK.
    const placesTarget = await getDestinationFkTarget(
      sequelize,
      transaction,
      'Places',
      'fk_places_destination'
    );
    const fullDaysTarget = await getDestinationFkTarget(
      sequelize,
      transaction,
      'FullDays',
      'fk_full_days_destination'
    );

    const pointsToCanonical = (target) =>
      target === 'tour_destinations' || target === 'public.tour_destinations';

    const placesNeedsRemap = Boolean(placesTarget && !pointsToCanonical(placesTarget));
    const fullDaysNeedsRemap = Boolean(fullDaysTarget && !pointsToCanonical(fullDaysTarget));

    // 7) MUY IMPORTANTE: primero retiramos la FK antigua. Si intentáramos
    //    cambiar destinationId antes, PostgreSQL exigiría que el nuevo ID aún
    //    existiera en "Destinations" y abortaría la transacción.
    if (placesNeedsRemap) {
      await run(
        sequelize,
        transaction,
        `ALTER TABLE "Places" DROP CONSTRAINT IF EXISTS fk_places_destination;`
      );
    }

    if (fullDaysNeedsRemap) {
      await run(
        sequelize,
        transaction,
        `ALTER TABLE "FullDays" DROP CONSTRAINT IF EXISTS fk_full_days_destination;`
      );
    }

    // 8) Remapea IDs solo cuando la instalación realmente venía de
    //    "Destinations". La tabla anterior se conserva; no se borran datos.
    if (legacyDestinationsExists && placesNeedsRemap) {
      await run(
        sequelize,
        transaction,
        `UPDATE "Places" p
         SET "destinationId" = td.id
         FROM "Destinations" d
         JOIN tour_destinations td
           ON td.region_id = d."regionId" AND td.slug = d.slug
         WHERE p."destinationId" = d.id;`
      );
    }

    if (legacyDestinationsExists && fullDaysNeedsRemap) {
      await run(
        sequelize,
        transaction,
        `UPDATE "FullDays" f
         SET "destinationId" = td.id
         FROM "Destinations" d
         JOIN tour_destinations td
           ON td.region_id = d."regionId" AND td.slug = d.slug
         WHERE f."destinationId" = d.id;`
      );
    }

    // 9) Si quedó una FK con el mismo nombre pero a otra tabla, la retiramos.
    //    Esto también cubre bases parcialmente preparadas por scripts antiguos.
    await run(
      sequelize,
      transaction,
      `DO $$
       BEGIN
         IF EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'fk_places_destination'
             AND conrelid = 'public."Places"'::regclass
             AND confrelid <> 'public.tour_destinations'::regclass
         ) THEN
           ALTER TABLE "Places" DROP CONSTRAINT fk_places_destination;
         END IF;

         IF EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'fk_full_days_destination'
             AND conrelid = 'public."FullDays"'::regclass
             AND confrelid <> 'public.tour_destinations'::regclass
         ) THEN
           ALTER TABLE "FullDays" DROP CONSTRAINT fk_full_days_destination;
         END IF;
       END $$;`
    );

    // 10) FK definitivas hacia la tabla canónica.
    await run(
      sequelize,
      transaction,
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'fk_places_destination'
             AND conrelid = 'public."Places"'::regclass
         ) THEN
           ALTER TABLE "Places"
             ADD CONSTRAINT fk_places_destination
             FOREIGN KEY ("destinationId") REFERENCES tour_destinations(id)
             ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
         END IF;

         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'fk_full_days_destination'
             AND conrelid = 'public."FullDays"'::regclass
         ) THEN
           ALTER TABLE "FullDays"
             ADD CONSTRAINT fk_full_days_destination
             FOREIGN KEY ("destinationId") REFERENCES tour_destinations(id)
             ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
         END IF;
       END $$;`
    );

    // 11) Índices del módulo de mapas.
    await run(
      sequelize,
      transaction,
      `CREATE INDEX IF NOT EXISTS idx_places_destination_id ON "Places" ("destinationId");
       CREATE INDEX IF NOT EXISTS idx_places_map_visibility ON "Places" ("showOnMap", "isHidden");
       CREATE INDEX IF NOT EXISTS idx_places_map_coordinates ON "Places" ("latitude", "longitude");
       CREATE INDEX IF NOT EXISTS idx_full_days_destination_id ON "FullDays" ("destinationId");
       CREATE INDEX IF NOT EXISTS idx_full_days_map_visibility ON "FullDays" ("showOnMap", "isHidden");
       CREATE INDEX IF NOT EXISTS idx_full_days_map_coordinates ON "FullDays" ("latitude", "longitude");`
    );
  },
};
