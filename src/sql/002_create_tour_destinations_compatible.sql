BEGIN;

-- Tabla compatible con el modelo Destination que actualmente usa Maze Tour:
-- regionId -> region_id, name, slug, isActive y sortOrder.
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_tour_destinations_region_slug
  ON tour_destinations (region_id, slug);

CREATE INDEX IF NOT EXISTS idx_tour_destinations_region
  ON tour_destinations (region_id);

CREATE INDEX IF NOT EXISTS idx_tour_destinations_active
  ON tour_destinations ("isActive");

CREATE INDEX IF NOT EXISTS idx_tour_destinations_order
  ON tour_destinations (region_id, "sortOrder", name);

-- Relación con Regions. Se agrega solo cuando la tabla existe y aún no hay FK.
DO $$
BEGIN
  IF to_regclass('"Regions"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'fk_tour_destinations_region'
     ) THEN
    ALTER TABLE tour_destinations
      ADD CONSTRAINT fk_tour_destinations_region
      FOREIGN KEY (region_id)
      REFERENCES "Regions"(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Place ya consulta destinationId. Se crea la columna cuando todavía no existe.
DO $$
BEGIN
  IF to_regclass('"Places"') IS NOT NULL THEN
    ALTER TABLE "Places"
      ADD COLUMN IF NOT EXISTS "destinationId" INTEGER;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"Places"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'fk_places_destination'
     ) THEN
    ALTER TABLE "Places"
      ADD CONSTRAINT fk_places_destination
      FOREIGN KEY ("destinationId")
      REFERENCES tour_destinations(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"Places"') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_places_destination_id ON "Places" ("destinationId")';
  END IF;
END $$;

-- Tabla para las cajas/marcadores del mapa. Se conserva compatible con el
-- módulo entregado anteriormente.
CREATE TABLE IF NOT EXISTS tour_map_points (
  id SERIAL PRIMARY KEY,
  destino_id INTEGER NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  referencia_id VARCHAR(80),
  nombre VARCHAR(180) NOT NULL,
  nombre_normalizado VARCHAR(200) NOT NULL,
  descripcion TEXT,
  direccion VARCHAR(255),
  imagen_url TEXT,
  latitud NUMERIC(10,8) NOT NULL,
  longitud NUMERIC(11,8) NOT NULL,
  destacado BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_tour_map_points_tipo
    CHECK (tipo IN ('LUGAR_TURISTICO', 'HOTEL', 'RESTAURANTE', 'FULL_DAY'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_tour_map_points_destination'
  ) THEN
    ALTER TABLE tour_map_points
      ADD CONSTRAINT fk_tour_map_points_destination
      FOREIGN KEY (destino_id)
      REFERENCES tour_destinations(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tour_map_points_destination
  ON tour_map_points (destino_id);
CREATE INDEX IF NOT EXISTS idx_tour_map_points_type
  ON tour_map_points (tipo);
CREATE INDEX IF NOT EXISTS idx_tour_map_points_filters
  ON tour_map_points (destino_id, tipo, activo);
CREATE INDEX IF NOT EXISTS idx_tour_map_points_name
  ON tour_map_points (nombre_normalizado);

COMMIT;
