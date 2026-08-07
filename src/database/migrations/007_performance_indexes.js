/*
 * Índices de producción para catálogos, filtros, búsquedas y relaciones.
 * Todos usan IF NOT EXISTS para que sean seguros sobre instalaciones existentes.
 */
const sql = `
CREATE INDEX IF NOT EXISTS idx_users_role ON "Users" ("role");
CREATE INDEX IF NOT EXISTS idx_users_created_at ON "Users" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON "Users" ("lastLoginAt" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_users_role_created_at ON "Users" ("role", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_places_visible_created
  ON "Places" ("isHidden", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_places_admin_listing
  ON "Places" ("isHidden", "billingDate", "name");
CREATE INDEX IF NOT EXISTS idx_places_city
  ON "Places" ("city");
CREATE INDEX IF NOT EXISTS idx_places_category
  ON "Places" ("category");
CREATE INDEX IF NOT EXISTS idx_places_billing_date
  ON "Places" ("billingDate");
CREATE INDEX IF NOT EXISTS idx_places_destination_id
  ON "Places" ("destinationId");
CREATE INDEX IF NOT EXISTS idx_places_map_visibility
  ON "Places" ("showOnMap", "isHidden");
CREATE INDEX IF NOT EXISTS idx_places_public_map
  ON "Places" ("destinationId", "category", "name")
  WHERE "deletedAt" IS NULL
    AND "isHidden" = FALSE
    AND "showOnMap" = TRUE
    AND "latitude" IS NOT NULL
    AND "longitude" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hotels_place_id
  ON "Hotels" ("placeId");
CREATE INDEX IF NOT EXISTS idx_hotels_place_sort
  ON "Hotels" ("placeId", "sortOrder");

CREATE INDEX IF NOT EXISTS idx_rooms_hotel_id
  ON "Rooms" ("hotelId");
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_sort
  ON "Rooms" ("hotelId", "sortOrder");
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_price
  ON "Rooms" ("hotelId", "price");
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_type
  ON "Rooms" ("hotelId", "type");

CREATE INDEX IF NOT EXISTS idx_restaurants_place_id
  ON "Restaurants" ("placeId");
CREATE INDEX IF NOT EXISTS idx_restaurants_place_sort
  ON "Restaurants" ("placeId", "sortOrder");

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id
  ON "MenuItems" ("restaurantId");
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_category
  ON "MenuItems" ("restaurantId", "category", "sortOrder");
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_price
  ON "MenuItems" ("restaurantId", "dishPrice");

-- El modelo permite un solo like por usuario/lugar. Si una base histórica
-- contiene duplicados, conserva el registro más antiguo antes del índice único.
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
CREATE INDEX IF NOT EXISTS idx_full_days_admin_listing
  ON "FullDays" ("isHidden", "billingDate", "name");
CREATE INDEX IF NOT EXISTS idx_full_days_city
  ON "FullDays" ("city");
CREATE INDEX IF NOT EXISTS idx_full_days_billing_date
  ON "FullDays" ("billingDate");
CREATE INDEX IF NOT EXISTS idx_full_days_destination_id
  ON "FullDays" ("destinationId");
CREATE INDEX IF NOT EXISTS idx_full_days_map_visibility
  ON "FullDays" ("showOnMap", "isHidden");
CREATE INDEX IF NOT EXISTS idx_full_days_public_map
  ON "FullDays" ("destinationId", "name")
  WHERE "deletedAt" IS NULL
    AND "isHidden" = FALSE
    AND "showOnMap" = TRUE
    AND "latitude" IS NOT NULL
    AND "longitude" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_regions_catalog
  ON "Regions" ("isActive", "sortOrder", "name");
CREATE INDEX IF NOT EXISTS idx_tour_destinations_catalog
  ON tour_destinations (region_id, "isActive", "sortOrder", name);
CREATE INDEX IF NOT EXISTS idx_tour_destinations_current_active
  ON tour_destinations ("isActive");

CREATE INDEX IF NOT EXISTS idx_contact_created
  ON "ContactMessages" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_contact_status_created
  ON "ContactMessages" ("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_contact_phone
  ON "ContactMessages" ("phone");

CREATE INDEX IF NOT EXISTS idx_admin_activity_user_created
  ON "AdminActivityLogs" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_entity_created
  ON "AdminActivityLogs" ("entityType", "entityId", "createdAt" DESC);

-- Búsquedas ILIKE '%texto%'. Si el usuario de PostgreSQL no puede instalar
-- extensiones, la aplicación continúa funcionando y solo omite estos GIN.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin permiso para instalar pg_trgm; se omiten índices trigram.';
  END;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_places_name_trgm
      ON "Places" USING gin ("name" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_places_city_trgm
      ON "Places" USING gin ("city" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_places_map_address_trgm
      ON "Places" USING gin ("mapAddress" gin_trgm_ops);
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
    CREATE INDEX IF NOT EXISTS idx_full_days_map_address_trgm
      ON "FullDays" USING gin ("mapAddress" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_regions_name_trgm
      ON "Regions" USING gin ("name" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_tour_destinations_name_trgm
      ON tour_destinations USING gin (name gin_trgm_ops);
  END IF;
END $$;
`;

module.exports = {
  up: async ({ sequelize, transaction }) => {
    await sequelize.query(sql, { transaction });
  },
};
