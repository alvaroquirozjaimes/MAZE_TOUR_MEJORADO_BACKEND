const { Op, fn, col } = require('sequelize');
const { Hotel, Place, Room } = require('../models');
const { AppError } = require('../utils/app-error');
const { positiveInteger, toNumber } = require('../utils/parsers');

const normalizeOrder = (value) => {
  const allowed = { name: 'name', price: 'price', createdat: 'createdAt' };
  return allowed[String(value || '').toLowerCase()] || 'createdAt';
};

const getHotel = async (id, query, options = {}) => {
  const hotel = await Hotel.findOne({
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
  if (!hotel) throw new AppError('Hotel no encontrado.', 404);

  const wantRooms = query.withRooms === undefined || String(query.withRooms).toLowerCase() === 'true';
  if (!wantRooms) return { data: hotel, etag: `W/"hotel-${hotel.id}-${new Date(hotel.updatedAt).getTime()}-0"` };

  const where = { hotelId: id };
  if (query.type) where.type = query.type;
  const min = toNumber(query.minPrice, null);
  const max = toNumber(query.maxPrice, null);
  if (min !== null || max !== null) {
    where.price = {};
    if (min !== null) where.price[Op.gte] = min;
    if (max !== null) where.price[Op.lte] = max;
  }
  if (query.q?.trim()) {
    const term = `%${query.q.trim()}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { description: { [Op.iLike]: term } },
      { type: { [Op.iLike]: term } },
    ];
  }

  const pageSize = positiveInteger(query.pageSize, null, 100);
  const page = positiveInteger(query.page, pageSize ? 1 : null);
  const offset = pageSize && page ? (page - 1) * pageSize : undefined;
  const order = normalizeOrder(query.orderBy);
  const direction = String(query.orderDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const [total, freshness, rooms] = await Promise.all([
    Room.count({ where }),
    Room.findOne({
      where,
      attributes: [[fn('MAX', col('updatedAt')), 'latest']],
      raw: true,
    }),
    Room.findAll({
      where,
      order: [[order, direction]],
      ...(pageSize ? { limit: pageSize } : {}),
      ...(offset !== undefined ? { offset } : {}),
    }),
  ]);

  const output = hotel.toJSON();
  output.rooms = rooms;
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
    etag: `W/"hotel-${hotel.id}-${new Date(hotel.updatedAt).getTime()}-${total}-${latest}"`,
  };
};

module.exports = { getHotel };
