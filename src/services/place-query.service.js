const { Op } = require('sequelize');
const {
  Place,
  Hotel,
  Room,
  Restaurant,
  MenuItem,
  Like,
  Destination,
  Region,
  sequelize,
} = require('../models');
const { normalizeCategory, positiveInteger, toNumber } = require('../utils/parsers');
const { env } = require('../config/env');

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

const likesCountLiteral = () =>
  sequelize.literal('(SELECT COUNT(*)::int FROM "Likes" AS l WHERE l."placeId" = "Place"."id")');

/* El corazón es por usuario: el contador es global, pero "liked" solo puede
   salir true para quien pide el listado. Si nadie inició sesión devolvemos
   FALSE constante para que la tarjeta nunca herede el like de otro. */
const likedLiteral = (viewerId) => {
  if (!viewerId) return sequelize.literal('FALSE');
  return sequelize.literal(
    `EXISTS (SELECT 1 FROM "Likes" AS lv WHERE lv."placeId" = "Place"."id" AND lv."userId" = ${sequelize.escape(String(viewerId))})`
  );
};

const locationInclude = (options = {}) => ({
  model: Destination,
  as: 'destination',
  required: Boolean(options.required),
  where: options.where,
  attributes: ['id', 'regionId', 'name', 'slug', 'isActive'],
  include: [{
    model: Region,
    as: 'region',
    required: Boolean(options.regionRequired),
    where: options.regionWhere,
    attributes: ['id', 'countryCode', 'name', 'slug', 'isActive'],
  }],
});

const detailIncludes = [
  locationInclude(),
  { model: Hotel, as: 'hotels', include: [{ model: Room, as: 'rooms' }] },
  { model: Restaurant, as: 'restaurants', include: [{ model: MenuItem, as: 'menuItems' }] },
];

const detailOrder = [
  [{ model: Hotel, as: 'hotels' }, 'sortOrder', 'ASC'],
  [{ model: Hotel, as: 'hotels' }, { model: Room, as: 'rooms' }, 'sortOrder', 'ASC'],
  [{ model: Restaurant, as: 'restaurants' }, 'sortOrder', 'ASC'],
  [{ model: Restaurant, as: 'restaurants' }, { model: MenuItem, as: 'menuItems' }, 'category', 'ASC'],
  [{ model: Restaurant, as: 'restaurants' }, { model: MenuItem, as: 'menuItems' }, 'sortOrder', 'ASC'],
];

const getPlaceDetail = (id, options = {}) =>
  Place.findByPk(id, {
    include: detailIncludes,
    order: detailOrder,
    ...options,
  });

const buildOrder = (sort) => {
  const choices = {
    asc: [['name', 'ASC']],
    name_asc: [['name', 'ASC']],
    name_desc: [['name', 'DESC']],
    oldest: [['createdAt', 'ASC']],
    recent: [['createdAt', 'DESC']],
    price_asc: [['price', 'ASC'], ['name', 'ASC']],
    price_desc: [['price', 'DESC'], ['name', 'ASC']],
    popular: [[sequelize.literal('"likesCount"'), 'DESC'], ['createdAt', 'DESC']],
  };
  return choices[String(sort || '').toLowerCase()] || choices.popular;
};

const addLiteral = (where, literal) => {
  const existing = where[Op.and] || [];
  where[Op.and] = [...existing, literal];
};

