const express = require('express');
const controller = require('../controllers/location.controller');
const { requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { uploadFields } = require('../middleware/upload');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();
router.get('/locations/catalog', asyncHandler(controller.catalog));
router.get('/admin/locations', requireAdmin, asyncHandler(controller.adminCatalog));
router.post('/admin/regions', requireAdmin, requireCsrf, uploadFields, asyncHandler(controller.addRegion));
router.patch('/admin/regions/:id', requireAdmin, requireCsrf, uploadFields, asyncHandler(controller.editRegion));
router.delete('/admin/regions/:id', requireAdmin, requireCsrf, asyncHandler(controller.removeRegion));
router.post('/admin/destinations', requireAdmin, requireCsrf, uploadFields, asyncHandler(controller.addDestination));
router.patch('/admin/destinations/:id', requireAdmin, requireCsrf, uploadFields, asyncHandler(controller.editDestination));
router.delete('/admin/destinations/:id', requireAdmin, requireCsrf, asyncHandler(controller.removeDestination));

module.exports = router;
