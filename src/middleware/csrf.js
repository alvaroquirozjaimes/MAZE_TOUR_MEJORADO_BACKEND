const crypto = require('crypto');
const { AppError } = require('../utils/app-error');

const generateToken = () => crypto.randomBytes(32).toString('hex');

const ensureCsrfToken = (req) => {
  if (!req.session) throw new AppError('La sesión no está disponible.', 500);
  if (!req.session.csrfToken) req.session.csrfToken = generateToken();
  return req.session.csrfToken;
};

const csrfToken = (req, res) => {
  const token = ensureCsrfToken(req);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ csrfToken: token });
};

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
};

const requireCsrf = (req, _res, next) => {
  const expected = req.session?.csrfToken;
  const received = req.get('x-csrf-token');
  if (!expected || !safeEqual(expected, received)) {
    return next(new AppError('Token CSRF inválido o vencido. Recarga la página e inténtalo nuevamente.', 403));
  }
  return next();
};

module.exports = { csrfToken, ensureCsrfToken, requireCsrf, safeEqual };
