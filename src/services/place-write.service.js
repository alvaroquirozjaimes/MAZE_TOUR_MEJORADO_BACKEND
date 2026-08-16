const { Op, QueryTypes } = require('sequelize');
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
const { parseImageFocus, resetImageFocus } = require('../utils/image-focus');
const { getPlaceDetail } = require('./place-query.service');
const { logAdminAction } = require('./audit.service');
const { getDestination } = require('./location.service');

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
    for (const field of ['name', 'billingDate', 'destinationId']) {
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

/* La portada de la tarjeta sale de Place.imageUrl. Al crear se rellena
   con la primera foto del hotel o del restaurante, pero al editar solo
   cambiaba si llegaba un archivo en 'mainImage', y los formularios de
   hotel y restaurante nunca envían ese campo: mandan 'hotelImages' y
   'restaurantImages'.

   Resultado: un restaurante creado sin fotos y con las fotos añadidas
   después se quedaba con imageUrl en null para siempre. Su ficha se veía
   bien (lee restaurant.images) pero en el catálogo salía el dibujo
   genérico. Aquí se rellena el hueco después de sincronizar los hijos.

   Solo rellena cuando está vacío: si alguien eligió portada a mano, se
   respeta. */
const backfillCoverImage = async ({ placeId, transaction }) => {
  const place = await Place.findByPk(placeId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!place || (place.imageUrl && String(place.imageUrl).trim())) return;

  const [hotel, restaurant] = await Promise.all([
    Hotel.findOne({ where: { placeId }, order: [['id', 'ASC']], transaction }),
    Restaurant.findOne({ where: { placeId }, order: [['id', 'ASC']], transaction }),
  ]);

  const cover = [hotel?.images?.[0], restaurant?.images?.[0]].find(
    (value) => typeof value === 'string' && value.trim()
  );
  if (cover) await place.update({ imageUrl: cover }, { transaction });
};

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
    const destination = await getDestination(integerId(req.body.destinationId), { transaction });
    const mainImage = storedPathForFile(filesFor(req, 'mainImage')[0]);
    const gallery = filesFor(req, 'gallery').map(storedPathForFile).filter(Boolean);
    const fallbackImage = mainImage || storedPathForFile(filesFor(req, 'hotelImages')[0]) || storedPathForFile(filesFor(req, 'restaurantImages')[0]);
    const actor = actorId(req);
    const place = await Place.create(
      {
        name: req.body.name.trim(),
        destinationId: destination.id,
        city: destination.name,
        shortDescription: textOrNull(req.body.shortDescription),
        longDescription: textOrNull(req.body.longDescription),
        price: toNumber(req.body.price, 0),
        billingDate: req.body.billingDate,
        category: normalizeCategory(req.body.category),
        imageUrl: fallbackImage,
        /* Encuadre elegido en el formulario. Si no llega nada, queda
           centrado y la tarjeta se ve igual que siempre. */
        ...parseImageFocus(req.body),
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
    await backfillCoverImage({ placeId: place.id, transaction });
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
    for (const field of ['name', 'shortDescription', 'longDescription', 'billingDate']) {
      if (req.body[field] !== undefined) values[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
    }
    if (req.body.destinationId !== undefined) {
      const destination = await getDestination(integerId(req.body.destinationId), { transaction });
      values.destinationId = destination.id;
      values.city = destination.name;
    }
    if (req.body.price !== undefined) values.price = toNumber(req.body.price, place.price);
    if (req.body.category !== undefined) values.category = normalizeCategory(req.body.category);
    const mainImage = storedPathForFile(filesFor(req, 'mainImage')[0]);
    if (mainImage) values.imageUrl = mainImage;
    else if (toBoolean(req.body.removeMainImage, false)) values.imageUrl = null;
    else if (req.body.coverImage !== undefined) {
      /* Los formularios de hotel y restaurante no suben una portada
         aparte: eligen cuál de las fotos que ya tienen hace de portada.
         safeExistingPaths es la misma barrera que usa la galería — solo
         se acepta una ruta que ya pertenezca a este lugar, para que
         nadie pueda apuntar la portada a un archivo ajeno. */
      const [cover] = safeExistingPaths([req.body.coverImage], allowedPaths);
      if (cover) values.imageUrl = cover;
    }

    /* El encuadre pertenece a una foto concreta. Si entra una portada
       nueva y el formulario no dice cómo encuadrarla, se vuelve al
       centro: heredar el encuadre de la foto anterior recortaría la
       nueva por un punto que ya no significa nada. */
    const focusValues = parseImageFocus(req.body, { partial: true });
    if (Object.keys(focusValues).length) Object.assign(values, focusValues);
    else if (mainImage) Object.assign(values, resetImageFocus());

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

    /* Después de los syncs, no antes: las fotos nuevas todavía no
       existían en el hotel ni en el restaurante. */
    await backfillCoverImage({ placeId: id, transaction });

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

/* Un solo viaje a la base de datos. Antes eran siete consultas encadenadas
   (buscar el lugar, BEGIN, lock consultivo, buscar el like, insertar o borrar,
   contar, COMMIT) y cada una pagaba la latencia de red hasta PostgreSQL: con
   50 ms de ida y vuelta eso son ~350 ms que el usuario siente como lentitud.
   Todo cabe en una sentencia con CTEs, que además es atómica por sí misma.
   El índice único (userId, placeId) ya impide duplicados, así que el
   pg_advisory_xact_lock sobraba.

   Las CTE ven la foto de la tabla anterior a la sentencia, por eso el conteo
   final se corrige sumando lo insertado y restando lo borrado. */
const TOGGLE_LIKE_SQL = `
  WITH objetivo AS (
    SELECT "id" FROM "Places" WHERE "id" = :placeId AND "isHidden" = false
  ),
  borrado AS (
    DELETE FROM "Likes"
    WHERE "placeId" = (SELECT "id" FROM objetivo) AND "userId" = :userId
    RETURNING 1
  ),
  insertado AS (
    INSERT INTO "Likes" ("placeId", "userId", "createdAt", "updatedAt")
    SELECT (SELECT "id" FROM objetivo), :userId, NOW(), NOW()
    WHERE EXISTS (SELECT 1 FROM objetivo) AND NOT EXISTS (SELECT 1 FROM borrado)
    ON CONFLICT ("userId", "placeId") DO NOTHING
    RETURNING 1
  )
  SELECT
    EXISTS (SELECT 1 FROM objetivo) AS "existe",
    EXISTS (SELECT 1 FROM insertado) AS "liked",
    (
      (SELECT COUNT(*) FROM "Likes" WHERE "placeId" = :placeId)
      - (SELECT COUNT(*) FROM borrado)
      + (SELECT COUNT(*) FROM insertado)
    )::int AS "likesCount";
`;

const toggleLike = async (placeId, userId) => {
  const [row] = await sequelize.query(TOGGLE_LIKE_SQL, {
    replacements: { placeId, userId },
    type: QueryTypes.SELECT,
  });

  if (!row?.existe) throw new AppError('Lugar no encontrado.', 404);
  return { liked: Boolean(row.liked), likesCount: Number(row.likesCount) || 0 };
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