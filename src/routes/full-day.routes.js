const express = require('express');
const controller = require('../controllers/full-day.controller');
const { requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { uploadFields } = require('../middleware/upload');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();
router.get('/', asyncHandler(controller.list));
router.get('/:id', asyncHandler(controller.getById));
router.post('/', requireAdmin, requireCsrf, uploadFields, asyncHandler(controller.create));
router.put('/:id', requireAdmin, requireCsrf, uploadFields, asyncHandler(controller.update));
router.patch('/:id/visibility', requireAdmin, requireCsrf, asyncHandler(controller.setVisibility));
router.post('/:id/restore', requireAdmin, requireCsrf, asyncHandler(controller.restore));
router.delete('/:id/permanent', requireAdmin, requireCsrf, asyncHandler(controller.removePermanently));
router.delete('/:id', requireAdmin, requireCsrf, asyncHandler(controller.remove));
module.exports = router;
