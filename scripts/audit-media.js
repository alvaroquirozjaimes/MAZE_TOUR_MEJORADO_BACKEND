const fs = require('fs');
const { sequelize, Place, Hotel, Room, Restaurant, MenuItem, FullDay } = require('../src/models');
const { resolveStoredPath, isRemoteUrl } = require('../src/utils/file-storage');

const entries = [];
const add = (entity, id, field, value) => {
  for (const item of Array.isArray(value) ? value : [value]) {
    if (item) entries.push({ entity, id, field, value: item });
  }
};

const main = async () => {
  await sequelize.authenticate();

  for (const row of await Place.findAll({ attributes: ['id', 'imageUrl', 'gallery'], raw: true })) {
    add('Place', row.id, 'imageUrl', row.imageUrl);
    add('Place', row.id, 'gallery', row.gallery);
  }
  for (const row of await Hotel.findAll({ attributes: ['id', 'images'], raw: true })) {
    add('Hotel', row.id, 'images', row.images);
  }
  for (const row of await Room.findAll({ attributes: ['id', 'images'], raw: true })) {
    add('Room', row.id, 'images', row.images);
  }
  for (const row of await Restaurant.findAll({ attributes: ['id', 'images', 'menuPdf'], raw: true })) {
    add('Restaurant', row.id, 'images', row.images);
    add('Restaurant', row.id, 'menuPdf', row.menuPdf);
  }
  for (const row of await MenuItem.findAll({ attributes: ['id', 'dishImage'], raw: true })) {
    add('MenuItem', row.id, 'dishImage', row.dishImage);
  }
  for (const row of await FullDay.findAll({ attributes: ['id', 'imageUrl'], raw: true })) {
    add('FullDay', row.id, 'imageUrl', row.imageUrl);
  }

  const missing = entries.filter(({ value }) => {
    if (isRemoteUrl(value)) return false;
    const absolute = resolveStoredPath(value);
    return !absolute || !fs.existsSync(absolute);
  });

  console.log(`Referencias revisadas: ${entries.length}`);
  console.log(`Archivos faltantes: ${missing.length}`);
  for (const item of missing) {
    console.log(`- ${item.entity} ${item.id} | ${item.field}: ${item.value}`);
  }

  if (missing.length) process.exitCode = 2;
};

main()
  .catch((error) => {
    console.error('No se pudo auditar el contenido multimedia:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
