const { Op } = require('sequelize');
const { FullDay, Destination, Region, sequelize } = require('../models');
const { AppError } = require('../utils/app-error');
const { deleteStoredFiles, storedPathForFile, uploadedPathsFromRequest } = require('../utils/file-storage');
const { positiveInteger } = require('../utils/parsers');
const { logAdminAction } = require('./audit.service');
const { getDestination } = require('./location.service');
const { env } = require('../config/env');

const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 50;
const actorId = (req) => req.user?.googleId || null;
const integerId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const locationInclude = (options = {}) => ({
  model: Destination,
  as: 'destination',
  required: Boolean(options.required),
  attributes: ['id', 'regionId', 'name', 'slug', 'isActive'],
  include: [{
    model: Region,
    as: 'region',
    required: Boolean(options.regionRequired),
    where: options.regionWhere,
    attributes: ['id', 'countryCode', 'name', 'slug', 'isActive'],
  }],
});

const validate = (body, partial = false) => {
  if (!partial) {
    for (const field of ['name', 'destinationId', 'billingDate']) {
      if (!String(body[field] || '').trim()) throw new AppError(`El campo "${field}" es obligatorio.`, 400);
    }
  }
};

const createFullDay = async (req) => {
  validate(req.body);
  const uploaded = uploadedPathsFromRequest(req);
  const image = req.files?.images?.[0];
  const transaction = await sequelize.transaction();
  try {
    const destination = await getDestination(integerId(req.body.destinationId), { transaction });
    const fullDay = await FullDay.create(
      {
        name: req.body.name.trim(),
        destinationId: destination.id,
        city: destination.name,
        description: req.body.description?.trim() || `Disfruta un día completo en ${destination.name}`,
        price: 0,
        billingDate: req.body.billingDate,
        imageUrl: storedPathForFile(image),
        createdBy: actorId(req),
        updatedBy: actorId(req),
      },
      { transaction }
    );
    await logAdminAction({ req, action: 'create', entityType: 'FullDay', entityId: fullDay.id, details: { name: fullDay.name }, transaction });
    await transaction.commit();
    await deleteStoredFiles(uploaded.slice(1));
    return getFullDay(fullDay.id);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    await deleteStoredFiles(uploaded);
    throw error;
  }
};

const buildOrder = (sort) => {
  const options = {
    name_asc: [['name', 'ASC']],
    name_desc: [['name', 'DESC']],
    oldest: [['createdAt', 'ASC']],
    recent: [['createdAt', 'DESC']],
  };
  return options[String(sort || '').toLowerCase()] || options.recent;
};

const listFullDays = async (query = {}) => {
  const where = { isHidden: false };
  if (query.billingDate) where.billingDate = query.billingDate;
  const destinationId = integerId(query.destinationId);
  const regionId = integerId(query.regionId);
  if (destinationId) where.destinationId = destinationId;
  if (query.city?.trim()) {
    const term = `%${query.city.trim()}%`;
    where[Op.or] = [
      { city: { [Op.iLike]: term } },
      { '$destination.name$': { [Op.iLike]: term } },
      { '$destination.region.name$': { [Op.iLike]: term } },
    ];
  }
  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    const conditions = [
      { name: { [Op.iLike]: term } },
      { city: { [Op.iLike]: term } },
      { description: { [Op.iLike]: term } },
      { '$destination.name$': { [Op.iLike]: term } },
      { '$destination.region.name$': { [Op.iLike]: term } },
    ];
    if (where[Op.or]) where[Op.and] = [{ [Op.or]: where[Op.or] }, { [Op.or]: conditions }];
    else where[Op.or] = conditions;
  }

  const pageSize = positiveInteger(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = positiveInteger(query.page, 1);
  const result = await FullDay.findAndCountAll({
    where,
    include: [locationInclude({
      required: Boolean(destinationId || regionId),
      regionRequired: Boolean(regionId || destinationId),
      regionWhere: { countryCode: env.countryCode, ...(regionId ? { id: regionId } : {}) },
    })],
    order: buildOrder(query.sort),
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true,
    subQuery: false,
  });
  const total = Number(result.count) || 0;
  const data = result.rows.map((row) => {
    const value = row.toJSON();
    return { ...value, city: value.destination?.name || value.city };
  });
  return {
    data,
    meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
};

const getFullDay = async (id, options = {}) => {
  const fullDay = await FullDay.findByPk(id, { include: [locationInclude()], ...options });
  if (!fullDay) throw new AppError('Full Day no encontrado.', 404);
  return fullDay;
};

const updateFullDay = async (id, req) => {
  validate(req.body, true);
  const uploaded = uploadedPathsFromRequest(req);
  const image = req.files?.images?.[0];
  const transaction = await sequelize.transaction();
  let oldImage;
  try {
    const fullDay = await FullDay.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!fullDay) throw new AppError('Full Day no encontrado.', 404);
    oldImage = fullDay.imageUrl;
    const values = { updatedBy: actorId(req) };
    for (const field of ['name', 'description', 'billingDate']) {
      if (req.body[field] !== undefined && req.body[field] !== '') values[field] = req.body[field].trim?.() || req.body[field];
    }
    if (req.body.destinationId !== undefined) {
      const destination = await getDestination(integerId(req.body.destinationId), { transaction });
      values.destinationId = destination.id;
      values.city = destination.name;
    }
    if (image) values.imageUrl = storedPathForFile(image);
    await fullDay.update(values, { transaction });
    await logAdminAction({ req, action: 'update', entityType: 'FullDay', entityId: id, details: { name: fullDay.name }, transaction });
    await transaction.commit();
    await deleteStoredFiles(uploaded.slice(1));
    if (values.imageUrl && oldImage && values.imageUrl !== oldImage) await deleteStoredFiles(oldImage);
    return getFullDay(fullDay.id);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    await deleteStoredFiles(uploaded);
    throw error;
  }
};

