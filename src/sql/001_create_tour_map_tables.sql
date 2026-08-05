BEGIN;

CREATE TABLE IF NOT EXISTS tour_destinations (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  nombre_normalizado VARCHAR(180) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  departamento_codigo VARCHAR(2) NOT NULL,
  departamento_nombre VARCHAR(100) NOT NULL,
  provincia_codigo VARCHAR(2),
  provincia_nombre VARCHAR(100),
  distrito_codigo VARCHAR(2),
  distrito_nombre VARCHAR(100),
  descripcion TEXT,
  imagen_url TEXT,
  latitud NUMERIC(10,8),
  longitud NUMERIC(11,8),
  destacado BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tour_destinations_department ON tour_destinations (departamento_codigo);
CREATE INDEX IF NOT EXISTS idx_tour_destinations_name ON tour_destinations (nombre_normalizado);
CREATE INDEX IF NOT EXISTS idx_tour_destinations_active ON tour_destinations (activo);
CREATE INDEX IF NOT EXISTS idx_tour_destinations_slug ON tour_destinations (slug);

CREATE TABLE IF NOT EXISTS tour_map_points (
  id SERIAL PRIMARY KEY,
  destino_id INTEGER NOT NULL REFERENCES tour_destinations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  tipo VARCHAR(40) NOT NULL CHECK (tipo IN ('LUGAR_TURISTICO', 'HOTEL', 'RESTAURANTE', 'FULL_DAY')),
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tour_map_points_destination ON tour_map_points (destino_id);
CREATE INDEX IF NOT EXISTS idx_tour_map_points_type ON tour_map_points (tipo);
CREATE INDEX IF NOT EXISTS idx_tour_map_points_name ON tour_map_points (nombre_normalizado);
CREATE INDEX IF NOT EXISTS idx_tour_map_points_active ON tour_map_points (activo);
CREATE INDEX IF NOT EXISTS idx_tour_map_points_filters ON tour_map_points (destino_id, tipo, activo);
CREATE INDEX IF NOT EXISTS idx_tour_map_points_coordinates ON tour_map_points (latitud, longitud);

COMMIT;
