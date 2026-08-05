BEGIN;

-- Campos del mapa para lugares, hoteles y restaurantes (todos dependen de Places).
ALTER TABLE IF EXISTS "Places"
  ADD COLUMN IF NOT EXISTS "destinationId" INTEGER,
  ADD COLUMN IF NOT EXISTS "mapAddress" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "latitude" NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS "longitude" NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS "showOnMap" BOOLEAN NOT NULL DEFAULT FALSE;

-- Campos del mapa para full days.
ALTER TABLE IF EXISTS "FullDays"
  ADD COLUMN IF NOT EXISTS "destinationId" INTEGER,
  ADD COLUMN IF NOT EXISTS "mapAddress" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "latitude" NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS "longitude" NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS "showOnMap" BOOLEAN NOT NULL DEFAULT FALSE;

-- Relaciones con destinos, solamente cuando la tabla de destinos existe.
DO $$
BEGIN
  IF to_regclass('public.tour_destinations') IS NOT NULL
     AND to_regclass('public."Places"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_places_destination'
         AND conrelid = 'public."Places"'::regclass
     ) THEN
    ALTER TABLE "Places"
      ADD CONSTRAINT fk_places_destination
      FOREIGN KEY ("destinationId") REFERENCES tour_destinations(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.tour_destinations') IS NOT NULL
     AND to_regclass('public."FullDays"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_full_days_destination'
         AND conrelid = 'public."FullDays"'::regclass
     ) THEN
    ALTER TABLE "FullDays"
      ADD CONSTRAINT fk_full_days_destination
      FOREIGN KEY ("destinationId") REFERENCES tour_destinations(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_places_destination_id
  ON "Places" ("destinationId");
CREATE INDEX IF NOT EXISTS idx_places_map_visibility
  ON "Places" ("showOnMap", "isHidden");
CREATE INDEX IF NOT EXISTS idx_places_map_coordinates
  ON "Places" ("latitude", "longitude");

CREATE INDEX IF NOT EXISTS idx_full_days_destination_id
  ON "FullDays" ("destinationId");
CREATE INDEX IF NOT EXISTS idx_full_days_map_visibility
  ON "FullDays" ("showOnMap", "isHidden");
CREATE INDEX IF NOT EXISTS idx_full_days_map_coordinates
  ON "FullDays" ("latitude", "longitude");

COMMIT;
