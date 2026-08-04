const { ensureId } = require('../utils/parsers');
const { AppError } = require('../utils/app-error');
const {
  getDashboardSummary,
  listActivityLogs,
  listAdminFullDays,
  listAdminHotels,
  listAdminPlaces,
  listAdminRestaurants,
  listContactMessages,
  listUsers,
  setContactMessageStatus,
  setUserRole,
} = require('../services/admin-dashboard.service');

const summary = async (_req, res) => res.status(200).json(await getDashboardSummary());
const places = async (req, res) => res.status(200).json(await listAdminPlaces(req.query));
const fullDays = async (req, res) => res.status(200).json(await listAdminFullDays(req.query));
const hotels = async (req, res) => res.status(200).json(await listAdminHotels(req.query));
const restaurants = async (req, res) => res.status(200).json(await listAdminRestaurants(req.query));
const contactMessages = async (req, res) => res.status(200).json(await listContactMessages(req.query));
const updateContactStatus = async (req, res) =>
  res.status(200).json(await setContactMessageStatus(ensureId(req.params.id), String(req.body?.status || ''), req));
const activityLogs = async (req, res) => res.status(200).json(await listActivityLogs(req.query));
const users = async (req, res) => res.status(200).json(await listUsers(req.query));
const updateUserRole = async (req, res) => {
  const googleId = String(req.params.googleId || '').trim();
  if (!googleId || googleId.length > 128) throw new AppError('Usuario inválido.', 400);
  return res.status(200).json(await setUserRole(googleId, String(req.body?.role || ''), req));
};

module.exports = {
  activityLogs,
  contactMessages,
  fullDays,
  hotels,
  places,
  restaurants,
  summary,
  updateContactStatus,
  updateUserRole,
  users,
};
