const express = require('express');
const { passport, googleAuthEnabled } = require('../config/passport');
const { env } = require('../config/env');
const { currentUser, logout } = require('../controllers/auth.controller');
const { csrfToken, requireCsrf } = require('../middleware/csrf');
const { createRateLimit } = require('../middleware/rate-limit');
const { AppError } = require('../utils/app-error');

const router = express.Router();
const authLimit = createRateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  scope: 'oauth',
  message: 'Demasiados intentos de autenticación. Intenta nuevamente más tarde.',
});
const ensureGoogleConfigured = (_req, _res, next) =>
  googleAuthEnabled ? next() : next(new AppError('Google OAuth no está configurado en el servidor.', 503));

router.get('/auth/csrf', csrfToken);
router.get('/auth/google', authLimit, ensureGoogleConfigured, passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account', state: true }));
router.get(
  '/auth/google/callback',
  ensureGoogleConfigured,
  passport.authenticate('google', { failureRedirect: `${env.frontendUrl}/iniciar-sesion` }),
  (_req, res) => res.redirect(`${env.frontendUrl}/dashboard`)
);
router.get('/auth/user', currentUser);
router.post('/auth/logout', requireCsrf, logout);
module.exports = router;
