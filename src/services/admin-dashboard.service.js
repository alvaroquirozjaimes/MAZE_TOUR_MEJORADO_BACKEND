const { Op, literal } = require('sequelize');
const {
  AdminActivityLog,
  ContactMessage,
  Destination,
  FullDay,
  Hotel,
  Like,
  Place,
  Restaurant,
  Region,
  Room,
  User,
} = require('../models');
const { AppError } = require('../utils/app-error');
const { positiveInteger } = require('../utils/parsers');
const { logAdminAction } = require('./audit.service');

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

const stateOptions = (status) => {
  const normalized = String(status || 'all').toLowerCase();
  if (normalized === 'trash') return { paranoid: false, stateWhere: { deletedAt: { [Op.not]: null } } };
  if (normalized === 'visible') return { paranoid: true, stateWhere: { isHidden: false } };
  if (normalized === 'hidden') return { paranoid: true, stateWhere: { isHidden: true } };
  return { paranoid: true, stateWhere: {} };
};

const buildWhere = (query = {}) => {
  const { stateWhere } = stateOptions(query.status);
  const where = { ...stateWhere };
  if (query.billingDate) where.billingDate = query.billingDate;
  const destinationId = Number.parseInt(query.destinationId, 10);
  if (Number.isInteger(destinationId) && destinationId > 0) where.destinationId = destinationId;
  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { city: { [Op.iLike]: term } },
      { '$destination.name$': { [Op.iLike]: term } },
      { '$destination.region.name$': { [Op.iLike]: term } },
    ];
  }
  return where;
};

const buildOrder = (sort) => {
  const options = {
    name_asc: [['name', 'ASC']],
    name_desc: [['name', 'DESC']],
    recent: [['createdAt', 'DESC']],
    oldest: [['createdAt', 'ASC']],
    billing_asc: [['billingDate', 'ASC'], ['name', 'ASC']],
    billing_desc: [['billingDate', 'DESC'], ['name', 'ASC']],
  };
  return options[String(sort || '').toLowerCase()] || options.recent;
};

const paginationFrom = (query = {}) => {
  const page = positiveInteger(query.page, 1);
  const pageSize = positiveInteger(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
};

const buildMeta = (count, page, pageSize) => {
  const total = Number(count) || 0;
  return { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
};

const listEntity = async (Model, attributes, query) => {
  const { page, pageSize, limit, offset } = paginationFrom(query);
  const { paranoid } = stateOptions(query.status);
  const regionId = Number.parseInt(query.regionId, 10);
  const result = await Model.findAndCountAll({
    where: buildWhere(query),
    paranoid,
    attributes,
    include: [{
      model: Destination,
      as: 'destination',
      required: Number.isInteger(regionId) && regionId > 0,
      attributes: ['id', 'regionId', 'name'],
      include: [{
        model: Region,
        as: 'region',
        required: Number.isInteger(regionId) && regionId > 0,
        where: Number.isInteger(regionId) && regionId > 0 ? { id: regionId } : undefined,
        attributes: ['id', 'name'],
      }],
    }],
    order: buildOrder(query.sort),
    limit,
    offset,
    distinct: true,
    subQuery: false,
  });
  const data = result.rows.map((row) => {
    const value = row.toJSON();
    return {
      ...value,
      city: value.destination?.name || value.city,
      destinationName: value.destination?.name || value.city || null,
      regionName: value.destination?.region?.name || null,
    };
  });
  return { data, meta: buildMeta(result.count, page, pageSize) };
};

const listAdminPlaces = (query = {}) =>
  listEntity(
    Place,
    ['id', 'name', 'imageUrl', 'category', 'city', 'destinationId', 'billingDate', 'isHidden', 'deletedAt', 'createdAt', 'updatedAt'],
    query
  );

const listAdminFullDays = (query = {}) =>
  listEntity(
    FullDay,
    ['id', 'name', 'imageUrl', 'city', 'destinationId', 'billingDate', 'isHidden', 'deletedAt', 'createdAt', 'updatedAt'],
    query
  );


const buildRelatedWhere = (query = {}) => {
  const where = {};
  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { description: { [Op.iLike]: term } },
      { '$place.name$': { [Op.iLike]: term } },
      { '$place.city$': { [Op.iLike]: term } },
      { '$place.destination.name$': { [Op.iLike]: term } },
      { '$place.destination.region.name$': { [Op.iLike]: term } },
    ];
  }
  return where;
};

