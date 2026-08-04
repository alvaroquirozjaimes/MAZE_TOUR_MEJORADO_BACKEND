const express = require('express');
const { env } = require('../config/env');
const { chat } = require('../controllers/chat.controller');
const { createRateLimit } = require('../middleware/rate-limit');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();
const perIp = createRateLimit({
  windowMs: 60_000,
  max: 10,
  scope: 'chat-ip',
  message: 'Demasiadas consultas al chat. Intenta nuevamente en un momento.',
});
const globalDaily = createRateLimit({
  windowMs: 24 * 60 * 60_000,
  max: env.chatDailyLimit,
  scope: 'chat-global',
  keyGenerator: () => `chat-global:${new Date().toISOString().slice(0, 10)}`,
  message: 'El asistente alcanzó su límite diario. Intenta nuevamente mañana.',
});
router.post('/chat', perIp, globalDaily, asyncHandler(chat));
module.exports = router;
