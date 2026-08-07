'use strict';

require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize, Region, Destination, Place, Hotel, Room, Restaurant, MenuItem, FullDay } = require('../models');
const { env } = require('../config/env');
const demoCatalog = require('../data/demoCatalog.seed');
const { runPendingMigrations } = require('../database/migration-status');

const INTERIOR_ASSET_ROOT = path.resolve(__dirname, '../seed-assets/demo-catalog/interiors');
const RESTAURANT_ASSET_ROOT = path.resolve(__dirname, '../seed-assets/demo-catalog/restaurants');
const FULLDAY_ASSET_ROOT = path.resolve(__dirname, '../seed-assets/demo-catalog/full-days');
const HOTEL_DIR = path.join(env.uploadRoot, 'hotelImages');
const ROOM_DIR = path.join(env.uploadRoot, 'roomImages');
const RESTAURANT_DIR = path.join(env.uploadRoot, 'restaurantImages');
const FULLDAY_DIR = path.join(env.uploadRoot, 'fullDayImages');
const MAIN_DIR = path.join(env.uploadRoot, 'mainImages');
const MENU_DIR = path.join(env.uploadRoot, 'menuItems');

const slugify = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const today = () => new Date().toISOString().slice(0, 10);
const extensionOf = (filename) => (path.extname(filename || '').toLowerCase() || '.jpg');
const buildNameWhere = (item) => ({
  [Op.or]: [item.name, ...(item.legacyNames || [])].map((name) => ({ name: { [Op.iLike]: name } })),
});

async function ensureDirectories() {
  await Promise.all([HOTEL_DIR, ROOM_DIR, RESTAURANT_DIR, FULLDAY_DIR, MAIN_DIR, MENU_DIR].map((dir) => fs.mkdir(dir, { recursive: true })));
}

async function ensureDestination(regionName, destinationName) {
  const region = await Region.findOne({
    where: { countryCode: env.countryCode || 'PE', name: { [Op.iLike]: regionName } },
  });
  if (!region) throw new Error(`No existe la región "${regionName}".`);

  const slug = slugify(destinationName);
  const [destination] = await Destination.findOrCreate({
    where: { regionId: region.id, slug },
    defaults: {
      regionId: region.id,
      name: destinationName,
      slug,
      isActive: true,
      sortOrder: 0,
      shortDescription: `Destino turístico de ${regionName}.`,
    },
  });
  return destination;
}

async function copyAsset(assetRoot, sourceName, targetDir, targetBaseName) {
  const source = path.join(assetRoot, sourceName);
  const ext = extensionOf(sourceName);
  const targetName = `${targetBaseName}${ext}`;
  const target = path.join(targetDir, targetName);
  await fs.copyFile(source, target);
  return `uploads/${path.basename(targetDir)}/${targetName}`;
}

async function copyGallery(item, kind) {
  const slug = slugify(item.name);
  const targetDir = kind === 'hotel' ? HOTEL_DIR : RESTAURANT_DIR;
  const prefix = kind === 'hotel' ? 'hotel' : 'restaurante';
  const assetRoot = kind === 'hotel' ? INTERIOR_ASSET_ROOT : RESTAURANT_ASSET_ROOT;
  const stored = [];
  for (let i = 0; i < item.images.length; i += 1) {
    stored.push(await copyAsset(assetRoot, item.images[i], targetDir, `${prefix}-${slug}-${i + 1}`));
  }
  const main = await copyAsset(assetRoot, item.images[0], MAIN_DIR, `${prefix}-${slug}-principal`);
  return { stored, main };
}