const buildRelatedOrder = (sort) => {
  const options = {
    name_asc: [['name', 'ASC']],
    name_desc: [['name', 'DESC']],
    recent: [['createdAt', 'DESC']],
    oldest: [['createdAt', 'ASC']],
    billing_asc: [[{ model: Place, as: 'place' }, 'billingDate', 'ASC'], ['name', 'ASC']],
    billing_desc: [[{ model: Place, as: 'place' }, 'billingDate', 'DESC'], ['name', 'ASC']],
  };
  return options[String(sort || '').toLowerCase()] || options.recent;
};

const listRelatedEntity = async (Model, type, query = {}) => {
  const { page, pageSize, limit, offset } = paginationFrom(query);
  const { paranoid, stateWhere } = stateOptions(query.status);
  const placeWhere = { ...stateWhere };
  if (query.billingDate) placeWhere.billingDate = query.billingDate;

  const result = await Model.findAndCountAll({
    where: buildRelatedWhere(query),
    attributes: ['id', 'placeId', 'name', 'description', 'images', 'category', 'createdAt', 'updatedAt'],
    include: [
      {
        model: Place,
        as: 'place',
        required: true,
        paranoid,
        where: placeWhere,
        attributes: ['id', 'name', 'city', 'destinationId', 'billingDate', 'isHidden', 'deletedAt', 'imageUrl'],
        include: [{
          model: Destination,
          as: 'destination',
          attributes: ['id', 'regionId', 'name'],
          include: [{ model: Region, as: 'region', attributes: ['id', 'name'] }],
        }],
      },
    ],
    order: buildRelatedOrder(query.sort),
    limit,
    offset,
    distinct: true,
    subQuery: false,
  });

  const data = result.rows.map((row) => {
    const value = row.toJSON();
    const images = Array.isArray(value.images) ? value.images : [];
    return {
      id: value.id,
      placeId: value.placeId,
      name: value.name,
      description: value.description,
      category: type,
      imageUrl: images[0] || value.place?.imageUrl || null,
      city: value.place?.destination?.name || value.place?.city || null,
      destinationName: value.place?.destination?.name || value.place?.city || null,
      regionName: value.place?.destination?.region?.name || null,
      billingDate: value.place?.billingDate || null,
      isHidden: Boolean(value.place?.isHidden),
      deletedAt: value.place?.deletedAt || null,
      parentPlaceName: value.place?.name || null,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  });

  return { data, meta: buildMeta(result.count, page, pageSize) };
};

const listAdminHotels = (query = {}) => listRelatedEntity(Hotel, 'Hotel', query);
const listAdminRestaurants = (query = {}) => listRelatedEntity(Restaurant, 'Restaurante', query);

const getDashboardSummary = async () => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const activeSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    places, visiblePlaces, hiddenPlaces, trashedPlaces,
    fullDays, visibleFullDays, hiddenFullDays, trashedFullDays,
    hotels, restaurants, rooms, users, admins, usersToday, usersThisMonth,
    activeUsers30d, favorites, newMessages,
  ] = await Promise.all([
    Place.count(),
    Place.count({ where: { isHidden: false } }),
    Place.count({ where: { isHidden: true } }),
    Place.count({ paranoid: false, where: { deletedAt: { [Op.not]: null } } }),
    FullDay.count(),
    FullDay.count({ where: { isHidden: false } }),
    FullDay.count({ where: { isHidden: true } }),
    FullDay.count({ paranoid: false, where: { deletedAt: { [Op.not]: null } } }),
    Hotel.count({
      include: [{ model: Place, as: 'place', required: true, attributes: [] }],
      distinct: true,
    }),
    Restaurant.count({
      include: [{ model: Place, as: 'place', required: true, attributes: [] }],
      distinct: true,
    }),
    Room.count({
      include: [{
        model: Hotel,
        as: 'hotel',
        required: true,
        attributes: [],
        include: [{ model: Place, as: 'place', required: true, attributes: [] }],
      }],
      distinct: true,
    }),
    User.count(),
    User.count({ where: { role: 'admin' } }),
    User.count({ where: { createdAt: { [Op.gte]: startOfToday } } }),
    User.count({ where: { createdAt: { [Op.gte]: startOfMonth } } }),
    User.count({ where: { lastLoginAt: { [Op.gte]: activeSince } } }),
    Like.count(), ContactMessage.count({ where: { status: 'new' } }),
  ]);

  return {
    publications: {
      total: places + fullDays,
      visible: visiblePlaces + visibleFullDays,
      hidden: hiddenPlaces + hiddenFullDays,
      trash: trashedPlaces + trashedFullDays,
    },
    places: { total: places, visible: visiblePlaces, hidden: hiddenPlaces, trash: trashedPlaces },
    fullDays: { total: fullDays, visible: visibleFullDays, hidden: hiddenFullDays, trash: trashedFullDays },
    related: {
      hotels,
      restaurants,
      rooms,
      users,
      admins,
      usersToday,
      usersThisMonth,
      activeUsers30d,
      favorites,
      newMessages,
    },
  };
};