const setFullDayVisibility = async (id, isHidden, req) => {
  const transaction = await sequelize.transaction();
  try {
    const fullDay = await FullDay.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!fullDay) throw new AppError('Full Day no encontrado.', 404);
    await fullDay.update({ isHidden: Boolean(isHidden), updatedBy: actorId(req) }, { transaction });
    await logAdminAction({ req, action: isHidden ? 'hide' : 'show', entityType: 'FullDay', entityId: id, transaction });
    await transaction.commit();
    return fullDay;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

const trashFullDay = async (id, req) => {
  const transaction = await sequelize.transaction();
  try {
    const fullDay = await FullDay.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!fullDay) throw new AppError('Full Day no encontrado.', 404);
    await fullDay.update({ deletedBy: actorId(req), updatedBy: actorId(req) }, { transaction });
    await fullDay.destroy({ transaction });
    await logAdminAction({ req, action: 'trash', entityType: 'FullDay', entityId: id, details: { name: fullDay.name }, transaction });
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

const restoreFullDay = async (id, req) => {
  const transaction = await sequelize.transaction();
  try {
    const fullDay = await FullDay.findByPk(id, { paranoid: false, transaction, lock: transaction.LOCK.UPDATE });
    if (!fullDay || !fullDay.deletedAt) throw new AppError('El Full Day no está en la papelera.', 404);
    await fullDay.restore({ transaction });
    await fullDay.update({ deletedBy: null, updatedBy: actorId(req) }, { transaction });
    await logAdminAction({ req, action: 'restore', entityType: 'FullDay', entityId: id, details: { name: fullDay.name }, transaction });
    await transaction.commit();
    return fullDay;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

const permanentDeleteFullDay = async (id, req) => {
  const transaction = await sequelize.transaction();
  let image;
  try {
    const fullDay = await FullDay.findByPk(id, { paranoid: false, transaction, lock: transaction.LOCK.UPDATE });
    if (!fullDay) throw new AppError('Full Day no encontrado.', 404);
    if (!fullDay.deletedAt) throw new AppError('Primero envía el Full Day a la papelera.', 409);
    image = fullDay.imageUrl;
    await logAdminAction({ req, action: 'delete_permanently', entityType: 'FullDay', entityId: id, details: { name: fullDay.name }, transaction });
    await fullDay.destroy({ force: true, transaction });
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
  if (image) await deleteStoredFiles(image);
};

module.exports = {
  createFullDay,
  getFullDay,
  listFullDays,
  permanentDeleteFullDay,
  restoreFullDay,
  setFullDayVisibility,
  trashFullDay,
  updateFullDay,
};
