const { AppError } = require('../utils/app-error');
const { isAdminUser } = require('../config/access');
const { ensureId, toBoolean } = require('../utils/parsers');
const { getPlaceDetail, listCities, listFavorites, listPlaces } = require('../services/place-query.service');
const {
  createPlace,
  permanentDeletePlace,
  restorePlace,
  setVisibility,
  toggleLike,
  trashPlace,
  updatePlace,
} = require('../services/place-write.service');

const create = async (req, res) => res.status(201).json(await createPlace(req));

const list = async (req, res) => {
  /* La ruta es pública, pero la sesión llega igual cuando existe: con ella
     sabemos qué corazones pintar. Sin sesión, viewerId queda null. */
  const result = await listPlaces(req.query, req.user?.googleId || null);
  /* La respuesta ahora varía por usuario; ningún proxy debe reutilizarla. */
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Total-Count', result.meta.total);
  res.setHeader('X-Page', result.meta.page);
  res.setHeader('X-Page-Size', result.meta.pageSize);
  res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count, X-Page, X-Page-Size');
  return res.status(200).json(result.data);
};

const getById = async (req, res) => {
  const place = await getPlaceDetail(ensureId(req.params.id));
  if (!place || (place.isHidden && !isAdminUser(req.user))) throw new AppError('Lugar no encontrado.', 404);
  return res.status(200).json(place);
};

const cities = async (_req, res) => res.status(200).json(await listCities());
const favorites = async (req, res) => res.status(200).json(await listFavorites(req.user.googleId));

const visibility = async (req, res) => {
  const isHidden = toBoolean(req.body?.isHidden, null);
  if (typeof isHidden !== 'boolean') throw new AppError('El campo "isHidden" debe ser booleano.', 400);
  const place = await setVisibility(ensureId(req.params.id), isHidden, req);
  return res.status(200).json({ message: `Lugar ${isHidden ? 'ocultado' : 'mostrado'} correctamente.`, place });
};

const remove = async (req, res) => {
  await trashPlace(ensureId(req.params.id), req);
  return res.status(200).json({ message: 'Lugar enviado a la papelera.' });
};

const restore = async (req, res) =>
  res.status(200).json({ message: 'Lugar restaurado correctamente.', place: await restorePlace(ensureId(req.params.id), req) });

const removePermanently = async (req, res) => {
  await permanentDeletePlace(ensureId(req.params.id), req);
  return res.status(200).json({ message: 'Lugar eliminado permanentemente.' });
};

const update = async (req, res) => res.status(200).json(await updatePlace(ensureId(req.params.id), req));
const like = async (req, res) => res.status(200).json(await toggleLike(ensureId(req.params.id), req.user.googleId));

module.exports = {
  cities,
  create,
  favorites,
  getById,
  like,
  list,
  remove,
  removePermanently,
  restore,
  update,
  visibility,
};
