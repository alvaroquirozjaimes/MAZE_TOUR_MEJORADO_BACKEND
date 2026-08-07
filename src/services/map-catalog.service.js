const { Op } = require('sequelize');
const { Place, FullDay, Destination, Region } = require('../models');
const { env } = require('../config/env');
const { AppError } = require('../utils/app-error');
const { logAdminAction } = require('./audit.service');
const { mapFieldsFromBody } = require('../utils/map-fields');

const positiveId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const locationInclude = (regionId = null, destinationId = null) => ({
  model: Destination,
  as: 'destination',
  required: Boolean(regionId || destinationId),
  where: destinationId ? { id: destinationId } : undefined,
  attributes: ['id', 'regionId', 'name', 'slug', 'isActive'],
  include: [{
    model: Region,
    as: 'region',
    required: true,
    where: { countryCode: env.countryCode, ...(regionId ? { id: regionId } : {}) },
    attributes: ['id', 'countryCode', 'name', 'slug', 'isActive'],
  }],
});

const normalizeCategory = (value) => {
  const key = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (['lugar', 'hotel', 'restaurante', 'full_day', 'fullday'].includes(key)) {
    return key === 'fullday' ? 'full_day' : key;
  }
  return '';
};

const placeDetailUrl = (row) => {
  if (row.category === 'hotel') return `/hotels/${row.id}`;
  if (row.category === 'restaurante') return `/restaurants/${row.id}`;
  return `/places/${row.id}`;
};

const serializePlace = (row) => {
  const value = row.toJSON();
  return {
    id: value.id,
    entityType: 'place',
    category: value.category || 'lugar',
    name: value.name,
    description: value.shortDescription,
    imageUrl: value.imageUrl,
    address: value.mapAddress,
    latitude: value.latitude === null ? null : Number(value.latitude),
    longitude: value.longitude === null ? null : Number(value.longitude),
    showOnMap: Boolean(value.showOnMap),
    isHidden: Boolean(value.isHidden),
    destination: value.destination,
    detailUrl: placeDetailUrl(value),
  };
};

const serializeFullDay = (row) => {
  const value = row.toJSON();
  return {
    id: value.id,
    entityType: 'fullDay',
    category: 'full_day',
    name: value.name,
    description: value.description,
    imageUrl: value.imageUrl,
    address: value.mapAddress,
    latitude: value.latitude === null ? null : Number(value.latitude),
    longitude: value.longitude === null ? null : Number(value.longitude),
    showOnMap: Boolean(value.showOnMap),
    isHidden: Boolean(value.isHidden),
    destination: value.destination,
    detailUrl: `/fulldays/${value.id}`,
  };
};

const listMapCatalog = async (query = {}, { admin = false } = {}) => {
  const regionId = positiveId(query.regionId);
  const destinationId = positiveId(query.destinationId);
  const category = normalizeCategory(query.category);
  const search = String(query.search || '').trim();
  const includeUnmapped = admin && String(query.includeUnmapped || '').toLowerCase() !== 'false';

  const placeWhere = {};
  const fullDayWhere = {};
  if (!admin) {
    // El catálogo público es estrictamente de lectura y solo devuelve
    // publicaciones visibles, no eliminadas y con coordenadas completas.
    placeWhere.isHidden = false;
    placeWhere.showOnMap = true;
    placeWhere.latitude = { [Op.not]: null };
    placeWhere.longitude = { [Op.not]: null };
    fullDayWhere.isHidden = false;
    fullDayWhere.showOnMap = true;
    fullDayWhere.latitude = { [Op.not]: null };
    fullDayWhere.longitude = { [Op.not]: null };
  } else if (!includeUnmapped) {
    placeWhere.showOnMap = true;
    placeWhere.latitude = { [Op.not]: null };
    placeWhere.longitude = { [Op.not]: null };
    fullDayWhere.showOnMap = true;
    fullDayWhere.latitude = { [Op.not]: null };
    fullDayWhere.longitude = { [Op.not]: null };
  }
  if (destinationId) {
    placeWhere.destinationId = destinationId;
    fullDayWhere.destinationId = destinationId;
  }
  if (search) {
    const term = `%${search}%`;
    placeWhere[Op.or] = [
      { name: { [Op.iLike]: term } },
      { mapAddress: { [Op.iLike]: term } },
      { city: { [Op.iLike]: term } },
    ];
    fullDayWhere[Op.or] = [
      { name: { [Op.iLike]: term } },
      { mapAddress: { [Op.iLike]: term } },
      { city: { [Op.iLike]: term } },
    ];
  }
  if (category && category !== 'full_day') placeWhere.category = category;

  const includePlaces = category !== 'full_day';
  const includeFullDays = !category || category === 'full_day';
  const include = [locationInclude(regionId, destinationId)];

  const [places, fullDays] = await Promise.all([
    includePlaces
      ? Place.findAll({
          where: placeWhere,
          include,
          attributes: [
            'id', 'category', 'name', 'shortDescription', 'imageUrl', 'mapAddress',
            'latitude', 'longitude', 'showOnMap', 'isHidden', 'destinationId',
          ],
          order: [['showOnMap', 'DESC'], ['name', 'ASC']],
          limit: admin ? 500 : 300,
        })
      : [],
    includeFullDays
      ? FullDay.findAll({
          where: fullDayWhere,
          include: [locationInclude(regionId, destinationId)],
          attributes: [
            'id', 'name', 'description', 'imageUrl', 'mapAddress', 'latitude', 'longitude',
            'showOnMap', 'isHidden', 'destinationId',
          ],
          order: [['showOnMap', 'DESC'], ['name', 'ASC']],
          limit: admin ? 500 : 300,
        })
      : [],
  ]);

  return [...places.map(serializePlace), ...fullDays.map(serializeFullDay)]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
};

const updateMapItem = async (entityType, id, body, req) => {
  const numericId = positiveId(id);
  if (!numericId) throw new AppError('Identificador no válido.', 400);
  const normalizedType = String(entityType || '').toLowerCase();
  const Model = normalizedType === 'place' ? Place : normalizedType === 'fullday' ? FullDay : null;
  if (!Model) throw new AppError('Tipo de publicación no válido.', 400);

  const row = await Model.findByPk(numericId);
  if (!row) throw new AppError('Publicación no encontrada.', 404);
  const values = mapFieldsFromBody(body, { partial: true });

  const nextShowOnMap = values.showOnMap === undefined ? row.showOnMap : values.showOnMap;
  const nextLatitude = values.latitude === undefined ? row.latitude : values.latitude;
  const nextLongitude = values.longitude === undefined ? row.longitude : values.longitude;
  if (nextShowOnMap && (nextLatitude === null || nextLongitude === null)) {
    throw new AppError('Selecciona una ubicación válida antes de mostrarla en el mapa.', 400);
  }

  await row.update({ ...values, updatedBy: req.user?.googleId || null });
  const removedFromMap = row.showOnMap === false && row.latitude === null && row.longitude === null;
  await logAdminAction({
    req,
    action: removedFromMap ? 'remove_map_location' : 'update_map_location',
    entityType: normalizedType === 'place' ? 'Place' : 'FullDay',
    entityId: row.id,
    details: {
      showOnMap: row.showOnMap,
      mapAddress: row.mapAddress,
      latitude: row.latitude,
      longitude: row.longitude,
    },
  });
  return row;
};

module.exports = { listMapCatalog, updateMapItem };
