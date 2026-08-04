const sql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_MenuItems_category') THEN
    CREATE TYPE "enum_MenuItems_category" AS ENUM ('dishes', 'drinks', 'cocktails', 'specials');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Users" (
  "googleId" VARCHAR(128) PRIMARY KEY,
  "name" VARCHAR(150) NOT NULL,
  "email" VARCHAR(254) NULL UNIQUE,
  "avatar" TEXT NULL,
  "role" VARCHAR(20) NOT NULL DEFAULT 'user',
  "lastLoginAt" TIMESTAMPTZ NULL,
  "loginCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Places" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(180) NOT NULL,
  "city" VARCHAR(120) NOT NULL DEFAULT 'Ciudad Desconocida',
  "category" VARCHAR(30) NOT NULL DEFAULT 'lugar',
  "shortDescription" VARCHAR(500) NULL,
  "longDescription" TEXT NULL,
  "price" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "imageUrl" TEXT NULL,
  "gallery" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isHidden" BOOLEAN NOT NULL DEFAULT FALSE,
  "billingDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "createdBy" VARCHAR(128) NULL,
  "updatedBy" VARCHAR(128) NULL,
  "deletedBy" VARCHAR(128) NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS "Hotels" (
  "id" SERIAL PRIMARY KEY,
  "placeId" INTEGER NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT NULL,
  "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "category" VARCHAR(30) NOT NULL DEFAULT 'hotel',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Rooms" (
  "id" SERIAL PRIMARY KEY,
  "hotelId" INTEGER NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "type" VARCHAR(100) NULL,
  "description" TEXT NULL,
  "price" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "category" VARCHAR(30) NOT NULL DEFAULT 'habitacion',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Restaurants" (
  "id" SERIAL PRIMARY KEY,
  "placeId" INTEGER NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT NULL,
  "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "category" VARCHAR(30) NOT NULL DEFAULT 'restaurante',
  "menuPdf" TEXT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "MenuItems" (
  "id" SERIAL PRIMARY KEY,
  "restaurantId" INTEGER NOT NULL,
  "dishName" VARCHAR(180) NOT NULL,
  "dishDescription" TEXT NULL,
  "dishPrice" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "dishImage" TEXT NULL,
  "category" "enum_MenuItems_category" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Likes" (
  "id" SERIAL PRIMARY KEY,
  "userId" VARCHAR(128) NOT NULL,
  "placeId" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "FullDays" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(180) NOT NULL,
  "city" VARCHAR(120) NOT NULL,
  "description" TEXT NULL,
  "price" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "billingDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "imageUrl" TEXT NULL,
  "isHidden" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdBy" VARCHAR(128) NULL,
  "updatedBy" VARCHAR(128) NULL,
  "deletedBy" VARCHAR(128) NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ NULL
);
`;

module.exports = {
  up: async ({ sequelize, transaction }) => {
    await sequelize.query(sql, { transaction });
  },
};
