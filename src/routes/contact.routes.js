const express = require('express');
const controller = require('../controllers/contact.controller');
const { createRateLimit } = require('../middleware/rate-limit');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();
const contactLimit = createRateLimit({
  windowMs: 60 * 60_000,
  max: 8,
  scope: 'contact',
  message: 'Has enviado demasiados mensajes. Intenta nuevamente más tarde.',
});

router.post('/contact', contactLimit, asyncHandler(controller.create));
module.exports = router;
