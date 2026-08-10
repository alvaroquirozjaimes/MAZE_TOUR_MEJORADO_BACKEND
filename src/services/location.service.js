const { Op } = require('sequelize');
const { Region, Destination, Place, FullDay, sequelize } = require('../models');
const { env } = require('../config/env');
const { AppError } = require('../utils/app-error');
const { deleteStoredFiles } = require('../utils/file-storage');
const { logAdminAction } = require('./audit.service');

const actorId = (req) => req.user?.googleId || null;
const slugify = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const cleanName = (value, label) => {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new AppError(`${label} es obligatorio.`, 400);
  if (name.length > 140) throw new AppError(`${label} es demasiado largo.`, 400);
  return name;
};

const optionalText = (value, maxLength = 500) => {
  if (value === undefined) return undefined;
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  if (text.length > maxLength) throw new AppError(`La descripción debe tener máximo ${maxLength} caracteres.`, 400);
  return text;
};

const duplicateWhere = (where, excludeId = null) => {
  if (!excludeId) return where;
  return { ...where, id: { [Op.ne]: excludeId } };
};

const ensureRegionNameAvailable = async (name, transaction, excludeId = null) => {
  const slug = slugify(name) || 'ubicacion';
  const existing = await Region.findOne({
    where: duplicateWhere({ countryCode: env.countryCode, slug }, excludeId),
    attributes: ['id', 'name'],
    transaction,
  });
  if (existing) {
    throw new AppError(`Ya existe “${existing.name}” en el catálogo de ${env.countryName || 'este país'}.`, 409);
  }
  return slug;
};

const ensureDestinationNameAvailable = async (name, regionId, transaction, excludeId = null) => {
  const slug = slugify(name) || 'destino';
  const existing = await Destination.findOne({
    where: duplicateWhere({ regionId, slug }, excludeId),
    attributes: ['id', 'name'],
    transaction,
  });
  if (existing) {
    throw new AppError(`El destino “${existing.name}” ya está registrado en esta ubicación.`, 409);
  }
  return slug;
};

const destinationInclude = {
  model: Destination,
  as: 'destinations',
  required: false,
  attributes: ['id', 'regionId', 'name', 'slug', 'imageUrl', 'shortDescription', 'isActive', 'sortOrder'],
};

/* Destinos que tienen al menos una publicación viva. Se consulta por
   separado y no con un EXISTS en el include porque la misma lista sirve
   para dos cosas: filtrar los destinos y, de rebote, saber qué regiones
   se quedan sin ninguno.

   Sin paranoid: false, o sea que un lugar en la papelera no cuenta. */
const destinationIdsWithContent = async () => {
  const [places, fullDays] = await Promise.all([
    Place.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('destinationId')), 'destinationId']],
      where: { destinationId: { [Op.not]: null } },
      raw: true,
    }),
    FullDay.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('destinationId')), 'destinationId']],
      where: { destinationId: { [Op.not]: null } },
      raw: true,
    }),
  ]);

  return new Set(
    [...places, ...fullDays]
      .map((row) => Number(row.destinationId))
      .filter((id) => Number.isFinite(id))
  );
};

/* onlyWithContent es lo que separa el selector público del panel.

   El catálogo trae los 25 departamentos del país sembrados de inicio, así
   que el buscador ofrecía Amazonas, Áncash, Apurímac… y quien elegía
   cualquiera de ellos se topaba con "No se encontraron destinos". Un
   selector no debería ofrecer caminos que no llevan a nada.

   El panel de administración sigue viendo la lista entera: ahí sí hace
   falta poder elegir un destino todavía vacío para crear el primero. */
const listCatalog = async ({ includeInactive = false, onlyWithContent = false } = {}) => {
  const regionWhere = { countryCode: env.countryCode };
  const destinationWhere = {};
  if (!includeInactive) {
    regionWhere.isActive = true;
    destinationWhere.isActive = true;
  }

  const regions = await Region.findAll({
    where: regionWhere,
    attributes: ['id', 'countryCode', 'name', 'slug', 'imageUrl', 'shortDescription', 'isActive', 'sortOrder'],
    include: [{ ...destinationInclude, where: destinationWhere }],
    order: [
      ['sortOrder', 'ASC'],
      ['name', 'ASC'],
      [{ model: Destination, as: 'destinations' }, 'sortOrder', 'ASC'],
      [{ model: Destination, as: 'destinations' }, 'name', 'ASC'],
    ],
  });

  if (!onlyWithContent) return regions;

  const withContent = await destinationIdsWithContent();

  /* Se devuelven objetos planos, no instancias: al filtrar destinations
     sobre una instancia de Sequelize el cambio no sobrevive al toJSON()
     que hace res.json(). */
  return regions
    .map((region) => {
      const value = region.toJSON();
      value.destinations = value.destinations.filter((destination) =>
        withContent.has(Number(destination.id))
      );
      return value;
    })
    .filter((region) => region.destinations.length > 0);
};

