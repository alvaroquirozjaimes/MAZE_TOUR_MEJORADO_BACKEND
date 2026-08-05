BEGIN;

-- Si quedó una tabla antigua del prototipo (columnas nombre/departamento_codigo),
-- se conserva como respaldo y se crea la tabla compatible con el catálogo real.
DO $$
BEGIN
  IF to_regclass('public.tour_destinations') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tour_destinations' AND column_name = 'departamento_codigo'
     )
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tour_destinations' AND column_name = 'region_id'
     ) THEN
    IF to_regclass('public.tour_destinations_legacy_map') IS NULL THEN
      ALTER TABLE tour_destinations RENAME TO tour_destinations_legacy_map;
    ELSE
      DROP TABLE tour_destinations CASCADE;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tour_destinations (
  id SERIAL PRIMARY KEY,
  region_id INTEGER NOT NULL,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tour_destinations
  ADD COLUMN IF NOT EXISTS region_id INTEGER,
  ADD COLUMN IF NOT EXISTS name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS slug VARCHAR(180),
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_tour_destinations_region_slug
  ON tour_destinations (region_id, slug);
CREATE INDEX IF NOT EXISTS idx_tour_destinations_region
  ON tour_destinations (region_id);
CREATE INDEX IF NOT EXISTS idx_tour_destinations_active
  ON tour_destinations ("isActive");
CREATE INDEX IF NOT EXISTS idx_tour_destinations_order
  ON tour_destinations (region_id, "sortOrder", name);

DO $$
BEGIN
  IF to_regclass('public."Regions"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tour_destinations_region') THEN
    ALTER TABLE tour_destinations
      ADD CONSTRAINT fk_tour_destinations_region
      FOREIGN KEY (region_id) REFERENCES "Regions"(id)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE IF EXISTS "Places"
  ADD COLUMN IF NOT EXISTS "destinationId" INTEGER,
  ADD COLUMN IF NOT EXISTS "mapAddress" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "latitude" NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS "longitude" NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS "showOnMap" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS "FullDays"
  ADD COLUMN IF NOT EXISTS "destinationId" INTEGER,
  ADD COLUMN IF NOT EXISTS "mapAddress" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "latitude" NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS "longitude" NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS "showOnMap" BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
  places_target REGCLASS;
  full_days_target REGCLASS;
BEGIN
  SELECT confrelid::regclass INTO places_target
  FROM pg_constraint
  WHERE conname = 'fk_places_destination'
  LIMIT 1;
  IF places_target IS NOT NULL AND places_target <> 'tour_destinations'::regclass THEN
    ALTER TABLE "Places" DROP CONSTRAINT fk_places_destination;
  END IF;

  SELECT confrelid::regclass INTO full_days_target
  FROM pg_constraint
  WHERE conname = 'fk_full_days_destination'
  LIMIT 1;
  IF full_days_target IS NOT NULL AND full_days_target <> 'tour_destinations'::regclass THEN
    ALTER TABLE "FullDays" DROP CONSTRAINT fk_full_days_destination;
  END IF;

  IF to_regclass('public."Places"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_places_destination') THEN
    ALTER TABLE "Places"
      ADD CONSTRAINT fk_places_destination
      FOREIGN KEY ("destinationId") REFERENCES tour_destinations(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF to_regclass('public."FullDays"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_full_days_destination') THEN
    ALTER TABLE "FullDays"
      ADD CONSTRAINT fk_full_days_destination
      FOREIGN KEY ("destinationId") REFERENCES tour_destinations(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_places_destination_id ON "Places" ("destinationId");
CREATE INDEX IF NOT EXISTS idx_places_map_visibility ON "Places" ("showOnMap", "isHidden");
CREATE INDEX IF NOT EXISTS idx_places_map_coordinates ON "Places" ("latitude", "longitude");
CREATE INDEX IF NOT EXISTS idx_full_days_destination_id ON "FullDays" ("destinationId");
CREATE INDEX IF NOT EXISTS idx_full_days_map_visibility ON "FullDays" ("showOnMap", "isHidden");
CREATE INDEX IF NOT EXISTS idx_full_days_map_coordinates ON "FullDays" ("latitude", "longitude");

COMMIT;
