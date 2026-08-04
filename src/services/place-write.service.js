const { Op } = require('sequelize');
const { Place, Hotel, Room, Restaurant, MenuItem, Like, sequelize } = require('../models');
const { AppError } = require('../utils/app-error');
const { normalizeCategory, parseJson, toBoolean, toNumber } = require('../utils/parsers');
const {
  deleteStoredFiles,
  isRemoteUrl,
  pathsFromPlace,
  storedPathForFile,
  uploadedPathsFromRequest,
} = require('../utils/file-storage');
const { getPlaceDetail } = require('./place-query.service');
const { logAdminAction } = require('./audit.service');

const filesFor = (req, field) => req.files?.[field] || [];
const integerId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const actorId = (req) => req.user?.googleId || null;
const textOrNull = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

const validatePlaceInput = (body, { partial = false } = {}) => {
  if (!partial) {
    for (const field of ['name', 'city', 'billingDate']) {
      if (!String(body[field] || '').trim()) throw new AppError(`El campo "${field}" es obligatorio.`, 400);
    }
  }
  if (body.price !== undefined) {
    const price = toNumber(body.price, null);
    if (price === null || price < 0) throw new AppError('El precio debe ser un número mayor o igual que cero.', 400);
  }
};

const requiredName = (value, label) => {
  const name = String(value || '').trim();
  if (!name) throw new AppError(`El nombre de ${label} es obligatorio.`, 400);
  return name;
};

const safeExistingPaths = (values, allowedPaths) =>
  [...new Set((Array.isArray(values) ? values : []).filter((value) => {
    if (typeof value !== 'string' || !value.trim()) return false;
    return isRemoteUrl(value) || allowedPaths.has(value);
  }))];

const makeCursor = (req) => ({
  req,
  indexes: Object.create(null),
  take(field, countValue) {
    const count = Math.max(0, Number.parseInt(countValue, 10) || 0);
    const start = this.indexes[field] || 0;
    const files = filesFor(this.req, field).slice(start, start + count);
    this.indexes[field] = start + count;
    return files.map(storedPathForFile).filter(Boolean);
  },
});

const syncRooms = async ({ hotel, rooms, cursor, allowedPaths, transaction }) => {
  const existing = await Room.findAll({ where: { hotelId: hotel.id }, transaction, lock: transaction.LOCK.UPDATE });
  const byId = new Map(existing.map((room) => [room.id, room]));
  const retained = new Set();

  for (let index = 0; index < rooms.length; index += 1) {
    const data = rooms[index] || {};
    const id = integerId(data.id);
    const current = id ? byId.get(id) : null;
    if (id && !current) throw new AppError(`La habitación ${id} no pertenece al hotel editado.`, 400);

    const newImages = cursor.take('roomImages', data.imageCount);
    const images = [
      ...safeExistingPaths(data.existingImages ?? current?.images ?? [], allowedPaths),
      ...newImages,
    ];
    const values = {
      hotelId: hotel.id,
      name: requiredName(data.name, 'la habitación'),
      type: textOrNull(data.type),
      description: textOrNull(data.description),
      price: toNumber(data.price, 0),
      images,
      category: 'habitacion',
      sortOrder: index,
    };

    const room = current
      ? await current.update(values, { transaction })
      : await Room.create(values, { transaction });
    retained.add(room.id);
  }

  const removedIds = existing.filter((room) => !retained.has(room.id)).map((room) => room.id);
  if (removedIds.length) await Room.destroy({ where: { id: { [Op.in]: removedIds } }, transaction });
};

