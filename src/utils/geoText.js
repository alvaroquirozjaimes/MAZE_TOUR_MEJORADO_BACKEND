const normalizeGeoText = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toUpperCase();

const slugify = (value = '') => normalizeGeoText(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const cleanNullable = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const parseCoordinate = (value, fieldName) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    const error = new Error(`${fieldName} no es una coordenada válida`);
    error.status = 400;
    throw error;
  }
  return parsed;
};

module.exports = { normalizeGeoText, slugify, cleanNullable, parseCoordinate };
