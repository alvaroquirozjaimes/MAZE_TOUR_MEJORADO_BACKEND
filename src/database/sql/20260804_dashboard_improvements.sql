-- Migración aditiva e idempotente para el dashboard y roles.
-- No elimina ni altera datos existentes.

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "role" VARCHAR(20) NOT NULL DEFAULT 'user';

UPDATE "Users"
SET "role" = 'user'
WHERE "role" IS NULL OR "role" NOT IN ('admin', 'user');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE "Users"
      ADD CONSTRAINT users_role_check CHECK ("role" IN ('admin', 'user'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_role ON "Users" ("role");

CREATE INDEX IF NOT EXISTS idx_places_admin_listing
  ON "Places" ("isHidden", "billingDate", "name");

CREATE INDEX IF NOT EXISTS idx_full_days_admin_listing
  ON "FullDays" ("isHidden", "billingDate", "name");
