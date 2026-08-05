const { Op } = require('sequelize');
const { Destination, MapPoint } = require('../models');
const { normalizeGeoText, cleanNullable, parseCoordinate } = require('../utils/geoText');

const validateType = (type) => {
  if (!MapPoint.MAP_POINT_TYPES.includes(type)) {
    const error = new Error('Tipo inválido. Usa LUGAR_TURISTICO, HOTEL, RESTAURANTE o FULL_DAY');
    error.status = 400;
    throw error;
  }
};

const ensureUniquePoint = async ({ destinoId, tipo, nombre, excludeId = null }) => {
  const existing = await MapPoint.findOne({
    where: {
      destino_id: destinoId,
      tipo,
      nombre_normalizado: normalizeGeoText(nombre),
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
  });

  if (existing) {
    const error = new Error(`Ya existe “${existing.nombre}” dentro de este destino y categoría`);
    error.status = 409;
    throw error;
  }
};

const sanitize = async (body = {}, excludeId = null) => {
  const destinoId = Number(body.destino_id);
  const tipo = String(body.tipo || '').trim().toUpperCase();
  const nombre = String(body.nombre || '').trim();

  if (!Number.isInteger(destinoId) || destinoId <= 0) {
    throw Object.assign(new Error('Debes seleccionar un destino'), { status: 400 });
  }
  if (!nombre) throw Object.assign(new Error('El nombre es obligatorio'), { status: 400 });
  validateType(tipo);

  const destination = await Destination.findOne({ where: { id: destinoId, activo: true } });
  if (!destination) throw Object.assign(new Error('El destino seleccionado no existe o está inactivo'), { status: 400 });

  const latitud = parseCoordinate(body.latitud, 'latitud');
  const longitud = parseCoordinate(body.longitud, 'longitud');
  if (latitud === null || longitud === null) {
    throw Object.assign(new Error('Debes marcar la ubicación en el mapa'), { status: 400 });
  }

  await ensureUniquePoint({ destinoId, tipo, nombre, excludeId });

  return {
    destino_id: destinoId,
    tipo,
    referencia_id: cleanNullable(body.referencia_id),
    nombre,
    nombre_normalizado: normalizeGeoText(nombre),
    descripcion: cleanNullable(body.descripcion),
    direccion: cleanNullable(body.direccion),
    imagen_url: cleanNullable(body.imagen_url),
    latitud,
    longitud,
    destacado: Boolean(body.destacado),
    activo: body.activo === undefined ? true : Boolean(body.activo),
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : null,
  };
};

const getAll = async (req, res) => {
  try {
    const pointWhere = { activo: true };
    const destinationWhere = {};

    if (req.query.activo !== undefined) {
      pointWhere.activo = !['false', '0', 'no'].includes(String(req.query.activo).toLowerCase());
    }
    if (req.query.destino_id) pointWhere.destino_id = Number(req.query.destino_id);
    if (req.query.tipo) pointWhere.tipo = String(req.query.tipo).toUpperCase();
    if (req.query.search) {
      pointWhere.nombre_normalizado = { [Op.like]: `%${normalizeGeoText(req.query.search)}%` };
    }
    if (req.query.departamento_codigo) {
      destinationWhere.departamento_codigo = String(req.query.departamento_codigo);
    }

    const points = await MapPoint.findAll({
      where: pointWhere,
      include: [{
        model: Destination,
        as: 'destino',
        where: destinationWhere,
        required: Boolean(req.query.departamento_codigo),
      }],
      order: [['tipo', 'ASC'], ['nombre', 'ASC']],
    });

    return res.json(points);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const create = async (req, res) => {
  try {
    const payload = await sanitize(req.body);
    const point = await MapPoint.create(payload);
    const created = await MapPoint.findByPk(point.id, {
      include: [{ model: Destination, as: 'destino' }],
    });
    return res.status(201).json(created);
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
};

const update = async (req, res) => {
  try {
    const point = await MapPoint.findByPk(req.params.id);
    if (!point) return res.status(404).json({ message: 'Elemento del mapa no encontrado' });
    const payload = await sanitize(req.body, point.id);
    await point.update(payload);
    return res.json(point);
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
};

const move = async (req, res) => {
  try {
    const point = await MapPoint.findByPk(req.params.id);
    if (!point) return res.status(404).json({ message: 'Elemento del mapa no encontrado' });

    const latitud = parseCoordinate(req.body.latitud, 'latitud');
    const longitud = parseCoordinate(req.body.longitud, 'longitud');
    if (latitud === null || longitud === null) {
      return res.status(400).json({ message: 'latitud y longitud son obligatorias' });
    }

    await point.update({ latitud, longitud });
    return res.json({ id: point.id, latitud: point.latitud, longitud: point.longitud });
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const point = await MapPoint.findByPk(req.params.id);
    if (!point) return res.status(404).json({ message: 'Elemento del mapa no encontrado' });
    await point.update({ activo: false });
    return res.json({ message: 'Elemento desactivado' });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = { getAll, create, update, move, remove };
