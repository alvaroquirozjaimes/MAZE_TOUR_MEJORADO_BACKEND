const { AppError } = require('../utils/app-error');
const { isAdminUser } = require('../config/access');
const { ensureId, toBoolean } = require('../utils/parsers');
const {
  createFullDay,
  getFullDay,
  listFavoriteFullDays,
  listFullDays,
  permanentDeleteFullDay,
  toggleFullDayLike,
  restoreFullDay,
  setFullDayVisibility,
  trashFullDay,
  updateFullDay,
} = require('../services/full-day.service');

const create = async (req, res) =>
  res.status(201).json({ message: 'Full Day creado correctamente.', fullDay: await createFullDay(req) });

const list = async (req, res) => {
  /* El id del visitante decide qué corazones salen en rojo. */
  const result = await listFullDays(req.query, req.user?.googleId || null);
  res.setHeader('X-Total-Count', result.meta.total);
  res.setHeader('X-Page', result.meta.page);
  res.setHeader('X-Page-Size', result.meta.pageSize);
  res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count, X-Page, X-Page-Size');
  return res.status(200).json(result.data);
};

const getById = async (req, res) => {
  const fullDay = await getFullDay(ensureId(req.params.id), { viewerId: req.user?.googleId || null });
  if (fullDay.isHidden && !isAdminUser(req.user)) throw new AppError('Full Day no encontrado.', 404);
  return res.status(200).json(fullDay);
};

const update = async (req, res) =>
  res.status(200).json({ message: 'Full Day actualizado correctamente.', fullDay: await updateFullDay(ensureId(req.params.id), req) });

const setVisibility = async (req, res) => {
  const isHidden = toBoolean(req.body?.isHidden, null);
  if (typeof isHidden !== 'boolean') throw new AppError('El campo "isHidden" debe ser booleano.', 400);
  const fullDay = await setFullDayVisibility(ensureId(req.params.id), isHidden, req);
  return res.status(200).json({
    message: fullDay.isHidden ? 'Full Day ocultado correctamente.' : 'Full Day visible nuevamente.',
    fullDay,
  });
};

const remove = async (req, res) => {
  await trashFullDay(ensureId(req.params.id), req);
  return res.status(200).json({ message: 'Full Day enviado a la papelera.' });
};
const restore = async (req, res) =>
  res.status(200).json({ message: 'Full Day restaurado correctamente.', fullDay: await restoreFullDay(ensureId(req.params.id), req) });
const removePermanently = async (req, res) => {
  await permanentDeleteFullDay(ensureId(req.params.id), req);
  return res.status(200).json({ message: 'Full Day eliminado permanentemente.' });
};

const like = async (req, res) =>
  res.status(200).json(await toggleFullDayLike(ensureId(req.params.id), req.user.googleId));

const favorites = async (req, res) =>
  res.status(200).json(await listFavoriteFullDays(req.user.googleId));

module.exports = {
  create,
  favorites,
  getById,
  like,
  list,
  remove,
  removePermanently,
  restore,
  setVisibility,
  update,
};
