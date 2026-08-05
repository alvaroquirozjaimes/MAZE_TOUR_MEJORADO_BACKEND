const { AppError } = require('./app-error');
const { toBoolean } = require('./parsers');

const coordinate = (value, label, min, max) => {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new AppError(`${label} no es válida.`, 400);
  }
  return parsed;
};

const mapFieldsFromBody = (body = {}, { partial = false } = {}) => {
  const values = {};
  if (!partial || body.mapAddress !== undefined) {
    const address = String(body.mapAddress || '').trim();
    values.mapAddress = address || null;
  }
  const latitude = coordinate(body.latitude, 'La latitud', -90, 90);
  const longitude = coordinate(body.longitude, 'La longitud', -180, 180);
  if (latitude !== undefined) values.latitude = latitude;
  if (longitude !== undefined) values.longitude = longitude;
  if (!partial || body.showOnMap !== undefined) {
    values.showOnMap = toBoolean(body.showOnMap, false);
  }

  const effectiveLat = values.latitude;
  const effectiveLng = values.longitude;
  if (values.showOnMap && (effectiveLat === null || effectiveLat === undefined || effectiveLng === null || effectiveLng === undefined)) {
    throw new AppError('Selecciona una ubicación en el mapa antes de activarla.', 400);
  }
  return values;
};

module.exports = { mapFieldsFromBody };