const syncHotels = async ({ placeId, hotels, req, allowedPaths, transaction }) => {
  const cursor = makeCursor(req);
  const existing = await Hotel.findAll({ where: { placeId }, transaction, lock: transaction.LOCK.UPDATE });
  const byId = new Map(existing.map((hotel) => [hotel.id, hotel]));
  const retained = new Set();

  for (let index = 0; index < hotels.length; index += 1) {
    const data = hotels[index] || {};
    const id = integerId(data.id);
    const current = id ? byId.get(id) : null;
    if (id && !current) throw new AppError(`El hotel ${id} no pertenece al lugar editado.`, 400);

    const values = {
      placeId,
      name: requiredName(data.name, 'el hotel'),
      description: textOrNull(data.description),
      images: [
        ...safeExistingPaths(data.existingImages ?? current?.images ?? [], allowedPaths),
        ...cursor.take('hotelImages', data.imageCount),
      ],
      category: 'hotel',
      sortOrder: index,
    };
    const hotel = current
      ? await current.update(values, { transaction })
      : await Hotel.create(values, { transaction });
    retained.add(hotel.id);
    await syncRooms({
      hotel,
      rooms: Array.isArray(data.rooms) ? data.rooms : [],
      cursor,
      allowedPaths,
      transaction,
    });
  }

  const removed = existing.filter((hotel) => !retained.has(hotel.id));
  const removedIds = removed.map((hotel) => hotel.id);
  if (removedIds.length) {
    await Room.destroy({ where: { hotelId: { [Op.in]: removedIds } }, transaction });
    await Hotel.destroy({ where: { id: { [Op.in]: removedIds } }, transaction });
  }
};

const resolveRestaurantPdf = ({ data, current, req, position, allowedPaths }) => {
  if (toBoolean(data.removeMenuPdf, false)) return null;
  const indexed = filesFor(req, 'restaurantMenuPdfs');
  const newIndex = Number.parseInt(data.newMenuPdfIndex, 10);
  if (Number.isInteger(newIndex) && indexed[newIndex]) return storedPathForFile(indexed[newIndex]);
  const singular = filesFor(req, 'restaurantMenuPdf');
  if (singular[position]) return storedPathForFile(singular[position]);
  const candidate = data.existingMenuPdfUrl || data.menuPdfUrl || current?.menuPdf || null;
  return candidate && (isRemoteUrl(candidate) || allowedPaths.has(candidate)) ? candidate : null;
};

