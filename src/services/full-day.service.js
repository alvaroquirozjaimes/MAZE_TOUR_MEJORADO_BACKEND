const { Op } = require('sequelize');
const { FullDay, sequelize } = require('../models');
const { AppError } = require('../utils/app-error');
const { deleteStoredFiles, storedPathForFile, uploadedPathsFromRequest } = require('../utils/file-storage');
const { positiveInteger, toNumber } = require('../utils/parsers');
const { logAdminAction } = require('./audit.service');

const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 50;
const actorId = (req) => req.user?.googleId || null;

const validate = (body, partial = false) => {
  if (!partial) {
    for (const field of ['name', 'city', 'billingDate']) {
      if (!String(body[field] || '').trim()) throw new AppError(`El campo "${field}" es obligatorio.`, 400);
    }
  }
  if (body.price !== undefined) {
    const price = toNumber(body.price, null);
    if (price === null || price < 0) throw new AppError('El precio no es válido.', 400);
  }
};

const createFullDay = async (req) => {
  validate(req.body);
  const uploaded = uploadedPathsFromRequest(req);
  const image = req.files?.images?.[0];
  const transaction = await sequelize.transaction();
  try {
    const city = req.body.city.trim();
    const fullDay = await FullDay.create(
      {
        name: req.body.name.trim(),
        city,
        description: req.body.description?.trim() || `Disfruta un día completo en ${city}`,
        price: toNumber(req.body.price, 0),
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
    return fullDay;
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
    price_asc: [['price', 'ASC'], ['name', 'ASC']],
    price_desc: [['price', 'DESC'], ['name', 'ASC']],
  };
  return options[String(sort || '').toLowerCase()] || options.recent;
};

const listFullDays = async (query = {}) => {
  const where = { isHidden: false };
  if (query.billingDate) where.billingDate = query.billingDate;
  if (query.city?.trim()) where.city = { [Op.iLike]: query.city.trim() };
  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { city: { [Op.iLike]: term } },
      { description: { [Op.iLike]: term } },
    ];
  }

  const pageSize = positiveInteger(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = positiveInteger(query.page, 1);
  const result = await FullDay.findAndCountAll({
    where,
    order: buildOrder(query.sort),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const total = Number(result.count) || 0;
  return {
    data: result.rows,
    meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
};

const getFullDay = async (id, options = {}) => {
  const fullDay = await FullDay.findByPk(id, options);
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
    for (const field of ['name', 'city', 'description', 'billingDate']) {
      if (req.body[field] !== undefined && req.body[field] !== '') values[field] = req.body[field].trim?.() || req.body[field];
    }
    if (req.body.price !== undefined && req.body.price !== '') values.price = toNumber(req.body.price, fullDay.price);
    if (image) values.imageUrl = storedPathForFile(image);
    await fullDay.update(values, { transaction });
    await logAdminAction({ req, action: 'update', entityType: 'FullDay', entityId: id, details: { name: fullDay.name }, transaction });
    await transaction.commit();
    await deleteStoredFiles(uploaded.slice(1));
    if (values.imageUrl && oldImage && values.imageUrl !== oldImage) await deleteStoredFiles(oldImage);
    return fullDay;
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
