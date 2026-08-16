/*
 * Encuadre de la portada: normaliza lo que llega del formulario.
 *
 * El navegador manda todo como texto dentro de un FormData, así que aquí
 * no se confía en el tipo ni en el rango. Lo que sale de estas funciones
 * ya es apto para escribirse en la base: enteros 0..100 y un zoom
 * acotado con dos decimales.
 */

const IMAGE_FOCUS_DEFAULT = Object.freeze({
  imageFocusX: 50,
  imageFocusY: 50,
  imageZoom: 1,
});

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toPercent = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(Math.round(parsed), 0, 100);
};

const toZoom = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Number(clamp(parsed, MIN_ZOOM, MAX_ZOOM).toFixed(2));
};

/**
 * Devuelve los campos de encuadre listos para Sequelize.
 *
 * @param {object} body            req.body
 * @param {object} [options]
 * @param {boolean} [options.partial=false]
 *        En modo parcial (edición) solo se devuelven las claves que el
 *        formulario envió: así una petición que no toca el encuadre no lo
 *        pisa con el valor por defecto.
 * @returns {{imageFocusX?: number, imageFocusY?: number, imageZoom?: number}}
 */
const parseImageFocus = (body = {}, { partial = false } = {}) => {
  const values = {};

  if (!partial || body.imageFocusX !== undefined) {
    values.imageFocusX = toPercent(body.imageFocusX, IMAGE_FOCUS_DEFAULT.imageFocusX);
  }
  if (!partial || body.imageFocusY !== undefined) {
    values.imageFocusY = toPercent(body.imageFocusY, IMAGE_FOCUS_DEFAULT.imageFocusY);
  }
  if (!partial || body.imageZoom !== undefined) {
    values.imageZoom = toZoom(body.imageZoom, IMAGE_FOCUS_DEFAULT.imageZoom);
  }

  return values;
};

/** Lo que se aplica cuando se sube una portada nueva sin indicar encuadre. */
const resetImageFocus = () => ({ ...IMAGE_FOCUS_DEFAULT });

/** Lectura segura desde una fila ya guardada, para las respuestas de la API. */
const readImageFocus = (record = {}) => ({
  imageFocusX: toPercent(record.imageFocusX, IMAGE_FOCUS_DEFAULT.imageFocusX),
  imageFocusY: toPercent(record.imageFocusY, IMAGE_FOCUS_DEFAULT.imageFocusY),
  imageZoom: toZoom(record.imageZoom, IMAGE_FOCUS_DEFAULT.imageZoom),
});

module.exports = {
  IMAGE_FOCUS_DEFAULT,
  MAX_ZOOM,
  MIN_ZOOM,
  parseImageFocus,
  readImageFocus,
  resetImageFocus,
};
