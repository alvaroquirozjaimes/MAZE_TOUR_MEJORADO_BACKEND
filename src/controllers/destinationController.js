const { Op, fn, col } = require('sequelize');
const { Destination, MapPoint } = require('../models');
const {
  normalizeGeoText,
  slugify,
  cleanNullable,
  parseCoordinate,
} = require('../utils/geoText');

const buildWhere = (query = {}) => {
  const where = {};
  if (query.activo !== undefined) {
    where.activo = !['false', '0', 'no'].includes(String(query.activo).toLowerCase());
  }
  if (query.departamento_codigo) where.departamento_codigo = String(query.departamento_codigo);
  if (query.provincia_codigo) where.provincia_codigo = String(query.provincia_codigo);
  if (query.distrito_codigo) where.distrito_codigo = String(query.distrito_codigo);
  if (query.search) {
    where.nombre_normalizado = { [Op.like]: `%${normalizeGeoText(query.search)}%` };
  }
  return where;
};

const makeSlug = async ({ nombre, departamentoCodigo, excludeId = null }) => {
  const base = `${slugify(nombre)}-${String(departamentoCodigo || '').toLowerCase()}`.replace(/-+$/g, '');
  let candidate = base || `destino-${Date.now()}`;
  let sequence = 2;

  while (true) {
    const existing = await Destination.findOne({
      where: {
        slug: candidate,
        ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
      },
    });
    if (!existing) return candidate;
    candidate = `${base}-${sequence}`;
    sequence += 1;
  }
};

const ensureUniqueDestination = async ({ payload, excludeId = null }) => {
  const where = {
    nombre_normalizado: normalizeGeoText(payload.nombre),
    departamento_codigo: String(payload.departamento_codigo),
    provincia_codigo: payload.provincia_codigo || null,
    distrito_codigo: payload.distrito_codigo || null,
    ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
  };
  const existing = await Destination.findOne({ where });
  if (existing) {
    const error = new Error(`Ya existe el destino “${existing.nombre}” en la ubicación seleccionada`);
    error.status = 409;
    throw error;
  }
};

const sanitize = async (body = {}, excludeId = null) => {
  const nombre = String(body.nombre || '').trim();
  const departamentoCodigo = String(body.departamento_codigo || '').trim();
  const departamentoNombre = String(body.departamento_nombre || '').trim();

  if (!nombre) throw Object.assign(new Error('El nombre del destino es obligatorio'), { status: 400 });
  if (!departamentoCodigo || !departamentoNombre) {
    throw Object.assign(new Error('El departamento es obligatorio'), { status: 400 });
  }

  const payload = {
    nombre,
    nombre_normalizado: normalizeGeoText(nombre),
    departamento_codigo: departamentoCodigo,
    departamento_nombre: departamentoNombre,
    provincia_codigo: cleanNullable(body.provincia_codigo),
    provincia_nombre: cleanNullable(body.provincia_nombre),
    distrito_codigo: cleanNullable(body.distrito_codigo),
    distrito_nombre: cleanNullable(body.distrito_nombre),
    descripcion: cleanNullable(body.descripcion),
    imagen_url: cleanNullable(body.imagen_url),
    latitud: parseCoordinate(body.latitud, 'latitud'),
    longitud: parseCoordinate(body.longitud, 'longitud'),
    destacado: Boolean(body.destacado),
    activo: body.activo === undefined ? true : Boolean(body.activo),
  };

  await ensureUniqueDestination({ payload, excludeId });
  payload.slug = await makeSlug({ nombre, departamentoCodigo, excludeId });
  return payload;
};

const getAll = async (req, res) => {
  try {
    const destinations = await Destination.findAll({
      where: buildWhere(req.query),
      order: [
        ['departamento_nombre', 'ASC'],
        ['nombre', 'ASC'],
      ],
    });

    const ids = destinations.map(item => item.id);
    const counters = ids.length
      ? await MapPoint.findAll({
          attributes: [
            'destino_id',
            'tipo',
            [fn('COUNT', col('id')), 'total'],
          ],
          where: { destino_id: { [Op.in]: ids }, activo: true },
          group: ['destino_id', 'tipo'],
          raw: true,
        })
      : [];

    const counterMap = new Map();
    for (const row of counters) {
      const key = Number(row.destino_id);
      const current = counterMap.get(key) || {
        LUGAR_TURISTICO: 0,
        HOTEL: 0,
        RESTAURANTE: 0,
        FULL_DAY: 0,
        total: 0,
      };
      current[row.tipo] = Number(row.total || 0);
      current.total += Number(row.total || 0);
      counterMap.set(key, current);
    }

    return res.json(destinations.map(item => ({
      ...item.toJSON(),
      conteos: counterMap.get(Number(item.id)) || {
        LUGAR_TURISTICO: 0,
        HOTEL: 0,
        RESTAURANTE: 0,
        FULL_DAY: 0,
        total: 0,
      },
    })));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getById = async (req, res) => {
  try {
    const destination = await Destination.findByPk(req.params.id, {
      include: [{ model: MapPoint, as: 'puntosMapa', where: { activo: true }, required: false }],
    });
    if (!destination) return res.status(404).json({ message: 'Destino no encontrado' });
    return res.json(destination);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const create = async (req, res) => {
  try {
    const payload = await sanitize(req.body);
    const destination = await Destination.create(payload);
    return res.status(201).json(destination);
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
};

const update = async (req, res) => {
  try {
    const destination = await Destination.findByPk(req.params.id);
    if (!destination) return res.status(404).json({ message: 'Destino no encontrado' });
    const payload = await sanitize(req.body, destination.id);
    await destination.update(payload);
    return res.json(destination);
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const destination = await Destination.findByPk(req.params.id);
    if (!destination) return res.status(404).json({ message: 'Destino no encontrado' });

    const related = await MapPoint.count({ where: { destino_id: destination.id, activo: true } });
    if (related > 0) {
      return res.status(409).json({
        message: `No puedes desactivar este destino porque tiene ${related} elemento(s) activo(s) en el mapa`,
      });
    }

    await destination.update({ activo: false });
    return res.json({ message: 'Destino desactivado' });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = { getAll, getById, create, update, remove };
