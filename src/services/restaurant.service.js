const { Op, fn, col } = require('sequelize');
const { MenuItem, Place, Restaurant } = require('../models');
const { AppError } = require('../utils/app-error');
const { positiveInteger, toNumber } = require('../utils/parsers');

const normalizeOrder = (value) => {
  const allowed = { dishname: 'dishName', dishprice: 'dishPrice', createdat: 'createdAt' };
  return allowed[String(value || '').toLowerCase()] || 'createdAt';
};

const getRestaurant = async (id, query, options = {}) => {
  const restaurant = await Restaurant.findOne({
    where: { id },
    include: [
      {
        model: Place,
        as: 'place',
        attributes: [],
        required: true,
        ...(!options.includeHidden ? { where: { isHidden: false } } : {}),
      },
    ],
  });
  if (!restaurant) throw new AppError('Restaurante no encontrado.', 404);

  const wantMenu = query.withMenu === undefined || String(query.withMenu).toLowerCase() === 'true';
  if (!wantMenu) {
    return {
      data: restaurant,
      etag: `W/"restaurant-${restaurant.id}-${new Date(restaurant.updatedAt).getTime()}-0"`,
    };
  }

  const where = { restaurantId: id };
  if (query.category) where.category = query.category;
  const min = toNumber(query.minPrice, null);
  const max = toNumber(query.maxPrice, null);
  if (min !== null || max !== null) {
    where.dishPrice = {};
    if (min !== null) where.dishPrice[Op.gte] = min;
    if (max !== null) where.dishPrice[Op.lte] = max;
  }
  if (query.q?.trim()) {
    const term = `%${query.q.trim()}%`;
    where[Op.or] = [
      { dishName: { [Op.iLike]: term } },
      { dishDescription: { [Op.iLike]: term } },
    ];
  }

  const pageSize = positiveInteger(query.pageSize, null, 100);
  const page = positiveInteger(query.page, pageSize ? 1 : null);
  const offset = pageSize && page ? (page - 1) * pageSize : undefined;
  const order = normalizeOrder(query.orderBy);
  const direction = String(query.orderDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const [total, freshness, items] = await Promise.all([
    MenuItem.count({ where }),
    MenuItem.findOne({
      where,
      attributes: [[fn('MAX', col('updatedAt')), 'latest']],
      raw: true,
    }),
    MenuItem.findAll({
      where,
      order: [[order, direction]],
      ...(pageSize ? { limit: pageSize } : {}),
      ...(offset !== undefined ? { offset } : {}),
    }),
  ]);

  const output = restaurant.toJSON();
  output.menuItems = items;
  if (pageSize && page) {
    output._meta = {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      orderBy: order,
      orderDir: direction,
    };
  }

  const latest = freshness?.latest ? new Date(freshness.latest).getTime() : 0;
  return {
    data: output,
    etag: `W/"restaurant-${restaurant.id}-${new Date(restaurant.updatedAt).getTime()}-${total}-${latest}"`,
  };
};

module.exports = { getRestaurant };