async function upsertDemoHotel(item) {
  const destination = await ensureDestination(item.region, item.destination);
  const { stored, main } = await copyGallery(item, 'hotel');

  return sequelize.transaction(async (transaction) => {
    let place = await Place.findOne({
      where: { category: 'hotel', ...buildNameWhere(item) },
      paranoid: false,
      transaction,
    });

    const placeValues = {
      name: item.name,
      destinationId: destination.id,
      city: destination.name,
      category: 'hotel',
      shortDescription: item.shortDescription,
      longDescription: item.description,
      price: 0,
      imageUrl: main,
      gallery: [],
      isHidden: false,
      billingDate: today(),
      mapAddress: item.mapAddress || null,
      latitude: item.latitude || null,
      longitude: item.longitude || null,
      showOnMap: item.showOnMap === true,
    };

    if (place?.deletedAt) await place.restore({ transaction });
    place = place ? await place.update(placeValues, { transaction }) : await Place.create(placeValues, { transaction });

    let hotel = await Hotel.findOne({ where: { placeId: place.id }, transaction });
    const hotelWasExisting = Boolean(hotel);
    const hotelValues = {
      placeId: place.id,
      name: item.name,
      description: item.description,
      images: stored,
      category: 'hotel',
      sortOrder: 0,
    };
    hotel = hotel ? await hotel.update(hotelValues, { transaction }) : await Hotel.create(hotelValues, { transaction });

    const roomCount = hotelWasExisting ? await Room.count({ where: { hotelId: hotel.id }, transaction }) : 0;
    if (roomCount === 0) {
      for (let index = 0; index < item.rooms.length; index += 1) {
        const room = item.rooms[index];
        const roomImage = await copyAsset(INTERIOR_ASSET_ROOT, room.image, ROOM_DIR, `room-${slugify(item.name)}-${index + 1}`);
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
    }

    return place;
  });
}

async function ensureMenuItems(restaurantId, restaurantName, menuItems, transaction) {
  const count = await MenuItem.count({ where: { restaurantId }, transaction });
  if (count > 0 || !Array.isArray(menuItems) || menuItems.length === 0) return 0;

  let created = 0;
  const slug = slugify(restaurantName);
  for (let index = 0; index < menuItems.length; index += 1) {
    const item = menuItems[index];
    const imagePath = item.image
      ? await copyAsset(RESTAURANT_ASSET_ROOT, item.image, MENU_DIR, `menu-${slug}-${index + 1}`)
      : null;

    await MenuItem.create({
      restaurantId,
      dishName: item.dishName,
      dishDescription: item.dishDescription,
      dishPrice: item.dishPrice,
      dishImage: imagePath,
      category: item.category,
      sortOrder: index,
    }, { transaction });
    created += 1;
  }
  return created;
}

async function upsertDemoRestaurant(item) {
  const destination = await ensureDestination(item.region, item.destination);
  const { stored, main } = await copyGallery(item, 'restaurant');

  return sequelize.transaction(async (transaction) => {
    let place = await Place.findOne({
      where: { category: 'restaurante', ...buildNameWhere(item) },
      paranoid: false,
      transaction,
    });

    const placeValues = {
      name: item.name,
      destinationId: destination.id,
      city: destination.name,
      category: 'restaurante',
      shortDescription: item.shortDescription,
      longDescription: item.description,
      price: 0,
      imageUrl: main,
      gallery: [],
      isHidden: false,
      billingDate: today(),
      mapAddress: item.mapAddress || null,
      latitude: item.latitude || null,
      longitude: item.longitude || null,
      showOnMap: item.showOnMap === true,
    };

    if (place?.deletedAt) await place.restore({ transaction });
    place = place ? await place.update(placeValues, { transaction }) : await Place.create(placeValues, { transaction });

    let restaurant = await Restaurant.findOne({ where: { placeId: place.id }, transaction });
    const restaurantValues = {
      placeId: place.id,
      name: item.name,
      description: item.description,
      images: stored,
      category: 'restaurante',
      sortOrder: 0,
    };
    restaurant = restaurant
      ? await restaurant.update(restaurantValues, { transaction })
      : await Restaurant.create({ ...restaurantValues, menuPdf: null }, { transaction });

    const createdMenuItems = await ensureMenuItems(restaurant.id, item.name, item.menuItems, transaction);
    return { place, createdMenuItems };
  });
}

async function upsertFullDay(item) {
  const destination = await ensureDestination(item.region, item.destination);
  const imageUrl = await copyAsset(FULLDAY_ASSET_ROOT, item.image, FULLDAY_DIR, `full-day-${slugify(item.name)}`);

  return sequelize.transaction(async (transaction) => {
    let fullDay = await FullDay.findOne({
      where: buildNameWhere(item),
      paranoid: false,
      transaction,
    });

    const values = {
      name: item.name,
      destinationId: destination.id,
      city: destination.name,
      description: item.description,
      price: item.price ?? 0,
      billingDate: today(),
      imageUrl,
      mapAddress: item.mapAddress || null,
      latitude: item.latitude || null,
      longitude: item.longitude || null,
      showOnMap: item.showOnMap === true,
      isHidden: false,
      deletedBy: null,
      updatedBy: null,
    };

    if (fullDay?.deletedAt) await fullDay.restore({ transaction });
    fullDay = fullDay ? await fullDay.update(values, { transaction }) : await FullDay.create(values, { transaction });
    return fullDay;
  });
}

async function main() {
  if ((env.countryCode || 'PE') !== 'PE') throw new Error('Este catálogo corresponde a Maze Tour Perú.');
  await sequelize.authenticate();
  await runPendingMigrations();
  await ensureDirectories();

  console.log(`\n[CATÁLOGO] Hoteles a cargar: ${demoCatalog.hotels.length}`);
  for (const hotel of demoCatalog.hotels) {
    await upsertDemoHotel(hotel);
    console.log(`  + ${hotel.name} (${hotel.destination})`);
  }

  console.log(`\n[CATÁLOGO] Restaurantes a cargar: ${demoCatalog.restaurants.length}`);
  for (const restaurant of demoCatalog.restaurants) {
    const result = await upsertDemoRestaurant(restaurant);
    console.log(`  + ${restaurant.name} (${restaurant.destination})${result.createdMenuItems ? ` · menú de ejemplo: ${result.createdMenuItems}` : ''}`);
  }

  console.log(`\n[CATÁLOGO] Full Days a cargar: ${demoCatalog.fullDays.length}`);
  for (const fullDay of demoCatalog.fullDays) {
    await upsertFullDay(fullDay);
    console.log(`  + ${fullDay.name} (${fullDay.destination})`);
  }

  console.log('\n[CATÁLOGO] Carga terminada.');
  console.log('[CATÁLOGO] Hoteles, restaurantes y full days quedan visibles en el catálogo y el mapa.');
  console.log('[CATÁLOGO] La carta PDF del restaurante permanece libre para que luego subas tu enlace.');
}

main()
  .catch((error) => {
    console.error('\n[CATÁLOGO] No se pudo completar la carga.');
    console.error(error.original || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => undefined);
  });
