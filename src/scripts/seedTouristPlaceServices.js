'use strict';

require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize, Place, Hotel, Room, Restaurant, MenuItem } = require('../models');
const { env } = require('../config/env');
const links = require('../data/touristPlaceServices.seed');
const { runPendingMigrations } = require('../database/migration-status');

const INTERIORS = path.resolve(__dirname, '../seed-assets/demo-catalog/interiors');
const RESTAURANTS = path.resolve(__dirname, '../seed-assets/demo-catalog/restaurants');
const HOTEL_DIR = path.join(env.uploadRoot, 'hotelImages');
const ROOM_DIR = path.join(env.uploadRoot, 'roomImages');
const RESTAURANT_DIR = path.join(env.uploadRoot, 'restaurantImages');
const MENU_DIR = path.join(env.uploadRoot, 'menuItems');

const slugify = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const ext = (filename) => path.extname(filename || '') || '.jpg';

async function ensureDirs() {
  await Promise.all([HOTEL_DIR, ROOM_DIR, RESTAURANT_DIR, MENU_DIR].map((dir) => fs.mkdir(dir, { recursive: true })));
}

async function copyAsset(root, sourceName, targetDir, targetBase) {
  const targetName = `${targetBase}${ext(sourceName)}`;
  const target = path.join(targetDir, targetName);
  await fs.copyFile(path.join(root, sourceName), target);
  return `uploads/${path.basename(targetDir)}/${targetName}`;
}

async function ensureHotel(place, data, transaction) {
  let hotel = await Hotel.findOne({
    where: { placeId: place.id, name: { [Op.iLike]: data.name } },
    transaction,
  });

  if (hotel) return { hotel, created: false };

  const hotelSlug = `${slugify(place.name)}-${slugify(data.name)}`;
  const images = [];
  for (let index = 0; index < data.images.length; index += 1) {
    images.push(await copyAsset(INTERIORS, data.images[index], HOTEL_DIR, `propio-hotel-${hotelSlug}-${index + 1}`));
  }

  hotel = await Hotel.create({
    placeId: place.id,
    name: data.name,
    description: data.description,
    images,
    category: 'hotel',
    sortOrder: 0,
  }, { transaction });

  for (let index = 0; index < data.rooms.length; index += 1) {
    const room = data.rooms[index];
    const roomImage = await copyAsset(INTERIORS, room.image, ROOM_DIR, `propio-room-${hotelSlug}-${index + 1}`);
    await Room.create({
      hotelId: hotel.id,
      name: room.name,
      type: room.type,
      description: room.description,
      price: room.price,
      images: [roomImage],
      category: 'habitacion',
      sortOrder: index,
    }, { transaction });
  }

  return { hotel, created: true };
}

async function ensureRestaurant(place, data, transaction) {
  let restaurant = await Restaurant.findOne({
    where: { placeId: place.id, name: { [Op.iLike]: data.name } },
    transaction,
  });

  if (restaurant) return { restaurant, created: false };

  const restaurantSlug = `${slugify(place.name)}-${slugify(data.name)}`;
  const images = [];
  for (let index = 0; index < data.images.length; index += 1) {
    images.push(await copyAsset(RESTAURANTS, data.images[index], RESTAURANT_DIR, `propio-rest-${restaurantSlug}-${index + 1}`));
  }

  restaurant = await Restaurant.create({
    placeId: place.id,
    name: data.name,
    description: data.description,
    images,
    category: 'restaurante',
    menuPdf: null,
    sortOrder: 0,
  }, { transaction });

  for (let index = 0; index < data.menu.length; index += 1) {
    const item = data.menu[index];
    const dishImage = await copyAsset(RESTAURANTS, item.image, MENU_DIR, `propio-menu-${restaurantSlug}-${index + 1}`);
    await MenuItem.create({
      restaurantId: restaurant.id,
      dishName: item.name,
      dishDescription: item.description,
      dishPrice: item.price,
      dishImage,
      category: item.category,
      sortOrder: index,
    }, { transaction });
  }

  return { restaurant, created: true };
}

async function processPlace(definition) {
  const place = await Place.findOne({
    where: {
      category: 'lugar',
      name: { [Op.iLike]: definition.placeName },
    },
  });

  if (!place) {
    console.warn(`  ! No se encontró el lugar turístico: ${definition.placeName}`);
    return;
  }

  await sequelize.transaction(async (transaction) => {
    let createdHotels = 0;
    let createdRestaurants = 0;

    for (const hotelData of definition.hotels || []) {
      const result = await ensureHotel(place, hotelData, transaction);
      if (result.created) createdHotels += 1;
    }

    for (const restaurantData of definition.restaurants || []) {
      const result = await ensureRestaurant(place, restaurantData, transaction);
      if (result.created) createdRestaurants += 1;
    }

    console.log(`  + ${place.name}: ${createdHotels} hotel(es) propio(s), ${createdRestaurants} restaurante(s) propio(s)`);
  });
}

async function main() {
  if ((env.countryCode || 'PE') !== 'PE') throw new Error('Este seed corresponde a Maze Tour Perú.');
  await sequelize.authenticate();
  await runPendingMigrations();
  await ensureDirs();

  console.log(`\n[SERVICIOS PROPIOS] Lugares a procesar: ${links.length}`);
  for (const definition of links) await processPlace(definition);
  console.log('\n[SERVICIOS PROPIOS] Carga terminada.');
  console.log('[SERVICIOS PROPIOS] Al entrar a esos lugares aparecerán los botones “Hoteles Propios” y “Restaurantes Propios”.');
}

main()
  .catch((error) => {
    console.error('\n[SERVICIOS PROPIOS] No se pudo completar la carga.');
    console.error(error.original || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => undefined);
  });
