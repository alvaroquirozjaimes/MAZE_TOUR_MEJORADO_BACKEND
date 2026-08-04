const sql = `
CREATE INDEX IF NOT EXISTS idx_users_role ON "Users" ("role");
CREATE INDEX IF NOT EXISTS idx_places_city ON "Places" ("city");
CREATE INDEX IF NOT EXISTS idx_places_category ON "Places" ("category");
CREATE INDEX IF NOT EXISTS idx_places_billing_date ON "Places" ("billingDate");
CREATE INDEX IF NOT EXISTS idx_full_days_city ON "FullDays" ("city");
CREATE INDEX IF NOT EXISTS idx_full_days_billing_date ON "FullDays" ("billingDate");
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_price ON "Rooms" ("hotelId", "price");
CREATE INDEX IF NOT EXISTS idx_rooms_hotel_type ON "Rooms" ("hotelId", "type");
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_price ON "MenuItems" ("restaurantId", "dishPrice");
CREATE INDEX IF NOT EXISTS idx_likes_place_id ON "Likes" ("placeId");
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON "Likes" ("userId");
CREATE INDEX IF NOT EXISTS idx_contact_email_created ON "ContactMessages" ("email", "createdAt" DESC);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_contact_status' AND conrelid = '"ContactMessages"'::regclass
  ) THEN
    ALTER TABLE "ContactMessages"
      ADD CONSTRAINT chk_contact_status CHECK ("status" IN ('new', 'read', 'archived')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_places_price_nonnegative' AND conrelid = '"Places"'::regclass
  ) THEN
    ALTER TABLE "Places"
      ADD CONSTRAINT chk_places_price_nonnegative CHECK ("price" >= 0) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_rooms_price_nonnegative' AND conrelid = '"Rooms"'::regclass
  ) THEN
    ALTER TABLE "Rooms"
      ADD CONSTRAINT chk_rooms_price_nonnegative CHECK ("price" >= 0) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_menu_price_nonnegative' AND conrelid = '"MenuItems"'::regclass
  ) THEN
    ALTER TABLE "MenuItems"
      ADD CONSTRAINT chk_menu_price_nonnegative CHECK ("dishPrice" >= 0) NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_full_days_price_nonnegative' AND conrelid = '"FullDays"'::regclass
  ) THEN
    ALTER TABLE "FullDays"
      ADD CONSTRAINT chk_full_days_price_nonnegative CHECK ("price" >= 0) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_places_created_by' AND conrelid = '"Places"'::regclass) THEN
    ALTER TABLE "Places" ADD CONSTRAINT fk_places_created_by FOREIGN KEY ("createdBy") REFERENCES "Users"("googleId") ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_places_updated_by' AND conrelid = '"Places"'::regclass) THEN
    ALTER TABLE "Places" ADD CONSTRAINT fk_places_updated_by FOREIGN KEY ("updatedBy") REFERENCES "Users"("googleId") ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_places_deleted_by' AND conrelid = '"Places"'::regclass) THEN
    ALTER TABLE "Places" ADD CONSTRAINT fk_places_deleted_by FOREIGN KEY ("deletedBy") REFERENCES "Users"("googleId") ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_full_days_created_by' AND conrelid = '"FullDays"'::regclass) THEN
    ALTER TABLE "FullDays" ADD CONSTRAINT fk_full_days_created_by FOREIGN KEY ("createdBy") REFERENCES "Users"("googleId") ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_full_days_updated_by' AND conrelid = '"FullDays"'::regclass) THEN
    ALTER TABLE "FullDays" ADD CONSTRAINT fk_full_days_updated_by FOREIGN KEY ("updatedBy") REFERENCES "Users"("googleId") ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_full_days_deleted_by' AND conrelid = '"FullDays"'::regclass) THEN
    ALTER TABLE "FullDays" ADD CONSTRAINT fk_full_days_deleted_by FOREIGN KEY ("deletedBy") REFERENCES "Users"("googleId") ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
`;

module.exports = {
  up: async ({ sequelize, transaction }) => {
    await sequelize.query(sql, { transaction });
  },
};