const getAdminCatalog = async () => {
  const regions = await listCatalog({ includeInactive: true });
  const [placeCounts, fullDayCounts] = await Promise.all([
    Place.findAll({
      attributes: ['destinationId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      where: { destinationId: { [Op.not]: null } },
      group: ['destinationId'],
      raw: true,
      paranoid: false,
    }),
    FullDay.findAll({
      attributes: ['destinationId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      where: { destinationId: { [Op.not]: null } },
      group: ['destinationId'],
      raw: true,
      paranoid: false,
    }),
  ]);
  const counts = new Map();
  for (const row of [...placeCounts, ...fullDayCounts]) {
    const key = Number(row.destinationId);
    counts.set(key, (counts.get(key) || 0) + Number(row.count || 0));
  }
  return regions.map((region) => {
    const value = region.toJSON();
    value.destinations = value.destinations.map((destination) => ({
      ...destination,
      publicationsCount: counts.get(Number(destination.id)) || 0,
    }));
    return value;
  });
};

const getDestination = async (id, { transaction, requireActive = true } = {}) => {
  const destination = await Destination.findByPk(id, {
    include: [{
      model: Region,
      as: 'region',
      attributes: ['id', 'countryCode', 'name', 'slug', 'imageUrl', 'shortDescription', 'isActive'],
    }],
    transaction,
  });
  if (!destination) throw new AppError('Destino no encontrado.', 404);
  if (destination.region.countryCode !== env.countryCode) throw new AppError('El destino no pertenece a este catálogo.', 400);
  if (requireActive && (!destination.isActive || !destination.region.isActive)) {
    throw new AppError('El destino seleccionado no está disponible.', 409);
  }
  return destination;
};

const createRegion = async (body, req) => {
  const name = cleanName(body.name, 'El nombre del departamento o región');
  const transaction = await sequelize.transaction();
  try {
    const slug = await ensureRegionNameAvailable(name, transaction);
    const region = await Region.create({
      countryCode: env.countryCode,
      name,
      slug,
      imageUrl: body.imageUrl || null,
      shortDescription: optionalText(body.shortDescription),
      isActive: body.isActive !== false,
      sortOrder: Number.parseInt(body.sortOrder, 10) || 0,
    }, { transaction });
    await logAdminAction({ req, action: 'create', entityType: 'Region', entityId: region.id, details: { name, actorId: actorId(req) }, transaction });
    await transaction.commit();
    return region;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error?.name === 'SequelizeUniqueConstraintError') {
      throw new AppError('Esta ubicación ya está registrada.', 409);
    }
    throw error;
  }
};

const updateRegion = async (id, body, req) => {
  const transaction = await sequelize.transaction();
  let oldImage = null;
  try {
    const region = await Region.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!region || region.countryCode !== env.countryCode) throw new AppError('Departamento o región no encontrado.', 404);
    const values = {};
    if (body.name !== undefined) {
      values.name = cleanName(body.name, 'El nombre del departamento o región');
      values.slug = await ensureRegionNameAvailable(values.name, transaction, region.id);
    }
    if (body.shortDescription !== undefined) values.shortDescription = optionalText(body.shortDescription);
    if (body.imageUrl) {
      oldImage = region.imageUrl;
      values.imageUrl = body.imageUrl;
    } else if (body.removeImage === true) {
      oldImage = region.imageUrl;
      values.imageUrl = null;
    }
    if (body.isActive !== undefined) values.isActive = Boolean(body.isActive);
    if (body.sortOrder !== undefined) values.sortOrder = Number.parseInt(body.sortOrder, 10) || 0;
    await region.update(values, { transaction });
    await logAdminAction({ req, action: 'update', entityType: 'Region', entityId: region.id, details: values, transaction });
    await transaction.commit();
    if (oldImage && oldImage !== region.imageUrl) await deleteStoredFiles(oldImage);
    return region;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error?.name === 'SequelizeUniqueConstraintError') {
      throw new AppError('Esta ubicación ya está registrada.', 409);
    }
    throw error;
  }
};

