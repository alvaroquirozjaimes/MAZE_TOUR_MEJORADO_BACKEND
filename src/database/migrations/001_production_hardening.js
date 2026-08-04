const sql = `
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_trgm no pudo instalarse por falta de permisos; se omiten índices trigram.';
  END;
END $$;

ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "role" VARCHAR(20) NOT NULL DEFAULT 'user';
UPDATE "Users" SET "role" = 'user' WHERE "role" IS NULL OR "role" NOT IN ('admin', 'user');

ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ NULL;
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "createdBy" VARCHAR(128) NULL;
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "updatedBy" VARCHAR(128) NULL;
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "deletedBy" VARCHAR(128) NULL;
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
UPDATE "Places" SET "billingDate" = COALESCE("billingDate", "createdAt"::date, CURRENT_DATE) WHERE "billingDate" IS NULL;
ALTER TABLE "Places" ALTER COLUMN "billingDate" SET NOT NULL;
ALTER TABLE "Places" ALTER COLUMN "price" TYPE NUMERIC(12,2) USING ROUND(COALESCE("price", 0)::numeric, 2);
ALTER TABLE "Places" ALTER COLUMN "price" SET DEFAULT 0;
ALTER TABLE "Places" ALTER COLUMN "price" SET NOT NULL;

ALTER TABLE "FullDays" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ NULL;
ALTER TABLE "FullDays" ADD COLUMN IF NOT EXISTS "createdBy" VARCHAR(128) NULL;
ALTER TABLE "FullDays" ADD COLUMN IF NOT EXISTS "updatedBy" VARCHAR(128) NULL;
ALTER TABLE "FullDays" ADD COLUMN IF NOT EXISTS "deletedBy" VARCHAR(128) NULL;
ALTER TABLE "FullDays" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FullDays" ALTER COLUMN "price" TYPE NUMERIC(12,2) USING ROUND(COALESCE("price", 0)::numeric, 2);
ALTER TABLE "FullDays" ALTER COLUMN "price" SET DEFAULT 0;
ALTER TABLE "FullDays" ALTER COLUMN "price" SET NOT NULL;

ALTER TABLE "Hotels" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Hotels" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Rooms" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Rooms" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Rooms" ALTER COLUMN "price" TYPE NUMERIC(12,2) USING ROUND(COALESCE("price", 0)::numeric, 2);
ALTER TABLE "Rooms" ALTER COLUMN "price" SET DEFAULT 0;
ALTER TABLE "Rooms" ALTER COLUMN "price" SET NOT NULL;
ALTER TABLE "Restaurants" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Restaurants" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MenuItems" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MenuItems" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MenuItems" ALTER COLUMN "dishPrice" TYPE NUMERIC(12,2) USING ROUND(COALESCE("dishPrice", 0)::numeric, 2);
ALTER TABLE "MenuItems" ALTER COLUMN "dishPrice" SET DEFAULT 0;
ALTER TABLE "MenuItems" ALTER COLUMN "dishPrice" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "AdminActivityLogs" (
  "id" BIGSERIAL PRIMARY KEY,
  "userId" VARCHAR(128) NULL,
  "action" VARCHAR(80) NOT NULL,
  "entityType" VARCHAR(50) NOT NULL,
  "entityId" VARCHAR(128) NULL,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "ipAddress" VARCHAR(64) NULL,
  "userAgent" TEXT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "ContactMessages" (
  "id" BIGSERIAL PRIMARY KEY,
  "name" VARCHAR(150) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "phone" VARCHAR(40) NULL,
  "message" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'new',
  "readAt" TIMESTAMPTZ NULL,
  "ipAddress" VARCHAR(64) NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "ApiRateLimits" (
  "key" VARCHAR(255) PRIMARY KEY,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_role') THEN
    ALTER TABLE "Users" ADD CONSTRAINT chk_users_role CHECK ("role" IN ('admin', 'user'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_hotels_place') THEN
    ALTER TABLE "Hotels" ADD CONSTRAINT fk_hotels_place FOREIGN KEY ("placeId") REFERENCES "Places"("id") ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rooms_hotel') THEN
    ALTER TABLE "Rooms" ADD CONSTRAINT fk_rooms_hotel FOREIGN KEY ("hotelId") REFERENCES "Hotels"("id") ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_restaurants_place') THEN
    ALTER TABLE "Restaurants" ADD CONSTRAINT fk_restaurants_place FOREIGN KEY ("placeId") REFERENCES "Places"("id") ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_menu_items_restaurant') THEN
    ALTER TABLE "MenuItems" ADD CONSTRAINT fk_menu_items_restaurant FOREIGN KEY ("restaurantId") REFERENCES "Restaurants"("id") ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_likes_place') THEN
    ALTER TABLE "Likes" ADD CONSTRAINT fk_likes_place FOREIGN KEY ("placeId") REFERENCES "Places"("id") ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_likes_user') THEN
    ALTER TABLE "Likes" ADD CONSTRAINT fk_likes_user FOREIGN KEY ("userId") REFERENCES "Users"("googleId") ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_admin_logs_user') THEN
    ALTER TABLE "AdminActivityLogs" ADD CONSTRAINT fk_admin_logs_user FOREIGN KEY ("userId") REFERENCES "Users"("googleId") ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

DELETE FROM "Likes" a
USING "Likes" b
WHERE a."id" > b."id"
  AND a."userId" = b."userId"
  AND a."placeId" = b."placeId";
CREATE UNIQUE INDEX IF NOT EXISTS uniq_likes_user_place ON "Likes" ("userId", "placeId");
CREATE INDEX IF NOT EXISTS idx_places_admin_state ON "Places" ("deletedAt", "isHidden", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_full_days_admin_state ON "FullDays" ("deletedAt", "isHidden", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_places_billing_name ON "Places" ("billingDate", "name");
CREATE INDEX IF NOT EXISTS idx_full_days_billing_name ON "FullDays" ("billingDate", "name");
CREATE INDEX IF NOT EXISTS idx_hotels_place_sort ON "Hotels" ("placeId", "sortOrder", "id");
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_sort ON "Rooms" ("hotelId", "sortOrder", "id");
CREATE INDEX IF NOT EXISTS idx_restaurants_place_sort ON "Restaurants" ("placeId", "sortOrder", "id");
CREATE INDEX IF NOT EXISTS idx_menu_restaurant_sort ON "MenuItems" ("restaurantId", "category", "sortOrder", "id");
CREATE INDEX IF NOT EXISTS idx_admin_logs_entity ON "AdminActivityLogs" ("entityType", "entityId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_user ON "AdminActivityLogs" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_contact_status_created ON "ContactMessages" ("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON "ApiRateLimits" ("resetAt");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_places_name_trgm ON "Places" USING gin (lower("name") gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_places_city_trgm ON "Places" USING gin (lower("city") gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_hotels_name_trgm ON "Hotels" USING gin (lower("name") gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_restaurants_name_trgm ON "Restaurants" USING gin (lower("name") gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_menu_dish_name_trgm ON "MenuItems" USING gin (lower("dishName") gin_trgm_ops)';
  END IF;
END $$;
`;

module.exports = {
  up: async ({ sequelize, transaction }) => {
    await sequelize.query(sql, { transaction });
  },
};
