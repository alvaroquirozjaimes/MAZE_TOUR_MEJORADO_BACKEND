const { AppError } = require('./app-error');

const parseJson = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new AppError('Se recibió un JSON inválido en el formulario.', 400);
  }
};

const toNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
};

const positiveInteger = (value, fallback = null, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const normalizeCategory = (value, fallback = 'lugar') => {
  const category = String(value || fallback).trim().toLowerCase();
  if (category === 'hotel') return 'hotel';
  if (category === 'restaurante') return 'restaurante';
  return 'lugar';
};

const ensureId = (value, field = 'id') => {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError(`${field} inválido.`, 400);
  }
  return id;
};

module.exports = {
  ensureId,
  normalizeCategory,
  parseJson,
  positiveInteger,
  toBoolean,
  toNumber,
};