const syncMenuItems = async ({ restaurant, menu, cursor, allowedPaths, transaction }) => {
  const existing = await MenuItem.findAll({
    where: { restaurantId: restaurant.id },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const byId = new Map(existing.map((item) => [item.id, item]));
  const retained = new Set();

  for (const category of ['dishes', 'drinks', 'cocktails', 'specials']) {
    const items = Array.isArray(menu?.[category]) ? menu[category] : [];
    for (let index = 0; index < items.length; index += 1) {
      const data = items[index] || {};
      const id = integerId(data.id);
      const current = id ? byId.get(id) : null;
      if (id && (!current || current.category !== category)) {
        throw new AppError(`El ítem de menú ${id} no pertenece a la categoría editada.`, 400);
      }

      let dishImage = null;
      if (!toBoolean(data.removeDishImage, false)) {
        if (toBoolean(data.imageExists, false)) {
          dishImage = cursor.take('menuItemImages', 1)[0] || null;
        } else {
          const candidate = data.existingImageUrl || current?.dishImage || null;
          if (candidate && (isRemoteUrl(candidate) || allowedPaths.has(candidate))) dishImage = candidate;
        }
      }

      const values = {
        restaurantId: restaurant.id,
        dishName: requiredName(data.dishName, 'el plato o bebida'),
        dishDescription: textOrNull(data.dishDescription),
        dishPrice: toNumber(data.dishPrice, 0),
        dishImage,
        category,
        sortOrder: index,
      };
      const item = current
        ? await current.update(values, { transaction })
        : await MenuItem.create(values, { transaction });
      retained.add(item.id);
    }
  }

  const removedIds = existing.filter((item) => !retained.has(item.id)).map((item) => item.id);
  if (removedIds.length) await MenuItem.destroy({ where: { id: { [Op.in]: removedIds } }, transaction });
};

const syncRestaurants = async ({ placeId, restaurants, req, allowedPaths, transaction }) => {
  const cursor = makeCursor(req);
  const existing = await Restaurant.findAll({ where: { placeId }, transaction, lock: transaction.LOCK.UPDATE });
  const byId = new Map(existing.map((restaurant) => [restaurant.id, restaurant]));
  const retained = new Set();

  for (let index = 0; index < restaurants.length; index += 1) {
    const data = restaurants[index] || {};
    const id = integerId(data.id);
    const current = id ? byId.get(id) : null;
    if (id && !current) throw new AppError(`El restaurante ${id} no pertenece al lugar editado.`, 400);

    const values = {
      placeId,
      name: requiredName(data.name, 'el restaurante'),
      description: textOrNull(data.description),
      images: [
        ...safeExistingPaths(data.existingImages ?? current?.images ?? [], allowedPaths),
        ...cursor.take('restaurantImages', data.imageCount),
      ],
      category: 'restaurante',
      menuPdf: resolveRestaurantPdf({ data, current, req, position: index, allowedPaths }),
      sortOrder: index,
    };
    const restaurant = current
      ? await current.update(values, { transaction })
      : await Restaurant.create(values, { transaction });
    retained.add(restaurant.id);
    await syncMenuItems({ restaurant, menu: data.menu || {}, cursor, allowedPaths, transaction });
  }

  const removed = existing.filter((restaurant) => !retained.has(restaurant.id));
  const removedIds = removed.map((restaurant) => restaurant.id);
  if (removedIds.length) {
    await MenuItem.destroy({ where: { restaurantId: { [Op.in]: removedIds } }, transaction });
    await Restaurant.destroy({ where: { id: { [Op.in]: removedIds } }, transaction });
  }
};

const parseNested = (body) => ({
  hotels: parseJson(body.hotels, []),
  restaurants: parseJson(body.restaurants, []),
});

const createPlace = async (req) => {
  validatePlaceInput(req.body);
  const uploadedPaths = uploadedPathsFromRequest(req);
  const transaction = await sequelize.transaction();
  let placeId;
  try {
    const { hotels, restaurants } = parseNested(req.body);
    const mainImage = storedPathForFile(filesFor(req, 'mainImage')[0]);
    const gallery = filesFor(req, 'gallery').map(storedPathForFile).filter(Boolean);
    const fallbackImage = mainImage || storedPathForFile(filesFor(req, 'hotelImages')[0]) || storedPathForFile(filesFor(req, 'restaurantImages')[0]);
    const actor = actorId(req);
    const place = await Place.create(
      {
        name: req.body.name.trim(),
        city: req.body.city.trim(),
        shortDescription: textOrNull(req.body.shortDescription),
        longDescription: textOrNull(req.body.longDescription),
        price: toNumber(req.body.price, 0),
        billingDate: req.body.billingDate,
        category: normalizeCategory(req.body.category),
        imageUrl: fallbackImage,
        gallery,
        isHidden: false,
        createdBy: actor,
        updatedBy: actor,
      },
      { transaction }
    );
    const allowedPaths = new Set(uploadedPaths);
    await syncHotels({ placeId: place.id, hotels, req, allowedPaths, transaction });
    await syncRestaurants({ placeId: place.id, restaurants, req, allowedPaths, transaction });
    await logAdminAction({ req, action: 'create', entityType: 'Place', entityId: place.id, details: { name: place.name }, transaction });
    await transaction.commit();
    placeId = place.id;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    await deleteStoredFiles(uploadedPaths);
    throw error;
  }
  const created = await getPlaceDetail(placeId);
  const retained = new Set(pathsFromPlace(created));
  await deleteStoredFiles(uploadedPaths.filter((item) => !retained.has(item)));
  return created;
};

const updatePlace = async (id, req) => {
  validatePlaceInput(req.body, { partial: true });
  const uploadedPaths = uploadedPathsFromRequest(req);
  const before = await getPlaceDetail(id);
  if (!before) throw new AppError('Lugar no encontrado.', 404);
  const oldPaths = pathsFromPlace(before);
  const allowedPaths = new Set([...oldPaths, ...uploadedPaths]);
  const transaction = await sequelize.transaction();
  try {
    const place = await Place.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!place) throw new AppError('Lugar no encontrado.', 404);
    const values = { updatedBy: actorId(req) };
    for (const field of ['name', 'city', 'shortDescription', 'longDescription', 'billingDate']) {
      if (req.body[field] !== undefined) values[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
    }
    if (req.body.price !== undefined) values.price = toNumber(req.body.price, place.price);
    if (req.body.category !== undefined) values.category = normalizeCategory(req.body.category);
    const mainImage = storedPathForFile(filesFor(req, 'mainImage')[0]);
    if (mainImage) values.imageUrl = mainImage;
    else if (toBoolean(req.body.removeMainImage, false)) values.imageUrl = null;

    if (req.body.existingGallery !== undefined || filesFor(req, 'gallery').length) {
      const existingGallery = req.body.existingGallery !== undefined
        ? safeExistingPaths(parseJson(req.body.existingGallery, []), allowedPaths)
        : safeExistingPaths(before.gallery || [], allowedPaths);
      values.gallery = [...existingGallery, ...filesFor(req, 'gallery').map(storedPathForFile).filter(Boolean)];
    }
    await place.update(values, { transaction });

    if (req.body.hotels !== undefined) {
      await syncHotels({ placeId: id, hotels: parseJson(req.body.hotels, []), req, allowedPaths, transaction });
    }
    if (req.body.restaurants !== undefined) {
      await syncRestaurants({ placeId: id, restaurants: parseJson(req.body.restaurants, []), req, allowedPaths, transaction });
    }
    await logAdminAction({ req, action: 'update', entityType: 'Place', entityId: id, details: { name: place.name }, transaction });
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    await deleteStoredFiles(uploadedPaths);
    throw error;
  }

  const updated = await getPlaceDetail(id);
  const retained = new Set(pathsFromPlace(updated));
  await deleteStoredFiles([...new Set([...oldPaths, ...uploadedPaths])].filter((item) => !retained.has(item)));
  return updated;
};

const setVisibility = async (id, isHidden, req) => {
  const transaction = await sequelize.transaction();
  try {
    const place = await Place.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!place) throw new AppError('Lugar no encontrado.', 404);
    await place.update({ isHidden: Boolean(isHidden), updatedBy: actorId(req) }, { transaction });
    await logAdminAction({ req, action: isHidden ? 'hide' : 'show', entityType: 'Place', entityId: id, transaction });
    await transaction.commit();
    return place;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

const trashPlace = async (id, req) => {
  const transaction = await sequelize.transaction();
  try {
    const place = await Place.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!place) throw new AppError('Lugar no encontrado.', 404);
    await place.update({ deletedBy: actorId(req), updatedBy: actorId(req) }, { transaction });
    await place.destroy({ transaction });
    await logAdminAction({ req, action: 'trash', entityType: 'Place', entityId: id, details: { name: place.name }, transaction });
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

const restorePlace = async (id, req) => {
  const transaction = await sequelize.transaction();
  try {
    const place = await Place.findByPk(id, { paranoid: false, transaction, lock: transaction.LOCK.UPDATE });
    if (!place || !place.deletedAt) throw new AppError('El lugar no está en la papelera.', 404);
    await place.restore({ transaction });
    await place.update({ deletedBy: null, updatedBy: actorId(req) }, { transaction });
    await logAdminAction({ req, action: 'restore', entityType: 'Place', entityId: id, details: { name: place.name }, transaction });
    await transaction.commit();
    return place;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

const permanentDeletePlace = async (id, req) => {
  const place = await getPlaceDetail(id, { paranoid: false });
  if (!place) throw new AppError('Lugar no encontrado.', 404);
  if (!place.deletedAt) throw new AppError('Primero envía el lugar a la papelera.', 409);
  const paths = pathsFromPlace(place);
  const transaction = await sequelize.transaction();
  try {
    await logAdminAction({ req, action: 'delete_permanently', entityType: 'Place', entityId: id, details: { name: place.name }, transaction });
    await Like.destroy({ where: { placeId: id }, transaction, force: true });
    await Place.destroy({ where: { id }, transaction, force: true });
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
  await deleteStoredFiles(paths);
};

const toggleLike = async (placeId, userId) => {
  const place = await Place.findOne({ where: { id: placeId, isHidden: false }, attributes: ['id'] });
  if (!place) throw new AppError('Lugar no encontrado.', 404);
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:lockKey));', {
      replacements: { lockKey: `like:${userId}:${placeId}` },
      transaction,
    });
    const existing = await Like.findOne({ where: { placeId, userId }, transaction });
    const liked = !existing;
    if (existing) await existing.destroy({ transaction });
    else await Like.create({ placeId, userId }, { transaction });
    const likesCount = await Like.count({ where: { placeId }, transaction });
    await transaction.commit();
    return { liked, likesCount };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

module.exports = {
  createPlace,
  permanentDeletePlace,
  restorePlace,
  setVisibility,
  toggleLike,
  trashPlace,
  updatePlace,
};
