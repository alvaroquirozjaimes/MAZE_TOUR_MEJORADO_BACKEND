const sql = `
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMPTZ NULL;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "loginCount" INTEGER NOT NULL DEFAULT 0;

-- Los usuarios existentes no tenían un campo de último acceso. Se usa updatedAt como aproximación
-- inicial; desde esta migración cada autenticación registra el dato exacto.
UPDATE "Users"
SET
  "lastLoginAt" = COALESCE("lastLoginAt", "updatedAt", "createdAt"),
  "loginCount" = CASE WHEN COALESCE("loginCount", 0) < 1 THEN 1 ELSE "loginCount" END;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_login_count') THEN
    ALTER TABLE "Users"
      ADD CONSTRAINT chk_users_login_count CHECK ("loginCount" >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_created_at ON "Users" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON "Users" ("lastLoginAt" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_users_role_created_at ON "Users" ("role", "createdAt" DESC);
`;

module.exports = {
  up: async ({ sequelize, transaction }) => {
    await sequelize.query(sql, { transaction });
  },
};