const listContactMessages = async (query = {}) => {
  const { page, pageSize, limit, offset } = paginationFrom(query);
  const where = {};
  if (['new', 'read', 'archived'].includes(query.status)) where.status = query.status;
  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
      { message: { [Op.iLike]: term } },
    ];
  }
  const result = await ContactMessage.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return { data: result.rows, meta: buildMeta(result.count, page, pageSize) };
};

const setContactMessageStatus = async (id, status, req) => {
  if (!['new', 'read', 'archived'].includes(status)) throw new AppError('Estado de mensaje no válido.', 400);
  const message = await ContactMessage.findByPk(id);
  if (!message) throw new AppError('Mensaje no encontrado.', 404);
  await message.update({ status, readAt: status === 'new' ? null : message.readAt || new Date() });
  await logAdminAction({ req, action: `contact_${status}`, entityType: 'ContactMessage', entityId: id });
  return message;
};

const listActivityLogs = async (query = {}) => {
  const { page, pageSize, limit, offset } = paginationFrom(query);
  const where = {};
  if (query.entityType) where.entityType = query.entityType;
  if (query.action) where.action = query.action;
  const result = await AdminActivityLog.findAndCountAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['name', 'email'], required: false }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return { data: result.rows, meta: buildMeta(result.count, page, pageSize) };
};


const userRegistrationRange = (period) => {
  const now = new Date();
  const normalized = String(period || 'all').toLowerCase();
  if (normalized === 'today') {
    return { [Op.gte]: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
  }
  if (normalized === '7d') return { [Op.gte]: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
  if (normalized === '30d') return { [Op.gte]: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
  if (normalized === 'month') return { [Op.gte]: new Date(now.getFullYear(), now.getMonth(), 1) };
  return null;
};

const userOrder = (sort) => {
  const options = {
    registered_desc: [['createdAt', 'DESC']],
    registered_asc: [['createdAt', 'ASC']],
    last_login_desc: [literal('"lastLoginAt" DESC NULLS LAST')],
    last_login_asc: [literal('"lastLoginAt" ASC NULLS LAST')],
    name_asc: [['name', 'ASC']],
    name_desc: [['name', 'DESC']],
    logins_desc: [['loginCount', 'DESC'], literal('"lastLoginAt" DESC NULLS LAST')],
  };
  return options[String(sort || '').toLowerCase()] || options.registered_desc;
};

const listUsers = async (query = {}) => {
  const { page, pageSize, limit, offset } = paginationFrom(query);
  const where = {};
  if (['admin', 'user'].includes(query.role)) where.role = query.role;
  const registrationRange = userRegistrationRange(query.registration);
  if (registrationRange) where.createdAt = registrationRange;
  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
    ];
  }
  const result = await User.findAndCountAll({
    where,
    attributes: [
      'googleId',
      'name',
      'email',
      'avatar',
      'role',
      'lastLoginAt',
      'loginCount',
      'createdAt',
      'updatedAt',
    ],
    order: userOrder(query.sort),
    limit,
    offset,
  });
  return { data: result.rows, meta: buildMeta(result.count, page, pageSize) };
};

const setUserRole = async (googleId, role, req) => {
  if (!['admin', 'user'].includes(role)) throw new AppError('Rol no válido.', 400);
  const transaction = await User.sequelize.transaction();
  try {
    const user = await User.findByPk(googleId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw new AppError('Usuario no encontrado.', 404);
    if (req.user?.googleId === googleId && role === 'user') {
      throw new AppError('No puedes quitarte tu propio rol de administrador.', 409);
    }
    if (user.role === 'admin' && role === 'user') {
      const adminCount = await User.count({ where: { role: 'admin' }, transaction });
      if (adminCount <= 1) throw new AppError('No puedes quitar el rol al último administrador.', 409);
    }
    const previousRole = user.role;
    await user.update({ role }, { transaction });
    await logAdminAction({
      req,
      action: 'change_role',
      entityType: 'User',
      entityId: googleId,
      details: { email: user.email, previousRole, role },
      transaction,
    });
    await transaction.commit();
    return user;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

module.exports = {
  getDashboardSummary,
  listActivityLogs,
  listAdminFullDays,
  listAdminHotels,
  listAdminPlaces,
  listAdminRestaurants,
  listContactMessages,
  listUsers,
  setContactMessageStatus,
  setUserRole,
};
