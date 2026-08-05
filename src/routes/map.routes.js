const express = require('express');
const controller = require('../controllers/map.controller');
const { requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();
router.get('/map/catalog', asyncHandler(controller.publicCatalog));
router.get('/admin/map/catalog', requireAdmin, asyncHandler(controller.adminCatalog));
router.patch('/admin/map/:entityType/:id', requireAdmin, requireCsrf, asyncHandler(controller.updateItem));
module.exports = router;