const deleteRegion = async (id, req) => {
  const transaction = await sequelize.transaction();
  let imageUrl = null;
  try {
    const region = await Region.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!region || region.countryCode !== env.countryCode) throw new AppError('Departamento o región no encontrado.', 404);
    const destinations = await Destination.count({ where: { regionId: region.id }, transaction });
    if (destinations) throw new AppError('No puedes eliminar esta ubicación porque tiene destinos registrados. Puedes desactivarla.', 409);
    imageUrl = region.imageUrl;
    await logAdminAction({ req, action: 'delete', entityType: 'Region', entityId: region.id, details: { name: region.name }, transaction });
    await region.destroy({ transaction });
    await transaction.commit();
    if (imageUrl) await deleteStoredFiles(imageUrl);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

const createDestination = async (body, req) => {
  const name = cleanName(body.name, 'El nombre del destino');
  const regionId = Number.parseInt(body.regionId, 10);
  if (!Number.isInteger(regionId) || regionId < 1) throw new AppError('Selecciona un departamento o región válido.', 400);
  const transaction = await sequelize.transaction();
  try {
    const region = await Region.findByPk(regionId, { transaction });
    if (!region || region.countryCode !== env.countryCode) throw new AppError('Departamento o región no encontrado.', 404);
    const slug = await ensureDestinationNameAvailable(name, regionId, transaction);
    const destination = await Destination.create({
      regionId,
      name,
      slug,
      imageUrl: body.imageUrl || null,
      shortDescription: optionalText(body.shortDescription),
      isActive: body.isActive !== false,
      sortOrder: Number.parseInt(body.sortOrder, 10) || 0,
    }, { transaction });
    await logAdminAction({ req, action: 'create', entityType: 'Destination', entityId: destination.id, details: { name, regionId }, transaction });
    await transaction.commit();
    return destination;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error?.name === 'SequelizeUniqueConstraintError') {
      throw new AppError('Este destino ya está registrado en la ubicación seleccionada.', 409);
    }
    throw error;
  }
};

const updateDestination = async (id, body, req) => {
  const transaction = await sequelize.transaction();
  let oldImage = null;
  try {
    const destination = await Destination.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    const currentRegion = destination
      ? await Region.findByPk(destination.regionId, { attributes: ['id', 'countryCode'], transaction })
      : null;
    if (!destination || currentRegion?.countryCode !== env.countryCode) {
      throw new AppError('Destino no encontrado.', 404);
    }
    let regionId = destination.regionId;
    if (body.regionId !== undefined) {
      regionId = Number.parseInt(body.regionId, 10);
      const region = await Region.findByPk(regionId, { transaction });
      if (!region || region.countryCode !== env.countryCode) throw new AppError('Departamento o región no encontrado.', 404);
    }

    const nextName = body.name !== undefined
      ? cleanName(body.name, 'El nombre del destino')
      : destination.name;
    const values = {
      regionId,
      slug: await ensureDestinationNameAvailable(nextName, regionId, transaction, destination.id),
    };
    if (body.name !== undefined) values.name = nextName;
    if (body.shortDescription !== undefined) values.shortDescription = optionalText(body.shortDescription);
    if (body.imageUrl) {
      oldImage = destination.imageUrl;
      values.imageUrl = body.imageUrl;
    } else if (body.removeImage === true) {
      oldImage = destination.imageUrl;
      values.imageUrl = null;
    }
    if (body.isActive !== undefined) values.isActive = Boolean(body.isActive);
    if (body.sortOrder !== undefined) values.sortOrder = Number.parseInt(body.sortOrder, 10) || 0;
    await destination.update(values, { transaction });
    await logAdminAction({ req, action: 'update', entityType: 'Destination', entityId: destination.id, details: values, transaction });
    await transaction.commit();
    if (oldImage && oldImage !== destination.imageUrl) await deleteStoredFiles(oldImage);
    return destination;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error?.name === 'SequelizeUniqueConstraintError') {
      throw new AppError('Este destino ya está registrado en la ubicación seleccionada.', 409);
    }
    throw error;
  }
};

const deleteDestination = async (id, req) => {
  const transaction = await sequelize.transaction();
  let imageUrl = null;
  try {
    const destination = await Destination.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    const region = destination
      ? await Region.findByPk(destination.regionId, { attributes: ['id', 'countryCode'], transaction })
      : null;
    if (!destination || region?.countryCode !== env.countryCode) {
      throw new AppError('Destino no encontrado.', 404);
    }
    const [places, fullDays] = await Promise.all([
      Place.count({ where: { destinationId: destination.id }, paranoid: false, transaction }),
      FullDay.count({ where: { destinationId: destination.id }, paranoid: false, transaction }),
    ]);
    if (places + fullDays > 0) throw new AppError('No puedes eliminar este destino porque tiene publicaciones asociadas. Puedes desactivarlo.', 409);
    imageUrl = destination.imageUrl;
    await logAdminAction({ req, action: 'delete', entityType: 'Destination', entityId: destination.id, details: { name: destination.name }, transaction });
    await destination.destroy({ transaction });
    await transaction.commit();
    if (imageUrl) await deleteStoredFiles(imageUrl);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

module.exports = {
  createDestination,
  createRegion,
  deleteDestination,
  deleteRegion,
  getAdminCatalog,
  getDestination,
  listCatalog,
  updateDestination,
  updateRegion,
};
