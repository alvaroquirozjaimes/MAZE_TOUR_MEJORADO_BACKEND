const express = require('express');
const controller = require('../controllers/admin-dashboard.controller');
const { requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();
router.use(requireAdmin);
router.get('/dashboard/summary', asyncHandler(controller.summary));
router.get('/places', asyncHandler(controller.places));
router.get('/hotels', asyncHandler(controller.hotels));
router.get('/restaurants', asyncHandler(controller.restaurants));
router.get('/full-days', asyncHandler(controller.fullDays));
router.get('/contact-messages', asyncHandler(controller.contactMessages));
router.patch('/contact-messages/:id/status', requireCsrf, asyncHandler(controller.updateContactStatus));
router.get('/activity-logs', asyncHandler(controller.activityLogs));
router.get('/users', asyncHandler(controller.users));
router.patch('/users/:googleId/role', requireCsrf, asyncHandler(controller.updateUserRole));
module.exports = router;
