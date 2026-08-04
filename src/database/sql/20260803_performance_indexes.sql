-- Índices seguros para PostgreSQL. Ejecutar una sola vez con: npm run db:indexes
-- CREATE INDEX IF NOT EXISTS no elimina ni modifica datos existentes.

CREATE INDEX IF NOT EXISTS idx_places_visible_created
  ON "Places" ("isHidden", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_places_city
  ON "Places" ("city");
CREATE INDEX IF NOT EXISTS idx_places_category
  ON "Places" ("category");
CREATE INDEX IF NOT EXISTS idx_places_billing_date
  ON "Places" ("billingDate");

CREATE INDEX IF NOT EXISTS idx_hotels_place_id
  ON "Hotels" ("placeId");
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_id
  ON "Rooms" ("hotelId");
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_price
  ON "Rooms" ("hotelId", "price");
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_type
  ON "Rooms" ("hotelId", "type");

CREATE INDEX IF NOT EXISTS idx_restaurants_place_id
  ON "Restaurants" ("placeId");
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id
  ON "MenuItems" ("restaurantId");
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_category
  ON "MenuItems" ("restaurantId", "category");
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_price
  ON "MenuItems" ("restaurantId", "dishPrice");

-- El modelo permite un solo like por usuario/lugar. Se conservan los IDs más antiguos
-- si la base histórica contiene duplicados previos al índice único.
DELETE FROM "Likes" AS duplicate
USING "Likes" AS original
WHERE duplicate."userId" = original."userId"
  AND duplicate."placeId" = original."placeId"
  AND duplicate."id" > original."id";

CREATE UNIQUE INDEX IF NOT EXISTS uniq_likes_user_place
  ON "Likes" ("userId", "placeId");
CREATE INDEX IF NOT EXISTS idx_likes_place_id
  ON "Likes" ("placeId");
CREATE INDEX IF NOT EXISTS idx_likes_user_id
  ON "Likes" ("userId");

CREATE INDEX IF NOT EXISTS idx_full_days_visible_created
  ON "FullDays" ("isHidden", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_full_days_city
  ON "FullDays" ("city");
CREATE INDEX IF NOT EXISTS idx_full_days_billing_date
  ON "FullDays" ("billingDate");

-- Búsquedas ILIKE con comodín inicial. Requiere permiso para instalar pg_trgm.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin permiso para instalar pg_trgm; se omiten índices de texto.';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_places_name_trgm
      ON "Places" USING gin ("name" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_places_city_trgm
      ON "Places" USING gin ("city" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_hotels_name_trgm
      ON "Hotels" USING gin ("name" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_restaurants_name_trgm
      ON "Restaurants" USING gin ("name" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_menu_items_name_trgm
      ON "MenuItems" USING gin ("dishName" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_full_days_name_trgm
      ON "FullDays" USING gin ("name" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_full_days_city_trgm
      ON "FullDays" USING gin ("city" gin_trgm_ops);
  END IF;
END $$;
