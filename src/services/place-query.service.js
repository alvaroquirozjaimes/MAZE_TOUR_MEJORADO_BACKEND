const { Op } = require('sequelize');
const { Place, Hotel, Room, Restaurant, MenuItem, Like, sequelize } = require('../models');
const { normalizeCategory, positiveInteger, toNumber } = require('../utils/parsers');

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

const likesCountLiteral = () =>
  sequelize.literal('(SELECT COUNT(*)::int FROM "Likes" AS l WHERE l."placeId" = "Place"."id")');

const detailIncludes = [
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

const listPlaces = async (query = {}) => {
  const where = { isHidden: false };
  if (query.billingDate) where.billingDate = query.billingDate;
  if (query.city?.trim()) where.city = { [Op.iLike]: query.city.trim() };

  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    const escaped = sequelize.escape(term);
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { city: { [Op.iLike]: term } },
      sequelize.literal(`EXISTS (SELECT 1 FROM "Hotels" h WHERE h."placeId" = "Place"."id" AND h."name" ILIKE ${escaped})`),
      sequelize.literal(`EXISTS (SELECT 1 FROM "Restaurants" r WHERE r."placeId" = "Place"."id" AND r."name" ILIKE ${escaped})`),
    ];
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
    attributes: [
      'id', 'name', 'shortDescription', 'imageUrl', 'price', 'city', 'category',
      'createdAt', 'billingDate', [likesCountLiteral(), 'likesCount'],
    ],
    order: buildOrder(query.sort),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const total = Number(result.count) || 0;
  return {
    data: result.rows.map((place) => ({
      id: place.id,
      name: place.name,
      description: place.shortDescription,
      imageUrl: place.imageUrl,
      price: place.price,
      city: place.city,
      category: place.category,
      createdAt: place.createdAt,
      billingDate: place.billingDate,
      likesCount: Number(place.get('likesCount')) || 0,
    })),
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
  return places.map((place) => ({ ...place.toJSON(), likesCount: Number(place.get('likesCount')) || 0 }));
};

const listCities = async () => {
  const rows = await Place.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('city')), 'city']],
    where: { isHidden: false, city: { [Op.not]: null } },
    order: [[sequelize.col('city'), 'ASC']],
    raw: true,
  });
  return rows.map((row) => String(row.city || '').trim()).filter(Boolean);
};

module.exports = { detailIncludes, getPlaceDetail, likesCountLiteral, listCities, listFavorites, listPlaces };