const positiveId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const listPlaces = async (query = {}, viewerId = null) => {
  const where = { isHidden: false };
  if (query.billingDate) where.billingDate = query.billingDate;
  const destinationId = positiveId(query.destinationId);
  const regionId = positiveId(query.regionId);
  if (destinationId) where.destinationId = destinationId;

  const destinationWhere = {};
  const regionWhere = { countryCode: env.countryCode };
  if (regionId) regionWhere.id = regionId;

  if (query.city?.trim()) {
    const locationTerm = `%${query.city.trim()}%`;
    where[Op.or] = [
      { city: { [Op.iLike]: locationTerm } },
      { '$destination.name$': { [Op.iLike]: locationTerm } },
      { '$destination.region.name$': { [Op.iLike]: locationTerm } },
    ];
  }

  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    const escaped = sequelize.escape(term);
    const searchConditions = [
      { name: { [Op.iLike]: term } },
      { city: { [Op.iLike]: term } },
      { '$destination.name$': { [Op.iLike]: term } },
      { '$destination.region.name$': { [Op.iLike]: term } },
      sequelize.literal(`EXISTS (SELECT 1 FROM "Hotels" h WHERE h."placeId" = "Place"."id" AND h."name" ILIKE ${escaped})`),
      sequelize.literal(`EXISTS (SELECT 1 FROM "Restaurants" r WHERE r."placeId" = "Place"."id" AND r."name" ILIKE ${escaped})`),
    ];
    if (where[Op.or]) addLiteral(where, { [Op.or]: searchConditions });
    else where[Op.or] = searchConditions;
  }

  const category = query.category ? normalizeCategory(query.category) : null;
  const min = toNumber(query.minPrice, null);
  const max = toNumber(query.maxPrice, null);
  const roomConditions = [];
  if (min !== null) roomConditions.push(`room."price" >= ${sequelize.escape(min)}`);
  if (max !== null) roomConditions.push(`room."price" <= ${sequelize.escape(max)}`);

  if (category === 'lugar') where.category = 'lugar';
  if (category === 'hotel' || roomConditions.length) {
    const priceSql = roomConditions.length ? ` AND ${roomConditions.join(' AND ')}` : '';
    addLiteral(
      where,
      sequelize.literal(`EXISTS (
        SELECT 1 FROM "Hotels" hotel
        ${roomConditions.length ? 'JOIN "Rooms" room ON room."hotelId" = hotel."id"' : ''}
        WHERE hotel."placeId" = "Place"."id"${priceSql}
      )`)
    );
  }

  if (category === 'restaurante' || query.foodSearchQuery?.trim()) {
    const food = query.foodSearchQuery?.trim();
    const foodSql = food
      ? ` AND EXISTS (SELECT 1 FROM "MenuItems" menu WHERE menu."restaurantId" = restaurant."id" AND menu."dishName" ILIKE ${sequelize.escape(`%${food}%`)})`
      : '';
    addLiteral(
      where,
      sequelize.literal(`EXISTS (SELECT 1 FROM "Restaurants" restaurant WHERE restaurant."placeId" = "Place"."id"${foodSql})`)
    );
  }

  const pageSize = positiveInteger(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = positiveInteger(query.page, 1);
  const result = await Place.findAndCountAll({
    where,
    include: [locationInclude({
      required: Boolean(destinationId || regionId),
      where: Object.keys(destinationWhere).length ? destinationWhere : undefined,
      regionRequired: Boolean(regionId || destinationId),
      regionWhere,
    })],
    attributes: [
      'id', 'name', 'shortDescription', 'imageUrl', 'price', 'city', 'destinationId', 'category',
      'createdAt', 'billingDate', [likesCountLiteral(), 'likesCount'],
      [likedLiteral(viewerId), 'liked'],
    ],
    order: buildOrder(query.sort),
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true,
    subQuery: false,
  });

  const total = Number(result.count) || 0;
  return {
    data: result.rows.map((place) => {
      const destination = place.destination?.toJSON?.() || place.destination || null;
      return {
        id: place.id,
        name: place.name,
        description: place.shortDescription,
        imageUrl: place.imageUrl,
        price: place.price,
        city: destination?.name || place.city,
        destinationId: place.destinationId,
        destination,
        category: place.category,
        createdAt: place.createdAt,
        billingDate: place.billingDate,
        likesCount: Number(place.get('likesCount')) || 0,
        liked: Boolean(place.get('liked')),
      };
    }),
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
};

const listFavorites = async (userId) => {
  const places = await Place.findAll({
    where: { isHidden: false },
    include: [
      { model: Like, as: 'likes', attributes: [], required: true, where: { userId }, duplicating: false },
      ...detailIncludes,
    ],
    distinct: true,
    attributes: { include: [[likesCountLiteral(), 'likesCount']] },
    order: [[sequelize.literal('"likesCount"'), 'DESC'], ...detailOrder],
    subQuery: false,
  });
  /* Aquí el filtro ya es "likes de este usuario", así que liked es true por
     definición: la tarjeta debe salir en rojo sin pedir otra consulta. */
  return places.map((place) => ({
    ...place.toJSON(),
    likesCount: Number(place.get('likesCount')) || 0,
    liked: true,
  }));
};

const listCities = async () => {
  const rows = await Destination.findAll({
    attributes: ['name'],
    where: { isActive: true },
    include: [{
      model: Region,
      as: 'region',
      attributes: [],
      required: true,
      where: { isActive: true, countryCode: env.countryCode },
    }],
    order: [['name', 'ASC']],
    raw: true,
  });
  return [...new Set(rows.map((row) => String(row.name || '').trim()).filter(Boolean))];
};

module.exports = {
  detailIncludes,
  getPlaceDetail,
  likedLiteral,
  likesCountLiteral,
  listCities,
  listFavorites,
  listPlaces,
  locationInclude,
};